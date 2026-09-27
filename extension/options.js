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
  $("profiles-empty").hidden=profiles.length>0;

  profiles.sort((a,b)=>(a.menuOrder??999)-(b.menuOrder??999));
  profiles.forEach((p,index)=>{
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
  const tools=$("local-tools");
  if(!select||!tools)return;
  const r2=r2Profiles();
  tools.hidden=!r2.length;
  if(!r2.length){workspaceTarget=null;return;}
  const previous=select.value;
  select.replaceChildren();
  for(const profile of r2){
    const option=document.createElement("option");
    option.value=profile.id;
    option.textContent=`${displayName(profile)} · ${profile.bucketName}`;
    select.append(option);
  }
  if(r2.some(p=>p.id===previous))select.value=previous;
  workspaceTarget=r2.find(p=>p.id===select.value)||r2[0];
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
  const profile=workspaceTarget;
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
  $("workspace-prefix").value=prefix;
  await browseWorkspace();
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
  const url=publicObjectUrl(workspaceTarget,key);
  const type=objectContentType(obj,key);

  const head=document.createElement("div");
  head.className="preview-head";
  const title=document.createElement("div");
  title.className="preview-title";
  title.textContent=key;
  const expand=document.createElement("button");
  expand.className="ghost";
  expand.type="button";
  expand.textContent=workspacePreviewExpanded?"Collapse":"Expand";
  expand.addEventListener("click",()=>setWorkspacePreviewExpanded(!workspacePreviewExpanded));
  head.append(title,expand);
  root.append(head);

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
  const grid=document.querySelector(".workspace-grid");
  grid?.classList.toggle("expanded",workspacePreviewExpanded);
  const button=$("#preview-expand")||document.querySelector("#workspace-preview .preview-head button");
  if(button)button.textContent=workspacePreviewExpanded?"Collapse":"Expand";
}

async function browseWorkspace(){
  if(!workspaceTarget)return;
  const root=$("workspace-objects");
  root.replaceChildren();
  const prefix=$("workspace-prefix").value.trim();
  const result=await send({
    type:"cfObjects",
    accountId:workspaceTarget.accountId,
    bucketName:workspaceTarget.bucketName,
    prefix
  });
  if(!result?.ok){
    const e=document.createElement("div");e.className="object";e.textContent=result?.error||"Could not browse bucket";root.append(e);return;
  }
  workspaceObjects=(result.objects||[]).filter(obj=>{
    const key=obj.key||obj.name||"";
    return key&&!key.endsWith("/.redown");
  });
  if(!workspaceObjects.length){
    const e=document.createElement("div");e.className="object";e.textContent="No objects under this prefix.";root.append(e);
    const preview=$("workspace-preview");
    preview.replaceChildren();
    const head=document.createElement("div");head.className="preview-head";
    const note=document.createElement("div");note.className="meta";note.textContent="Nothing to preview here yet.";
    const expand=document.createElement("button");expand.className="ghost";expand.type="button";expand.textContent=workspacePreviewExpanded?"Collapse":"Expand";
    expand.addEventListener("click",()=>setWorkspacePreviewExpanded(!workspacePreviewExpanded));
    head.append(note,expand);preview.append(head);
    return;
  }
  for(const obj of workspaceObjects.slice(0,300)){
    const key=obj.key||obj.name||String(obj);
    const row=document.createElement("div");
    row.className="object";
    row.textContent=`${key} · ${formatBytes(obj.size)}`;
    row.addEventListener("click",()=>showWorkspacePreview(obj,row));
    root.append(row);
  }
}
function wireWorkspace(){
  const select=$("local-profile");
  if(!select)return;
  select.addEventListener("change",async()=>{
    workspaceTarget=profiles.find(p=>p.id===select.value)||null;
    if(workspaceTarget){
      $("workspace-prefix").value="";
      await browseWorkspace();
    }
  });
  const drop=$("local-dropzone");
  const picker=$("local-files");
  drop.addEventListener("click",()=>picker.click());
  drop.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();picker.click();}});
  picker.addEventListener("change",async()=>{await uploadLocalFiles(picker.files);picker.value="";});
  for(const eventName of ["dragenter","dragover"]){
    drop.addEventListener(eventName,e=>{e.preventDefault();drop.classList.add("drag");});
  }
  for(const eventName of ["dragleave","drop"]){
    drop.addEventListener(eventName,e=>{e.preventDefault();drop.classList.remove("drag");});
  }
  drop.addEventListener("drop",e=>uploadLocalFiles(e.dataTransfer?.files));
  $("workspace-browse").addEventListener("click",browseWorkspace);
  $("workspace-refresh").addEventListener("click",browseWorkspace);
  $("workspace-prefix").addEventListener("keydown",e=>{if(e.key==="Enter")browseWorkspace();});
  $("preview-expand")?.addEventListener("click",()=>setWorkspacePreviewExpanded(!workspacePreviewExpanded));
}

async function renderHistory(){
  const result=await send({type:"transferHistory"});
  const root=$("history");
  root.replaceChildren();
  const items=result?.transferHistory||[];
  if(!items.length){
    const empty=document.createElement("div");
    empty.className="meta";
    empty.textContent="No transfers yet. Right-click an image, video, audio item, or direct file link → REDOWN → a preset.";
    root.append(empty);
    return;
  }
  for(const item of items){
    const row=document.createElement("div");row.className="history-row";
    const status=document.createElement("div");status.className="history-status "+(item.ok?"ok":"bad");
    status.textContent=item.ok?"SENT":"FAILED";
    const main=document.createElement("div");main.className="history-main";
    const title=document.createElement("div");title.className="history-title";
    title.textContent=item.ok?(item.location||"Stored"):(item.error||"Transfer failed");
    const meta=document.createElement("div");meta.className="history-meta";
    meta.textContent=[item.profileName,item.category,item.sourceUrl].filter(Boolean).join(" · ");
    main.append(title,meta);row.append(status,main);root.append(row);
  }
}

async function refreshCloudflare(){
  const stored=await chrome.storage.local.get("cloudflareAuth");
  const connected=Boolean(stored.cloudflareAuth?.accessToken);
  $("connect-cloudflare").hidden=connected;
  $("disconnect-cloudflare").hidden=!connected;
  $("cloudflare-panel").hidden=!connected;
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
$("refresh-history").addEventListener("click",renderHistory);

(async()=>{
  const stored=await chrome.storage.local.get(["profiles","cloudflareAuth"]);
  profiles=stored.profiles||[];
  renderProfiles();
  wireWorkspace();
  renderWorkspaceProfiles();
  if(workspaceTarget)await browseWorkspace();
  await refreshCloudflare();
  await renderHistory();
})();