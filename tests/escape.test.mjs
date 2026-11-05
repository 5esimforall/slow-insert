import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SlowInsertPanel } from '../module/scripts/panel.mjs';

test('Escape passes through the local search handler without consuming or closing anything',()=>{
 const panel=Object.assign(Object.create(SlowInsertPanel.prototype),{input:{},close(){throw Error('Must not close on Escape');}});
 for (const target of [panel.input, {}]) for (const properties of [{},{repeat:true},{ctrlKey:true},{isComposing:true}]) {
  const event={key:'Escape',code:'Escape',target,...properties,preventDefault(){throw Error('Must not consume Escape');},stopPropagation(){throw Error('Must not stop Escape');}};
  panel.onKeydown(event);
 }
 assert.equal(panel.onEscape,undefined);
 assert.equal(panel.onDocumentKeydown,undefined);
});
test('module does not register Escape bindings, global listeners, or native dismissal forwarding',async()=>{
 const panel=await readFile(new URL('../module/scripts/panel.mjs',import.meta.url),'utf8');
 const main=await readFile(new URL('../module/scripts/main.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(panel,/core\.dismiss|hasPriorityEscapeTarget|onDocumentKeydown|onEscape|this\.listen\(document,\s*["']keydown/);
 assert.doesNotMatch(main,/key:\s*["']Escape|MODULE_ID,\s*["']dismiss/);
 assert.match(main,/MODULE_ID, "toggle"/); // Existing explicit sidebar toggle shortcut is unaffected.
});
