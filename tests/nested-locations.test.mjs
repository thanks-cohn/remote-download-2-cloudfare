import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import {JSDOM} from 'jsdom';

const modelSource=await readFile(new URL('../extension/nested-locations.js',import.meta.url),'utf8');
const editorSource=await readFile(new URL('../extension/nested-menu-editor.js',import.meta.url),'utf8');
const background=await readFile(new URL('../extension/background.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settled(){for(let i=0;i<12;i++)await tick();}
const folder=(id,name,children=[])=>({id,name,ready:true,children});
function profile(){return {id:'profile',type:'cloudflare-r2',accountId:'account',accountName:'My storage',bucketName:'bucket-one',defaultPrefix:'quick-only',menuTree:[],nestedMenu:{version:1,enabled:true,roots:[{id:'root',bucketName:'bucket-one',ready:true,children:[folder('child','child',[folder('grand','grandchild')])]}]}};}
function harness(p=profile(),sendOverride){
  const dom=new JSDOM('<main id="editor"></main>',{runScripts:'outside-only',url:'https://settings.test'});
  dom.window.eval(modelSource);dom.window.eval(editorSource);
  const calls=[],saved=[],locations=new Map([['',['child','sibling']],['child',['grandchild']],['child/grandchild',[]]]);
  const send=async message=>{
    calls.push(structuredClone(message));
    if(sendOverride){const result=await sendOverride(message);if(result)return result;}
    if(message.type==='cfBuckets')return {ok:true,buckets:[{name:'bucket-one'},{name:'bucket-two'}]};
    if(message.type==='cfFolderChildren')return {ok:true,children:locations.get(message.parentPrefix) || []};
    if(message.type==='cfCreateFolder'){
      const children=locations.get(message.prefix) || [];locations.set(message.prefix,[...children,message.name]);
      return {ok:true,key:[message.prefix,message.name].filter(Boolean).join('/')+'/'};
    }
    if(message.type==='cfCreateBucket')return {ok:true,bucket:{name:message.name}};
    throw new Error(`Unexpected request ${message.type}`);
  };
  dom.window.RedownNestedEditor.mount(dom.window.document.getElementById('editor'),{profiles:()=>[p],save:async value=>saved.push(structuredClone(value)),send});
  const row=id=>dom.window.document.querySelector(`[data-node-id="${id}"] > .nested-location-row`);
  const change=(select,value)=>{select.value=value;select.dispatchEvent(new dom.window.Event('change'));};
  const type=(input,value)=>{input.value=value;input.dispatchEvent(new dom.window.Event('input'));};
  return {dom,p,calls,saved,row,change,type,locations};
}

test('selection never fills the new-name field, and preserves an independently typed draft',async()=>{
  const h=harness();await settled();
  let row=h.row('child');assert.equal(row.querySelector('input').value,'');
  h.change(row.querySelector('select'),'sibling');await settled();
  assert.equal(h.row('child').querySelector('input').value,'');
  h.type(h.row('child').querySelector('input'),'my-new-folder');
  h.change(h.row('child').querySelector('select'),'child');await settled();
  assert.equal(h.row('child').querySelector('input').value,'my-new-folder');
  const bucket=h.dom.window.document.querySelector('.nested-roots > .nested-group select');
  const bucketInput=h.dom.window.document.querySelector('.nested-roots > .nested-group input');
  h.type(bucketInput,'new-bucket');h.change(bucket,'bucket-two');await settled();
  assert.equal(h.dom.window.document.querySelector('.nested-roots > .nested-group input').value,'new-bucket');
  assert.equal(h.calls.filter(c=>c.type==='cfCreateFolder'||c.type==='cfCreateBucket').length,0);
  h.dom.window.close();
});

test('Add child and Create use the exact parent path; actual dropdown children stay scoped',async()=>{
  const h=harness();await settled();
  assert.deepEqual([...h.row('grand').querySelector('select').options].map(o=>o.value),['','grandchild']);
  h.row('grand').querySelector('.nested-actions button').click();await settled();
  const child=h.p.nestedMenu.roots[0].children[0].children[0].children[0];
  assert.ok(child);h.type(h.row(child.id).querySelector('input'),'great-grandchild');
  h.row(child.id).querySelector('.nested-create button').click();await settled();
  const creation=h.calls.find(c=>c.type==='cfCreateFolder');
  assert.equal(creation.prefix,'child/grandchild');assert.equal(creation.name,'great-grandchild');
  assert.equal(child.name,'great-grandchild');assert.equal(h.row(child.id).querySelector('input').value,'');
  assert.equal(h.row(child.id).querySelector('select').value,'great-grandchild');
  assert.ok(h.dom.window.RedownNestedLocations.destinations(h.p.nestedMenu).some(d=>d.prefix==='child/grandchild/great-grandchild'));
  assert.equal(h.p.defaultPrefix,'quick-only');assert.deepEqual(h.p.menuTree,[]);
  h.dom.window.close();
});

test('hiding a nested menu preserves its hierarchy and failed creation preserves the draft',async()=>{
  const h=harness(profile(),message=>message.type==='cfCreateFolder'?{ok:false,error:'Permission denied'}:null);await settled();
  h.type(h.row('child').querySelector('input'),'retry-name');h.row('child').querySelector('.nested-create button').click();await settled();
  assert.equal(h.row('child').querySelector('input').value,'retry-name');assert.equal(h.p.nestedMenu.roots[0].children[0].name,'child');
  assert.match(h.dom.window.document.querySelector('.nested-status').textContent,/Permission denied/);
  const checkbox=h.dom.window.document.querySelector('.nested-heading input');checkbox.checked=false;checkbox.dispatchEvent(new h.dom.window.Event('change'));await settled();
  assert.equal(h.p.nestedMenu.enabled,false);assert.equal(h.p.nestedMenu.roots[0].children[0].children[0].name,'grandchild');
  assert.equal(h.p.defaultPrefix,'quick-only');h.dom.window.close();
});

test('native nested menu targets every verified depth and offers Send here for parents',async()=>{
  const created=[],context=vm.createContext({crypto:webcrypto,chrome:{contextMenus:{create:item=>created.push(item)}},ROOT_MENU_ID:'REDOWN'});
  vm.runInContext(modelSource,context);
  vm.runInContext(background.slice(background.indexOf('function addNestedLocations('),background.indexOf('async function rebuildMenus()')),context);
  context.p=profile();vm.runInContext('addNestedLocations(p)',context);
  assert.ok(created.some(item=>item.id==='nested:profile:root:grand' && item.parentId==='nested:profile:root:child'));
  assert.ok(created.some(item=>item.id==='nested:profile:root:child:send' && item.title==='Send here'));
  assert.ok(created.some(item=>item.id==='nested:profile:root:root:send'));
  context.p.nestedMenu.roots[0].children[0].ready=false;created.length=0;vm.runInContext('addNestedLocations(p)',context);
  assert.ok(!created.some(item=>item.id.includes(':child') || item.id.includes(':grand')));
});

test('legacy paths migrate without modifying old configuration or writing remote folders',async()=>{
  const p=profile();delete p.nestedMenu;p.menuTree=[{id:'old',label:'Old label',prefix:'child',children:[{id:'old-grand',prefix:'grandchild',children:[]}]}];
  const before=structuredClone(p.menuTree),h=harness(p);await settled();
  assert.deepEqual(p.menuTree,before);assert.equal(p.nestedMenu.roots[0].children[0].children[0].name,'grandchild');
  assert.ok(h.dom.window.RedownNestedLocations.destinations(p.nestedMenu).some(d=>d.prefix==='child/grandchild'));
  assert.equal(h.calls.filter(c=>c.type==='cfCreateFolder'||c.type==='cfEnsurePrefixes').length,0);h.dom.window.close();
});

test('nested saving retains provisioned worker credentials and new Explorer profiles through autosave',async()=>{
  const options=await readFile(new URL('../extension/options.js',import.meta.url),'utf8');
  const p=profile();p.token='stale';
  let stored=[{...structuredClone(p),token:'current-secret',workerVersion:3},{id:'new-hidden',explorerManaged:true,bucketName:'bucket-two',token:'second-secret'}];
  const context=vm.createContext({structuredClone,profiles:[p],chrome:{storage:{local:{get:async()=>({profiles:structuredClone(stored)}),set:async value=>{stored=structuredClone(value.profiles);}}}}});
  vm.runInContext(options.slice(options.indexOf('async function saveProfiles()'),options.indexOf('function displayName(')),context);
  await vm.runInContext('saveNestedMenu(profiles[0])',context);
  await vm.runInContext('saveProfiles()',context);
  assert.equal(stored[0].token,'current-secret');assert.equal(stored[0].defaultPrefix,'quick-only');
  assert.equal(stored.find(item=>item.id==='new-hidden').token,'second-secret');
  assert.equal(stored[0].nestedMenu.roots[0].children[0].children[0].name,'grandchild');
});

test('Simple and Nested menus remain independent when either is hidden',async()=>{
  const p=profile(),created=[];
  const context=vm.createContext({crypto:webcrypto,chrome:{contextMenus:{removeAll:async()=>{created.length=0;},create:item=>created.push(item)}},ROOT_MENU_ID:'REDOWN',getProfiles:async()=>[p]});
  vm.runInContext(modelSource,context);
  vm.runInContext(background.slice(background.indexOf('function addNestedLocations('),background.indexOf('chrome.runtime.onInstalled.addListener')),context);
  await vm.runInContext('rebuildMenus()',context);
  assert.ok(created.some(item=>item.id==='quick:profile'));assert.ok(created.some(item=>item.id==='nested:profile:root:grand'));
  p.showInContextMenu=false;await vm.runInContext('rebuildMenus()',context);
  assert.ok(!created.some(item=>item.id==='quick:profile'));assert.ok(created.some(item=>item.id==='nested:profile:root:grand'));
  p.showInContextMenu=true;p.nestedMenu.enabled=false;await vm.runInContext('rebuildMenus()',context);
  assert.ok(created.some(item=>item.id==='quick:profile'));assert.ok(!created.some(item=>item.id.startsWith('nested:')));
});
