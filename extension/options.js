const $=id=>document.getElementById(id);
let profiles=[];
let cfAccounts=[];
let currentAccountId="";
let workspaceTarget=null;
let workspaceObjects=[];
let workspacePreviewExpanded=false;

function uid(){return crypto.randomUUID();}
function setStatus(id,msg,kind=""){const el=$(id);el.textContent=msg||"";el.className="status"+(kind?" "+kind:"");}
async function send(message){return chrome.runtime.sendMessage(message);}
async function saveProfiles(){await chrome.storage.local.set({profiles});}
function displayName(p){return p.name||p.bucketName||p.repository||"Destination";}
let saveTimer=null;
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>saveProfiles(),180);
}
function makeNode(label="New section"){
  return {id:uid(),label,category:"files",prefix:"",path:"",children:[]};
}
function findNode(nodes,id){
  for(const node of nodes||[]){
    if(node.id===id)return node;
    const found=findNode(node.children,id);
    if(found)return found;
  }
  return null;
}
function removeNode(nodes,id){
  const index=(nodes||[]).findIndex(n=>n.id===id);
  if(index>=0){nodes.splice(index,1);return true;}
  for(const node of nodes||[]) if(removeNode(node.children,id)) return true;
  return false;
}
function renderTree(profile){
  const wrap=document.createElement("div");
  wrap.className="tree-editor";

  const heading=document.createElement("div");
  heading.className="tree-heading";
  const copy=document.createElement("div");
  const strong=document.createElement("strong");
  strong.textContent="Right-click behavior";
  const small=document.createElement("div");
  small.className="meta";
  small.textContent=(profile.menuTree?.length)
    ?"Nested menu: each leaf sends to its own saved location."
    :"Quick send: clicking this preset immediately uses its default location.";
  copy.append(strong,small);

  const controls=document.createElement("div");
  controls.className="row-actions";
  const quick=document.createElement("button");
  quick.className=profile.menuTree?.length?"ghost":"secondary";
  quick.textContent="Quick send";
  quick.addEventListener("click",()=>{
    profile.menuTree=[];
    scheduleSave();
    renderProfiles();
  });
  const nested=document.createElement("button");
  nested.className=profile.menuTree?.length?"secondary":"ghost";
  nested.textContent="Nested menu";
  nested.addEventListener("click",()=>{
    if(!profile.menuTree?.length){
      profile.menuTree=[
        {id:uid(),label:"3D",category:"3d",prefix:"3d",path:"assets/3d",children:[]},
        {id:uid(),label:"2D",category:"2d",prefix:"2d",path:"assets/2d",children:[]},
        {id:uid(),label:"Files",category:"files",prefix:"files",path:"assets/files",children:[]}
      ];
    }
    scheduleSave();
    renderProfiles();
  });
  controls.append(quick,nested);
  heading.append(copy,controls);
  wrap.append(heading);

  if(!profile.menuTree?.length) return wrap;

  const note=document.createElement("div");
  note.className="tree-note";
  note.textContent="Add children to any item to create another pop-out level. There is no fixed depth.";
  wrap.append(note);

  const treeRoot=document.createElement("div");
  treeRoot.className="tree-root";
  for(const node of profile.menuTree) treeRoot.append(renderTreeNode(profile,node,0));
  wrap.append(treeRoot);

  const addRoot=document.createElement("button");
  addRoot.className="ghost";
  addRoot.textContent="+ Add top-level item";
  addRoot.addEventListener("click",()=>{
    profile.menuTree.push(makeNode("New destination"));
    scheduleSave();
    renderProfiles();
  });
  wrap.append(addRoot);
  return wrap;
}
function renderTreeNode(profile,node,depth){
  node.children??=[];
  const item=document.createElement("div");
  item.className="tree-node";
  item.style.setProperty("--depth",String(depth));

  const row=document.createElement("div");
  row.className="tree-row";

  const branch=document.createElement("div");
  branch.className="tree-branch";
  branch.textContent=node.children.length?"▾":"•";

  const labelInput=document.createElement("input");
  labelInput.className="tree-label";
  labelInput.value=node.label||"";
  labelInput.placeholder="Menu label";
  labelInput.addEventListener("input",()=>{node.label=labelInput.value;scheduleSave();});

  const kind=document.createElement("select");
  [["files","Files"],["videos","Videos"],["3d","3D"],["2d","2D"]].forEach(([v,t])=>{
    const o=document.createElement("option");o.value=v;o.textContent=t;o.selected=(node.category||"files")===v;kind.append(o);
  });
  kind.title="Target category";
  kind.addEventListener("change",()=>{node.category=kind.value;scheduleSave();});

  const target=document.createElement("input");
  target.className="tree-target";
  target.value=profile.type==="cloudflare-r2"?(node.prefix??""):(node.path??"");
  target.placeholder=profile.type==="cloudflare-r2"?"R2 prefix, e.g. 3d/heroes":"GitHub path, e.g. assets/3d/heroes";
  target.disabled=node.children.length>0;
  target.title=node.children.length?"Parent menu items do not download; their leaf children do.":"Download destination";
  target.addEventListener("input",()=>{
    if(profile.type==="cloudflare-r2")node.prefix=target.value;
    else node.path=target.value;
    scheduleSave();
  });

  const add=document.createElement("button");
  add.className="mini";
  add.textContent="+ Child";
  add.title="Add another pop-out level";
  add.addEventListener("click",()=>{
    node.children.push(makeNode("New subsection"));
    scheduleSave();
    renderProfiles();
  });

  const remove=document.createElement("button");
  remove.className="mini danger";
  remove.textContent="×";
  remove.title="Remove this menu item";
  remove.addEventListener("click",()=>{
    removeNode(profile.menuTree,node.id);
    scheduleSave();
    renderProfiles();
  });

  row.append(branch,labelInput,kind,target,add,remove);
  item.append(row);

  if(node.children.length){
    const children=document.createElement("div");
    children.className="tree-children";
    for(const child of node.children)children.append(renderTreeNode(profile,child,depth+1));
    item.append(children);
  }
  return item;
}

function assetCorsControl(profile){
  const wrap=document.createElement("div");
  wrap.style.gridColumn="1 / -1";

  const label=document.createElement("label");
  label.textContent="Asset serving domain";

  const row=document.createElement("div");
  row.style.display="grid";
  row.style.gridTemplateColumns="minmax(0,1fr) auto";
  row.style.gap="8px";

  const input=document.createElement("input");
  input.type="text";
  input.value=profile.customAssetDomain||"";
  input.placeholder="cdn.website.com";

  const apply=document.createElement("button");
  apply.type="button";
  apply.className="secondary";
  apply.textContent="Use domain";

  const status=document.createElement("div");
  status.className="status";
  status.style.marginTop="7px";

  const endpoints=document.createElement("div");
  endpoints.className="meta";
  endpoints.style.gridColumn="1 / -1";
  endpoints.style.marginTop="9px";
  endpoints.style.wordBreak="break-all";

  function renderEndpoints(){
    const base=(profile.publicBaseUrl||(`${profile.workerUrl}/assets`)).replace(/\/+$/,"");
    const folders=profile.folders||{};
    const lines=[
      ["Public base",base],
      ["2D",`${base}/${folders["2d"]||"2d"}/`],
      ["3D",`${base}/${folders["3d"]||"3d"}/`],
      ["Videos",`${base}/${folders.videos||"videos"}/`],
      ["Files",`${base}/${folders.files||"files"}/`]
    ];
    endpoints.replaceChildren();
    for(const [name,url] of lines){
      const line=document.createElement("div");
      const strong=document.createElement("strong");
      strong.textContent=name+": ";
      const text=document.createElement("span");
      text.textContent=url;
      line.append(strong,text);
      endpoints.append(line);
    }
  }

  status.textContent=profile.customAssetDomain
    ? `Serving through https://${profile.customAssetDomain}`
    : "Using REDOWN's workers.dev endpoint by default. Add a Cloudflare-hosted domain/subdomain to use it instead.";

  apply.addEventListener("click",async()=>{
    if(apply.disabled)return;
    apply.disabled=true;
    const previous=apply.textContent;
    apply.textContent="Attaching…";
    status.className="status";
    status.textContent="Attaching this hostname to the REDOWN Worker…";
    try{
      const result=await send({
        type:"cfSetAssetDomain",
        accountId:profile.accountId,
        bucketName:profile.bucketName,
        website:input.value
      });
      if(!result?.ok)throw new Error(result?.error||"Could not attach asset domain");
      profile.customAssetDomain=result.hostname;
      profile.allowedWebsiteOrigin=result.origin;
      profile.publicBaseUrl=result.publicBaseUrl;
      input.value=result.hostname;
      await saveProfiles();
      status.className="status ok";
      status.textContent=`Assets now serve from ${result.publicBaseUrl}`;
      renderEndpoints();
    }catch(error){
      status.className="status bad";
      status.textContent=error?.message||String(error);
    }finally{
      apply.disabled=false;
      apply.textContent=previous;
    }
  });

  row.append(input,apply);
  wrap.append(label,row,status,endpoints);
  renderEndpoints();
  return wrap;
}

function renderProfiles(){
  const root=$("profiles");
  root.replaceChildren();
  const visibleProfiles=profiles.filter(profile=>!profile.explorerManaged);
  $("profiles-empty").hidden=visibleProfiles.length>0;

  profiles.sort((a,b)=>(a.menuOrder??999)-(b.menuOrder??999));
  visibleProfiles.forEach((p,index)=>{
    const card=document.createElement("article");
    card.className="card";

    const top=document.createElement("div");
    top.className="card-top";
    const left=document.createElement("div");
    const title=document.createElement("div"); title.className="title"; title.textContent=displayName(p);
    const meta=document.createElement("div"); meta.className="meta";
    meta.textContent=p.type==="cloudflare-r2"
      ? `Cloudflare R2 · ${p.bucketName}`
      : `GitHub · ${p.repository||"not configured"}`;
    left.append(title,meta);
    const badge=document.createElement("div"); badge.className="badge"; badge.textContent=p.type==="cloudflare-r2"?"R2":"GitHub";
    top.append(left,badge);

    const grid=document.createElement("div"); grid.className="grid";
    grid.append(
      field("Menu label",p.menuLabel||p.name||"",v=>p.menuLabel=v),
      selectField("Default path",[
        ["3d","3D"],["2d","2D"],["videos","Videos"],["files","Files"]
      ],p.defaultCategory||"files",v=>p.defaultCategory=v),
      field("Order",String(p.menuOrder??index),v=>p.menuOrder=Number(v)||0,"number")
    );

    if(p.type==="cloudflare-r2"){
      grid.append(
        field("3D prefix",p.folders?.["3d"]||"3d",v=>(p.folders??={})["3d"]=v),
        field("2D prefix",p.folders?.["2d"]||"2d",v=>(p.folders??={})["2d"]=v),
        field("Video prefix",p.folders?.videos||"videos",v=>(p.folders??={}).videos=v),
        field("Files prefix",p.folders?.files||"files",v=>(p.folders??={}).files=v),
        assetCorsControl(p)
      );
    }else{
      grid.append(
        field("Repository",p.repository||"",v=>p.repository=v,"text","owner/repository"),
        field("Branch",p.branch||"main",v=>p.branch=v),
        field("GitHub token",p.token||"",v=>p.token=v,"password"),
        field("3D path",p.paths?.["3d"]||"assets/3d",v=>(p.paths??={})["3d"]=v),
        field("2D path",p.paths?.["2d"]||"assets/2d",v=>(p.paths??={})["2d"]=v),
        field("Video path",p.paths?.videos||"assets/videos",v=>(p.paths??={}).videos=v),
        field("Files path",p.paths?.files||"assets/files",v=>(p.paths??={}).files=v)
      );
    }

    const actions=document.createElement("div");actions.className="row-actions";
    const toggle=document.createElement("label");toggle.className="toggle";
    const check=document.createElement("input");check.type="checkbox";check.checked=p.showInContextMenu!==false;
    check.addEventListener("change",()=>{p.showInContextMenu=check.checked;scheduleSave();});
    toggle.append(check,document.createTextNode("Show in right-click menu"));
    actions.append(toggle);

    const up=document.createElement("button");up.className="ghost";up.textContent="Move up";
    up.addEventListener("click",()=>{p.menuOrder=(p.menuOrder??index)-1;renderProfiles();});
    const down=document.createElement("button");down.className="ghost";down.textContent="Move down";
    down.addEventListener("click",()=>{p.menuOrder=(p.menuOrder??index)+1;renderProfiles();});
    const remove=document.createElement("button");remove.className="danger";remove.textContent="Remove preset";
    remove.addEventListener("click",()=>{profiles=profiles.filter(x=>x.id!==p.id);renderProfiles();saveProfiles();});
    actions.append(up,down,remove);

    card.append(top,grid,actions,renderTree(p));
    root.append(card);
  });

  renderWorkspaceProfiles();
  scheduleSave();
}

function field(labelText,value,onInput,type="text",placeholder=""){
  const wrap=document.createElement("div");
  const label=document.createElement("label");label.textContent=labelText;
  const input=document.createElement("input");input.type=type;input.value=value??"";input.placeholder=placeholder;
  input.addEventListener("input",()=>{onInput(input.value);scheduleSave();});
  wrap.append(label,input);return wrap;
}
function selectField(labelText,items,value,onInput){
  const wrap=document.createElement("div");
  const label=document.createElement("label");label.textContent=labelText;
  const select=document.createElement("select");
  items.forEach(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;o.selected=v===value;select.append(o);});
  select.addEventListener("change",()=>{onInput(select.value);scheduleSave();});
  wrap.append(label,select);return wrap;
}

function formatBytes(value){
  const n=Number(value||0);
  if(!Number.isFinite(n)||n<=0)return "—";
  const units=["B","KB","MB","GB","TB"];
  let x=n,i=0;
  while(x>=1024&&i<units.length-1){x/=1024;i++;}
  return `${x>=10||i===0?x.toFixed(0):x.toFixed(1)} ${units[i]}`;
}
function publicObjectUrl(profile,key){
  const base=(profile.publicBaseUrl||(`${profile.workerUrl}/assets`)).replace(/\/+$/,"");
  return `${base}/${String(key).split("/").map(encodeURIComponent).join("/")}`;
}
function r2Profiles(){return profiles.filter(p=>p.type==="cloudflare-r2");}
function renderWorkspaceProfiles(){
  const select=$("local-profile");
  if(!select)return;
  const previous=select.value;
  select.replaceChildren();
  for(const profile of r2Profiles()){
    const option=document.createElement("option");
    option.value=profile.id;option.textContent=`${displayName(profile)} · ${profile.bucketName}`;select.append(option);
  }
  if(Array.from(select.options).some(o=>o.value===previous))select.value=previous;
  const uploadCard=$("local-dropzone")?.closest(".card");
  if(uploadCard)uploadCard.hidden=!select.options.length;
}
function categoryFromPrefix(prefix){
  const first=String(prefix||"").split("/").filter(Boolean)[0]?.toLowerCase();
  if(first==="2d")return "2d";
  if(first==="3d")return "3d";
  if(first==="videos"||first==="video")return "videos";
  return "files";
}
async function uploadLocalFiles(fileList){
  const files=Array.from(fileList||[]);
  if(!files.length)return;
  const profile=profiles.find(p=>p.id===$("local-profile").value);
  if(!profile)return setStatus("local-upload-status","Choose an R2 bucket first.","bad");
  const prefix=$("local-prefix").value.trim();
  const status=$("local-upload-status");
  let completed=0;
  for(const file of files){
    status.className="status";
    status.textContent=`Uploading ${file.name} (${completed+1}/${files.length})…`;
    try{
      const response=await fetch(profile.workerUrl,{
        method:"POST",
        headers:{
          authorization:`Bearer ${profile.token||""}`,
          "content-type":file.type||"application/octet-stream",
          "x-redown-action":"upload-local",
          "x-redown-filename":encodeURIComponent(file.name),
          "x-redown-folder":prefix,
          "x-redown-public-base":profile.publicBaseUrl||`${profile.workerUrl}/assets`
        },
        body:file
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok||!body?.ok)throw new Error(body?.error||`Upload failed (${response.status})`);
      completed++;
      await send({
        type:"recordLocalTransfer",
        ok:true,
        profileId:profile.id,
        profileName:profile.name,
        category:categoryFromPrefix(prefix),
        location:body.publicUrl
      });
      status.className="status ok";
      status.textContent=`Uploaded ${completed}/${files.length} · ${body.publicUrl}`;
    }catch(error){
      await send({
        type:"recordLocalTransfer",
        ok:false,
        profileId:profile.id,
        profileName:profile.name,
        category:categoryFromPrefix(prefix),
        error:error?.message||String(error)
      });
      status.className="status bad";
      status.textContent=`Stopped on ${file.name}: ${error?.message||String(error)}`;
      await renderHistory();
      return;
    }
  }
  await renderHistory();
  if(workspaceTarget?.accountId===profile.accountId&&workspaceTarget?.bucketName===profile.bucketName){workspacePrefix=normalizePrefix(prefix);await browseWorkspace();}
}
function objectContentType(obj,key){
  const explicit=String(obj?.httpMetadata?.contentType||obj?.contentType||"").toLowerCase();
  if(explicit)return explicit;
  const ext=String(key).split(".").pop().toLowerCase();
  return ({
    jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif",avif:"image/avif",svg:"image/svg+xml",
    mp4:"video/mp4",webm:"video/webm",mov:"video/quicktime",mp3:"audio/mpeg",ogg:"audio/ogg",wav:"audio/wav",
    glb:"model/gltf-binary",gltf:"model/gltf+json",pdf:"application/pdf",
    txt:"text/plain",md:"text/markdown",markdown:"text/markdown",json:"application/json",csv:"text/csv",
    xml:"application/xml",html:"text/html",htm:"text/html",js:"text/javascript",mjs:"text/javascript",
    ts:"text/typescript",tsx:"text/typescript",jsx:"text/javascript",css:"text/css",yaml:"text/yaml",yml:"text/yaml",
    py:"text/x-python",rs:"text/plain",go:"text/plain",java:"text/plain",c:"text/plain",cpp:"text/plain",h:"text/plain",
    sh:"text/plain",bat:"text/plain",ps1:"text/plain",log:"text/plain"
  })[ext]||"application/octet-stream";
}
function isTextPreview(type,key){
  if(type.startsWith("text/"))return true;
  if(["application/json","application/xml","application/javascript","application/x-javascript"].includes(type))return true;
  const ext=String(key).split(".").pop().toLowerCase();
  return ["txt","md","markdown","json","csv","xml","html","htm","js","mjs","ts","tsx","jsx","css","yaml","yml","py","rs","go","java","c","cpp","h","sh","bat","ps1","log"].includes(ext);
}
function appendDetails(root,obj,key,url,type){
  const details=document.createElement("div");
  details.className="preview-details";
  const entries=[
    ["Type",type||"application/octet-stream"],
    ["Size",formatBytes(obj?.size)],
    ["Uploaded",obj?.uploaded||obj?.uploadedAt||obj?.created||"—"],
    ["Key",key]
  ];
  for(const [label,value] of entries){
    const a=document.createElement("div");a.textContent=label;
    const b=document.createElement("div");b.textContent=String(value??"—");
    details.append(a,b);
  }
  root.append(details);
  const link=document.createElement("a");
  link.className="preview-url";
  link.href=url;
  link.target="_blank";
  link.rel="noopener";
  link.textContent=url;
  root.append(link);
}
async function showWorkspacePreview(obj,row){
  const root=$("workspace-preview");
  root.replaceChildren();
  document.querySelectorAll("#workspace-objects .object.active").forEach(el=>el.classList.remove("active"));
  row?.classList.add("active");
  const key=obj.key||obj.name||String(obj);
  let previewProfile=r2Profiles().find(p=>p.accountId===workspaceTarget?.accountId&&p.bucketName===workspaceTarget?.bucketName);
  if(!previewProfile){
    const preparing=document.createElement("div");preparing.className="meta";preparing.innerHTML='<span class="operation-spinner"></span>Preparing preview…';root.append(preparing);
    try{previewProfile=await ensurePrepared(workspaceTarget);}catch(error){preparing.textContent=friendlyError(error,"prepare the preview");return;}
    root.replaceChildren();
  }
  const url=publicObjectUrl(previewProfile,key);
  const type=objectContentType(obj,key);
  const head=document.createElement("div");head.className="preview-head";
  const title=document.createElement("div");title.className="preview-title";title.textContent=key;
  const expand=document.createElement("button");expand.className="ghost";expand.type="button";expand.textContent=workspacePreviewExpanded?"Collapse":"Expand";expand.addEventListener("click",()=>setWorkspacePreviewExpanded(!workspacePreviewExpanded));
  head.append(title,expand);root.append(head);

  const media=document.createElement("div");
  media.className="preview-media";

  if(type.startsWith("image/")){
    const img=document.createElement("img");
    img.src=url;img.alt=key;
    media.append(img);
    root.append(media);
  }else if(type.startsWith("video/")){
    const video=document.createElement("video");
    video.src=url;video.controls=true;video.preload="metadata";
    media.append(video);
    root.append(media);
  }else if(type.startsWith("audio/")){
    const audio=document.createElement("audio");
    audio.src=url;audio.controls=true;audio.preload="metadata";
    media.append(audio);
    root.append(media);
  }else if(type==="application/pdf"||key.toLowerCase().endsWith(".pdf")){
    const frame=document.createElement("iframe");
    frame.src=url;
    frame.title=`PDF preview: ${key}`;
    media.append(frame);
    root.append(media);
  }else if(isTextPreview(type,key)){
    const pre=document.createElement("pre");
    pre.className="text-preview";
    pre.textContent="Loading text preview…";
    root.append(pre);
    try{
      const response=await fetch(url,{headers:{range:"bytes=0-524287"}});
      if(!response.ok&&!([200,206].includes(response.status)))throw new Error(`HTTP ${response.status}`);
      const text=await response.text();
      pre.textContent=text+(text.length>=524288?"\n\n[Preview truncated at 512 KB]":"");
    }catch(error){
      pre.textContent=`Could not load text preview: ${error?.message||String(error)}`;
    }
  }else{
    const note=document.createElement("div");
    note.className="meta";
    note.textContent=type.includes("gltf")
      ?"3D asset detected. Metadata and public URL are ready; interactive 3D preview can be added next."
      :"No inline renderer for this file type yet. Details and public URL are available below.";
    media.append(note);
    root.append(media);
  }

  appendDetails(root,obj,key,url,type);
}

function setWorkspacePreviewExpanded(expanded){
  workspacePreviewExpanded=Boolean(expanded);
  const grid=document.querySelector(".explorer-body");
  grid?.classList.toggle("expanded",workspacePreviewExpanded);
  const button=$("#preview-expand")||document.querySelector("#workspace-preview .preview-head button");
  if(button)button.textContent=workspacePreviewExpanded?"Collapse":"Expand";
}

let explorerAccounts = [];
let explorerBuckets = new Map();
let workspacePrefix = "";
let explorerItems = [];
let explorerRawObjects = [];
let explorerNextCursor = "";
let explorerSelected = new Set();
let explorerAnchor = -1;
let explorerHistory = [];
let explorerHistoryIndex = -1;
let explorerClipboard = null;
let explorerSort = { field: "name", direction: 1 };
let explorerOperation = null;
let explorerPreparing = new Map();
const EXPLORER_RENDER_LIMIT = 400;
let explorerVisibleLimit = EXPLORER_RENDER_LIMIT;

function normalizePrefix(value) {
  const parts = String(value || "")
    .split("/")
    .filter(Boolean);
  if (parts.some((x) => x === "." || x === ".." || /[\\\0]/.test(x)))
    throw new Error("That location is not valid");
  return parts.length ? `${parts.join("/")}/` : "";
}
function accountName(id) {
  return explorerAccounts.find((a) => a.id === id)?.name || id || "Account";
}
function explorerSource() {
  return {
    accountId: workspaceTarget.accountId,
    bucketName: workspaceTarget.bucketName,
    accountName: accountName(workspaceTarget.accountId),
  };
}
function iconSvg(kind) {
  const paths = {
    bucket:
      '<path d="M4 6c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2Zm0 0v5c0 1.1 3.6 2 8 2s8-.9 8-2V6m-16 5v5c0 1.1 3.6 2 8 2s8-.9 8-2v-5"/>',
    folder:
      '<path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5Zm0 3h18"/>',
    image:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5 18 5-5 3 3 2-2 4 4"/>',
    video:
      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/>',
    audio:
      '<path d="M9 18V7l9-2v11M9 18a3 3 0 1 1-3-3h3m9 1a3 3 0 1 1-3-3h3"/>',
    code: '<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-5 3 2-14"/>',
    model:
      '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9"/>',
    archive: '<path d="M5 4h14v16H5zM8 4v4h8V4m-5 7h2m-2 3h2"/>',
    pdf: '<path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M8 15h8M8 18h5"/>',
    file: '<path d="M6 3h8l4 4v14H6V3Zm8 0v5h4"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2 5.3M20 5v6h-6"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[kind] || paths.file}</svg>`;
}
function fileKind(key, type = "") {
  const ext = String(key).split(".").pop().toLowerCase();
  if (
    type.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)
  )
    return "image";
  if (type.startsWith("video/") || ["mp4", "webm", "mov", "mkv"].includes(ext))
    return "video";
  if (type.startsWith("audio/") || ["mp3", "wav", "ogg", "flac"].includes(ext))
    return "audio";
  if (ext === "pdf") return "pdf";
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) return "archive";
  if (["glb", "gltf", "obj", "fbx", "stl"].includes(ext)) return "model";
  if (
    [
      "txt",
      "md",
      "json",
      "js",
      "mjs",
      "ts",
      "tsx",
      "jsx",
      "css",
      "html",
      "xml",
      "yaml",
      "yml",
      "py",
      "rs",
      "go",
      "java",
      "c",
      "cpp",
      "h",
      "sh",
    ].includes(ext)
  )
    return "code";
  return "file";
}
function itemType(key, obj = {}) {
  const ext = String(key).split(".").pop().toLowerCase();
  const kind = fileKind(
    key,
    String(obj?.httpMetadata?.contentType || obj?.contentType || ""),
  );
  const labels = {
    image: "image",
    video: "video",
    audio: "audio",
    pdf: "PDF document",
    archive: "archive",
    model: "3D model",
    code: "document",
    file: "file",
  };
  if (ext === "js") return "JavaScript";
  if (ext === "json") return "JSON";
  if (ext === "md") return "Markdown";
  return ext
    ? `${ext.toUpperCase()} ${labels[kind]}`
    : labels[kind][0].toUpperCase() + labels[kind].slice(1);
}
function itemDate(obj) {
  const value =
    obj?.uploaded || obj?.uploadedAt || obj?.created || obj?.lastModified;
  return value ? new Date(value) : null;
}
function buildDirectoryItems(objects, prefix) {
  const folders = new Map(),
    files = [];
  for (const object of objects || []) {
    const key = object.key || object.name || "";
    if (!key || key === ".redown" || !key.startsWith(prefix)) continue;
    const relative = key.slice(prefix.length);
    if (!relative) continue;
    const slash = relative.indexOf("/");
    if (slash >= 0) {
      const name = relative.slice(0, slash);
      if (name)
        folders.set(name, {
          id: `folder:${prefix}${name}/`,
          name,
          key: `${prefix}${name}/`,
          folder: true,
          size: null,
          modified: null,
          type: "Folder",
        });
      continue;
    }
    if (relative === ".redown") continue;
    files.push({
      id: `file:${key}`,
      name: relative,
      key,
      folder: false,
      size: Number(object.size || 0),
      modified: itemDate(object),
      type: itemType(key, object),
      kind: fileKind(
        key,
        String(object?.httpMetadata?.contentType || object?.contentType || ""),
      ),
      object,
    });
  }
  return [...folders.values(), ...files];
}
function sortedVisibleItems() {
  const query = $("workspace-search")?.value.trim().toLocaleLowerCase() || "";
  return explorerItems
    .filter((x) => !query || x.name.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      if (a.folder !== b.folder) return a.folder ? -1 : 1;
      let av = a[explorerSort.field],
        bv = b[explorerSort.field];
      if (explorerSort.field === "modified") {
        av = av?.getTime() || 0;
        bv = bv?.getTime() || 0;
      }
      if (typeof av === "number") return (av - bv) * explorerSort.direction;
      return (
        String(av || "").localeCompare(String(bv || ""), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * explorerSort.direction
      );
    });
}
function setOperation(
  type,
  message,
  state = "running",
  completed = 0,
  total = 0,
) {
  explorerOperation = {
    id: uid(),
    type,
    state,
    message,
    completed,
    total,
    errors: [],
  };
  renderOperation();
}
function renderOperation() {
  const el = $("explorer-operation");
  if (!el) return;
  if (!explorerOperation) {
    el.textContent = "";
    return;
  }
  const progress = explorerOperation.total
    ? ` · ${explorerOperation.completed} of ${explorerOperation.total}`
    : "";
  el.innerHTML = `${explorerOperation.state === "running" ? '<span class="operation-spinner"></span>' : ""}${explorerOperation.message}${progress}`;
}
function finishOperation(message, error = false) {
  if (!explorerOperation)
    setOperation("status", message, error ? "failed" : "done");
  else
    Object.assign(explorerOperation, {
      message,
      state: error ? "failed" : "done",
    });
  renderOperation();
  setTimeout(() => {
    if (explorerOperation?.state !== "running") {
      explorerOperation = null;
      renderOperation();
    }
  }, 6000);
}
function friendlyError(error, action = "complete that action") {
  const raw = error?.message || String(error);
  if (/unauthorized|401|403/i.test(raw))
    return "REDOWN could not access this bucket yet.";
  if (/not found|404/i.test(raw)) return "The item is no longer available.";
  return `Could not ${action}.`;
}
async function refreshProfiles() {
  profiles = (await chrome.storage.local.get("profiles")).profiles || [];
  renderWorkspaceProfiles();
}
async function ensurePrepared(target = workspaceTarget) {
  const existing = r2Profiles().find(
    (p) =>
      p.accountId === target.accountId && p.bucketName === target.bucketName,
  );
  if (existing) return existing;
  const id = `${target.accountId}:${target.bucketName}`;
  if (explorerPreparing.has(id)) return explorerPreparing.get(id);
  const task = (async () => {
    setOperation("prepare", "Preparing this bucket for file operations…");
    let lastError;
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await send({
        type: "cfPrepareBucket",
        accountId: target.accountId,
        bucketName: target.bucketName,
        accountName: accountName(target.accountId),
      });
      if (result?.ok) {
        await refreshProfiles();
        finishOperation("Bucket ready");
        return result.profile;
      }
      lastError = new Error(
        result?.error || "Bucket preparation is still propagating",
      );
      explorerOperation.message =
        "Verifying Cloudflare access… Cloudflare may take a few minutes; REDOWN will keep checking.";
      renderOperation();
      if (attempt < 9)
        await new Promise((resolve) => setTimeout(resolve, 30000));
    }
    finishOperation("REDOWN could not prepare this bucket yet.", true);
    throw lastError;
  })().finally(() => explorerPreparing.delete(id));
  explorerPreparing.set(id, task);
  return task;
}
function rememberLocation() {
  if (!workspaceTarget) return;
  const location = {
    accountId: workspaceTarget.accountId,
    bucketName: workspaceTarget.bucketName,
    prefix: workspacePrefix,
  };
  explorerHistory = explorerHistory.slice(0, explorerHistoryIndex + 1);
  explorerHistory.push(location);
  explorerHistoryIndex = explorerHistory.length - 1;
  chrome.storage.local.set({ explorerLastLocation: location });
  updateNavButtons();
}
async function goLocation(accountId, bucketName, prefix = "", remember = true) {
  const bucket = (explorerBuckets.get(accountId) || []).find(
    (b) => b.name === bucketName,
  );
  if (!bucket) return;
  workspaceTarget = {
    accountId,
    bucketName,
    accountName: accountName(accountId),
    bucket,
  };
  workspacePrefix = normalizePrefix(prefix);
  if ($("local-prefix"))
    $("local-prefix").value = workspacePrefix.replace(/\/$/, "");
  const uploadProfile = r2Profiles().find(
    (p) => p.accountId === accountId && p.bucketName === bucketName,
  );
  if (uploadProfile && $("local-profile"))
    $("local-profile").value = uploadProfile.id;
  if ($("explorer-location"))
    $("explorer-location").value = `${accountId}|${bucketName}`;
  explorerSelected.clear();
  explorerAnchor = -1;
  if (remember) rememberLocation();
  renderExplorerChrome();
  await browseWorkspace();
}
function updateNavButtons() {
  $("explorer-back").disabled = explorerHistoryIndex <= 0;
  $("explorer-forward").disabled =
    explorerHistoryIndex >= explorerHistory.length - 1;
  $("explorer-up").disabled = !workspaceTarget || !workspacePrefix;
}
function renderExplorerChrome() {
  const crumbs = $("explorer-breadcrumbs");
  crumbs.replaceChildren();
  if (!workspaceTarget) {
    updateNavButtons();
    return;
  }
  const parts = [
    { label: "Cloudflare", kind: "root" },
    { label: accountName(workspaceTarget.accountId), kind: "account" },
    { label: workspaceTarget.bucketName, prefix: "" },
  ];
  let cumulative = "";
  for (const part of workspacePrefix.split("/").filter(Boolean)) {
    cumulative += part + "/";
    parts.push({ label: part, prefix: cumulative });
  }
  parts.forEach((part, index) => {
    const button = document.createElement("button");
    button.className = "crumb";
    button.textContent = part.label;
    button.onclick = () => {
      if (part.kind === "root") return loadExplorerInventory();
      if (part.kind === "account") {
        const first = (explorerBuckets.get(workspaceTarget.accountId) || [])[0];
        if (first) goLocation(workspaceTarget.accountId, first.name);
        return;
      }
      goLocation(
        workspaceTarget.accountId,
        workspaceTarget.bucketName,
        part.prefix,
      );
    };
    crumbs.append(button);
  });
  document
    .querySelectorAll(".source-item")
    .forEach((el) =>
      el.classList.toggle(
        "active",
        el.dataset.account === workspaceTarget.accountId &&
          el.dataset.bucket === workspaceTarget.bucketName,
      ),
    );
  document.querySelectorAll(".file-head button").forEach((button) => {
    const active = button.dataset.sort === explorerSort.field;
    button.textContent =
      button.dataset.label || button.textContent.replace(/[ ↑↓]$/g, "");
    button.dataset.label = button.textContent;
    if (active) button.textContent += explorerSort.direction > 0 ? " ↑" : " ↓";
  });
  updateNavButtons();
}
function renderSources() {
  const root = $("explorer-sources"),
    mobile = $("explorer-location");
  root.replaceChildren();
  mobile.replaceChildren();
  for (const account of explorerAccounts) {
    const group = document.createElement("div");
    group.className = "account-group";
    const label = document.createElement("div");
    label.className = "account-label";
    label.textContent = account.name || account.id;
    group.append(label);
    for (const bucket of explorerBuckets.get(account.id) || []) {
      const button = document.createElement("button");
      button.className = "source-item";
      button.dataset.account = account.id;
      button.dataset.bucket = bucket.name;
      const icon = document.createElement("span");
      icon.className = "source-icon";
      icon.innerHTML = iconSvg("bucket");
      const name = document.createElement("span");
      name.textContent = bucket.name;
      button.append(icon, name);
      button.onclick = () => goLocation(account.id, bucket.name);
      button.ondragover = (e) => e.preventDefault();
      button.ondrop = (e) => dropOnBucket(e, account.id, bucket.name);
      group.append(button);
      const option = document.createElement("option");
      option.value = `${account.id}|${bucket.name}`;
      option.textContent = `${account.name} / ${bucket.name}`;
      mobile.append(option);
    }
    root.append(group);
  }
  mobile.onchange = () => {
    const [accountId, bucketName] = mobile.value.split("|");
    goLocation(accountId, bucketName);
  };
  renderExplorerChrome();
}
async function loadExplorerInventory() {
  const accountsResult = await send({ type: "cfAccounts" });
  if (!accountsResult?.ok)
    throw new Error(accountsResult?.error || "Could not load accounts");
  explorerAccounts = accountsResult.accounts || [];
  explorerBuckets.clear();
  await Promise.all(
    explorerAccounts.map(async (account) => {
      const result = await send({ type: "cfBuckets", accountId: account.id });
      explorerBuckets.set(account.id, result?.ok ? result.buckets || [] : []);
    }),
  );
  renderSources();
  if (
    workspaceTarget &&
    (explorerBuckets.get(workspaceTarget.accountId) || []).some(
      (b) => b.name === workspaceTarget.bucketName,
    )
  ) {
    renderExplorerChrome();
    return;
  }
  const stored = (await chrome.storage.local.get("explorerLastLocation"))
    .explorerLastLocation;
  const valid =
    stored &&
    (explorerBuckets.get(stored.accountId) || []).some(
      (b) => b.name === stored.bucketName,
    );
  if (valid)
    await goLocation(stored.accountId, stored.bucketName, stored.prefix);
  else {
    const account = explorerAccounts.find(
      (a) => (explorerBuckets.get(a.id) || []).length,
    );
    const bucket = account && (explorerBuckets.get(account.id) || [])[0];
    if (bucket) await goLocation(account.id, bucket.name);
    else renderFileItems();
  }
}
async function browseWorkspace({ append = false } = {}) {
  const root = $("workspace-objects");
  if (!workspaceTarget) {
    renderFileItems();
    return;
  }
  if (!append) {
    root.innerHTML =
      '<div class="file-empty"><span class="operation-spinner"></span><strong>Loading folder…</strong>Fetching objects from Cloudflare R2</div>';
    $("explorer-status").textContent = "";
    explorerRawObjects = [];
    explorerNextCursor = "";
    explorerVisibleLimit = EXPLORER_RENDER_LIMIT;
  }
  const result = await send({
    type: "cfObjects",
    accountId: workspaceTarget.accountId,
    bucketName: workspaceTarget.bucketName,
    prefix: workspacePrefix,
    cursor: append ? explorerNextCursor : "",
  });
  if (!result?.ok) {
    if (!append) explorerItems = [];
    $("explorer-status").textContent = friendlyError(
      new Error(result?.error || ""),
      "load this folder",
    );
  } else {
    explorerRawObjects.push(...(result.objects || []));
    explorerNextCursor = result.cursor || "";
    explorerItems = buildDirectoryItems(explorerRawObjects, workspacePrefix);
  }
  if (!append) explorerSelected.clear();
  renderFileItems();
  renderExplorerChrome();
}
function renderFileItems() {
  const root = $("workspace-objects");
  root.replaceChildren();
  const all = sortedVisibleItems();
  const items = all.slice(0, explorerVisibleLimit);
  const query = $("workspace-search")?.value.trim() || "";
  if (!workspaceTarget)
    root.innerHTML =
      '<div class="file-empty"><strong>No R2 buckets found</strong>Create a bucket to begin.</div>';
  else if (!items.length)
    root.innerHTML = `<div class="file-empty"><strong>${explorerItems.length ? `No files match “${query}”` : workspacePrefix ? "This folder is empty." : "This bucket is empty."}</strong>${explorerItems.length ? "Try a different search." : "Drop files here or choose Upload."}</div>`;
  items.forEach((item, index) => root.append(createFileRow(item, index)));
  if (all.length > items.length || explorerNextCursor) {
    const more = document.createElement("button");
    more.className = "secondary load-more";
    more.textContent = items.length < all.length
      ? `Show ${Math.min(EXPLORER_RENDER_LIMIT, all.length - items.length)} more`
      : "Load more files";
    more.onclick = () => {
      if (items.length < all.length) {
        explorerVisibleLimit += EXPLORER_RENDER_LIMIT;
        renderFileItems();
      } else {
        browseWorkspace({ append: true });
      }
    };
    root.append(more);
  }
  root.oncontextmenu = (e) => {
    if (e.target === root || e.target.closest(".file-empty")) {
      e.preventDefault();
      if (e.target === root) explorerSelected.clear();
      showExplorerMenu(e.clientX, e.clientY, null);
      renderFileItems();
    }
  };
  root.ondragover = (e) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  };
  root.ondrop = (e) => {
    if (e.target === root || e.target.closest(".file-empty")) {
      e.preventDefault();
      handleLocalDrop(e, workspacePrefix);
    }
  };
  const selected = selectedExplorerItems();
  const bytes = selected.reduce((sum, item) => sum + (item.size || 0), 0);
  $("explorer-count").textContent = workspaceTarget
    ? `${all.length}${explorerNextCursor ? "+" : ""} item${all.length === 1 ? "" : "s"}`
    : "No location selected";
  $("explorer-selection").textContent = selected.length
    ? `${selected.length} selected${bytes ? ` · ${formatBytes(bytes)}` : ""}`
    : "";
}
function createFileRow(item, index) {
  const row = document.createElement("div");
  row.className = `file-row${item.folder ? " folder" : ""}${explorerSelected.has(item.id) ? " selected" : ""}${explorerClipboard?.operation === "move" && explorerClipboard.entries.some((x) => x.key === item.key) ? " cut" : ""}`;
  row.dataset.id = item.id;
  row.tabIndex = 0;
  row.draggable = true;
  row.setAttribute("role", "row");
  row.setAttribute("aria-selected", String(explorerSelected.has(item.id)));
  const name = document.createElement("div");
  name.className = "file-cell file-name";
  const icon = document.createElement("span");
  icon.className = "file-icon";
  icon.innerHTML = iconSvg(item.folder ? "folder" : item.kind);
  const text = document.createElement("span");
  text.textContent = item.name;
  name.append(icon, text);
  const size = document.createElement("div");
  size.className = "file-cell file-muted";
  size.textContent = item.folder ? "—" : formatBytes(item.size);
  const modified = document.createElement("div");
  modified.className = "file-cell file-muted";
  modified.textContent = item.modified ? item.modified.toLocaleString() : "—";
  const type = document.createElement("div");
  type.className = "file-cell file-muted";
  type.textContent = item.type;
  row.append(name, size, modified, type);
  row.onclick = (e) => selectExplorerItem(item, index, e);
  row.ondblclick = () => openExplorerItem(item);
  row.oncontextmenu = (e) => {
    e.preventDefault();
    if (!explorerSelected.has(item.id)) {
      explorerSelected = new Set([item.id]);
      renderFileItems();
    }
    showExplorerMenu(e.clientX, e.clientY, item);
  };
  row.ondragstart = (e) => {
    if (!explorerSelected.has(item.id)) explorerSelected = new Set([item.id]);
    e.dataTransfer.setData("application/x-redown-items", "1");
  };
  if (item.folder) {
    row.ondragover = (e) => {
      e.preventDefault();
      row.classList.add("drop-target");
    };
    row.ondragleave = () => row.classList.remove("drop-target");
    row.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove("drop-target");
      if (e.dataTransfer.files?.length) handleLocalDrop(e, item.key);
      else
        moveSelectionTo({
          accountId: workspaceTarget.accountId,
          bucketName: workspaceTarget.bucketName,
          prefix: item.key,
        });
    };
  }
  let timer;
  row.ontouchstart = (e) => {
    timer = setTimeout(() => {
      const touch = e.touches[0];
      showExplorerMenu(touch.clientX, touch.clientY, item);
    }, 550);
  };
  row.ontouchend = row.ontouchmove = () => clearTimeout(timer);
  return row;
}
function selectExplorerItem(item, index, event = {}) {
  const items = sortedVisibleItems();
  if (event.shiftKey && explorerAnchor >= 0) {
    const [a, b] = [explorerAnchor, index].sort((x, y) => x - y);
    if (!event.ctrlKey && !event.metaKey) explorerSelected.clear();
    items.slice(a, b + 1).forEach((x) => explorerSelected.add(x.id));
  } else if (event.ctrlKey || event.metaKey) {
    explorerSelected.has(item.id)
      ? explorerSelected.delete(item.id)
      : explorerSelected.add(item.id);
    explorerAnchor = index;
  } else {
    explorerSelected = new Set([item.id]);
    explorerAnchor = index;
  }
  renderFileItems();
  if (!item.folder && explorerSelected.size === 1)
    showWorkspacePreview(item.object, rootRow(item.id));
}
function rootRow(id) {
  return Array.from(
    document.querySelectorAll("#workspace-objects .file-row"),
  ).find((x) => x.dataset.id === id);
}
async function openExplorerItem(item) {
  if (item.folder)
    return goLocation(
      workspaceTarget.accountId,
      workspaceTarget.bucketName,
      item.key,
    );
  await showWorkspacePreview(item.object, rootRow(item.id));
}
function selectedExplorerItems() {
  return explorerItems.filter((x) => explorerSelected.has(x.id));
}
function clipboardEntries(items = selectedExplorerItems()) {
  return items.map((item) => ({
    key: item.key,
    folder: item.folder,
    displayName: item.name,
  }));
}
async function setExplorerClipboard(
  operation,
  items = selectedExplorerItems(),
) {
  if (!items.length) return;
  explorerClipboard = {
    operation,
    accountId: workspaceTarget.accountId,
    bucketName: workspaceTarget.bucketName,
    accountName: accountName(workspaceTarget.accountId),
    entries: clipboardEntries(items),
  };
  await chrome.storage.session.set({ explorerClipboard });
  renderFileItems();
}
async function pasteExplorer(
  destination = { ...explorerSource(), prefix: workspacePrefix },
) {
  if (!explorerClipboard?.entries?.length) return;
  setOperation(
    explorerClipboard.operation,
    `${explorerClipboard.operation === "move" ? "Moving" : "Copying"} ${explorerClipboard.entries.length} selected item${explorerClipboard.entries.length === 1 ? "" : "s"}…`,
  );
  const request = {
    type: "cfTransferObjects",
    operation: explorerClipboard.operation,
    source: {
      accountId: explorerClipboard.accountId,
      bucketName: explorerClipboard.bucketName,
      accountName: explorerClipboard.accountName,
    },
    destination,
    entries: explorerClipboard.entries,
    conflict: "skip",
  };
  let result = await send(request);
  if (!result?.ok) {
    finishOperation(
      friendlyError(new Error(result?.error || ""), request.operation),
      true,
    );
    return;
  }
  if (result.conflicts?.length) {
    const choice = prompt(
      `${result.conflicts.length} item${result.conflicts.length === 1 ? "" : "s"} already exist. Type Replace, Keep both, Skip, or Cancel.`,
      "Keep both",
    )
      ?.trim()
      .toLowerCase();
    if (!choice || choice === "cancel") {
      finishOperation("Paste cancelled");
      return;
    }
    const conflict = choice.startsWith("r")
      ? "replace"
      : choice.startsWith("k")
        ? "keep"
        : "skip";
    if (conflict !== "skip") {
      result = await send({
        ...request,
        entries: result.conflicts.map((x) => ({
          key: x.sourceKey,
          destinationKey: x.destinationKey,
          folder: false,
          displayName: x.sourceKey.split("/").pop(),
        })),
        conflict,
      });
    }
  }
  if (request.operation === "move" && !result.errors?.length) {
    explorerClipboard = null;
    await chrome.storage.session.remove("explorerClipboard");
  }
  const failed = (result.errors || []).length;
  finishOperation(
    failed
      ? `${result.completed || 0} files completed · ${failed} could not be ${request.operation === "move" ? "moved" : "copied"}`
      : `${result.completed || 0} files ${request.operation === "move" ? "moved" : "copied"}`,
    Boolean(failed),
  );
  await browseWorkspace();
}
async function moveSelectionTo(destination) {
  await setExplorerClipboard(
    destination.accountId === workspaceTarget.accountId &&
      destination.bucketName === workspaceTarget.bucketName
      ? "move"
      : "copy",
  );
  await pasteExplorer({
    ...destination,
    accountName: accountName(destination.accountId),
  });
}
async function deleteSelection() {
  const items = selectedExplorerItems();
  if (!items.length) return;
  const label =
    items.length === 1
      ? `“${items[0].name}”`
      : `${items.length} selected items`;
  if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
  setOperation("delete", `Deleting ${label}…`);
  const result = await send({
    type: "cfDeleteObjects",
    source: explorerSource(),
    entries: clipboardEntries(items),
  });
  if (!result?.ok)
    return finishOperation(
      friendlyError(
        new Error(result?.error || ""),
        "delete the selected items",
      ),
      true,
    );
  finishOperation(
    result.errors?.length
      ? `${result.completed} files deleted · ${result.errors.length} failed`
      : `${result.completed} files deleted`,
    Boolean(result.errors?.length),
  );
  await browseWorkspace();
}
function beginExplorerRename(item) {
  hideExplorerMenu();
  const row = rootRow(item.id);
  if (!row) return;
  const cell = row.querySelector(".file-name");
  const icon = cell.querySelector(".file-icon");
  const input = document.createElement("input");
  input.className = "inline-rename";
  input.value = item.name;
  cell.replaceChildren(icon, input);
  input.focus();
  const dot = item.folder ? -1 : item.name.lastIndexOf(".");
  input.setSelectionRange(0, dot > 0 ? dot : item.name.length);
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    if (!save || !input.value.trim() || input.value.trim() === item.name)
      return renderFileItems();
    setOperation("rename", `Renaming “${item.name}”…`);
    const result = await send({
      type: "cfRenameEntry",
      source: explorerSource(),
      entry: { key: item.key, folder: item.folder, displayName: item.name },
      newName: input.value.trim(),
    });
    if (!result?.ok || result.errors?.length || result.conflicts?.length) {
      finishOperation(
        result?.conflicts?.length
          ? `“${input.value.trim()}” already exists.`
          : friendlyError(
              new Error(result?.error || result.errors?.[0]?.error || ""),
              "rename this item",
            ),
        true,
      );
      return renderFileItems();
    }
    finishOperation(`Renamed to “${input.value.trim()}”`);
    await browseWorkspace();
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  };
  input.onblur = () => finish(true);
}
function beginNewFolder() {
  if (!workspaceTarget) return;
  const root = $("workspace-objects");
  const row = document.createElement("div");
  row.className = "file-row folder selected";
  row.innerHTML = `<div class="file-cell file-name"><span class="file-icon">${iconSvg("folder")}</span><input class="inline-rename" value="New folder"></div><div class="file-cell">—</div><div class="file-cell">—</div><div class="file-cell">Folder</div>`;
  root.prepend(row);
  const input = row.querySelector("input");
  input.focus();
  input.select();
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    if (!save) return renderFileItems();
    setOperation("folder", `Creating “${input.value.trim()}”…`);
    const result = await send({
      type: "cfCreateFolder",
      ...explorerSource(),
      prefix: workspacePrefix,
      name: input.value.trim(),
    });
    if (!result?.ok) {
      finishOperation(
        friendlyError(new Error(result?.error || ""), "create the folder"),
        true,
      );
      return renderFileItems();
    }
    finishOperation("Folder created");
    await browseWorkspace();
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  };
  input.onblur = () => finish(true);
}
async function explorerDownload(item) {
  if (item.folder) return;
  setOperation("download", `Preparing “${item.name}” for download…`);
  const result = await send({
    type: "cfDownloadObject",
    ...explorerSource(),
    key: item.key,
    filename: item.name,
  });
  if (!result?.ok) {
    finishOperation(friendlyError(new Error(result?.error || ""), "download this file"), true);
    return;
  }
  await refreshProfiles();
  finishOperation(`Downloading “${item.name}”…`);
}
async function showProperties(item) {
  if (item.folder) {
    $("properties-title").textContent = item.name;
    renderProperties([
      ["Name", item.name],
      ["Type", "Folder"],
      ["Bucket", workspaceTarget.bucketName],
      ["Path", item.key],
    ]);
    return;
  }
  setOperation("properties", "Loading properties…");
  const result = await send({
    type: "cfObjectProperties",
    ...explorerSource(),
    key: item.key,
  });
  if (!result?.ok)
    return finishOperation(
      friendlyError(new Error(result?.error || ""), "load properties"),
      true,
    );
  await refreshProfiles();
  explorerOperation = null;
  renderOperation();
  const object = result.object || {};
  const profile = r2Profiles().find(
    (p) =>
      p.accountId === workspaceTarget.accountId &&
      p.bucketName === workspaceTarget.bucketName,
  );
  $("properties-title").textContent = item.name;
  renderProperties([
    ["Name", item.name],
    ["Type", item.type],
    ["Size", formatBytes(object.size || item.size)],
    ["Modified", object.uploaded || item.modified?.toLocaleString() || "—"],
    ["Bucket", workspaceTarget.bucketName],
    ["Path", workspacePrefix || "/"],
    ["Full object key", item.key],
    ["Public URL", profile ? publicObjectUrl(profile, item.key) : "—"],
    [
      "Content-Type",
      object.httpMetadata?.contentType || "application/octet-stream",
    ],
    ["ETag", object.etag || object.httpEtag || "—"],
    ["Custom metadata", JSON.stringify(object.customMetadata || {}, null, 2)],
  ]);
}
function renderProperties(entries) {
  const content = $("properties-content");
  content.replaceChildren();
  for (const [label, value] of entries) {
    const a = document.createElement("div");
    a.className = "property-label";
    a.textContent = label;
    const b = document.createElement("div");
    b.className = "property-value";
    if (label.includes("key") || label === "Custom metadata") {
      const code = document.createElement("code");
      code.textContent = String(value);
      b.append(code);
    } else b.textContent = String(value);
    content.append(a, b);
  }
  $("explorer-properties").showModal();
}
async function copyItemUrl(item) {
  const profile = await ensurePrepared(workspaceTarget);
  await navigator.clipboard.writeText(publicObjectUrl(profile, item.key));
  finishOperation("URL copied");
}
async function explorerUploadFiles(files, prefix = workspacePrefix) {
  if (!files?.length) return;
  const profile = await ensurePrepared(workspaceTarget);
  await refreshProfiles();
  $("local-profile").value = profile.id;
  $("local-prefix").value = normalizePrefix(prefix).replace(/\/$/, "");
  await uploadLocalFiles(files);
}
function handleLocalDrop(event, prefix) {
  const files = event.dataTransfer?.files;
  if (files?.length) explorerUploadFiles(files, prefix);
}
async function dropOnBucket(event, accountId, bucketName) {
  event.preventDefault();
  if (event.dataTransfer.files?.length) {
    await goLocation(accountId, bucketName);
    return explorerUploadFiles(event.dataTransfer.files, "");
  }
  if (explorerSelected.size)
    moveSelectionTo({ accountId, bucketName, prefix: "" });
}
function menuButton(label, action, enabled = true) {
  const b = document.createElement("button");
  b.className = "menu-item";
  b.type = "button";
  b.role = "menuitem";
  b.textContent = label;
  b.disabled = !enabled;
  b.onclick = () => {
    hideExplorerMenu();
    action?.();
  };
  return b;
}
function showExplorerMenu(x, y, item) {
  const menu = $("explorer-menu");
  menu.replaceChildren();
  const selected = selectedExplorerItems();
  const hasSelection = selected.length > 0;
  const sep = () => {
    const e = document.createElement("div");
    e.className = "menu-separator";
    e.role = "separator";
    menu.append(e);
  };
  if (item) {
    menu.append(
      menuButton(item.folder ? "Open" : "Open / Preview", () =>
        openExplorerItem(item),
      ),
    );
    if (!item.folder)
      menu.append(
        menuButton("Download", () =>
          selected.filter((x) => !x.folder).forEach(explorerDownload),
        ),
      );
    sep();
    menu.append(
      menuButton("Cut", () => setExplorerClipboard("move"), hasSelection),
      menuButton("Copy", () => setExplorerClipboard("copy"), hasSelection),
      menuButton(
        "Paste",
        () =>
          pasteExplorer(
            item.folder ? { ...explorerSource(), prefix: item.key } : undefined,
          ),
        Boolean(explorerClipboard),
      ),
    );
    sep();
    const label = document.createElement("div");
    label.className = "menu-label";
    label.textContent = "Send to";
    menu.append(label);
    for (const account of explorerAccounts)
      for (const bucket of explorerBuckets.get(account.id) || []) {
        if (
          account.id === workspaceTarget.accountId &&
          bucket.name === workspaceTarget.bucketName
        )
          continue;
        menu.append(
          menuButton(
            `${account.name} · ${bucket.name}`,
            async () => {
              await setExplorerClipboard("copy");
              await pasteExplorer({
                accountId: account.id,
                bucketName: bucket.name,
                accountName: account.name,
                prefix: "",
              });
            },
            hasSelection,
          ),
        );
      }
    sep();
    menu.append(
      menuButton(
        "Rename",
        () => beginExplorerRename(item),
        selected.length === 1,
      ),
      menuButton("Delete", deleteSelection, hasSelection),
    );
    if (item.folder)
      menu.append(
        menuButton("New folder", async () => {
          await goLocation(
            workspaceTarget.accountId,
            workspaceTarget.bucketName,
            item.key,
          );
          beginNewFolder();
        }),
      );
    sep();
    if (!item.folder)
      menu.append(menuButton("Copy URL", () => copyItemUrl(item)));
    menu.append(
      menuButton(
        "Properties",
        () => showProperties(item),
        selected.length === 1,
      ),
    );
  } else
    menu.append(
      menuButton("Paste", pasteExplorer, Boolean(explorerClipboard)),
      menuButton("New folder", beginNewFolder),
      menuButton("Upload files", () => $("local-files").click()),
      menuButton("Refresh", () => browseWorkspace()),
    );
  menu.hidden = false;
  requestAnimationFrame(() => {
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector("button:not(:disabled)")?.focus();
  });
}
function hideExplorerMenu() {
  $("explorer-menu").hidden = true;
}
function wireWorkspace() {
  const drop = $("local-dropzone"),
    picker = $("local-files");
  if (drop && picker) {
    drop.onclick = () => picker.click();
    drop.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        picker.click();
      }
    };
    picker.onchange = async () => {
      await explorerUploadFiles(picker.files);
      picker.value = "";
    };
    for (const n of ["dragenter", "dragover"])
      drop.addEventListener(n, (e) => {
        e.preventDefault();
        drop.classList.add("drag");
      });
    for (const n of ["dragleave", "drop"])
      drop.addEventListener(n, (e) => {
        e.preventDefault();
        drop.classList.remove("drag");
      });
    drop.ondrop = (e) =>
      explorerUploadFiles(e.dataTransfer?.files, workspacePrefix);
  }
  $("workspace-refresh").onclick = () => browseWorkspace();
  $("workspace-search").oninput = renderFileItems;
  $("preview-expand")?.addEventListener("click", () =>
    setWorkspacePreviewExpanded(!workspacePreviewExpanded),
  );
  $("explorer-new-folder").onclick = beginNewFolder;
  $("explorer-upload").onclick = () => picker.click();
  $("properties-close").onclick = () => $("explorer-properties").close();
  $("explorer-back").onclick = () => navigateHistory(-1);
  $("explorer-forward").onclick = () => navigateHistory(1);
  $("explorer-up").onclick = () => {
    const parts = workspacePrefix.split("/").filter(Boolean);
    parts.pop();
    goLocation(
      workspaceTarget.accountId,
      workspaceTarget.bucketName,
      parts.join("/"),
    );
  };
  document.querySelectorAll(".file-head button").forEach(
    (b) =>
      (b.onclick = () => {
        const field = b.dataset.sort;
        explorerSort =
          explorerSort.field === field
            ? { field, direction: -explorerSort.direction }
            : { field, direction: 1 };
        renderFileItems();
        renderExplorerChrome();
      }),
  );
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#explorer-menu")) hideExplorerMenu();
  });
  $("explorer").onkeydown = (e) => {
    if (e.target.matches("input,select,textarea")) return;
    const selected = selectedExplorerItems();
    const command = e.ctrlKey || e.metaKey;
    if (command && e.key.toLowerCase() === "a") {
      e.preventDefault();
      explorerSelected = new Set(sortedVisibleItems().map((x) => x.id));
      renderFileItems();
    } else if (command && e.key.toLowerCase() === "c")
      setExplorerClipboard("copy");
    else if (command && e.key.toLowerCase() === "x")
      setExplorerClipboard("move");
    else if (command && e.key.toLowerCase() === "v") {
      e.preventDefault();
      pasteExplorer();
    } else if (command && e.key.toLowerCase() === "f") {
      e.preventDefault();
      $("workspace-search").focus();
    } else if (e.key === "F2" && selected.length === 1) {
      e.preventDefault();
      beginExplorerRename(selected[0]);
    } else if (e.key === "Delete") {
      e.preventDefault();
      deleteSelection();
    } else if (e.key === "Enter" && selected.length === 1)
      openExplorerItem(selected[0]);
    else if (e.key === "Escape") {
      hideExplorerMenu();
      explorerSelected.clear();
      renderFileItems();
    } else if (e.key === "Backspace" || (e.altKey && e.key === "ArrowLeft")) {
      e.preventDefault();
      navigateHistory(-1);
    } else if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      navigateHistory(1);
    }
  };
}
async function navigateHistory(delta) {
  const next = explorerHistoryIndex + delta;
  if (next < 0 || next >= explorerHistory.length) return;
  explorerHistoryIndex = next;
  const loc = explorerHistory[next];
  await goLocation(loc.accountId, loc.bucketName, loc.prefix, false);
  updateNavButtons();
}

function transferKey(profile, location){
  try{
    const target=new URL(String(location||""));
    const base=new URL(String(profile?.publicBaseUrl||`${profile?.workerUrl||""}/assets`).replace(/\/+$/,"")+"/");
    if(target.origin!==base.origin)return "";
    const basePath=base.pathname.replace(/\/+$/,"")+"/";
    if(!target.pathname.startsWith(basePath))return "";
    return target.pathname.slice(basePath.length).split("/").map(decodeURIComponent).join("/");
  }catch{return "";}
}
function transferDisplayParts(item){
  let filename="";
  let parent="";
  const profile=profiles.find(p=>p.id===item?.profileId);
  const key=profile?.type==="cloudflare-r2"?transferKey(profile,item?.location):"";
  if(key){
    const parts=key.split("/").filter(Boolean);
    filename=parts.pop()||"file";
    parent=parts.length?"/"+parts.join("/")+"/":"/";
  }else{
    const raw=String(item?.location||"");
    if(raw.includes(" → ")){
      const path=raw.split(" → ").pop();
      const parts=path.split("/").filter(Boolean);
      filename=parts.pop()||"file";
      parent=parts.length?parts.join("/")+"/":"";
    }else{
      try{
        const url=new URL(raw);
        const parts=url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        filename=parts.pop()||"file";
        parent=parts.length?"/"+parts.join("/")+"/":"/";
      }catch{
        filename=raw||"Stored";
      }
    }
  }
  const dot=filename.lastIndexOf(".");
  const extension=dot>0?filename.slice(dot+1):"";
  return {profile,key,filename,parent,type:(extension||"FILE").toUpperCase()};
}
function compactFilename(filename){
  const name=String(filename||"");
  const dot=name.lastIndexOf(".");
  const hasExt=dot>0&&dot<name.length-1;
  const stem=hasExt?name.slice(0,dot):name;
  const ext=hasExt?name.slice(dot):"";
  if(stem.length<=13)return name;
  return `${stem.slice(0,5)}...${stem.slice(-5)}${ext}`;
}
function formatTransferDate(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return "—";
  const now=new Date();
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const day=new Date(date.getFullYear(),date.getMonth(),date.getDate());
  const diff=Math.round((today-day)/86400000);
  const time=date.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  if(diff===0)return `Today ${time}`;
  if(diff===1)return `Yesterday ${time}`;
  return `${date.toLocaleDateString([],{month:"short",day:"numeric"})} ${time}`;
}
async function openTransferLocation(item,parts){
  if(parts?.profile?.type!=="cloudflare-r2"||!parts.key)return;
  const folder=parts.key.split("/").slice(0,-1).join("/");
  const select=$("local-profile");
  if(select){
    select.value=parts.profile.id;
    workspaceTarget=parts.profile;
  }
  await goLocation(parts.profile.accountId,parts.profile.bucketName,folder);
  $("local-tools")?.scrollIntoView({behavior:"smooth",block:"start"});
}
async function beginRename(item,parts,nameEl,cell){
  if(parts?.profile?.type!=="cloudflare-r2")return;
  const input=document.createElement("input");
  input.className="download-name-input";
  input.value=parts.filename;
  nameEl.replaceWith(input);
  input.focus();
  const dot=parts.filename.lastIndexOf(".");
  input.setSelectionRange(0,dot>0?dot:parts.filename.length);
  let finished=false;
  const finish=async(save)=>{
    if(finished)return;
    finished=true;
    if(!save)return renderHistory({markSeen:false});
    const next=input.value.trim();
    if(!next||next===parts.filename)return renderHistory({markSeen:false});
    input.disabled=true;
    try{
      const result=await send({type:"renameTransfer",id:item.id,newFilename:next});
      if(!result?.ok)throw new Error(result?.error||"Rename failed");
      await renderHistory({markSeen:false});
    }catch(error){
      input.disabled=false;
      const note=document.createElement("div");
      note.className="download-sub";
      note.style.color="var(--red)";
      note.textContent=error?.message||String(error);
      cell.append(note);
      input.focus();
      finished=false;
    }
  };
  input.addEventListener("keydown",e=>{
    if(e.key==="Enter"){e.preventDefault();finish(true);}
    if(e.key==="Escape"){e.preventDefault();finish(false);}
  });
  input.addEventListener("blur",()=>finish(true),{once:true});
}
async function renderHistory({markSeen=true}={}){
  const [result,seenState]=await Promise.all([
    send({type:"transferHistory"}),
    chrome.storage.local.get("downloadsSeenAt")
  ]);
  const root=$("history");
  root.replaceChildren();
  const items=(result?.transferHistory||[]).slice().sort((a,b)=>new Date(b?.at||0)-new Date(a?.at||0));
  const successes=items.filter(item=>item?.ok);
  const errors=items.filter(item=>!item?.ok);
  if(!items.length){
    const empty=document.createElement("div");
    empty.className="meta";
    empty.textContent="No downloads yet. Right-click an image, video, audio item, or direct file link → REDOWN → a preset.";
    root.append(empty);
    return;
  }

  const head=document.createElement("div");
  head.className="downloads-head";
  ["Date","Location","File name","Type"].forEach(label=>{const el=document.createElement("div");el.textContent=label;head.append(el);});
  root.append(head);

  const seenAt=seenState.downloadsSeenAt?new Date(seenState.downloadsSeenAt).getTime():0;
  let newestSuccessAt=seenAt;
  for(const item of successes){
    const parts=transferDisplayParts(item);
    const itemAt=new Date(item?.at||0).getTime();
    const isNew=Boolean(seenAt&&Number.isFinite(itemAt)&&itemAt>seenAt);
    if(Number.isFinite(itemAt))newestSuccessAt=Math.max(newestSuccessAt,itemAt);

    const row=document.createElement("div");row.className="history-row";
    const date=document.createElement("div");date.className="download-date";date.textContent=formatTransferDate(item.at);
    const location=document.createElement("div");location.className="download-location";location.textContent=parts.parent||"—";
    location.title=parts.parent||"";
    if(parts.profile?.type==="cloudflare-r2"&&parts.key){
      location.addEventListener("click",()=>openTransferLocation(item,parts));
    }else{
      location.style.cursor="default";
      location.style.textDecoration="none";
    }

    const nameCell=document.createElement("div");nameCell.className="download-name-cell";
    const name=document.createElement("span");name.className="download-name";
    name.textContent=compactFilename(parts.filename);
    name.title=parts.filename;
    name.addEventListener("click",()=>{
      if(name.classList.contains("expanded")){
        beginRename(item,parts,name,nameCell);
        return;
      }
      name.classList.add("expanded");
      name.textContent=parts.filename;
      row.style.minHeight="auto";
    });
    nameCell.append(name);
    if(isNew){
      const sticker=document.createElement("span");sticker.className="new-sticker";sticker.textContent="NEW";nameCell.append(sticker);
    }

    const type=document.createElement("div");type.className="download-type";type.textContent=parts.type;
    row.append(date,location,nameCell,type);
    root.append(row);
  }

  if(!successes.length){
    const note=document.createElement("div");note.className="meta";note.style.padding="12px 8px";note.textContent="No successful downloads yet.";root.append(note);
  }

  if(errors.length){
    const toggle=document.createElement("button");toggle.className="errors-toggle";toggle.type="button";toggle.textContent=`▸ Errors (${errors.length})`;
    const list=document.createElement("div");list.className="errors-list";list.hidden=true;
    toggle.addEventListener("click",()=>{
      list.hidden=!list.hidden;
      toggle.textContent=`${list.hidden?"▸":"▾"} Errors (${errors.length})`;
    });
    for(const item of errors){
      const row=document.createElement("div");row.className="error-row";
      const date=document.createElement("div");date.className="download-date";date.textContent=formatTransferDate(item.at);
      const copy=document.createElement("div");copy.className="error-copy";
      const title=document.createElement("div");title.className="error-title";title.textContent=item.error||"Transfer failed";
      const meta=document.createElement("div");meta.className="error-meta";meta.textContent=[item.profileName,item.category,item.sourceUrl].filter(Boolean).join(" · ");
      copy.append(title,meta);row.append(date,copy);list.append(row);
    }
    root.append(toggle,list);
  }

  if(markSeen&&newestSuccessAt>seenAt){
    await chrome.storage.local.set({downloadsSeenAt:new Date(newestSuccessAt).toISOString()});
  }else if(markSeen&&!seenState.downloadsSeenAt&&successes.length){
    const newest=successes.map(x=>new Date(x.at||0).getTime()).filter(Number.isFinite).reduce((a,b)=>Math.max(a,b),Date.now());
    await chrome.storage.local.set({downloadsSeenAt:new Date(newest).toISOString()});
  }
}

async function refreshCloudflare(){
  const stored=await chrome.storage.local.get("cloudflareAuth");
  const connected=Boolean(stored.cloudflareAuth?.accessToken);
  $("connect-cloudflare").hidden=connected;
  $("disconnect-cloudflare").hidden=!connected;
  $("cloudflare-panel").hidden=!connected;
  $("local-tools").hidden=!connected;
  if(!connected)return;

  setStatus("hero-status","Cloudflare connected.","ok");
  const result=await send({type:"cfAccounts"});
  if(!result?.ok){setStatus("cf-status",result?.error||"Could not load accounts","bad");return;}
  cfAccounts=result.accounts||[];
  const select=$("cf-account");select.replaceChildren();
  cfAccounts.forEach(a=>{const o=document.createElement("option");o.value=a.id;o.textContent=a.name||a.id;select.append(o);});
  currentAccountId=select.value||"";
  if(currentAccountId)await refreshBuckets();
}
async function refreshBuckets(){
  if(!currentAccountId)return;
  setStatus("cf-status","Loading buckets…");
  const result=await send({type:"cfBuckets",accountId:currentAccountId});
  if(!result?.ok){setStatus("cf-status",result?.error||"Could not load buckets","bad");return;}
  const root=$("bucket-grid");root.replaceChildren();
  (result.buckets||[]).forEach(bucket=>{
    const el=document.createElement("div");el.className="bucket";
    const strong=document.createElement("strong");strong.textContent=bucket.name;
    const ready=profiles.some(p=>p.type==="cloudflare-r2"&&p.accountId===currentAccountId&&p.bucketName===bucket.name);
    const span=document.createElement("span");
    span.textContent=ready
      ? "REDOWN ready · click to verify/repair"
      : ([bucket.location,bucket.jurisdiction].filter(Boolean).join(" · ")||"R2 bucket")+" · click to use";
    el.append(strong,span);
    el.addEventListener("click",()=>addBucketPreset(bucket.name));
    root.append(el);
  });
  setStatus("cf-status",(result.buckets||[]).length?"Click a bucket to make it a REDOWN preset.":"No buckets yet. Create one above.");
}
async function addBucketPreset(bucketName){
  const account=cfAccounts.find(a=>a.id===currentAccountId);
  if(!account)return;
  setStatus("cf-status",`Preparing ${bucketName}… REDOWN is verifying the remote transfer Worker before saving this preset.`);
  const result=await send({
    type:"cfProvision",
    accountId:account.id,
    accountName:account.name,
    bucketName,
    profileName:bucketName,
    folders:{"3d":"3d","2d":"2d","videos":"videos","files":"files"}
  });
  if(!result?.ok){setStatus("cf-status",result?.error||"Could not prepare bucket","bad");return;}
  const stored=await chrome.storage.local.get("profiles");
  profiles=stored.profiles||[];
  renderProfiles();
  setStatus("cf-status",`${bucketName} is ready. REDOWN verified a real R2 write and prepared its default locations. Right-click a link, image, video, audio item, or GLB link → REDOWN → ${bucketName}.`,"ok");
}

$("connect-cloudflare").addEventListener("click",async()=>{
  const button=$("connect-cloudflare");
  if(button.disabled)return;
  button.disabled=true;
  const original=button.textContent;
  button.textContent="Connecting…";
  setStatus("hero-status","Opening Cloudflare…");
  try{
    const result=await send({type:"cfConnect"});
    if(!result?.ok)throw new Error(result?.error||"Cloudflare connection failed");
    setStatus("hero-status","Cloudflare connected.","ok");
    await refreshCloudflare();
  }catch(error){
    setStatus("hero-status",error?.message||String(error),"bad");
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
});
$("disconnect-cloudflare").addEventListener("click",async()=>{await send({type:"cfDisconnect"});setStatus("hero-status","Cloudflare disconnected.");await refreshCloudflare();});
$("cf-account").addEventListener("change",async e=>{currentAccountId=e.target.value;await refreshBuckets();});
$("create-bucket").addEventListener("click",async()=>{
  const name=$("new-bucket").value.trim();
  if(!name)return setStatus("cf-status","Enter a bucket name first.","bad");
  const result=await send({type:"cfCreateBucket",accountId:currentAccountId,name});
  if(!result?.ok)return setStatus("cf-status",result?.error||"Could not create bucket","bad");
  $("new-bucket").value="";
  setStatus("cf-status",`${name} created.`,"ok");
  await refreshBuckets();
});
$("add-github").addEventListener("click",()=>{
  profiles.push({
    id:uid(),name:"GitHub Assets",type:"github",repository:"",branch:"main",
    workflowFile:"redown-ingest.yml",token:"",
    paths:{"2d":"assets/2d","3d":"assets/3d","videos":"assets/videos","files":"assets/files"},
    defaultCategory:"files",menuTree:[],showInContextMenu:true,menuOrder:profiles.length
  });
  renderProfiles();
  document.querySelector("#profiles .card:last-child")?.scrollIntoView({behavior:"smooth"});
});
$("refresh-history").addEventListener("click",()=>renderHistory({markSeen:true}));

let downloadsDirty=false;
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=="local"||!changes.transferHistory)return;
  downloadsDirty=true;
  if(document.visibilityState==="visible"&&document.hasFocus()){
    downloadsDirty=false;
    renderHistory({markSeen:true});
  }
});
async function refreshDownloadsOnAccess(){
  if(!downloadsDirty)return;
  downloadsDirty=false;
  await renderHistory({markSeen:true});
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refreshDownloadsOnAccess();});
window.addEventListener("focus",refreshDownloadsOnAccess);

(async()=>{
  const stored=await chrome.storage.local.get(["profiles","cloudflareAuth"]);
  profiles=stored.profiles||[];
  renderProfiles();
  wireWorkspace();
  renderWorkspaceProfiles();
  await refreshCloudflare();
  const auth=(await chrome.storage.local.get("cloudflareAuth")).cloudflareAuth;
  $("local-tools").hidden=!auth?.accessToken;
  explorerClipboard=(await chrome.storage.session.get("explorerClipboard")).explorerClipboard||null;
  if(auth?.accessToken)await loadExplorerInventory().catch(error=>{$("explorer-status").textContent=friendlyError(error,"load Cloudflare storage");});
  await renderHistory();
})();
