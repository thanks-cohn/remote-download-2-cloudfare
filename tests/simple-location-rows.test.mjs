import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import {JSDOM} from 'jsdom';

const options=await readFile(new URL('../extension/options.js',import.meta.url),'utf8');
const editorCode=options.slice(options.indexOf('function simpleFolderPathEditor('),options.indexOf('function simpleBucketCreator(){'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settled(){for(let i=0;i<18;i++)await tick();}
function harness(initialPrefix='one/two/three'){
  const dom=new JSDOM('<main id="host"></main><div id="status"></div>',{url:'https://extension.test',runScripts:'outside-only'});
  const stored=[],calls=[],tree=new Map([['',['one','other']],['one',['two','alternate']],['one/two',['three']],['one/two/three',['four']],['other',['different']],['other/different',[]]]);
  const send=async request=>{
    calls.push({...request});
    if(request.type==='cfFolderChildren')return {ok:true,children:tree.get(request.parentPrefix)||[]};
    if(request.type==='cfCreateFolder'){
      const list=tree.get(request.prefix)||[];
      tree.set(request.prefix,[...list,request.name]);
      return {ok:true,key:[request.prefix,request.name].filter(Boolean).join('/')+'/'};
    }
    throw Error('Unexpected: '+request.type);
  };
  const context=vm.createContext({document:dom.window.document,send,scheduleSave:()=>{},saveProfiles:async()=>{},uid:()=>String(Math.random()),field:()=>dom.window.document.createElement('input')});
  vm.runInContext(editorCode,context);
  const profile={type:'cloudflare-r2',accountId:'account',accountName:'Account',bucketName:'bucket',defaultPrefix:initialPrefix};
  context.profile=profile;
  const parent=dom.window.document.getElementById('host'),status=dom.window.document.getElementById('status');
  context.host=parent;context.status=status;
  const editor=vm.runInContext('simpleFolderPathEditor(profile,host,status,()=>profile.bucketName,profile.defaultPrefix,prefix=>{profile.defaultPrefix=prefix})',context);
  const rows=()=>[...parent.querySelectorAll('.location-level-row')];
  const select=(index,name)=>{const el=rows()[index].querySelector('select');el.value=name;el.dispatchEvent(new dom.window.Event('change'));};
  return {dom,profile,parent,status,stored,calls,tree,editor,rows,select};
}
test('Simple: removing an ancestor preserves reusable blank descendant rows and does not delete R2 folders',async()=>{
  const h=harness();await settled();
  assert.equal(h.rows().length,3);
  const rootRow=h.rows()[0];
  rootRow.querySelector('.location-level-remove').click();await settled();
  assert.equal(h.rows().length,3,'descendant row count is retained');
  assert.deepEqual(h.rows().map(r=>r.querySelector('select').value),['','','']);
  assert.equal(h.profile.defaultPrefix,'');
  assert.equal(h.calls.some(call=>call.type==='cfCreateFolder'),false);
  h.select(0,'other');await settled();
  assert.equal(h.rows()[1].querySelector('select').disabled,false);
  assert.ok([...h.rows()[1].querySelector('select').options].some(o=>o.value==='different'));
  h.dom.window.close();
});
test('Simple: selecting existing folder does not populate creation draft',async()=>{
  const h=harness('');await settled();
  h.select(0,'one');await settled();
  assert.equal(h.rows()[0].querySelector('.location-level-input').value,'');
  h.rows()[0].querySelector('button:nth-last-child(2)').click();await settled();
  assert.equal(h.rows()[1].querySelector('.location-level-input').value,'');
  assert.ok([...h.rows()[1].querySelector('select').options].some(o=>o.value==='two'));
  h.dom.window.close();
});
test('Simple: new directory is created under the exact parent only after Create',async()=>{
  const h=harness('one');await settled();
  const row=h.rows()[0];
  row.querySelector('.location-level-input').value='created-here';
  assert.equal(h.calls.some(c=>c.type==='cfCreateFolder'),false);
  row.querySelector('button:nth-last-child(3)').click();await settled();
  const request=h.calls.find(c=>c.type==='cfCreateFolder');
  assert.deepEqual({bucketName:request.bucketName,prefix:request.prefix,name:request.name},{bucketName:'bucket',prefix:'',name:'created-here'});
  assert.equal(h.profile.defaultPrefix,'created-here');
  assert.equal(h.rows()[0].querySelector('.location-level-input').value,'');
  h.dom.window.close();
});
