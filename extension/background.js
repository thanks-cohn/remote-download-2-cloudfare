const BRIDGE = "http://127.0.0.1:8765/ingest";

const menus = [
  ["r2-3d", "Send URL to Cloudflare → 3D", "3d"],
  ["r2-2d", "Send URL to Cloudflare → 2D", "2d"],
  ["r2-files", "Send URL to Cloudflare → Files", "files"]
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const [id, title] of menus) {
      chrome.contextMenus.create({
        id,
        title,
        contexts: ["link", "image", "video", "audio", "page"]
      });
    }
  });
});

function selectedUrl(info) {
  return info.linkUrl || info.srcUrl || info.pageUrl || "";
}

async function notify(title, message) {
  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.svg",
    title,
    message
  });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  const menu = menus.find(([id]) => id === info.menuItemId);
  if (!menu) return;

  const sourceUrl = selectedUrl(info);
  const folder = menu[2];

  try {
    const response = await fetch(BRIDGE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceUrl, folder })
    });

    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Import failed");

    const location = result.publicUrl || result.key;
    await notify("Sent to Cloudflare", location);
  } catch (error) {
    await notify("Cloudflare import failed", error instanceof Error ? error.message : String(error));
  }
});
