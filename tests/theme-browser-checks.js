import { checker, change, until } from './browser-checks.js';

// Computed-style checks in the synthetic Foundry host; pointer hover is checked separately.
export async function runThemeBrowserChecks() {
  const { checks, check } = checker();
  const panel = ui.slowinsert.panel;
  const originalScheme = panel.filters.scheme;
  const wasOpen = Boolean(panel.browseWindow?.rendered);
  const wasGM = game.user.isGM, bodyClass = document.body.className;
  const catalog = game.modules.get('truesight').api.catalog;
  const outside = document.createElement('select');
  outside.append(new Option('Unrelated native control', 'outside'));
  document.body.append(outside);
  const outsideBackground = getComputedStyle(outside.options[0]).backgroundColor;
  // Simulate an inherited upstream palette that disagrees with both local themes.
  const upstream = document.createElement('style');
  upstream.textContent = 'body { --qiBackground: magenta; --qiItemHoverColor: cyan; --qiItemSelectedColor: yellow; --qiItemSelectedHoverColor: lime; }';
  document.head.append(upstream);
  let review, frame, frameClass;
  const geometry = element => {
    const { width, height } = element.getBoundingClientRect();
    return [width, height];
  };
  const setTheme = (element, theme) => {
    element.classList.remove('theme-light', 'theme-dark');
    element.classList.add(`theme-${theme}`);
  };
  try {
    await panel.openBrowseWindow();
    frame = panel.browseWindow.element;
    frameClass = frame.className;
    game.user.isGM = true;
    fixtureState.reconnect();
    await until(() => catalog.getStatus().canPublish, 'theme fixture GM session');
    review = await catalog.openReview();
    change(panel.filterControls.scheme, 'monsters');
    const windows = [frame, review.element];
    const selects = windows.flatMap(window => [...window.querySelectorAll('select')]);
    check(selects.length >= 6, 'theme coverage includes both modules, scheme, sorting, name order and CR bounds');
    const dimensions = selects.map(geometry);
    for (const bodyTheme of ['light', 'dark']) {
      setTheme(document.body, bodyTheme);
      for (const theme of ['light', 'dark']) {
        windows.forEach(window => setTheme(window, theme));
        const context = `${bodyTheme} host / ${theme} window`;
        const text = theme === 'light' ? 'rgb(48, 40, 49)' : 'rgb(239, 230, 216)';
        const menu = theme === 'light' ? 'rgb(221, 221, 221)' : 'rgb(48, 40, 49)';
        const surface = theme === 'light' ? 'rgba(221, 221, 221, 0.89)' : 'rgba(48, 40, 49, 0.89)';
        for (const window of windows) {
          check(getComputedStyle(window).backgroundColor === surface
            && getComputedStyle(window.querySelector('.window-title')).color === text,
          `${context}: ${window.classList[0]} pairs window background and text`);
        }
        for (const select of selects) {
          check(getComputedStyle(select).colorScheme === theme, `${context}: select uses its window theme`);
          check([...select.options].every(option => {
            const style = getComputedStyle(option);
            return style.color === text && style.backgroundColor === menu;
          }), `${context}: ${select.getAttribute('aria-label')} options use the shared opaque surface`);
        }
        const primary = getComputedStyle(review.element.querySelector('.ts-primary'));
        check(primary.backgroundColor === (theme === 'light' ? 'rgb(69, 65, 89)' : 'rgb(198, 181, 215)')
          && primary.color === (theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(48, 40, 49)'),
        `${context}: primary button retains contrasting accent colors`);
        check(getComputedStyle(panel.root.querySelector('select')).colorScheme === bodyTheme,
          `${context}: window theme does not override the sidebar`);
        check(selects.every((select, i) => geometry(select).every((value, j) => value === dimensions[i][j])),
          `${context}: theme changes preserve control dimensions`);
        check(getComputedStyle(outside.options[0]).backgroundColor === outsideBackground,
          `${context}: unrelated native menus retain host styling`);
      }
    }
  } finally {
    upstream.remove();
    outside.remove();
    document.body.className = bodyClass;
    if (frame) frame.className = frameClass;
    change(panel.filterControls.scheme, originalScheme);
    await review?.close();
    game.user.isGM = wasGM;
    fixtureState.reconnect();
    if (!wasOpen) await panel.browseWindow?.close();
  }
  return checks;
}
