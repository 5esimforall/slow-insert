// Synthetic world only: exercise the complete consumer → workbench → publication flow.
import {checker, until, pause} from './browser-checks.js';
import {normalizeFilters} from '../module/scripts/filters.mjs';
import {normalizeGrouping} from '../module/scripts/grouping.mjs';
import {normalizeSorting} from '../module/scripts/sorting.mjs';
export async function runGroupingInspectionChecks() {
  if (!globalThis.fixtureItems || !new URL(location.href).searchParams.has('grouping')) throw Error('Grouping browser fixture required');
  const {check,checks}=checker(),catalog=game.modules.get('truesight').api.catalog,panel=ui.slowinsert.panel;
  const before={isGM:game.user.isGM,review:structuredClone(game.settings.get('truesight','review')??{schemaVersion:1,active:null,previous:null,excluded:[]}),
    query:panel.input.value,filters:panel.filters,grouping:panel.grouping,sorting:panel.sorting,
    expanded:new Set(panel.view.expandedGroups),tab:ui.sidebar.tabGroups.primary};
  let review;
  const button=key=>[...review.element.querySelectorAll('button')].find(b=>b.textContent===game.i18n.localize('TRUESIGHT.'+key));
  try {
    game.user.isGM=true;fixtureState.reconnect();
    await until(()=>catalog.getStatus().canPublish,'publisher ready');
    await catalog.apply(catalog.preview().id);
    panel.filters=normalizeFilters();panel.grouping=normalizeGrouping();panel.sorting=normalizeSorting();
    ui.sidebar.changeTab('slowinsert');panel.input.value='Example Spell';await panel.refresh(true);
    await until(()=>panel.list.querySelector('.si-group-toggle'),'grouped results');
    panel.list.querySelector('.si-group-toggle').click();
    await until(()=>panel.list.querySelector('.si-group-inspect'),'inspection entry');
    const inspect=panel.list.querySelector('.si-group-inspect'),uuid=inspect.dataset.uuid;
    const group=catalog.read().groups.get(catalog.getMember(uuid).key),revision=catalog.getStatus().revision;
    const expanded=new Set(panel.view.expandedGroups),query=panel.input.value;
    check(!panel.list.querySelector('.si-exclude,[data-group-action=exclude]'),'member rows have no direct exclusion control');
    check(inspect.textContent===game.i18n.localize('SLOWINSERT.Grouping.Inspect'),'inspection entry is localized');
    inspect.click();
    await until(()=>[...foundry.applications.instances.values()].some(app=>app.rendered&&app.element?.matches('.truesight-review')),'context workbench');
    review=[...foundry.applications.instances.values()].find(app=>app.element?.matches('.truesight-review'));
    check(catalog.getStatus().revision===revision,'opening inspection never writes a world revision');
    check(review.element.contains(document.activeElement),'inspection moves keyboard focus into the workbench');
    check(review.element.querySelector('.ts-row[aria-pressed=true]')?.dataset.rowKey===group.key,'inspection locates the approved group by member UUID');
    check(group.members.every(id=>[...review.element.querySelectorAll('.ts-detail code')].some(el=>el.textContent===id)),'inspection includes the full group, not only displayed members');
    check(panel.input.value===query&&[...expanded].every(key=>panel.view.expandedGroups.has(key)),'opening inspection retains search and expanded state');
    const advanced=review.element.querySelector('.ts-exclusion-actions');
    check(!advanced.open,'identity management starts collapsed');advanced.open=true;
    button('Exclusion.Exclude').click();
    await until(()=>review.element.querySelector('.ts-exclusion-preview'),'exclusion preview');
    await pause();
    check(document.activeElement?.matches('.ts-exclusion-preview'),'preview moves focus to its impact summary rather than the apply button');
    check(catalog.getStatus().revision===revision,'exclusion preview has no world side effects');
    check(review.element.querySelector('.ts-exclusion-preview').textContent.includes(game.i18n.localize('TRUESIGHT.Exclusion.Scope')),'preview explains shared grouping and name-resolution scope');
    button('UI.Discard').click();await pause();
    check(catalog.getStatus().revision===revision,'discarding exclusion leaves membership unchanged');
    review.element.querySelector('.ts-exclusion-actions').open=true;button('Exclusion.Exclude').click();
    await until(()=>!button('UI.Apply').hidden,'exclusion ready');
    const target=[...review.element.querySelectorAll('.ts-exclusion-preview code')][0].textContent;
    button('UI.Apply').click();await until(()=>catalog.getMember(target).reason==='excluded','exclusion applied');
    await until(()=>button('Exclusion.Restore'),'excluded target stays selected');
    review.element.querySelector('.ts-exclusion-actions').open=true;button('Exclusion.Restore').click();
    await until(()=>review.element.querySelector('.ts-exclusion-preview'),'restoration preview');
    check(catalog.getMember(target).reason==='excluded','restoration also waits for explicit application');
    button('UI.Apply').click();await until(()=>Boolean(catalog.getMember(target).key),'restoration applied');
    check(catalog.getMember(target).key===group.key,'restoration returns the selected member to its still-valid group');
    await until(()=>button('UI.Apply').hidden,'restoration UI settled');await pause();
    await review.close();review=null;
    game.user.isGM=false;fixtureState.reconnect();await panel.refresh(true);
    check(!panel.list.querySelector('.si-group-inspect'),'players retain browsing without identity management');
  } finally {
    await review?.close();game.user.isGM=true;fixtureState.reconnect();
    await game.settings.set('truesight','review',{...before.review,revision:catalog.getStatus().revision+1});
    game.user.isGM=before.isGM;fixtureState.reconnect();
    Object.assign(panel,{filters:before.filters,grouping:before.grouping,sorting:before.sorting});
    panel.input.value=before.query;panel.view.expandedGroups=before.expanded;await panel.refresh(true);
    ui.sidebar.changeTab(before.tab);
  }
  return checks;
}
