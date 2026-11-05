import {t} from './i18n.mjs';
import {catalog} from './catalog-api.mjs';

// Opens an application, so use native button semantics with a link appearance.
export function createGroupingLink(openReview = () => catalog.openReview()) {
  const link = document.createElement('button');
  link.type = 'button'; link.className = 'si-grouping-link';
  link.title = t('Grouping.OpenHint');
  const label = document.createElement('span'); label.textContent = t('Grouping.Open');
  const icon = document.createElement('i'); icon.className = 'fas fa-up-right-from-square';
  icon.setAttribute('aria-hidden', 'true');
  link.append(label, icon);
  link.onclick = async () => {
    if (link.disabled) return;
    link.disabled = true;
    try { await openReview(); }
    catch (error) {
      console.error('Slow Insert | Truesight', error);
      ui.notifications.warn(t('Grouping.OpenFailed'));
    } finally { link.disabled = false; }
  };
  return link;
}
