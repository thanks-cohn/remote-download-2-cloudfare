const urlInput = document.getElementById("url");
const filenameInput = document.getElementById("filename");
const profileSelect = document.getElementById("profile");
const categorySelect = document.getElementById("category");
const status = document.getElementById("status");

async function loadProfiles() {
  const { profiles = [] } = await chrome.storage.local.get("profiles");
  profileSelect.replaceChildren();

  if (!profiles.length) {
    const option = document.createElement("option");
    option.textContent = "No destinations configured";
    option.value = "";
    profileSelect.append(option);
    return;
  }

  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name || profile.id;
    profileSelect.append(option);
  }
}

document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

document.getElementById("send").addEventListener("click", async () => {
  const sourceUrl = urlInput.value.trim();
  if (!sourceUrl) {
    status.textContent = "Paste a remote URL first.";
    return;
  }
  if (!profileSelect.value) {
    status.textContent = "Configure a destination first.";
    return;
  }

  status.textContent = "Sending…";
  const result = await chrome.runtime.sendMessage({
    type: "ingest",
    sourceUrl,
    filename: filenameInput.value.trim(),
    profileId: profileSelect.value,
    category: categorySelect.value
  });

  status.textContent = result?.ok ? `Sent: ${result.location}` : `Error: ${result?.error || "Unknown error"}`;
});

loadProfiles();
