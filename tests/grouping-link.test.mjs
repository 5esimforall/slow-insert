import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroupingLink} from '../module/scripts/grouping-link.mjs';
import {language} from './localization.mjs';

function setup(t, lang = 'en') {
  const before = {document:globalThis.document,game:globalThis.game,ui:globalThis.ui};
  t.after(()=>Object.assign(globalThis,before));
  globalThis.document = {createDocumentFragment:()=>({tag:'fragment',children:[]}),createElement:tag=>({tag,children:[],attributes:{},append(...nodes){this.children.push(...nodes);},setAttribute(k,v){this.attributes[k]=v;}})};
  globalThis.game = {user:{isGM:true},i18n:language(lang)};
  const warnings = [];
  globalThis.ui = {notifications:{warn:message=>warnings.push(message)}};
  return warnings;
}

test('grouping entry is a single labeled external-style action that opens Truesight', async t => {
  setup(t,'cn');let opened=0;
  const link=createGroupingLink(async()=>{opened++;});
  assert.equal(link.tag,'button');assert.equal(link.type,'button');
  assert.equal(link.className,'si-grouping-link');assert.equal(link.children.length,2);
  assert.equal(link.children[0].textContent,'归组管理 · Truesight');
  assert.equal(link.children[1].attributes['aria-hidden'],'true');
  assert.match(link.children[1].className,/fa-up-right-from-square/);
  await link.onclick();assert.equal(opened,1);assert.equal(link.disabled,false);
});

test('grouping entry suppresses duplicate opens and recovers after an opening failure', async t => {
  const warnings=setup(t);let reject,opened=0;
  const original=console.error;console.error=()=>{};t.after(()=>console.error=original);
  const link=createGroupingLink(()=>{opened++;return new Promise((_,fail)=>{reject=fail;});});
  const pending=link.onclick();assert.equal(link.disabled,true);
  await link.onclick();assert.equal(opened,1);
  reject(Error('unavailable'));await pending;
  assert.equal(link.disabled,false);assert.deepEqual(warnings,['Could not open Truesight. Check that the module is enabled.']);
});


test('players have no grouping management entry and cannot invoke a previously created GM button', async t => {
  setup(t); let opened=0;
  const gm=createGroupingLink(async()=>{opened++;});
  game.user.isGM=false;
  const player=createGroupingLink(async()=>{opened++;});
  assert.equal(player.tag,'fragment');assert.equal(player.children.length,0);
  await gm.onclick();assert.equal(opened,0);
});
