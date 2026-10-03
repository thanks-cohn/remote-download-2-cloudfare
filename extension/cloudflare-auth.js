/* Shared by settings and the background worker. No runtime messaging is
 * needed to open Cloudflare, receive its callback, or verify authorization. */
(() => {
const CF_CLIENT_ID = "d9db0f71eb24cd2eed86b50a650a045e";
const CF_AUTH_URL = "https://dash.cloudflare.com/oauth2/auth";
const CF_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const CF_API = "https://api.cloudflare.com/client/v4";

function bytesToBase64Url(bytes) {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomString(bytes = 32) {
  const array = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToBase64Url(array);
}
async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}
function cloudflareErrorMessage(body, fallback) {
  return body?.errors?.[0]?.message || body?.error_description || body?.error || fallback;
}
async function storeCloudflareToken(token, previous = {}) {
  const accessToken = token?.access_token;
  if (!accessToken) throw new Error("Cloudflare did not return an access token");
  const auth = {
    ...previous,
    accessToken,
    refreshToken: token.refresh_token || previous.refreshToken || null,
    expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null
  };
  await chrome.storage.local.set({ cloudflareAuth: auth });
  return auth;
}
// Keep the login window visible before Cloudflare finishes loading. Chrome's
// launchWebAuthFlow hides its window until the first page load completes.
// Session storage and top-level listeners let OAuth resume after MV3 suspension.
const CF_LOGIN_SESSION = "cloudflareLogin";
const CF_LOGIN_ALARM = "redown-cloudflare-login";
const CF_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
let cloudflareAuthInFlight = null;

async function cloudflareLoginStatus() {
  const stored = await chrome.storage.session.get(CF_LOGIN_SESSION);
  const attempt = stored[CF_LOGIN_SESSION];
  // Never send the verifier or OAuth state to settings or other callers.
  return attempt ? {
    attemptId: attempt.id, phase: attempt.phase, error: attempt.error || ""
  } : { phase: "idle" };
}
const CF_LOGIN_STATE_LOCK = "redown-cloudflare-login-state";
async function finishCloudflareLogin(id, phase, error = "") {
  return navigator.locks.request(CF_LOGIN_STATE_LOCK, () => finishCloudflareLoginLocked(id, phase, error));
}
async function finishCloudflareLoginLocked(id, phase, error = "") {
  const stored = await chrome.storage.session.get(CF_LOGIN_SESSION);
  const attempt = stored[CF_LOGIN_SESSION];
  if (attempt?.id !== id || !["opening", "authorizing", "verifying"].includes(attempt.phase)) return;
  // Erase PKCE/state before closing the window, whose removal emits an event.
  await chrome.storage.session.set({ [CF_LOGIN_SESSION]: { id, phase, error } });
  await chrome.alarms.clear(CF_LOGIN_ALARM);
  if (Number.isInteger(attempt.windowId)) {
    await chrome.windows.remove(attempt.windowId).catch(() => {});
  }
}
async function expireCloudflareLogin() {
  const stored = await chrome.storage.session.get(CF_LOGIN_SESSION);
  const attempt = stored[CF_LOGIN_SESSION];
  if (attempt?.expiresAt && Date.now() >= attempt.expiresAt) {
    await finishCloudflareLogin(attempt.id, "failed", "Cloudflare sign-in timed out. Click Connect Cloudflare to try again.");
  }
}
async function startCloudflareLogin() {
  return navigator.locks.request("redown-cloudflare-login-start", startCloudflareLoginUnlocked);
}
async function startCloudflareLoginUnlocked() {
  await expireCloudflareLogin();
  const stored = await chrome.storage.session.get(CF_LOGIN_SESSION);
  const previous = stored[CF_LOGIN_SESSION];
  if (["opening", "authorizing", "verifying"].includes(previous?.phase)) {
    if (previous.phase === "verifying") return { pending: true, ...(await cloudflareLoginStatus()) };
    try {
      await chrome.windows.update(previous.windowId, { focused: true });
      return { pending: true, ...(await cloudflareLoginStatus()) };
    } catch {
      await finishCloudflareLogin(previous.id, "failed", "The sign-in window was closed. Try again.");
    }
  }

  const id = crypto.randomUUID();
  let loginWindow;
  try {
    // Open first: even a stalled network must not hide the sign-in window.
    loginWindow = await chrome.windows.create({
      url: "about:blank", type: "popup", focused: true, width: 720, height: 780
    });
    const tabId = loginWindow?.tabs?.[0]?.id;
    if (!Number.isInteger(loginWindow?.id) || !Number.isInteger(tabId)) {
      throw new Error("Chrome could not create the Cloudflare sign-in window. Try again.");
    }
    const redirectUri = chrome.identity.getRedirectURL("cloudflare");
    const verifier = randomString(48);
    const state = randomString(24);
    const attempt = {
      id, windowId: loginWindow.id, tabId, redirectUri, verifier, state,
      phase: "opening", expiresAt: Date.now() + CF_LOGIN_TIMEOUT_MS
    };
    await chrome.storage.session.set({ [CF_LOGIN_SESSION]: attempt });
    await chrome.alarms.create(CF_LOGIN_ALARM, { when: attempt.expiresAt });
    const auth = new URL(CF_AUTH_URL);
    auth.searchParams.set("client_id", CF_CLIENT_ID);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("code_challenge", await sha256Base64Url(verifier));
    auth.searchParams.set("code_challenge_method", "S256");
    auth.searchParams.set("scope", [
      "workers-r2.read", "workers-r2.write", "workers-scripts.read", "workers-scripts.write"
    ].join(" "));
    auth.searchParams.set("state", state);
    await navigator.locks.request(CF_LOGIN_STATE_LOCK, async () => {
      const current = (await chrome.storage.session.get(CF_LOGIN_SESSION))[CF_LOGIN_SESSION];
      if (current?.id !== id || current.phase !== "opening") throw new Error("Cloudflare sign-in was closed. Try again.");
      await chrome.storage.session.set({ [CF_LOGIN_SESSION]: { ...attempt, phase: "authorizing" } });
    });
    await chrome.tabs.update(tabId, { url: auth.toString(), active: true });
    return { pending: true, ...(await cloudflareLoginStatus()) };
  } catch (error) {
    await finishCloudflareLogin(id, "failed", error?.message || "Cloudflare sign-in could not open. Try again.");
    if (Number.isInteger(loginWindow?.id)) await chrome.windows.remove(loginWindow.id).catch(() => {});
    throw error;
  }
}
async function connectCloudflare() {
  if (!cloudflareAuthInFlight) {
    cloudflareAuthInFlight = startCloudflareLogin().finally(() => { cloudflareAuthInFlight = null; });
  }
  return cloudflareAuthInFlight;
}
async function cloudflareLoginJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Cloudflare did not respond. Click Connect Cloudflare to try again.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function completeCloudflareLogin(details) {
  if (details.frameId !== 0) return;
  // Settings and the service worker can both observe the redirect. Claim it
  // atomically across extension contexts before exchanging the one-use code.
  const attempt = await navigator.locks.request(CF_LOGIN_STATE_LOCK, async () => {
    const current = (await chrome.storage.session.get(CF_LOGIN_SESSION))[CF_LOGIN_SESSION];
    if (!current || current.phase !== "authorizing" || details.tabId !== current.tabId) return null;
    let returned;
    try { returned = new URL(details.url); } catch { return null; }
    const expected = new URL(current.redirectUri);
    if (returned.origin !== expected.origin || returned.pathname !== expected.pathname) return null;
    await chrome.storage.session.set({ [CF_LOGIN_SESSION]: { ...current, phase: "verifying" } });
    return current;
  });
  if (!attempt) return;
  const returned = new URL(details.url);
  try {
    if (Date.now() >= attempt.expiresAt) throw new Error("Cloudflare sign-in timed out. Try again.");
    if (returned.searchParams.get("state") !== attempt.state) throw new Error("Cloudflare OAuth state mismatch. Try again.");
    const oauthError = returned.searchParams.get("error");
    if (oauthError) throw new Error(returned.searchParams.get("error_description") || oauthError);
    const code = returned.searchParams.get("code");
    if (!code) throw new Error("Cloudflare did not return an authorization code. Try again.");
    const { response: tokenRes, body: token } = await cloudflareLoginJson(CF_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code", client_id: CF_CLIENT_ID,
        code, redirect_uri: attempt.redirectUri, code_verifier: attempt.verifier
      })
    });
    if (!tokenRes.ok || !token.access_token) throw new Error(cloudflareErrorMessage(token, "Cloudflare token exchange failed. Try again."));
    const headers = { authorization: `Bearer ${token.access_token}` };
    const { response: verifyRes, body: verifyBody } = await cloudflareLoginJson(`${CF_API}/accounts?per_page=50`, { headers });
    if (!verifyRes.ok || verifyBody.success === false) {
      throw new Error(cloudflareErrorMessage(verifyBody, `Cloudflare API verification failed (HTTP ${verifyRes.status}). Try again.`));
    }
    // Optional identity metadata must never block an otherwise valid login.
    const user = null;
    await navigator.locks.request(CF_LOGIN_STATE_LOCK, async () => {
      const current = (await chrome.storage.session.get(CF_LOGIN_SESSION))[CF_LOGIN_SESSION];
      if (current?.id !== attempt.id || current.phase !== "verifying" || Date.now() >= attempt.expiresAt) return;
      await storeCloudflareToken(token, { user });
      await finishCloudflareLoginLocked(attempt.id, "connected");
    });
  } catch (error) {
    await finishCloudflareLogin(attempt.id, "failed", error?.message || "Cloudflare sign-in failed. Try again.");
  }
}

let listenersRegistered = false;
function registerListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;
// Register synchronously at worker startup so a redirect can wake a suspended
// worker. Match the exact callback AND the login tab, never arbitrary pages.
const cloudflareCallbackFilter = { url: [{ hostEquals: new URL(chrome.identity.getRedirectURL()).hostname }] };
for (const event of [chrome.webNavigation.onBeforeNavigate, chrome.webNavigation.onCommitted, chrome.webNavigation.onErrorOccurred]) {
  event.addListener(details => completeCloudflareLogin(details).catch(error => {
    console.warn("REDOWN Cloudflare callback could not finish:", error?.message || String(error));
  }), cloudflareCallbackFilter);
}
chrome.windows.onRemoved.addListener(windowId => {
  (async () => {
    const attempt = (await chrome.storage.session.get(CF_LOGIN_SESSION))[CF_LOGIN_SESSION];
    if (attempt?.windowId === windowId && ["opening", "authorizing"].includes(attempt.phase)) {
      await finishCloudflareLogin(attempt.id, "failed", "Cloudflare sign-in was closed. Click Connect Cloudflare to try again.");
    }
  })().catch(() => {});
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === CF_LOGIN_ALARM) expireCloudflareLogin().catch(() => {});
});

}
globalThis.RedownCloudflareAuth = {
  connect: connectCloudflare,
  async status() { await expireCloudflareLogin(); return cloudflareLoginStatus(); },
  cancel(id) { return finishCloudflareLogin(id, "failed", "Cloudflare sign-in stopped. Click Connect Cloudflare to try again."); },
  registerListeners
};
registerListeners();
})();
