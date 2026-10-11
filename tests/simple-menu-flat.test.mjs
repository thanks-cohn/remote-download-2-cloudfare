import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source=await readFile(new URL('../extension/background.js',import.meta.url),'utf8');
const begin=source.indexOf('async function buildMenus() {');
const end=source.indexOf('chrome.runtime.onInstalled.addListener(rebuildMenus);',begin);
assert.ok(begin>=0&&end>begin);

function harness(profiles){
  const created=[];
  const context=vm.createContext({
    ROOT_MENU_ID:'REDOWN',
    chrome:{
      contextMenus:{removeAll:async()=>{created.length=0;},create:item=>created.push(item)},
      storage:{local:{get:async()=>({rightClickMode:'simple'}),set:async()=>{}}}
    },
    getProfiles:async()=>profiles,
    RedownNestedLocations:{menuMode:()=> 'simple'}
  });
  vm.runInContext(source.slice(begin,end),context);
  return {created,build:()=>vm.runInContext('buildMenus()',context)};
}

test('Simple menu places default and extra destinations immediately under REDOWN, never inside a preset submenu',async()=>{
  const h=harness([{
    id:'p',type:'cloudflare-r2',accountId:'a',bucketName:'bucket-one',
    defaultPrefix:'images/portraits/final',menuLabel:'',
    showInContextMenu:true,menuOrder:1,
    simpleOptions:[
      {id:'a',bucketName:'bucket-one',prefix:'projects/characters/ozempic',label:'Custom label'},
      {id:'b',bucketName:'bucket-one',prefix:'assets/raw/sounds',label:''},
      {id:'c',bucketName:'bucket-one',prefix:'',label:''}
    ]
  }]);
  await h.build();
  assert.deepEqual(h.created.filter(x=>String(x.id).startsWith('quick:')||String(x.id).startsWith('simple-option:')).map(x=>({id:x.id,parentId:x.parentId,title:x.title})),[
    {id:'quick:p',parentId:'REDOWN',title:'final'},
    {id:'simple-option:p:a',parentId:'REDOWN',title:'Custom label'},
    {id:'simple-option:p:b',parentId:'REDOWN',title:'sounds'},
    {id:'simple-option:p:c',parentId:'REDOWN',title:'bucket-one'}
  ]);
  assert.ok(!h.created.some(x=>String(x.id).startsWith('simple:p')));
});
