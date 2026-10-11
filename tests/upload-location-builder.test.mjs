import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

const source=await readFile(new URL('../extension/options.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function uploadBuilderChildren('),source.indexOf('function renderWorkspaceProfiles()'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<20;i++)await tick();}
function harness(){
  const dom=new JSDOM('<select id="local-prefix"><option value="">/</option></select><div id="local-location-builder"></div><div id="local-location-hint"></div>',{url:'https://settings.example',runScripts:'outside-only'});
  const state={target:{accountId:'acc',bucketName:'alpha'},calls:[]};
  const tree=new Map([['alpha:', ['images','projects']], ['alpha:images',['portraits']], ['beta:',['videos']]]);
  const ctx=vm.createContext({
    document:dom.window.document, uploadLocationPrefixes:[],uploadLocationSegments:[''],
    uploadLocationLoadVersion:0,uploadLocationTargetKey:'',
    uploadTarget:()=>({...state.target}),
    uploadProfile:()=>({folders:{files:'old-bucket-only',videos:'another-bucket/path'}}),
    $:id=>dom.window.document.getElementById(id),
    send:async msg=>{
      state.calls.push({...msg});
      if(msg.type==='cfFolderChildren')return {ok:true,children:tree.get(msg.bucketName+':'+msg.parentPrefix)||[]};
      throw Error('Unexpected operation '+msg.type);
    },
    ensureUploadLocationOption:()=>{},
    ensureUploadProfile:async()=>({}),
    ensureProfileMenuPrefixes:async()=>{}
  });
  vm.runInContext(code,ctx);
  return {dom,state,ctx,tree,root:dom.window.document.getElementById('local-location-builder')};
}
test('BUG-014: selecting an existing child does not fill the new-folder input or create a directory',async()=>{
  const h=harness();await vm.runInContext('loadUploadLocations({preserve:false})',h.ctx);await settle();
  const first=h.root.querySelector('select');
  assert.ok([...first.options].some(x=>x.value==='images'));
  first.value='images';first.dispatchEvent(new h.dom.window.Event('change'));await settle();
  const add=h.root.querySelector('.upload-path-add');
  add.click();await settle();
  assert.equal(h.root.querySelectorAll('.upload-path-row').length,2);
  const second=h.root.querySelectorAll('.upload-path-row')[1];
  assert.equal(second.querySelector('.upload-path-input').value,'');
  const deeper=second.querySelector('select');
  assert.ok([...deeper.options].some(x=>x.value==='portraits'));
  deeper.value='portraits';deeper.dispatchEvent(new h.dom.window.Event('change'));await settle();
  assert.equal(h.root.querySelectorAll('.upload-path-row')[1].querySelector('.upload-path-input').value,'');
  assert.equal(h.state.calls.some(x=>x.type==='cfCreateFolder'||x.type==='cfEnsurePrefixes'),false);
  h.dom.window.close();
});
test('BUG-013: right-side root lists only immediate folders from the selected left bucket',async()=>{
  const h=harness();await vm.runInContext('loadUploadLocations({preserve:false})',h.ctx);await settle();
  let first=h.root.querySelector('select');
  assert.deepEqual([...first.options].map(x=>x.value),['','images','projects']);
  assert.ok(![...first.options].some(x=>x.value==='old-bucket-only'||x.value==='beta'));
  h.state.target={accountId:'acc',bucketName:'beta'};
  await vm.runInContext('loadUploadLocations({preserve:true})',h.ctx);await settle();
  first=h.root.querySelector('select');
  assert.deepEqual([...first.options].map(x=>x.value),['','videos']);
  assert.equal(h.ctx.uploadLocationTargetKey,'acc:beta');
  h.dom.window.close();
});
test('BUG-013: stale earlier bucket results cannot overwrite newly selected bucket',async()=>{
  const h=harness();
  let release;
  h.ctx.send=async msg=>{
    h.state.calls.push({...msg});
    if(msg.bucketName==='alpha' && msg.parentPrefix==='')return new Promise(resolve=>{release=resolve;});
    return {ok:true,children:msg.bucketName==='beta'?['videos']:[]};
  };
  const first=vm.runInContext('loadUploadLocations({preserve:false})',h.ctx);
  await settle();
  h.state.target={accountId:'acc',bucketName:'beta'};
  await vm.runInContext('loadUploadLocations({preserve:false})',h.ctx);
  release({ok:true,children:['images','projects']});await first;await settle();
  assert.deepEqual([...h.root.querySelector('select').options].map(x=>x.value),['','videos']);
  h.dom.window.close();
});
