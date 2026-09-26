const ROOT_MENU_ID = "remote-asset-ingest";

function selectedUrl(info) {
  return info.linkUrl || info.srcUrl || info.pageUrl || "";
}

function basenameFromUrl(raw) {
  try {
    const url = new URL(raw);
    const base = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "download");
    return base.replace(/[^a-zA-Z0-9._ -]/g, "-") || "download";
  } catch {
    return "download";
  }
}

function joinPath(...parts) {
  return parts
    .filter(Boolean)
    .map((part, index) => String(part).replace(index === 0 ? /\/+$/g : /^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

async function getProfiles() {
  const { profiles = [] } = await chrome.storage.local.get("profiles");
  return Array.isArray(profiles) ? profiles : [];
}

async function notify(title, message) {
  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.svg",
    title,
    message
  });
}

async function rebuildMenus() {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: ROOT_MENU_ID,
    title: "Send Remote Asset",
    contexts: ["link", "image", "video", "audio", "page"]
  });

  const profiles = await getProfiles();
  if (!profiles.length) {
    chrome.contextMenus.create({
      id: "remote-asset-no-profiles",
      parentId: ROOT_MENU_ID,
      title: "Configure destinations…",
      contexts: ["link", "image", "video", "audio", "page"]
    });
    return;
  }

  for (const profile of profiles) {
    const parentId = `profile:${profile.id}`;
    chrome.contextMenus.create({
      id: parentId,
      parentId: ROOT_MENU_ID,
      title: profile.name || "Unnamed destination",
      contexts: ["link", "image", "video", "audio", "page"]
    });

    for (const category of ["3d", "2d", "files"]) {
      chrome.contextMenus.create({
        id: `send:${profile.id}:${category}`,
        parentId,
        title: category === "3d" ? "3D" : category === "2d" ? "2D" : "Files",
        contexts: ["link", "image", "video", "audio", "page"]
      });
    }
  }
}

async function ingestCloudflare(profile, sourceUrl, category, filename) {
  const folder = profile.folders?.[category] || category;
  const response = await fetch(profile.workerUrl, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${profile.token || ""}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sourceUrl,
      folder,
      filename
    })
  });

  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { ok: false, error: text }; }

  if (!response.ok || !body.ok) {
    throw new Error(body.error || `Cloudflare ingest failed (${response.status})`);
  }

  return body.publicUrl || body.key || "Uploaded";
}

async function ingestGitHub(profile, sourceUrl, category, filename) {
  const repo = String(profile.repository || "").trim();
  if (!/^[^/]+\/[^/]+$/.test(repo)) throw new Error("GitHub repository must be owner/name");

  const workflow = profile.workflowFile || "remote-ingest.yml";
  const ref = profile.branch || "main";
  const basePath = profile.paths?.[category] || profile.defaultPath || "";
  const destinationPath = joinPath(basePath, filename);

  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: "POST",
      headers: {
        "authorization": `Bearer ${profile.token || ""}`,
        "accept": "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ref,
        inputs: {
          source_url: sourceUrl,
          destination_path: destinationPath
        }
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub dispatch failed (${response.status}): ${text.slice(0, 180)}`);
  }

  return `${repo} → ${destinationPath}`;
}

async function ingest(profile, sourceUrl, category, filename) {
  const finalFilename = filename || basenameFromUrl(sourceUrl);

  if (profile.type === "cloudflare-r2") {
    return ingestCloudflare(profile, sourceUrl, category, finalFilename);
  }
  if (profile.type === "github") {
    return ingestGitHub(profile, sourceUrl, category, finalFilename);
  }

  throw new Error("Unsupported destination type");
}

chrome.runtime.onInstalled.addListener(rebuildMenus);
chrome.runtime.onStartup.addListener(rebuildMenus);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.profiles) rebuildMenus();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "remote-asset-no-profiles") {
    chrome.runtime.openOptionsPage();
    return;
  }

  const match = String(info.menuItemId).match(/^send:([^:]+):(3d|2d|files)$/);
  if (!match) return;

  const [, profileId, category] = match;
  const profiles = await getProfiles();
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) {
    await notify("Remote Asset Ingest", "Destination profile no longer exists.");
    return;
  }

  const sourceUrl = selectedUrl(info);
  if (!sourceUrl) {
    await notify("Remote Asset Ingest", "No URL found for that item.");
    return;
  }

  try {
    const location = await ingest(profile, sourceUrl, category);
    await notify("Remote asset sent", location);
  } catch (error) {
    await notify("Remote ingest failed", error instanceof Error ? error.message : String(error));
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ingest") return false;

  (async () => {
    try {
      const profiles = await getProfiles();
      const profile = profiles.find((item) => item.id === message.profileId);
      if (!profile) throw new Error("Destination profile not found");
      const location = await ingest(
        profile,
        String(message.sourceUrl || ""),
        message.category || "files",
        message.filename || undefined
      );
      sendResponse({ ok: true, location });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();

  return true;
});
