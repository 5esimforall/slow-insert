import { t } from './i18n.mjs';
import { SORT_FIELDS, effectiveSort, normalizeSorting, sortFieldLabel } from './sorting.mjs';
function el(tag,cls,text) { const e=document.createElement(tag);e.className=cls;if(text)e.textContent=text;return e; }
function btn(label,text) { const e=el('button','si-sort-button',text);e.type='button';e.title=label;e.setAttribute('aria-label',label);return e; }
export class SortControls {
  constructor({state,scheme,onChange,id}) {
    this.state=normalizeSorting(state);this.scheme=scheme;this.query='';this.onChange=onChange;
    this.root=el('div','si-sort-controls');
    this.select=el('select','si-sort-select');this.select.setAttribute('aria-label',t('Sort.Primary'));
    this.direction=btn(t('Sort.Direction'),'↑');
    this.more=btn(t('Sort.Advanced'),'⋯');this.more.setAttribute('aria-expanded','false');
    this.drawer=el('div','si-sort-drawer');this.drawer.id=`${id}-sort`;this.drawer.hidden=true;
    this.drawer.setAttribute('role','region');this.drawer.setAttribute('aria-label',t('Sort.Advanced'));
    this.more.setAttribute('aria-controls',this.drawer.id);
    this.root.append(this.select,this.direction,this.more);
    this.select.addEventListener('change',()=> {
      const p=this.profile;
      if(this.select.value==='auto')p.mode='auto';
      else {p.mode='manual';p.keys=[{field:this.select.value,direction:'asc'},...p.keys.slice(1).filter(k=>k.field!==this.select.value)];}
      this.commit();
    });
    this.direction.addEventListener('click',()=> {
      const keys=effectiveSort(this.profile,this.scheme,this.query).map(k=>({...k}));
      this.profile.mode='manual';keys[0].direction=keys[0].direction==='asc'?'desc':'asc';this.profile.keys=keys;this.commit();
    });
    this.more.addEventListener('click',()=>this.setExpanded(this.drawer.hidden));
    this.update(scheme,'');
  }
  setExpanded(value){this.drawer.hidden=!value;this.more.setAttribute('aria-expanded',String(value));this.onExpanded?.(value);}
  get profile(){return this.state.profiles[this.scheme];}
  commit(){this.state=normalizeSorting(this.state);this.update(this.scheme,this.query);this.onChange(this.state);}
  option(select,value,label){const o=el('option','',label);o.value=value;select.append(o);}
  update(scheme,query){
    this.scheme=scheme;this.query=query;
    const p=this.profile,keys=effectiveSort(p,scheme,query),primary=keys[0];
    this.select.replaceChildren();
    this.option(this.select,'auto',t('Sort.AutoEffective',{field:sortFieldLabel(primary.field)}));
    this.option(this.select,'relevance',sortFieldLabel('relevance'));
    for(const f of SORT_FIELDS[scheme])this.option(this.select,f,sortFieldLabel(f));
    this.select.value=p.mode==='auto'?'auto':primary.field;
    if(p.mode==='manual' && keys.length>1)this.select.selectedOptions[0].textContent+=` +${keys.length-1}`;
    // Auto label must describe auto's actual rule, not the current manual field.
    this.select.options[0].textContent=t('Sort.AutoEffective',{field:sortFieldLabel(effectiveSort({mode:'auto'},scheme,query)[0].field)});
    this.direction.disabled=primary.field==='relevance';
    this.direction.textContent=primary.direction==='desc'?'↓':'↑';
    const directionLabel=t(primary.direction==='desc'?'Sort.Desc':'Sort.Asc');
    this.direction.title=directionLabel;this.direction.setAttribute('aria-label',directionLabel);
    this.select.title=keys.map(k=>`${sortFieldLabel(k.field)} ${k.direction==='asc'?'↑':'↓'}`).join(' → ');
    this.more.classList.toggle('si-sort-custom',p.mode==='manual'&&p.keys.length>1);
    this.renderEditor();
  }
  renderEditor(){
    const focused=this.drawer.contains(document.activeElement)?document.activeElement.getAttribute("aria-label"):null;
    const p=this.profile,keys=effectiveSort(p,this.scheme,this.query);
    this.drawer.replaceChildren();
    this.drawer.append(el('div','si-sort-title',t('Sort.Advanced')));
    keys.forEach((key,i)=>{
      const row=el('div','si-sort-rule');
      row.append(el('span','si-sort-number',String(i+1)));
      const select=el('select','si-sort-select');select.setAttribute('aria-label',t('Sort.Rule',{n:i+1}));
      for(const f of ['relevance',...SORT_FIELDS[this.scheme]])if(f===key.field||!keys.some(k=>k.field===f))this.option(select,f,sortFieldLabel(f));
      select.value=key.field;
      const edit=fn=>{p.mode='manual';p.keys=keys.map(k=>({...k}));fn(p.keys);this.commit();};
      select.addEventListener('change',()=>edit(k=>{k[i]={field:select.value,direction:'asc'};}));
      const direction=btn(t('Sort.RuleDirection',{n:i+1}),key.direction==='asc'?'↑':'↓');direction.disabled=key.field==='relevance';
      direction.addEventListener('click',()=>edit(k=>{k[i].direction=k[i].direction==='asc'?'desc':'asc';}));
      const up=btn(t('Sort.MoveUp',{n:i+1}),'⌃');up.disabled=i===0;
      up.addEventListener('click',()=>{edit(k=>{[k[i-1],k[i]]=[k[i],k[i-1]];});this.drawer.querySelectorAll('select')[i-1]?.focus();});
      const remove=btn(t('Sort.Remove',{n:i+1}),'×');remove.disabled=keys.length===1;
      remove.addEventListener('click',()=>{edit(k=>k.splice(i,1));this.drawer.querySelector('select')?.focus();});
      row.append(select,direction,up,remove);this.drawer.append(row);
    });
    const actions=el('div','si-sort-actions');
    const add=btn(t('Sort.Add'),t('Sort.Add'));add.disabled=keys.length>=3;
    add.addEventListener('click',()=> {p.mode='manual';p.keys=[...keys,{field:SORT_FIELDS[this.scheme].find(f=>!keys.some(k=>k.field===f)),direction:'asc'}];this.commit();this.drawer.querySelectorAll('.si-sort-rule select')[p.keys.length-1]?.focus();});
    const reset=btn(t('Sort.Reset'),t('Sort.Reset'));reset.addEventListener('click',()=>{p.mode='auto';this.commit();this.select.focus();});
    actions.append(add,reset);this.drawer.append(actions);
    const label=el('label','si-sort-language',t('Sort.NameOrder'));
    const order=el('select','si-sort-select');this.option(order,'local',t('Sort.Local'));this.option(order,'english',t('Sort.English'));order.value=p.nameOrder;
    order.addEventListener('change',()=>{p.nameOrder=order.value;this.commit();});label.append(order);order.setAttribute('aria-label',t('Sort.NameOrder'));this.drawer.append(label,el('p','si-filter-help',t('Sort.Help')));
    if(focused)for(const control of this.drawer.querySelectorAll('[aria-label]'))if(control.getAttribute('aria-label')===focused){control.focus();break;}
  }
}
