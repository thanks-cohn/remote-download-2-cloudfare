const root = document.getElementById("profiles");
let profiles = [];

function id() {
  return crypto.randomUUID();
}

function blankCloudflare() {
  return {
    id: id(),
    name: "Cloudflare Assets",
    type: "cloudflare-r2",
    workerUrl: "",
    token: "",
    folders: { "2d": "2d", "3d": "3d", "files": "files" }
  };
}

function blankGitHub() {
  return {
    id: id(),
    name: "GitHub Assets",
    type: "github",
    repository: "",
    workflowFile: "remote-ingest.yml",
    branch: "main",
    token: "",
    paths: { "2d": "assets/2d", "3d": "assets/3d", "files": "assets/files" }
  };
}

function field(label, value, onInput, type = "text", placeholder = "") {
  const wrap = document.createElement("div");
  const l = document.createElement("label");
  l.textContent = label;
  const input = document.createElement("input");
  input.type = type;
  input.value = value || "";
  input.placeholder = placeholder;
  input.addEventListener("input", () => onInput(input.value));
  wrap.append(l, input);
  return wrap;
}

function render() {
  root.replaceChildren();

  for (const profile of profiles) {
    const card = document.createElement("section");
    card.className = "profile";

    const title = document.createElement("h2");
    title.textContent = profile.type === "github" ? "GitHub" : "Cloudflare R2";

    const grid = document.createElement("div");
    grid.className = "grid";
    grid.append(
      field("Display name", profile.name, (v) => profile.name = v)
    );

    if (profile.type === "cloudflare-r2") {
      grid.append(
        field("Worker ingest URL", profile.workerUrl, (v) => profile.workerUrl = v, "url", "https://…workers.dev/ingest"),
        field("Worker token", profile.token, (v) => profile.token = v, "password"),
        field("2D folder", profile.folders?.["2d"], (v) => (profile.folders ||= {})["2d"] = v),
        field("3D folder", profile.folders?.["3d"], (v) => (profile.folders ||= {})["3d"] = v),
        field("Files folder", profile.folders?.files, (v) => (profile.folders ||= {}).files = v)
      );
    } else {
      grid.append(
        field("Repository (owner/name)", profile.repository, (v) => profile.repository = v, "text", "owner/repository"),
        field("Workflow file", profile.workflowFile, (v) => profile.workflowFile = v, "text", "remote-ingest.yml"),
        field("Branch", profile.branch, (v) => profile.branch = v, "text", "main"),
        field("GitHub token", profile.token, (v) => profile.token = v, "password"),
        field("2D path", profile.paths?.["2d"], (v) => (profile.paths ||= {})["2d"] = v),
        field("3D path", profile.paths?.["3d"], (v) => (profile.paths ||= {})["3d"] = v),
        field("Files path", profile.paths?.files, (v) => (profile.paths ||= {}).files = v)
      );
    }

    const remove = document.createElement("button");
    remove.className = "danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      profiles = profiles.filter((item) => item.id !== profile.id);
      render();
    });

    card.append(title, grid, remove);
    root.append(card);
  }
}

async function load() {
  const stored = await chrome.storage.local.get("profiles");
  profiles = Array.isArray(stored.profiles) ? stored.profiles : [];
  render();
}

document.getElementById("add-cloudflare").addEventListener("click", () => {
  profiles.push(blankCloudflare());
  render();
});

document.getElementById("add-github").addEventListener("click", () => {
  profiles.push(blankGitHub());
  render();
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ profiles });
  alert("Saved.");
});

load();
