// Run only in fixture.html?grouping, never against a live world.
import {checker, until, pause} from './browser-checks.js';
export async function runTruesightRefreshChecks() {
  if (!globalThis.fixtureItems || !new URL(location.href).searchParams.has('grouping')) throw Error('Grouping browser fixture required');
  const {check, checks}=checker(), catalog=game.modules.get('truesight').api.catalog;
  const item=fixtureItems.find(item=>item.system?.identifier==='example-spell');
  const before={name:item.name,school:item.system.school},pack=game.packs.get(item.package),visible=pack.visible;
  const wasGM=game.user.isGM;
  let review;

  const label=key=>game.i18n.localize('TRUESIGHT.'+key);
  const button=key=>[...review.element.querySelectorAll('button')].find(b=>b.textContent===label(key));
  try {
    game.user.isGM=true;fixtureState.reconnect();
    await until(()=>catalog.getStatus().canPublish, 'designated GM session ready');
    review=await catalog.openReview();
    const count=fixtureState.calls.length;
    for(let i=0;i<100;i++)catalog.getStatus();
    check(fixtureState.calls.length===count,'100 status queries perform zero QI searches');
    catalog.read();const warm=fixtureState.calls.length;
    for(let i=0;i<5;i++)catalog.read();
    check(fixtureState.calls.length===warm,'repeated catalog reads reuse the QI scan');
    button('UI.Recalculate').click();await until(()=>!button('UI.Apply').hidden,'preview');
    const generation=catalog.getStatus().generation,searches=fixtureState.calls.length;
    Hooks.callAll('updateActor',{}, {'system.attributes.hp.value':1});
    Hooks.callAll('updateItem',{}, {'system.uses.spent':1});
    Hooks.callAll('updateSetting',{key:'slow-insert.browsePosition'},{value:{width:900}});
    await pause();await pause();
    check(catalog.getStatus().generation===generation && fixtureState.calls.length===searches,'HP, spent resources and window preferences do not invalidate or scan');
    check(!button('UI.Apply').hidden,'unrelated updates retain the visible preview');
    const row=review.element.querySelector('.ts-row');row.focus();const selected=row.getAttribute('data-row-key');
    item.name='Updated display';Hooks.callAll('updateItem',item,{name:item.name});await pause();await pause();
    check(!button('UI.Apply').hidden,'ordinary rename retains the preview');
    check(document.activeElement?.getAttribute('data-row-key')===selected,'ordinary rename retains keyboard focus on the selected row');
    item.system.school='evo';Hooks.callAll('updateItem',item,{'system.school':'evo'});await pause();
    check(button('UI.Apply').hidden && review.element.querySelector('.ts-error').textContent,'identity change discards the preview and reports why');
    item.system.school=before.school;Hooks.callAll('updateItem',item,{'system.school':before.school});await pause();
    const risk=review.element.querySelector('input[type=checkbox]');risk.checked=true;risk.dispatchEvent(new Event('change'));
    button('UI.Recalculate').click();await until(()=>!button('UI.Apply').hidden,'risk preview');
    item.name='Risk rename';Hooks.callAll('updateItem',item,{name:item.name});await pause();
    check(button('UI.Apply').hidden,'risk-enabled preview treats names as identity evidence');
    const stale=catalog.preview();pack.visible=false;Hooks.callAll('updateCompendium',pack,{ownership:{default:0}});
    check(!catalog.read().entries.has(item.uuid),'revoked pack access is filtered immediately despite a warm cache');
    let rejected=false;try{await catalog.apply(stale.id);}catch(error){rejected=error.code==='preview-stale';}
    check(rejected,'permission change rejects a previously valid preview');
  } finally {
    item.name=before.name;item.system.school=before.school;pack.visible=visible;
    Hooks.callAll('updateCompendium',pack,{ownership:{default:2}});
    await review?.close();
    game.user.isGM=wasGM;fixtureState.reconnect();
  }
  return checks;
}
