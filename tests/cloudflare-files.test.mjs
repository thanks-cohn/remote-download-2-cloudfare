import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../extension/cloudflare-api.js',import.meta.url),'utf8');
const settings=await readFile(new URL('../extension/options.js',import.meta.url),'utf8');
function harness(fetchImpl=async()=>new Response('image')) {
  const local={cloudflareAuth:{accessToken:'token',refreshToken:'refresh',expiresAt:Date.now()+3600000}};
  const calls=[]; let queue=Promise.resolve();
  const context=vm.createContext({Headers,FormData,AbortSignal,URL,URLSearchParams,Blob,Date,
    navigator:{locks:{request(_name,fn){const result=queue.catch(()=>{}).then(fn);queue=result;return result;}}},
    chrome:{storage:{local:{async get(){return local;},async set(data){Object.assign(local,data);}}},downloads:{async download(options){calls.push(options);return 123;}}},
    fetch:fetchImpl});
  vm.runInContext(source,context);
  return {api:context.RedownCloudflareApi,context,local,calls};
}
const bucket={accountId:'account',bucketName:'bucket'};
test('private WEBP preview reads nested keys without a Worker or background messaging',async()=>{
  const h=harness(async(url,options)=>{
    assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/account/r2/buckets/bucket/objects/folder/a%20%23%3F.webp');
    assert.equal(options.headers.get('authorization'),'Bearer token');
    return new Response('webp-data');
  });
  const url=await h.api.preview(bucket,'folder/a #?.webp','image/webp');
  const response=await fetch(url);
  assert.equal(response.headers.get('content-type'),'image/webp');
  assert.equal(await response.text(),'webp-data');
  URL.revokeObjectURL(url);
});
test('downloads use a header, keep credentials out of URLs and sanitize filenames',async()=>{
  const h=harness();
  assert.equal(await h.api.download(bucket,'folder/a.webp','a:b.webp'),123);
  assert.equal(h.calls[0].headers[0].value,'Bearer token');
  assert.equal(h.calls[0].filename,'a_b.webp');
  assert.ok(!h.calls[0].url.includes('token'));
});
test('concurrent expired requests refresh rotating credentials once',async()=>{
  let refreshes=0;
  const h=harness(async(url,options)=>{
    if(url.endsWith('/oauth2/token')){refreshes++;await Promise.resolve();return Response.json({access_token:'new',refresh_token:'rotated',expires_in:3600});}
    assert.equal(options.headers.get('authorization'),'Bearer new');return new Response('ok');
  });
  h.local.cloudflareAuth.expiresAt=0.1;
  await Promise.all([h.api.request('/one'),h.api.request('/two')]);
  assert.equal(refreshes,1);assert.equal(h.local.cloudflareAuth.refreshToken,'rotated');
});
test('401 refresh retries a private read and denied reads report failure',async()=>{
  let requests=0;
  const h=harness(async url=>url.endsWith('/oauth2/token')?Response.json({access_token:'new',expires_in:3600}):new Response('',{status:++requests===1?401:403}));
  await assert.rejects(h.api.preview(bucket,'a.webp','image/webp'),/403/);
  assert.equal(requests,2);
});
test('oversized preview stops without allocating an object URL',async()=>{
  const h=harness(async()=>new Response('data',{headers:{'content-length':String(65*1024*1024)}}));
  await assert.rejects(h.api.preview(bucket,'large.webp','image/webp'),/too large/);
});
test('preview failure replaces spinner and download rejection ends progress',async()=>{
  const root={replaceChildren(){this.textContent='';},append(){},textContent:''};
  const context=vm.createContext({AbortController,URL,document:{createElement(){return {};},querySelectorAll(){return [];}},
    $(){return root;},workspacePreviewRequestId:0,workspacePreviewAbort:null,workspacePreviewUrl:'',
    explorerSource(){return bucket;},objectContentType(){return 'image/webp';},
    RedownCloudflareApi:{async preview(){throw new Error('Read denied. Retry.');},async download(){throw new Error('Download denied.');}},
    setOperation(){},finishOperation(text,failed){context.finished={text,failed};}});
  const begin=settings.indexOf('async function showWorkspacePreview('),end=settings.indexOf('\nfunction workspaceLightboxLayer',begin);
  vm.runInContext(settings.slice(begin,end),context);
  await context.showWorkspacePreview({key:'a.webp'});
  assert.equal(root.textContent,'Read denied. Retry.');
  const a=settings.indexOf('async function explorerDownload('),b=settings.indexOf('\nasync function showProperties',a);
  vm.runInContext(settings.slice(a,b),context);
  await context.explorerDownload({key:'a.webp',name:'a.webp'});
  assert.equal(context.finished.failed,true);
  assert.equal(context.finished.text,'Download denied.');
});
