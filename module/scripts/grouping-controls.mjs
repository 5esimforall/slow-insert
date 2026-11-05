import { t } from './i18n.mjs';
import { calculateGrouping, groupingDiff, canonicalUuid } from './grouping.mjs';
import { applyGroupingState, undoGroupingState } from './grouping-state.mjs';

const node=(tag,content)=>{const el=document.createElement(tag);if(content)el.textContent=content;return el;};
const button=(key,fn)=>{const el=node('button',t(`Grouping.${key}`));el.type='button';el.addEventListener('click',fn);return el;};

export class GroupingControls {
  constructor(panel) {
    this.panel=panel;this.root=node('section');this.root.className='si-grouping-controls';
    this.status=node('p');this.status.setAttribute('role','status');
    this.rebuild=button('Rebuild',()=>void this.preview());
    this.undo=button('Undo',()=>void this.commit(undoGroupingState(panel.groupingState)));
    this.restore=button('RestoreExcluded',()=>void this.commit({...panel.groupingState,preferences:{...panel.grouping,excluded:[]}}));
    this.root.append(node('h3',t('Grouping.Title')),this.status,this.rebuild,this.undo,this.restore);
  }
  update(catalog) {
    const panel=this.panel;
    this.status.textContent=t(!panel.groupingState.active?'Grouping.NotBuilt':catalog?.changed?'Grouping.Changed':'Grouping.Current', {count:catalog?.changed??0});
    this.undo.disabled=!panel.groupingState.previous;
    this.restore.hidden=!panel.grouping.excluded.length;
    this.rebuild.disabled=!globalThis.QuickInsert?.hasIndex||panel.indexing||!panel.allowed();
    panel.browseButton?.classList.toggle('si-grouping-pending',Boolean(!panel.groupingState.active||catalog?.changed));
  }
  async commit(state) {
    if(this.saving||!this.panel.allowed())return false;
    this.saving=true;this.undo.disabled=true;this.restore.disabled=true;
    try { await this.panel.commitGroupingState(state); }
    catch(error) { console.error('Slow Insert | Grouping save failed',error);globalThis.ui?.notifications?.warn(t('Grouping.SaveFailed'));return false; }
    finally {this.saving=false;this.restore.disabled=false;this.update(this.panel.filterCatalog?.grouping);}
    return true;
  }
  async preview() {
    const panel=this.panel;
    if(panel.destroyed||!panel.allowed()||!globalThis.QuickInsert?.hasIndex||panel.indexing)return;
    if(this.window?.rendered){this.window.bringToFront();return;}
    // Always use the full permitted index, not the search query or facet/rules
    // visibility selections. Permission checks remain owned by Quick Insert.
    const read=()=>({results:globalThis.QuickInsert.search('',()=>true,Number.MAX_SAFE_INTEGER),environment:panel.sourceEnvironment()});
    const baseline=JSON.stringify(panel.groupingState),initial=read(),preferences=structuredClone(panel.grouping);
    const root=node('div');root.className='slow-insert si-grouping-preview';
    root.append(node('p',t('Grouping.PreviewHint')));
    const label=node('label'),risk=node('input');risk.type='checkbox';risk.checked=panel.groupingState.active?.includeRisk===true;
    label.append(risk,document.createTextNode(t('Grouping.IncludeRisk')));root.append(label);
    const summary=node('p'),details=node('details'),list=node('div'),error=node('p'),search=node('input');
    search.type='search';search.placeholder=t('Grouping.Find');search.setAttribute('aria-label',t('Grouping.Find'));
    search.addEventListener('input',()=>{const query=search.value.trim().toLocaleLowerCase();for(const section of list.children)section.hidden=Boolean(query&&!section.textContent.toLocaleLowerCase().includes(query));});error.setAttribute('role','alert');
    details.append(node('summary',t('Grouping.Details')),search,list);root.append(summary,details,error);
    let snapshot;
    const render=()=>{
      snapshot=calculateGrouping(initial.results,initial.environment,preferences,{includeRisk:risk.checked});
      const diff=groupingDiff(panel.groupingState.active,snapshot,panel.grouping);
      const lost=diff.lostPins;
      summary.textContent=t('Grouping.Diff',{...diff,lost:lost.length});list.replaceChildren();search.value='';
      const byId=new Map(initial.results.map(r=>[canonicalUuid(r.item),r.item.name]));
      // Entries in details are lazy to keep large catalogs responsive.
      const name=id=>byId.get(id)??t('Grouping.UnavailableMember');
      for(const [key,group] of Object.entries(snapshot.groups)) {
        const section=node('details');section.append(node('summary',`${group.risk?'⚠ ':''}${name(group.members[0])} (${group.members.length}) · ${group.rules} · ${t('Level',{level:group.level})} · ${t(`Option.school.${group.school}`)} — ${t(`Grouping.Reason.${group.reason}`)}`));
        section.addEventListener('toggle',()=>{if(section.open&&!section.dataset.loaded){section.dataset.loaded='1';for(const id of group.members)section.append(node('p',`${name(id)} — ${id}`));}});
        if(JSON.stringify(panel.groupingState.active?.groups[key]?.members)===JSON.stringify(group.members))section.dataset.unchanged='true';
        list.append(section);
      }
      const independent=node('details');independent.append(node('summary',t('Grouping.Independent',{count:diff.independent})));
      independent.addEventListener('toggle',()=>{if(independent.open&&!independent.dataset.loaded){independent.dataset.loaded='1';for(const [id,record] of Object.entries(snapshot.records))if(!record.key)independent.append(node('p',`${name(id)} — ${t(`Grouping.Review.${record.warning??'no-match'}`)}`));}});list.append(independent);
      const removed=Object.entries(panel.groupingState.active?.groups??{}).filter(([key,g])=>JSON.stringify(snapshot.groups[key]?.members)!==JSON.stringify(g.members));
      const old=node('details');old.append(node('summary',t('Grouping.PreviousChanges',{count:removed.length})));
      old.addEventListener('toggle',()=>{if(old.open&&!old.dataset.loaded){old.dataset.loaded='1';for(const [key,g] of removed)old.append(node('p',g.members.filter(id=>byId.has(id)).map(name).join(' / ')||t('Grouping.UnavailableMember')));}});list.append(old);
      if(lost.length)list.append(node('p',t('Grouping.LostPins')+' '+lost.map(name).join(' / ')));
    };
    risk.addEventListener('change',render);render();
    const actions=node('footer');
    const cancel=button('Cancel',()=>void this.window.close());
    const apply=button('Apply',async()=>{
      if(!panel.allowed()||panel.indexing||!globalThis.QuickInsert?.hasIndex){error.textContent=t('Grouping.PreviewStale');return;}
      const current=read(),fresh=calculateGrouping(current.results,current.environment,panel.grouping,{includeRisk:risk.checked});
      const stable=value=>JSON.stringify({records:Object.entries(value.records).sort(([a],[b])=>a.localeCompare(b)),groups:Object.entries(value.groups).sort(([a],[b])=>a.localeCompare(b))});
      if(JSON.stringify(panel.groupingState)!==baseline||stable(fresh)!==stable(snapshot)){error.textContent=t('Grouping.PreviewStale');apply.disabled=true;return;}
      apply.disabled=true;cancel.disabled=true;
      if(await this.commit(applyGroupingState(panel.groupingState,snapshot)))await this.window.close();
      else {error.textContent=t('Grouping.SaveFailed');apply.disabled=false;cancel.disabled=false;}
    });actions.append(cancel,apply);root.append(actions);
    const controls=this;
    class Preview extends foundry.applications.api.ApplicationV2 {
      static DEFAULT_OPTIONS={classes:['si-grouping-window'],window:{title:'SLOWINSERT.Grouping.PreviewTitle',resizable:true,minimizable:false},position:{width:620,height:650}};
      async _renderHTML(){return root;}
      _replaceHTML(content,host){host.replaceChildren(content);}
      _onRender(context,options){super._onRender(context,options);this.element.setAttribute('role','dialog');this.element.setAttribute('aria-label',t('Grouping.PreviewTitle'));if(options.isFirstRender)risk.focus();}
      _onClose(options){super._onClose(options);if(!panel.destroyed)controls.rebuild.focus();}
    }
    this.window=new Preview({window:{title:t('Grouping.PreviewTitle')}});
    await this.window.render({force:true,position:{width:Math.min(620,window.innerWidth-24),height:Math.min(650,window.innerHeight-32)}});
  }
  destroy(){void this.window?.close({animate:false});}
}
