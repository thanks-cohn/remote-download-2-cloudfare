import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

const source = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
const authSource = await readFile(new URL('../extension/cloudflare-auth.js', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../extension/cloudflare-api.js', import.meta.url), 'utf8');
const nestedSource = await readFile(new URL('../extension/nested-locations.js', import.meta.url), 'utf8');
const optionsSource = await readFile(new URL('../extension/options.js', import.meta.url), 'utf8');
function event() {
  const listeners = [];
  return { listeners, addListener(fn) { listeners.push(fn); } };
}
function harness(shared = {}) {
  const session = shared.session || {}, local = shared.local || {}, windows = shared.windows || new Map();
  const calls = [], alarms = new Map();
  let navigationReady;
  const navigated = new Promise(resolve => { navigationReady = resolve; });
  const lockQueues = shared.lockQueues || new Map();
  const locks = { request(name, task) {
    const result = (lockQueues.get(name) || Promise.resolve()).catch(() => {}).then(task);
    lockQueues.set(name, result.catch(() => {}));
    return result;
  } };
  const storage = values => ({
    async get(key) { return { [key]: structuredClone(values[key]) }; },
    async set(patch) { Object.assign(values, structuredClone(patch)); },
    async remove(key) { delete values[key]; }
  });
  const chrome = {
    identity: { getRedirectURL(path = '') { return `https://testid.chromiumapp.org/${path}`; } },
    runtime: { onInstalled:event(), onStartup:event(), onMessage:event(), sendMessage() { throw new Error("background unavailable"); } },
    storage: { session:storage(session), local:storage(local), onChanged:event() },
    contextMenus: { onClicked:event() },
    windows: {
      onRemoved:event(),
      async create(options) {
        calls.push(['create', options]);
        if (shared.createError) throw new Error(shared.createError);
        const window = { id:10, tabs:[{id:20}] }; windows.set(10, window); return window;
      },
      async update(id, options) {
        calls.push(['focus', id, options]);
        if (!windows.has(id)) throw new Error('No window');
      },
      async remove(id) { calls.push(['remove', id]); windows.delete(id); }
    },
    tabs: { async update(id, options) { calls.push(['navigate', id, options]); navigationReady(); } },
    alarms: {
      onAlarm:event(), async create(name, details) { alarms.set(name, details); },
      async clear(name) { alarms.delete(name); }
    },
    webNavigation: { onBeforeNavigate:event(), onCommitted:event(), onErrorOccurred:event() }
  };
  let fetchImpl = async url => {
    calls.push(['fetch', url]);
    if (url.endsWith('/oauth2/token')) return Response.json({access_token:'verified-token', refresh_token:'refresh', expires_in:3600});
    return Response.json({success:true, result:[{id:'account'}]});
  };
  const timers = [];
  const context = vm.createContext({
    chrome, navigator:{locks}, crypto:webcrypto, TextEncoder, Uint8Array, URL, URLSearchParams, Headers,
    AbortController, AbortSignal, FormData, btoa, console,
    setTimeout(fn, ms) { const timer = {fn, ms}; timers.push(timer); return timer; },
    clearTimeout(timer) { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); },
    fetch(...args) { return fetchImpl(...args); }
  });
  context.importScripts = path => {
    if (path === 'cloudflare-auth.js') vm.runInContext(authSource, context);
    else if(path === 'nested-locations.js')vm.runInContext(nestedSource,context);
    else { assert.equal(path, 'cloudflare-api.js'); vm.runInContext(apiSource, context); }
  };
  if (shared.withoutBackground) vm.runInContext(authSource, context);
  else vm.runInContext(source, context);
  return {
    session, local, windows, chrome, calls, alarms, timers, lockQueues, navigated,
    settings() {
      const button = {disabled:false, textContent:'Connect Cloudflare', addEventListener(_type, fn) { this.click = fn; }};
      const statuses = [];
      Object.assign(context, {
        $() { return button; }, setStatus(_id, text) { statuses.push(text); },
        send() { throw new Error('settings must not send login messages'); },
        async refreshCloudflare() {}, safeUiMessage(value) { return value; }
      });
      const begin = optionsSource.indexOf('async function loginRequest(');
      const end = optionsSource.indexOf('$("disconnect-cloudflare").addEventListener', begin);
      vm.runInContext(optionsSource.slice(begin, end), context);
      return {button, statuses};
    },
    run(code) { return vm.runInContext(code, context); },
    fetch(fn) { fetchImpl = fn; },
    callback(patch = {}) {
      const attempt = session.cloudflareLogin;
      return chrome.webNavigation.onBeforeNavigate.listeners[0]({tabId:attempt.tabId, frameId:0,
        url:`${attempt.redirectUri}?state=${attempt.state}&code=code`, ...patch});
    }
  };
}

test('click creates a visible window before network navigation; repeated clicks focus it', async () => {
  const h = harness();
  const [a, b] = await Promise.all([h.run('connectCloudflare()'), h.run('connectCloudflare()')]);
  assert.equal(a.attemptId, b.attemptId);
  assert.equal(a.pending, true);
  assert.equal(h.calls.filter(c => c[0] === 'create').length, 1);
  assert.deepEqual(structuredClone(h.calls[0][1]), {url:'about:blank', type:'popup', focused:true, width:720, height:780});
  const url = new URL(h.calls.find(c => c[0] === 'navigate')[2].url);
  assert.equal(url.origin, 'https://dash.cloudflare.com');
  assert.equal(url.pathname, '/oauth2/auth');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), h.session.cloudflareLogin.redirectUri);
  assert.ok(url.searchParams.get('code_challenge'));
  assert.equal(h.calls.some(c => c[0] === 'fetch'), false);
  await h.run('connectCloudflare()');
  assert.equal(h.calls.at(-1)[0], 'focus');
  const status = await h.run('RedownCloudflareAuth.status()');
  assert.equal(status.verifier, undefined);
  assert.equal(status.state, undefined);
});

test('successful callback exchanges PKCE and verifies access before saving token', async () => {
  const h = harness(); await h.run('connectCloudflare()');
  const verifier = h.session.cloudflareLogin.verifier;
  let exchange;
  h.fetch(async (url, options) => {
    assert.equal(h.local.cloudflareAuth, undefined);
    if (url.endsWith('/oauth2/token')) {
      exchange = options.body;
      return Response.json({access_token:'token', expires_in:3600});
    }
    assert.equal(options.headers.authorization, 'Bearer token');
    return Response.json({success:true, result:[]});
  });
  await h.callback();
  assert.equal(exchange.get('code_verifier'), verifier);
  assert.equal(h.local.cloudflareAuth.accessToken, 'token');
  assert.equal(h.session.cloudflareLogin.phase, 'connected');
  assert.equal(h.session.cloudflareLogin.verifier, undefined);
  assert.equal(h.windows.size, 0);
  assert.equal(h.alarms.size, 0);
});

test('callback resumes after service worker restart from session state', async () => {
  const first = harness(); await first.run('connectCloudflare()');
  const next = harness(first);
  assert.equal(next.chrome.webNavigation.onBeforeNavigate.listeners.length, 1);
  await next.callback();
  assert.equal(next.session.cloudflareLogin.phase, 'connected');
  assert.equal(next.local.cloudflareAuth.accessToken, 'verified-token');
});

test('unrelated tab, subframe, lookalike host, and wrong callback path are ignored', async () => {
  const h = harness(); await h.run('connectCloudflare()');
  for (const patch of [
    {tabId:999}, {frameId:1},
    {url:'https://testid.chromiumapp.org.evil.example/cloudflare?code=evil'},
    {url:'https://testid.chromiumapp.org/wrong?code=evil'}
  ]) await h.callback(patch);
  assert.equal(h.session.cloudflareLogin.phase, 'authorizing');
  assert.equal(h.calls.some(c => c[0] === 'fetch'), false);
});

test('state mismatch fails without token exchange and allows a fresh retry', async () => {
  const h = harness(); await h.run('connectCloudflare()'); const id = h.session.cloudflareLogin.id;
  await h.callback({url:'https://testid.chromiumapp.org/cloudflare?state=wrong&code=evil'});
  assert.equal(h.session.cloudflareLogin.phase, 'failed');
  assert.match(h.session.cloudflareLogin.error, /state mismatch/);
  assert.equal(h.calls.some(c => c[0] === 'fetch'), false);
  await h.run('connectCloudflare()'); assert.notEqual(h.session.cloudflareLogin.id, id);
});

test('denied consent and missing authorization code fail cleanly', async () => {
  for (const query of ['error=access_denied', '']) {
    const h = harness(); await h.run('connectCloudflare()');
    const a = h.session.cloudflareLogin;
    await h.callback({url:`${a.redirectUri}?state=${a.state}&${query}`});
    assert.equal(h.session.cloudflareLogin.phase, 'failed');
    assert.equal(h.local.cloudflareAuth, undefined);
    assert.equal(h.windows.size, 0);
  }
});

test('closed popup releases attempt and stale window is replaced on next click', async () => {
  const h = harness(); await h.run('connectCloudflare()'); const id = h.session.cloudflareLogin.id;
  h.windows.delete(10);
  await h.run('connectCloudflare()');
  assert.notEqual(h.session.cloudflareLogin.id, id);
  const listener = h.chrome.windows.onRemoved.listeners[0];
  listener(10);
  for (let i = 0; i < 60; i++) await Promise.resolve();
  assert.equal(h.session.cloudflareLogin.phase, 'failed');
  assert.match(h.session.cloudflareLogin.error, /closed/);
});

test('expired attempt clears secrets, closes popup, and permits retry', async () => {
  const h = harness(); await h.run('connectCloudflare()');
  h.session.cloudflareLogin.expiresAt = Date.now() - 1;
  await h.run('RedownCloudflareAuth.status()');
  assert.equal(h.session.cloudflareLogin.phase, 'failed');
  assert.match(h.session.cloudflareLogin.error, /timed out/);
  assert.equal(h.session.cloudflareLogin.verifier, undefined);
  assert.equal(h.windows.size, 0);
  await h.run('connectCloudflare()'); assert.equal(h.session.cloudflareLogin.phase, 'authorizing');
});

test('failed API verification never stores an access token', async () => {
  const h = harness(); await h.run('connectCloudflare()');
  h.fetch(async url => url.endsWith('/oauth2/token') ? Response.json({access_token:'bad-token'})
    : Response.json({success:false, errors:[{message:'Unauthorized'}]}, {status:401}));
  await h.callback();
  assert.equal(h.session.cloudflareLogin.phase, 'failed');
  assert.equal(h.local.cloudflareAuth, undefined);
});

test('duplicate navigation events exchange a code only once', async () => {
  const h = harness(); await h.run('connectCloudflare()');
  await Promise.all([h.callback(), h.callback(), h.callback()]);
  assert.equal(h.calls.filter(c => c[0] === 'fetch' && c[1].endsWith('/oauth2/token')).length, 1);
  assert.equal(h.session.cloudflareLogin.phase, 'connected');
});

test('verification network stall aborts and releases the attempt', async () => {
  const h = harness(); await h.run('connectCloudflare()');
  h.fetch((_url, {signal}) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))));
  const complete = h.callback();
  for (let i = 0; i < 80; i++) await Promise.resolve();
  const timer = h.timers.find(t => t.ms === 30000); assert.ok(timer); timer.fn();
  await complete;
  assert.equal(h.session.cloudflareLogin.phase, 'failed');
  assert.match(h.session.cloudflareLogin.error, /did not respond/);
  assert.equal(h.local.cloudflareAuth, undefined);
});

test('popup creation errors are returned instead of leaving an in-flight lock', async () => {
  const h = harness({createError:'window unavailable'});
  await assert.rejects(h.run('connectCloudflare()'), /window unavailable/);
  await assert.rejects(h.run('connectCloudflare()'), /window unavailable/);
  assert.equal(h.calls.filter(c => c[0] === 'create').length, 2);
});


test('settings opens and completes Cloudflare login with no background worker or messaging', {timeout:2000}, async () => {
  const h = harness({withoutBackground:true});
  const {button, statuses} = h.settings();
  const click = button.click();
  for (let i = 0; i < 100; i++) await Promise.resolve();
  await h.navigated;
  for (let i = 0; i < 100; i++) await Promise.resolve();
  assert.equal(h.calls[0][0], 'create');
  assert.equal(h.calls.some(c => c[0] === 'navigate'), true);
  assert.equal(button.disabled, true);
  await h.callback();
  const poll = h.timers.find(t => t.ms === 1000); assert.ok(poll); poll.fn();
  await click;
  assert.equal(h.local.cloudflareAuth.accessToken, 'verified-token');
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Connect Cloudflare');
  assert.ok(statuses.includes('Cloudflare connected.'));
});

test('settings and worker observing the same callback exchange the code once across contexts', async () => {
  const worker = harness();
  const settings = harness({...worker, withoutBackground:true});
  await settings.run('RedownCloudflareAuth.connect()');
  await Promise.all([worker.callback(), settings.callback()]);
  const exchanges = [...worker.calls, ...settings.calls].filter(c => c[0] === 'fetch' && c[1].endsWith('/oauth2/token'));
  assert.equal(exchanges.length, 1);
  assert.equal(worker.session.cloudflareLogin.phase, 'connected');
});

test('two settings contexts share one visible sign-in window', async () => {
  const a = harness({withoutBackground:true});
  const b = harness({...a, withoutBackground:true});
  const [first, second] = await Promise.all([a.run('RedownCloudflareAuth.connect()'), b.run('RedownCloudflareAuth.connect()')]);
  assert.equal(first.attemptId, second.attemptId);
  assert.equal([...a.calls, ...b.calls].filter(c => c[0] === 'create').length, 1);
});

test('Worker deployments cannot overlap and a failed deployment releases the lock', async () => {
  const h=harness();
  h.run(`globalThis.active=0;globalThis.maximum=0;
    deployCloudflareProfile=async options=>{
      active++; maximum=Math.max(maximum,active);
      await Promise.resolve(); active--;
      if(options.fail) throw new Error("deployment failed");
      return options;
    };`);
  const result=await h.run('Promise.allSettled([provisionCloudflareProfile({fail:true}),provisionCloudflareProfile({bucketName:"b"})])');
  assert.equal(result[0].status,'rejected');
  assert.equal(result[1].status,'fulfilled');
  assert.equal(h.run('maximum'),1);
});
