const $=id=>document.getElementById(id);
let profiles=[];
let cfAccounts=[];
let currentAccountId="";
let workspaceTarget=null;
let workspaceObjects=[];
let workspacePreviewExpanded=false;
let workspacePreviewLightbox=false;
let workspacePreviewRequestId=0;
const defaultLocationPrefixCache=new Map();
const presetLocationCache=new Map();
let uploadLocationPrefixes=[];
let uploadLocationSegments=[""];

function uid(){return crypto.randomUUID();}
function safeUiMessage(message){
  const raw=String(message||"");
  if(/unauthorized|\b401\b|\b403\b/i.test(raw))
    return "Connecting… REDOWN is verifying Cloudflare access.";
  return raw;
}
function setStatus(id,msg,kind=""){
  const el=$(id);
  const raw=String(msg||"");
  const transient=/unauthorized|\b401\b|\b403\b/i.test(raw);
  el.textContent=transient?"Connecting… REDOWN is verifying Cloudflare access.":raw;
  el.className="status"+((transient?"":kind)?" "+kind:"");
}
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
async function ensureProfileMenuPrefixes(profile, prefixes) {
  if (profile?.type !== "cloudflare-r2") return;
  const clean = Array.from(new Set((prefixes || [])
    .map((value) => String(value || "").trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)));
  if (!clean.length) return;
  const result = await send({
    type:"cfEnsurePrefixes",
    accountId:profile.accountId,
    bucketName:profile.bucketName,
    accountName:profile.accountName,
    prefixes:clean
  });
  if (!result?.ok) throw new Error(result?.error || "Could not create remote folder");
}
function leafMenuPrefixes(nodes) {
  const out = [];
  const walk = (items) => {
    for (const node of items || []) {
      if (node.children?.length) walk(node.children);
      else if (node.prefix != null) out.push(node.prefix);
    }
  };
  walk(nodes);
  return out;
}
function presetCacheKey(profile){
  return `${profile?.accountId||""}:${profile?.bucketName||""}`;
}
async function refreshPresetLocations(profile,{rerender=true}={}){
  if(profile?.type!=="cloudflare-r2")return [];
  const key=presetCacheKey(profile);
  const known=new Set([
    ...(presetLocationCache.get(presetCacheKey(profile))||[]),
    ...Object.values(profile.folders||{}),
    ...leafMenuPrefixes(profile.menuTree||[])
  ].map((value)=>String(value||"").trim().replace(/^\/+|\/+$/g,"")).filter(Boolean));

  // Show everything REDOWN already knows immediately. The Cloudflare lookup below
  // only enriches this cache; it never blocks the preset editor.
  presetLocationCache.set(key,known);

  try{
    const root=await send({
      type:"cfFolderChildren",
      accountId:profile.accountId,
      bucketName:profile.bucketName,
      parentPrefix:"",
      limit:250
    });
    if(root?.ok){
      for(const child of root.children||[])known.add(String(child||"").replace(/^\/+|\/+$/g,""));
    }
  }catch{}

  presetLocationCache.set(key,known);
  if(rerender)renderProfiles();
  return Array.from(known);
}


function renderTree(profile){
  if(profile?.type==="cloudflare-r2")return renderR2LocationMenu(profile);

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
    ?"Nested menu: each leaf sends to its exact saved location."
    :"Quick send: clicking this preset immediately uses the free-form default location above.";
  copy.append(strong,small);

  const controls=document.createElement("div");
  controls.className="row-actions";
  const refreshLocations=document.createElement("button");
  refreshLocations.className="ghost";
  refreshLocations.type="button";
  refreshLocations.textContent="Refresh locations";
  refreshLocations.title="Reload available R2 locations for this preset";
  refreshLocations.addEventListener("click",async()=>{
    refreshLocations.disabled=true;
    const previous=refreshLocations.textContent;
    refreshLocations.textContent="Refreshing…";
    try{await refreshPresetLocations(profile,{rerender:true});}
    finally{
      refreshLocations.disabled=false;
      refreshLocations.textContent=previous;
    }
  });
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
        {id:uid(),label:"Videos",category:"videos",prefix:"videos",path:"assets/videos",children:[]},
        {id:uid(),label:"Files",category:"files",prefix:"files",path:"assets/files",children:[]}
      ];
      ensureProfileMenuPrefixes(profile, leafMenuPrefixes(profile.menuTree)).catch(()=>{});
    }
    scheduleSave();
    renderProfiles();
  });
  controls.append(refreshLocations,quick,nested);
  heading.append(copy,controls);
  wrap.append(heading);

  if(!profile.menuTree?.length) return wrap;

  const note=document.createElement("div");
  note.className="tree-note";
  note.textContent="3D, 2D, Videos, and Files are starter suggestions only. Rename, remove, or add any destination you want. Each leaf uses its exact path.";
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

function presetKnownLocations(profile){
  const key=presetCacheKey(profile);
  const known=new Set([
    ...(presetLocationCache.get(key)||[]),
    ...Object.values(profile.folders||{}),
    ...leafMenuPrefixes(profile.menuTree||[])
  ].map((value)=>String(value||"").trim().replace(/^\/+|\/+$/g,"")).filter(Boolean));
  presetLocationCache.set(key,known);
  return known;
}
function presetImmediateChildren(profile,parentPrefix=""){
  const parent=String(parentPrefix||"").replace(/^\/+|\/+$/g,"");
  const parentParts=parent.split("/").filter(Boolean);
  const seen=new Set();
  for(const raw of presetKnownLocations(profile)){
    const parts=String(raw||"").split("/").filter(Boolean);
    let matches=true;
    for(let i=0;i<parentParts.length;i++){
      if(parts[i]!==parentParts[i]){matches=false;break;}
    }
    if(!matches)continue;
    const child=parts[parentParts.length];
    if(child)seen.add(child);
  }
  return Array.from(seen).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
}
async function hydratePresetChildren(profile,parentPrefix,select){
  try{
    const cleanParent=String(parentPrefix||"").replace(/^\/+|\/+$/g,"");
    const result=await send({
      type:"cfFolderChildren",
      accountId:profile.accountId,
      bucketName:profile.bucketName,
      parentPrefix:cleanParent,
      limit:250
    });
    if(!result?.ok)return;
    const known=presetKnownLocations(profile);
    const existing=new Set(Array.from(select.options).map((option)=>option.value));
    for(const child of result.children||[]){
      const clean=String(child||"").trim().replace(/^\/+|\/+$/g,"");
      if(!clean)continue;
      const full=cleanParent?cleanParent+"/"+clean:clean;
      known.add(full);
      if(!existing.has(clean)){
        const option=document.createElement("option");
        option.value=clean;
        option.textContent=clean;
        select.append(option);
        existing.add(clean);
      }
    }
    presetLocationCache.set(presetCacheKey(profile),known);
  }catch{}
}
function renderR2LocationMenu(profile){
  profile.menuTree??=[];
  const wrap=document.createElement("div");
  wrap.className="tree-editor r2-location-menu";

  const heading=document.createElement("div");
  heading.className="tree-heading";
  const copy=document.createElement("div");
  const strong=document.createElement("strong");
  strong.textContent="Right-click behavior";
  const small=document.createElement("div");
  small.className="meta";
  small.textContent=profile.menuTree.length
    ?"Nested menu follows real R2 locations. Existing folders appear immediately; deeper folders refresh quietly in the background."
    :"Quick send uses the destination selected above.";
  copy.append(strong,small);

  const controls=document.createElement("div");
  controls.className="row-actions";
  const refresh=document.createElement("button");
  refresh.className="ghost";
  refresh.type="button";
  refresh.textContent="Refresh locations";
  refresh.addEventListener("click",async()=>{
    refresh.disabled=true;
    refresh.textContent="Refreshing…";
    try{
      await refreshPresetLocations(profile,{rerender:false});
      renderProfiles();
    }finally{
      refresh.disabled=false;
      refresh.textContent="Refresh locations";
    }
  });

  const quick=document.createElement("button");
  quick.className=profile.menuTree.length?"ghost":"secondary";
  quick.type="button";
  quick.textContent="Quick send";
  quick.addEventListener("click",()=>{
    profile.menuTree=[];
    scheduleSave();
    renderProfiles();
  });

  const nested=document.createElement("button");
  nested.className=profile.menuTree.length?"secondary":"ghost";
  nested.type="button";
  nested.textContent="Nested menu";
  nested.addEventListener("click",()=>{
    if(!profile.menuTree.length){
      const roots=presetImmediateChildren(profile,"");
      profile.menuTree=roots.slice(0,4).map((name)=>({
        id:uid(),label:name,prefix:name,category:"files",children:[]
      }));
      if(!profile.menuTree.length){
        const fallback=String(profile.defaultPrefix||"files").split("/").filter(Boolean)[0]||"files";
        profile.menuTree=[{id:uid(),label:fallback,prefix:fallback,category:"files",children:[]}];
      }
    }
    scheduleSave();
    renderProfiles();
  });

  controls.append(refresh,quick,nested);
  heading.append(copy,controls);
  wrap.append(heading);
  if(!profile.menuTree.length)return wrap;

  const note=document.createElement("div");
  note.className="tree-note r2-location-note";
  note.textContent="Choose real folders from the dropdowns. The blank fields are only for creating something new.";
  wrap.append(note);

  const list=document.createElement("div");
  list.className="r2-location-list";

  const nodeParentPrefix=(node,parents)=>{
    if(!parents.length)return "";
    return String(parents[parents.length-1]?.prefix||"").replace(/^\/+|\/+$/g,"");
  };

  const renderNode=(node,depth,parents=[])=>{
    node.children??=[];
    const parentPrefix=nodeParentPrefix(node,parents);
    const currentPrefix=String(node.prefix||"").replace(/^\/+|\/+$/g,"");
    const currentLeaf=currentPrefix.split("/").filter(Boolean).pop()||"";

    const shell=document.createElement("div");
    shell.className="r2-location-node";
    shell.style.setProperty("--depth",String(depth));

    const row=document.createElement("div");
    row.className="r2-location-row";

    const branch=document.createElement("div");
    branch.className="r2-location-branch";
    branch.textContent=node.children.length?"▾":"•";

    const select=document.createElement("select");
    select.className="r2-location-select";
    const placeholder=document.createElement("option");
    placeholder.value="";
    placeholder.textContent=depth===0?"Choose existing location…":"Choose existing child…";
    select.append(placeholder);

    const children=presetImmediateChildren(profile,parentPrefix);
    if(currentLeaf&&!children.includes(currentLeaf))children.push(currentLeaf);
    children.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
    for(const child of children){
      const option=document.createElement("option");
      option.value=child;
      option.textContent=child;
      option.selected=child===currentLeaf;
      select.append(option);
    }

    const create=document.createElement("input");
    create.type="text";
    create.className="r2-location-create";
    create.value="";
    create.placeholder=depth===0
      ?"Create new location…"
      :"Create new child…";
    create.setAttribute("aria-label",create.placeholder);

    const add=document.createElement("button");
    add.type="button";
    add.className="mini tree-add";
    add.textContent="+";
    add.title="Add a child under this location";

    const remove=document.createElement("button");
    remove.type="button";
    remove.className="mini danger tree-remove";
    remove.textContent="×";
    remove.title="Remove this destination from the right-click preset only";

    const applyLocation=async(leaf,{materialize=false}={})=>{
      const clean=String(leaf||"").replace(/[\\/\0]/g,"").trim();
      if(!clean)return false;
      const full=parentPrefix?parentPrefix+"/"+clean:clean;
      node.prefix=full;
      node.label=clean;
      node.category=node.category||"files";
      scheduleSave();

      const known=presetKnownLocations(profile);
      known.add(full);
      presetLocationCache.set(presetCacheKey(profile),known);

      if(materialize){
        try{
          await saveProfiles();
          await ensureProfileMenuPrefixes(profile,[full]);
        }catch{}
      }
      return true;
    };

    select.addEventListener("change",async()=>{
      if(!select.value)return;
      await applyLocation(select.value,{materialize:false});
      renderProfiles();
    });

    const createLocation=async()=>{
      const clean=create.value.replace(/[\\/\0]/g,"").trim();
      if(!clean)return false;
      await applyLocation(clean,{materialize:true});
      create.value="";
      renderProfiles();
      return true;
    };
    create.addEventListener("keydown",(event)=>{
      if(event.key==="Enter"){event.preventDefault();createLocation();}
    });

    add.addEventListener("click",async()=>{
      if(!node.prefix){
        const made=await createLocation();
        if(!made)return;
      }
      node.children.push({id:uid(),label:"",prefix:"",category:"files",children:[]});
      scheduleSave();
      renderProfiles();
    });

    remove.addEventListener("click",()=>{
      removeNode(profile.menuTree,node.id);
      scheduleSave();
      renderProfiles();
    });

    row.append(branch,select,create,add,remove);
    shell.append(row);

    hydratePresetChildren(profile,parentPrefix,select);

    if(node.children.length){
      const kids=document.createElement("div");
      kids.className="r2-location-children";
      for(const child of node.children)kids.append(renderNode(child,depth+1,[...parents,node]));
      shell.append(kids);
    }
    return shell;
  };

  for(const node of profile.menuTree)list.append(renderNode(node,0,[]));
  wrap.append(list);

  const addTop=document.createElement("div");
  addTop.className="r2-add-top";
  const label=document.createElement("div");
  label.className="r2-add-top-label";
  label.textContent="New top-level location";
  const topInput=document.createElement("input");
  topInput.type="text";
  topInput.placeholder="Create a new top-level location…";
  const topButton=document.createElement("button");
  topButton.type="button";
  topButton.className="secondary";
  topButton.textContent="Add";
  const addTopLocation=async()=>{
    const clean=topInput.value.replace(/[\\/\0]/g,"").trim();
    if(!clean)return;
    profile.menuTree.push({id:uid(),label:clean,prefix:clean,category:"files",children:[]});
    const known=presetKnownLocations(profile);
    known.add(clean);
    presetLocationCache.set(presetCacheKey(profile),known);
    try{
      await saveProfiles();
      await ensureProfileMenuPrefixes(profile,[clean]);
    }catch{}
    topInput.value="";
    scheduleSave();
    renderProfiles();
  };
  topButton.addEventListener("click",addTopLocation);
  topInput.addEventListener("keydown",(event)=>{
    if(event.key==="Enter"){event.preventDefault();addTopLocation();}
  });
  addTop.append(label,topInput,topButton);
  wrap.append(addTop);

  // Warm the root cache without showing a blocking loading state.
  refreshPresetLocations(profile,{rerender:false}).catch(()=>{});
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
  labelInput.placeholder="Menu item";
  labelInput.title="The label shown in REDOWN's right-click menu";
  labelInput.addEventListener("input",()=>{node.label=labelInput.value;scheduleSave();});

  const targetWrap=document.createElement("div");
  targetWrap.className="tree-target-wrap";

  const suggestions=document.createElement("select");
  suggestions.className="tree-location-suggest";
  suggestions.title="Suggested or existing destination";
  const choose=document.createElement("option");
  choose.value="";
  choose.textContent="Suggested location…";
  suggestions.append(choose);

  const known=new Set([
    ...Object.values(profile.folders||{}),
    ...(profile.menuTree||[]).flatMap(function collect(entry){
      return [
        entry.prefix,
        ...(entry.children||[]).flatMap(collect)
      ];
    })
  ].map((value)=>String(value||"").trim().replace(/^\/+|\/+$/g,"")).filter(Boolean));

  for(const value of known){
    const option=document.createElement("option");
    option.value=value;
    option.textContent="/"+value;
    suggestions.append(option);
  }

  const target=document.createElement("input");
  target.className="tree-target";
  target.value=profile.type==="cloudflare-r2"?(node.prefix??""):(node.path??"");
  target.placeholder=profile.type==="cloudflare-r2"?"Location, e.g. Historical/Letters":"Path, e.g. assets/history/letters";
  target.disabled=node.children.length>0;
  target.title=node.children.length
    ?"This is a parent menu item. Its child entries choose the final destination."
    :"Exact destination. Type any path or choose a suggestion.";

  suggestions.addEventListener("change",()=>{
    if(!suggestions.value)return;
    target.value=suggestions.value;
    if(profile.type==="cloudflare-r2")node.prefix=suggestions.value;
    else node.path=suggestions.value;
    scheduleSave();
    materializeTarget();
  });

  target.addEventListener("input",()=>{
    if(profile.type==="cloudflare-r2")node.prefix=target.value;
    else node.path=target.value;
    scheduleSave();
  });

  const materializeTarget=async()=>{
    if(profile.type!=="cloudflare-r2"||node.children.length)return;
    try{
      await saveProfiles();
      await ensureProfileMenuPrefixes(profile,[node.prefix]);
      const clean=String(node.prefix||"").trim().replace(/^\/+|\/+$/g,"");
      if(clean){
        const key=presetCacheKey(profile);
        const known=new Set(presetLocationCache.get(key)||[]);
        known.add(clean);
        presetLocationCache.set(key,known);
      }
      await refreshPresetLocations(profile,{rerender:false});
      renderProfiles();
    }catch(error){
      console.warn("REDOWN could not materialize menu prefix:",error?.message||String(error));
    }
  };
  target.addEventListener("change",materializeTarget);
  target.addEventListener("blur",materializeTarget);
  targetWrap.append(suggestions,target);

  const add=document.createElement("button");
  add.className="mini tree-add";
  add.textContent="+";
  add.title="Add a child destination under this menu item";
  add.setAttribute("aria-label","Add child destination");
  add.addEventListener("click",()=>{
    node.children.push(makeNode("New destination"));
    scheduleSave();
    renderProfiles();
  });

  const remove=document.createElement("button");
  remove.className="mini danger tree-remove";
  remove.textContent="×";
  remove.title="Remove this menu entry only. This never deletes the R2 folder.";
  remove.addEventListener("click",()=>{
    removeNode(profile.menuTree,node.id);
    scheduleSave();
    renderProfiles();
  });

  row.append(branch,labelInput,targetWrap,add,remove);
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
    if(p.type==="cloudflare-r2"){
      grid.append(r2PresetDestinationField(p));
      grid.append(assetCorsControl(p));
    }else{
      grid.append(
        field("Menu label",p.menuLabel||p.name||"",v=>p.menuLabel=v),
        field("Default path",p.defaultPath||"assets/files",v=>p.defaultPath=v),
        field("Order",String(p.menuOrder??index),v=>p.menuOrder=Number(v)||0,"number")
      );
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
  for (const profile of visibleProfiles) {
    ensureProfileMenuPrefixes(profile, leafMenuPrefixes(profile.menuTree)).catch(()=>{});
    if (profile.type==="cloudflare-r2" && profile.defaultPrefix)
      ensureProfileMenuPrefixes(profile,[profile.defaultPrefix]).catch(()=>{});
  }
  scheduleSave();
}

function r2PresetDestinationField(profile){
  const wrap=document.createElement("div");
  wrap.style.gridColumn="1 / -1";

  const table=document.createElement("div");
  table.className="preset-destination";

  const head=document.createElement("div");
  head.className="preset-destination-head";
  ["Level","Existing","Create new","Action"].forEach((text)=>{
    const cell=document.createElement("div");
    cell.textContent=text;
    head.append(cell);
  });
  table.append(head);

  const cacheKey=profile.accountId+":"+profile.bucketName;
  let segments=String(profile.defaultPrefix||"").split("/").filter(Boolean);
  let prefixInventory=defaultLocationPrefixCache.get(cacheKey)||[];

  const cleanSegment=(value)=>String(value||"")
    .trim()
    .replace(/[\\/\0]/g,"")
    .replace(/^\.+$/,"");

  const immediateChildren=(parentSegments)=>{
    const parent=parentSegments.filter(Boolean);
    const seen=new Set();
    for(const raw of prefixInventory){
      const parts=String(raw||"").split("/").filter(Boolean);
      let matches=true;
      for(let i=0;i<parent.length;i++){
        if(parts[i]!==parent[i]){matches=false;break;}
      }
      if(!matches)continue;
      const child=parts[parent.length];
      if(child)seen.add(child);
    }
    return Array.from(seen).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
  };

  const currentPrefix=()=>segments.map(cleanSegment).filter(Boolean).join("/");
  const breadcrumb=document.createElement("div");
  breadcrumb.className="preset-breadcrumb";
  const status=document.createElement("div");
  status.className="preset-new-bucket-status";

  const updateBreadcrumb=()=>{
    const prefix=currentPrefix();
    breadcrumb.textContent=profile.bucketName+(prefix?" / "+prefix:" / (bucket root)");
  };

  const commitPrefix=async({materialize=false}={})=>{
    segments=segments.map(cleanSegment).filter(Boolean);
    profile.defaultPrefix=currentPrefix();
    scheduleSave();
    updateBreadcrumb();
    if(materialize&&profile.defaultPrefix){
      try{
        await saveProfiles();
        await ensureProfileMenuPrefixes(profile,[profile.defaultPrefix]);
        const known=new Set(prefixInventory);
        known.add(profile.defaultPrefix);
        prefixInventory=Array.from(known);
        defaultLocationPrefixCache.set(profile.accountId+":"+profile.bucketName,prefixInventory);
        status.textContent="Location ready.";
      }catch(error){
        status.textContent="Saved. REDOWN will create this location when Cloudflare is ready.";
      }
    }
  };

  const adoptPreparedProfile=(prepared)=>{
    if(!prepared)return;
    const keep={
      id:profile.id,
      menuTree:profile.menuTree,
      menuOrder:profile.menuOrder,
      showInContextMenu:profile.showInContextMenu,
      defaultPrefix:profile.defaultPrefix,
      defaultCategory:profile.defaultCategory
    };
    Object.assign(profile,prepared,keep);
    profile.name=prepared.bucketName||prepared.name||profile.name;
    profile.menuLabel="";
    prefixInventory=[];
    defaultLocationPrefixCache.delete(cacheKey);
  };

  const bucketRow=document.createElement("div");
  bucketRow.className="preset-destination-row";

  const bucketLevel=document.createElement("div");
  bucketLevel.className="preset-level";
  bucketLevel.textContent="Bucket";

  const bucketExisting=document.createElement("div");
  bucketExisting.className="preset-existing";
  const bucketSelect=document.createElement("select");
  bucketSelect.setAttribute("aria-label","Existing bucket");
  const bucketNames=new Set([profile.bucketName]);
  for(const p of r2Profiles()){
    if(p.accountId===profile.accountId&&p.bucketName)bucketNames.add(p.bucketName);
  }
  for(const bucket of (explorerBuckets.get(profile.accountId)||[])){
    if(bucket?.name)bucketNames.add(bucket.name);
  }
  Array.from(bucketNames).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"})).forEach((name)=>{
    const option=document.createElement("option");
    option.value=name;
    option.textContent=name;
    option.selected=name===profile.bucketName;
    bucketSelect.append(option);
  });
  bucketExisting.append(bucketSelect);

  const bucketNew=document.createElement("div");
  bucketNew.className="preset-new";
  const bucketInput=document.createElement("input");
  bucketInput.type="text";
  bucketInput.placeholder="new-bucket";
  bucketInput.setAttribute("aria-label","Create a new bucket");
  bucketNew.append(bucketInput);

  const bucketActions=document.createElement("div");
  bucketActions.className="preset-actions";
  const createBucketButton=document.createElement("button");
  createBucketButton.type="button";
  createBucketButton.className="mini";
  createBucketButton.textContent="Create";
  createBucketButton.title="Create this bucket and use it for this preset";
  bucketActions.append(createBucketButton);

  const switchBucket=async(name)=>{
    const clean=String(name||"").trim();
    if(!clean||clean===profile.bucketName)return;
    status.textContent="Switching preset to "+clean+"…";
    bucketSelect.disabled=true;
    try{
      let prepared=r2Profiles().find((p)=>p.accountId===profile.accountId&&p.bucketName===clean);
      if(!prepared){
        const result=await send({
          type:"cfProvision",
          accountId:profile.accountId,
          accountName:profile.accountName||accountName(profile.accountId),
          bucketName:clean,
          profileName:clean,
          folders:{"3d":"3d","2d":"2d","videos":"videos","files":"files"}
        });
        if(!result?.ok)throw new Error(result?.error||"Could not prepare bucket");
        prepared=result.profile;
      }
      adoptPreparedProfile(prepared);
      await saveProfiles();
      status.textContent="Preset now uses "+clean+".";
      renderProfiles();
    }catch(error){
      status.textContent=error?.message||String(error);
      bucketSelect.value=profile.bucketName;
    }finally{
      bucketSelect.disabled=false;
    }
  };

  bucketSelect.addEventListener("change",()=>switchBucket(bucketSelect.value));

  const createAndUseBucket=async()=>{
    const name=bucketInput.value.trim().toLowerCase();
    if(!name){status.textContent="Type a bucket name first.";bucketInput.focus();return;}
    createBucketButton.disabled=true;
    status.textContent="Creating "+name+"…";
    try{
      const created=await send({type:"cfCreateBucket",accountId:profile.accountId,name});
      if(!created?.ok)throw new Error(created?.error||"Could not create bucket");
      const prepared=await send({
        type:"cfProvision",
        accountId:profile.accountId,
        accountName:profile.accountName||accountName(profile.accountId),
        bucketName:name,
        profileName:name,
        folders:{"3d":"3d","2d":"2d","videos":"videos","files":"files"}
      });
      if(!prepared?.ok)throw new Error(prepared?.error||"Could not prepare bucket");
      adoptPreparedProfile(prepared.profile);
      bucketInput.value="";
      await saveProfiles();
      status.textContent=name+" created and selected.";
      renderProfiles();
    }catch(error){
      status.textContent=error?.message||String(error);
    }finally{
      createBucketButton.disabled=false;
    }
  };
  createBucketButton.addEventListener("click",createAndUseBucket);
  bucketInput.addEventListener("keydown",(event)=>{
    if(event.key==="Enter"){event.preventDefault();createAndUseBucket();}
  });

  bucketRow.append(bucketLevel,bucketExisting,bucketNew,bucketActions);
  table.append(bucketRow);

  const renderLevels=()=>{
    table.querySelectorAll(".preset-location-row").forEach((row)=>row.remove());

    segments.forEach((segment,index)=>{
      const row=document.createElement("div");
      row.className="preset-destination-row preset-location-row";

      const level=document.createElement("div");
      level.className="preset-level";
      level.textContent=index===0?"Location":"Child "+index;

      const existing=document.createElement("div");
      existing.className="preset-existing";
      const select=document.createElement("select");
      select.setAttribute("aria-label",index===0?"Existing location":"Existing child location");
      const placeholder=document.createElement("option");
      placeholder.value="";
      placeholder.textContent=index===0?"Choose existing folder…":"Choose existing child…";
      select.append(placeholder);
      const parent=segments.slice(0,index).map(cleanSegment).filter(Boolean);
      for(const child of immediateChildren(parent)){
        const option=document.createElement("option");
        option.value=child;
        option.textContent=child;
        option.selected=child===cleanSegment(segment);
        select.append(option);
      }
      existing.append(select);

      const create=document.createElement("div");
      create.className="preset-new";
      const input=document.createElement("input");
      input.type="text";
      input.placeholder=index===0?"new folder":"new child";
      input.setAttribute("aria-label",input.placeholder);
      create.append(input);

      const actions=document.createElement("div");
      actions.className="preset-actions";
      const add=document.createElement("button");
      add.type="button";
      add.className="mini";
      add.textContent="+";
      add.title="Add a child below this level";
      const remove=document.createElement("button");
      remove.type="button";
      remove.className="mini danger";
      remove.textContent="×";
      remove.title="Remove this level and every lower level from this preset only";
      actions.append(add,remove);

      select.addEventListener("change",async()=>{
        if(!select.value)return;
        segments[index]=select.value;
        segments=segments.slice(0,index+1);
        await commitPrefix({materialize:false});
        renderLevels();
      });

      const useTyped=async({addChild=false}={})=>{
        const typed=cleanSegment(input.value);
        if(typed){
          segments[index]=typed;
          segments=segments.slice(0,index+1);
          input.value="";
          await commitPrefix({materialize:true});
        }else if(!cleanSegment(segments[index])){
          status.textContent="Choose an existing location or type a new one first.";
          input.focus();
          return;
        }
        if(addChild){
          segments=segments.slice(0,index+1);
          segments.push("");
          await commitPrefix({materialize:false});
        }
        renderLevels();
        if(addChild)table.querySelector(".preset-location-row:last-of-type input")?.focus();
      };

      input.addEventListener("keydown",(event)=>{
        if(event.key==="Enter"){event.preventDefault();useTyped({addChild:false});}
      });
      input.addEventListener("change",()=>useTyped({addChild:false}));

      add.addEventListener("click",()=>useTyped({addChild:true}));
      remove.addEventListener("click",async()=>{
        segments=segments.slice(0,index);
        await commitPrefix({materialize:false});
        status.textContent="Removed from this preset only. Nothing was deleted from R2.";
        renderLevels();
      });

      row.append(level,existing,create,actions);
      table.append(row);
    });
    updateBreadcrumb();
  };

  const foot=document.createElement("div");
  foot.className="preset-destination-foot";
  const addLevel=document.createElement("button");
  addLevel.type="button";
  addLevel.className="ghost";
  addLevel.textContent="+ Add location level";
  addLevel.addEventListener("click",()=>{
    if(segments.length&& !cleanSegment(segments[segments.length-1])){
      table.querySelector(".preset-location-row:last-of-type input")?.focus();
      return;
    }
    segments.push("");
    renderLevels();
    table.querySelector(".preset-location-row:last-of-type input")?.focus();
  });
  foot.append(breadcrumb,addLevel);
  table.append(foot);
  wrap.append(table,status);

  renderLevels();

  const loadExisting=async()=>{
    const liveKey=profile.accountId+":"+profile.bucketName;
    if(defaultLocationPrefixCache.has(liveKey)){
      prefixInventory=defaultLocationPrefixCache.get(liveKey)||[];
      renderLevels();
      return;
    }
    status.innerHTML='<span class="operation-spinner"></span>Loading existing folders…';
    const timeout=new Promise((resolve)=>setTimeout(()=>resolve({ok:false,timeout:true}),4500));
    let result;
    try{
      result=await Promise.race([
        send({
          type:"cfFolderPrefixes",
          accountId:profile.accountId,
          bucketName:profile.bucketName,
          limit:5000
        }),
        timeout
      ]);
    }catch{
      result={ok:false};
    }
    if(result?.ok){
      prefixInventory=result.prefixes||[];
      defaultLocationPrefixCache.set(liveKey,prefixInventory);
      status.textContent="Existing locations loaded.";
    }else if(result?.timeout){
      const fallback=new Set([
        ...Object.values(profile.folders||{}),
        ...leafMenuPrefixes(profile.menuTree||[])
      ].map((value)=>String(value||"").replace(/^\/+|\/+$/g,"")).filter(Boolean));
      prefixInventory=Array.from(fallback);
      defaultLocationPrefixCache.set(liveKey,prefixInventory);
      status.textContent="Showing known locations now. Use Refresh locations for a deeper scan.";
    }else{
      prefixInventory=[];
      defaultLocationPrefixCache.set(liveKey,[]);
      status.textContent="Existing folders are unavailable right now, but you can still create any path.";
    }
    renderLevels();
  };
  loadExisting();

  return wrap;
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
function uploadTarget() {
  const select=$("local-profile");
  const option=select?.selectedOptions?.[0];
  if(!option)return null;
  const accountId=option.dataset.accountId||"";
  const bucketName=option.dataset.bucketName||"";
  if(accountId&&bucketName){
    const account=explorerAccounts.find((item)=>item.id===accountId);
    return {accountId,bucketName,accountName:account?.name||accountId};
  }
  const profile=profiles.find((p)=>p.id===select.value);
  return profile ? {accountId:profile.accountId,bucketName:profile.bucketName,accountName:profile.accountName||profile.name||profile.accountId} : null;
}
function uploadProfile() {
  const target=uploadTarget();
  if(!target)return null;
  return r2Profiles().find((p)=>p.accountId===target.accountId&&p.bucketName===target.bucketName)||null;
}
async function ensureUploadProfile() {
  const target=uploadTarget();
  if(!target)throw new Error("Choose an R2 bucket first.");
  let profile=uploadProfile();
  if(profile)return profile;
  profile=await ensurePrepared(target);
  await refreshProfiles();
  return r2Profiles().find((p)=>p.accountId===target.accountId&&p.bucketName===target.bucketName)||profile;
}
function ensureUploadLocationOption(prefix) {
  const select = $("local-prefix");
  if (!select) return;
  const value = String(prefix || "").replace(/^\/+|\/+$/g, "");
  if (!Array.from(select.options).some((option) => option.value === value)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value ? "/" + value : "/ (bucket root)";
    select.append(option);
  }
  select.value = value;
}
function uploadLocationMatchScore(query, value) {
  const q = String(query || "").trim().toLocaleLowerCase();
  const v = String(value || "").toLocaleLowerCase();
  if (!q) return 0;
  const leaf = v.split("/").filter(Boolean).pop() || v;
  if (leaf.startsWith(q)) return 1000 - leaf.length;
  if (v.startsWith(q)) return 900 - v.length;
  const leafIndex = leaf.indexOf(q);
  if (leafIndex >= 0) return 800 - leafIndex * 10 - leaf.length;
  const pathIndex = v.indexOf(q);
  if (pathIndex >= 0) return 700 - pathIndex * 10 - v.length;

  // Loose subsequence matching means "alm" can still find "almost".
  let qi = 0;
  for (let i = 0; i < v.length && qi < q.length; i++)
    if (v[i] === q[qi]) qi++;
  return qi === q.length ? 500 - v.length : -1;
}
function chooseBestUploadLocation(query) {
  const select = $("local-prefix");
  if (!select) return;
  const options = Array.from(select.options);
  if (!query.trim()) return;
  let best = null, bestScore = -1;
  for (const option of options) {
    const score = uploadLocationMatchScore(query, option.value);
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }
  if (best && bestScore >= 0) {
    select.value = best.value;
    const hint = $("local-location-hint");
    if (hint) hint.textContent = "Matched " + (best.value ? "/" + best.value : "/ (bucket root)");
  }
}
function uploadBuilderChildren(parentSegments){
  const parent=parentSegments.filter(Boolean);
  const seen=new Set();
  for(const raw of uploadLocationPrefixes){
    const parts=String(raw||"").split("/").filter(Boolean);
    let matches=true;
    for(let i=0;i<parent.length;i++){
      if(parts[i]!==parent[i]){matches=false;break;}
    }
    if(!matches)continue;
    const child=parts[parent.length];
    if(child)seen.add(child);
  }
  return Array.from(seen).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
}
async function fetchUploadBuilderChildren(parentSegments=[]){
  const target=uploadTarget();
  if(!target)return [];
  const parent=parentSegments.filter(Boolean);
  const result=await send({
    type:"cfFolderChildren",
    accountId:target.accountId,
    bucketName:target.bucketName,
    parentPrefix:parent.join("/"),
    limit:250
  });
  if(!result?.ok)return [];
  const children=(result.children||[]).map((value)=>String(value||"").trim()).filter(Boolean);
  for(const child of children){
    const full=[...parent,child].join("/");
    if(full&&!uploadLocationPrefixes.includes(full))uploadLocationPrefixes.push(full);
  }
  return children;
}
function syncUploadBuilderPrefix(){
  const prefix=uploadLocationSegments.map((part)=>String(part||"").trim().replace(/^\/+|\/+$/g,"")).filter(Boolean).join("/");
  ensureUploadLocationOption(prefix);
  const hint=$("local-location-hint");
  if(hint)hint.textContent=prefix?"Upload destination: /"+prefix:"Upload destination: / (bucket root)";
  return prefix;
}
async function materializeUploadBuilderPrefix(){
  const prefix=syncUploadBuilderPrefix();
  if(!prefix)return;
  try{
    const profile=await ensureUploadProfile();
    await ensureProfileMenuPrefixes(profile,[prefix]);
    if(!uploadLocationPrefixes.includes(prefix))uploadLocationPrefixes.push(prefix);
  }catch(error){
    const hint=$("local-location-hint");
    if(hint)hint.textContent="Destination saved. REDOWN will create it when Cloudflare access is ready.";
  }
}
function renderUploadLocationBuilder(){
  const root=$("local-location-builder");
  if(!root)return;
  root.replaceChildren();
  if(!uploadLocationSegments.length)uploadLocationSegments=[""];

  uploadLocationSegments.forEach((segment,index)=>{
    const row=document.createElement("div");
    row.className="upload-path-row";
    row.style.setProperty("--depth",String(index));

    const pathLine=document.createElement("div");
    pathLine.className="upload-path-connector";
    pathLine.setAttribute("aria-hidden","true");

    const select=document.createElement("select");
    select.className="upload-path-select";
    const blank=document.createElement("option");
    blank.value="";
    blank.textContent=index===0?"Choose a top-level location…":"Choose an existing child…";
    select.append(blank);

    const parent=uploadLocationSegments.slice(0,index)
      .map((part)=>String(part||"").trim())
      .filter(Boolean);
    for(const child of uploadBuilderChildren(parent)){
      const option=document.createElement("option");
      option.value=child;
      option.textContent=child;
      option.selected=child===segment;
      select.append(option);
    }
    fetchUploadBuilderChildren(parent).then((children)=>{
      if(!select.isConnected)return;
      const existing=new Set(Array.from(select.options).map((option)=>option.value));
      for(const child of children){
        if(existing.has(child))continue;
        const option=document.createElement("option");
        option.value=child;
        option.textContent=child;
        option.selected=child===uploadLocationSegments[index];
        select.append(option);
      }
    }).catch(()=>{});

    const input=document.createElement("input");
    input.type="text";
    input.className="upload-path-input";
    // This field means "create new" only. Never mirror an existing selection into it.
    input.value="";
    input.placeholder="Or create a new child…";
    input.hidden=index===0;

    const add=document.createElement("button");
    add.type="button";
    add.className="mini upload-path-add";
    add.textContent="+";
    add.title="Continue one level deeper";
    add.setAttribute("aria-label","Add child level");

    const remove=document.createElement("button");
    remove.type="button";
    remove.className="mini danger upload-path-remove";
    remove.textContent="×";
    remove.title="Remove this level from the upload path only. Nothing is deleted from R2.";
    remove.hidden=index===0;

    select.addEventListener("change",()=>{
      if(!select.value)return;
      uploadLocationSegments[index]=select.value;
      uploadLocationSegments=uploadLocationSegments.slice(0,index+1);
      syncUploadBuilderPrefix();
      renderUploadLocationBuilder();
    });

    input.addEventListener("input",()=>{
      uploadLocationSegments[index]=String(input.value||"").replace(/[\\/\0]/g,"").trim();
      syncUploadBuilderPrefix();
    });
    input.addEventListener("change",async()=>{
      uploadLocationSegments[index]=String(input.value||"").replace(/[\\/\0]/g,"").trim();
      await materializeUploadBuilderPrefix();
      renderUploadLocationBuilder();
    });
    input.addEventListener("blur",async()=>{
      uploadLocationSegments[index]=String(input.value||"").replace(/[\\/\0]/g,"").trim();
      if(uploadLocationSegments[index])await materializeUploadBuilderPrefix();
    });

    add.addEventListener("click",async()=>{
      const current=index===0
        ? String(select.value||uploadLocationSegments[index]||"").trim()
        : String(input.value||select.value||uploadLocationSegments[index]||"").replace(/[\\/\0]/g,"").trim();

      if(!current){
        const hint=$("local-location-hint");
        if(hint)hint.textContent=index===0
          ?"Choose a top-level location first."
          :"Choose an existing child or type a new one first.";
        return;
      }

      uploadLocationSegments[index]=current;
      await materializeUploadBuilderPrefix();
      uploadLocationSegments=uploadLocationSegments.slice(0,index+1);
      uploadLocationSegments.push("");
      renderUploadLocationBuilder();
      root.lastElementChild?.querySelector(".upload-path-input")?.focus();
    });

    remove.addEventListener("click",()=>{
      uploadLocationSegments=uploadLocationSegments.slice(0,index);
      if(!uploadLocationSegments.length)uploadLocationSegments=[""];
      syncUploadBuilderPrefix();
      const hint=$("local-location-hint");
      if(hint)hint.textContent="Removed from this upload path only. Nothing in R2 was deleted.";
      renderUploadLocationBuilder();
    });

    row.append(pathLine,select,input,add,remove);
    root.append(row);
  });
}
async function loadUploadLocations({ preserve = true } = {}) {
  const target = uploadTarget();
  const profile = uploadProfile();
  const select = $("local-prefix");
  const hint = $("local-location-hint");
  if (!select) return;

  const previous = preserve ? select.value : "";
  select.replaceChildren();
  const rootOption = document.createElement("option");
  rootOption.value = "";
  rootOption.textContent = "/ (bucket root)";
  select.append(rootOption);

  if (!target) {
    uploadLocationPrefixes=[];
    uploadLocationSegments=[""];
    renderUploadLocationBuilder();
    if (hint) hint.textContent = "Choose a bucket to load its remote locations.";
    return;
  }

  if (hint) hint.innerHTML = '<span class="operation-spinner"></span>Loading locations…';
  const result = await send({
    type:"cfFolderChildren",
    accountId:target.accountId,
    bucketName:target.bucketName,
    parentPrefix:"",
    limit:250
  });

  uploadLocationPrefixes = result?.ok
    ? (result.children || []).map((child)=>String(child||"").replace(/^\/+|\/+$/g,"")).filter(Boolean)
    : [];

  for (const value of Object.values(profile?.folders || {})) {
    const clean = String(value || "").replace(/^\/+|\/+$/g, "");
    if (clean && !uploadLocationPrefixes.includes(clean)) uploadLocationPrefixes.push(clean);
  }

  for (const prefix of uploadLocationPrefixes) {
    const value = String(prefix || "").replace(/^\/+|\/+$/g, "");
    if (!value || Array.from(select.options).some((option) => option.value === value)) continue;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = "/" + value;
    select.append(option);
  }

  const initial = String(previous || "").replace(/^\/+|\/+$/g, "");
  uploadLocationSegments = initial ? initial.split("/").filter(Boolean) : [""];
  ensureUploadLocationOption(initial);
  renderUploadLocationBuilder();

  if (hint) hint.textContent = result?.ok
    ? "Choose an existing location or create a new child. Deeper rows load only their immediate children."
    : "Locations are still loading, but you can create a new path now.";
}
function renderWorkspaceProfiles(){
  const select=$("local-profile");
  if(!select)return;
  const previousAccount=select.selectedOptions?.[0]?.dataset.accountId||"";
  const previousBucket=select.selectedOptions?.[0]?.dataset.bucketName||"";
  const previousValue=select.value;
  select.replaceChildren();

  let count=0;
  for(const account of explorerAccounts){
    for(const bucket of explorerBuckets.get(account.id)||[]){
      const option=document.createElement("option");
      option.value="bucket:"+account.id+":"+bucket.name;
      option.dataset.accountId=account.id;
      option.dataset.bucketName=bucket.name;
      option.textContent=(account.name||account.id)+" · "+bucket.name;
      if(account.id===previousAccount&&bucket.name===previousBucket)option.selected=true;
      select.append(option);
      count++;
    }
  }

  // Before Explorer inventory is available, keep configured R2 buckets usable.
  if(!count){
    for(const profile of r2Profiles()){
      const option=document.createElement("option");
      option.value=profile.id;
      option.dataset.accountId=profile.accountId||"";
      option.dataset.bucketName=profile.bucketName||"";
      option.textContent=`${displayName(profile)} · ${profile.bucketName}`;
      option.selected=profile.id===previousValue;
      select.append(option);
    }
  }

  if(!select.selectedOptions.length&&select.options.length)select.selectedIndex=0;
  const uploadCard=$("local-dropzone")?.closest(".card");
  if(uploadCard)uploadCard.hidden=!select.options.length;
  loadUploadLocations({preserve:true});
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
  let profile;
  try{profile=await ensureUploadProfile();}
  catch(error){return setStatus("local-upload-status",error?.message||"Choose an R2 bucket first.","bad");}
  const prefix=String($("local-prefix")?.value || "").trim();
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
async function showWorkspacePreview(obj,row,urlOverride=""){
  const requestId=++workspacePreviewRequestId;
  const root=$("workspace-preview");
  root.replaceChildren();
  const loading=document.createElement("div");
  loading.className="preview-loading";
  loading.innerHTML='<span class="operation-spinner"></span><strong>Opening preview…</strong><span>Preparing secure remote view</span>';
  root.append(loading);
  document.querySelectorAll("#workspace-objects .object.active").forEach(el=>el.classList.remove("active"));
  row?.classList.add("active");
  const key=obj.key||obj.name||String(obj);
  let previewProfile=r2Profiles().find(p=>p.accountId===workspaceTarget?.accountId&&p.bucketName===workspaceTarget?.bucketName);
  if(!previewProfile){
    const preparing=document.createElement("div");preparing.className="meta";preparing.innerHTML='<span class="operation-spinner"></span>Preparing preview…';root.append(preparing);
    try{previewProfile=await ensurePrepared(workspaceTarget);}catch(error){if(requestId!==workspacePreviewRequestId)return;preparing.textContent=friendlyError(error,"prepare the preview");return;}
    if(requestId!==workspacePreviewRequestId)return;
    root.replaceChildren();
  }
  let url=urlOverride;
  if(!url){
    let privateRead=await send({type:"cfPrivateObjectUrl",...explorerSource(),key,ttl:900});
    if(requestId!==workspacePreviewRequestId)return;
    if(!privateRead?.ok && isTransientBucketAccessError(new Error(privateRead?.error||""))){
      root.innerHTML='<div class="meta"><span class="operation-spinner"></span>Preparing bucket… Verifying Cloudflare access…</div>';
      try{
        await ensurePrepared(workspaceTarget);
        if(requestId!==workspacePreviewRequestId)return;
        privateRead=await send({type:"cfPrivateObjectUrl",...explorerSource(),key,ttl:900});
        if(requestId!==workspacePreviewRequestId)return;
      }catch(error){
        root.textContent=friendlyError(error,"open this preview");
        return;
      }
    }
    if(!privateRead?.ok){root.textContent=friendlyError(new Error(privateRead?.error||""),"open this preview");return;}
    url=privateRead.url;
  }
  if(requestId!==workspacePreviewRequestId)return;
  root.replaceChildren();
  const type=objectContentType(obj,key);
  const head=document.createElement("div");head.className="preview-head";
  const title=document.createElement("div");title.className="preview-title";title.textContent=key;
  const controls=document.createElement("div");controls.className="preview-nav";
  const previous=document.createElement("button");previous.className="ghost preview-arrow";previous.type="button";previous.setAttribute("aria-label","Previous file");previous.title="Previous file";previous.textContent="←";previous.addEventListener("click",()=>navigatePreview(-1));
  const next=document.createElement("button");next.className="ghost preview-arrow";next.type="button";next.setAttribute("aria-label","Next file");next.title="Next file";next.textContent="→";next.addEventListener("click",()=>navigatePreview(1));
  const lightbox=document.createElement("button");lightbox.className="ghost";lightbox.type="button";lightbox.textContent=workspaceLightboxOpen()?"Close lightbox":"Lightbox";lightbox.addEventListener("click",()=>setWorkspacePreviewLightbox(!workspaceLightboxOpen()));
  const expand=document.createElement("button");expand.className="ghost";expand.type="button";expand.textContent=workspacePreviewExpanded?"Collapse":"Expand";expand.addEventListener("click",()=>setWorkspacePreviewExpanded(!workspacePreviewExpanded));
  controls.append(previous,next,lightbox,expand);
  head.append(title,controls);root.append(head);

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
      if(requestId!==workspacePreviewRequestId)return;
      if(!response.ok&&!([200,206].includes(response.status)))throw new Error(`HTTP ${response.status}`);
      const text=await response.text();
      if(requestId!==workspacePreviewRequestId)return;
      pre.textContent=text+(text.length>=524288?"\n\n[Preview truncated at 512 KB]":"");
    }catch(error){
      pre.textContent=`Could not load text preview: ${error?.message||String(error)}`;
    }
  }else{
    const note=document.createElement("div");
    note.className="meta";
    note.textContent=type.includes("gltf")
      ?"Interactive 3D preview · drag to orbit · wheel to zoom · use Reset view to reframe the model."
      :"No inline renderer for this file type yet. Details and public URL are available below.";
    media.append(note);
    if(type.includes("gltf")){
      const viewer=document.createElement("model-viewer");
      viewer.setAttribute("src",url);viewer.setAttribute("camera-controls","");viewer.setAttribute("auto-rotate","");viewer.setAttribute("shadow-intensity","1");viewer.setAttribute("interaction-prompt","none");
      viewer.style.cssText="display:block;width:100%;height:360px;background:radial-gradient(circle,#283041,#10131a)";
      const reset=document.createElement("button");reset.type="button";reset.className="ghost";reset.textContent="Reset view";reset.onclick=()=>{viewer.cameraOrbit="0deg 75deg 105%";viewer.jumpCameraToGoal?.();};
      media.append(viewer,reset);
    }
    root.append(media);
  }

  appendDetails(root,obj,key,url,type);
}

function workspaceLightboxLayer(){
  return document.getElementById("workspace-lightbox");
}
function workspaceLightboxOpen(){
  return Boolean(workspaceLightboxLayer()?.isConnected);
}
function syncWorkspaceLightboxButtons(){
  const open=workspaceLightboxOpen();
  workspacePreviewLightbox=open;
  document.querySelectorAll("#workspace-preview .preview-head button").forEach((button)=>{
    if(/lightbox/i.test(button.textContent))button.textContent=open?"Close lightbox":"Lightbox";
  });
}
function setWorkspacePreviewExpanded(expanded){
  workspacePreviewExpanded=Boolean(expanded);
  if (workspacePreviewExpanded && workspaceLightboxOpen())
    setWorkspacePreviewLightbox(false);
  const grid=document.querySelector(".explorer-body");
  grid?.classList.toggle("expanded",workspacePreviewExpanded);
  if (workspacePreviewExpanded) $("explorer")?.focus?.({ preventScroll:true });
  const button=$("preview-expand")||document.querySelector("#workspace-preview .preview-head button:last-child");
  if(button)button.textContent=workspacePreviewExpanded?"Collapse":"Expand";
}
function setWorkspacePreviewLightbox(enabled){
  const existing=workspaceLightboxLayer();
  const shouldOpen=Boolean(enabled);

  if(!shouldOpen){
    existing?.remove();
    document.body.classList.remove("preview-lightbox-open");
    document.documentElement.classList.remove("preview-lightbox-open");
    workspacePreviewLightbox=false;
    syncWorkspaceLightboxButtons();
    $("explorer")?.focus?.({preventScroll:true});
    return;
  }

  if(existing){
    workspacePreviewLightbox=true;
    syncWorkspaceLightboxButtons();
    return;
  }

  const preview=$("workspace-preview");
  if(!preview)return;

  const source=preview.querySelector(".preview-media, .text-preview");
  if(!source){
    finishOperation("Open a file preview first.",true);
    workspacePreviewLightbox=false;
    syncWorkspaceLightboxButtons();
    return;
  }

  if(workspacePreviewExpanded){
    workspacePreviewExpanded=false;
    document.querySelector(".explorer-body")?.classList.remove("expanded");
  }

  const layer=document.createElement("div");
  layer.id="workspace-lightbox";
  layer.className="preview-lightbox-layer";
  layer.setAttribute("role","dialog");
  layer.setAttribute("aria-modal","true");
  layer.setAttribute("aria-label","File lightbox");
  layer.style.cssText="position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483646!important;display:grid!important;place-items:center!important;pointer-events:auto!important;";

  const backdrop=document.createElement("div");
  backdrop.className="preview-lightbox-backdrop";
  backdrop.setAttribute("role","button");
  backdrop.setAttribute("tabindex","0");
  backdrop.setAttribute("aria-label","Close lightbox");
  backdrop.addEventListener("click",()=>setWorkspacePreviewLightbox(false));
  backdrop.addEventListener("keydown",(event)=>{
    if(event.key==="Enter"||event.key===" "){event.preventDefault();setWorkspacePreviewLightbox(false);}
  });

  const panel=document.createElement("div");
  panel.className="preview-lightbox-panel";
  panel.setAttribute("role","document");

  const head=document.createElement("div");
  head.className="preview-lightbox-head";

  const title=document.createElement("div");
  title.className="preview-title";
  title.textContent=preview.querySelector(".preview-title")?.textContent||"Preview";

  const close=document.createElement("button");
  close.type="button";
  close.className="ghost preview-lightbox-close";
  close.textContent="Close";
  close.addEventListener("click",()=>setWorkspacePreviewLightbox(false));

  const stage=document.createElement("div");
  stage.className="preview-lightbox-stage";
  const clone=source.cloneNode(true);
  clone.classList.add("lightbox-copy");

  clone.querySelectorAll?.("video,audio").forEach((media)=>{
    media.controls=true;
    media.preload="metadata";
  });
  clone.querySelectorAll?.("iframe,img,video,audio,model-viewer").forEach((node)=>{
    const original=source.querySelector?.(node.tagName.toLowerCase());
    const resolved=original?.currentSrc||original?.src||original?.getAttribute?.("src");
    if(resolved)node.setAttribute("src",resolved);
  });

  stage.append(clone);
  head.append(title,close);
  panel.append(head,stage);
  layer.append(backdrop,panel);

  (document.documentElement||document.body).append(layer);
  document.body.classList.add("preview-lightbox-open");
  document.documentElement.classList.add("preview-lightbox-open");

  workspacePreviewLightbox=true;
  syncWorkspaceLightboxButtons();
  requestAnimationFrame(()=>close.focus({preventScroll:true}));
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
let explorerArchive = null;
let explorerBucketAccountId = "";
let explorerSearchActive = false;
let explorerSearchRequestId = 0;
let explorerSearchTimer = null;
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
  if (["zip", "cbz", "tar", "gz", "7z", "rar"].includes(ext)) return "archive";
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
  if (explorerSearchActive) return explorerItems.slice();
  return explorerItems.slice().sort((a, b) => {
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
function explorerSearchTargets() {
  if (workspaceTarget) {
    return [{
      accountId:workspaceTarget.accountId,
      accountName:accountName(workspaceTarget.accountId),
      bucketName:workspaceTarget.bucketName
    }];
  }
  const accounts = explorerBucketAccountId && explorerBucketAccountId !== "__all__"
    ? explorerAccounts.filter((account)=>account.id===explorerBucketAccountId)
    : explorerAccounts;
  return accounts.flatMap((account)=>
    (explorerBuckets.get(account.id)||[]).map((bucket)=>({
      accountId:account.id,
      accountName:account.name||account.id,
      bucketName:bucket.name
    }))
  );
}
async function runExplorerSearch(query) {
  const q=String(query||"").trim();
  const requestId=++explorerSearchRequestId;
  if(!q){
    explorerSearchActive=false;
    $("explorer-status").textContent="";
    if(workspaceTarget) return browseWorkspace();
    return showBucketRows(explorerBucketAccountId==="__all__"?"":explorerBucketAccountId);
  }

  explorerSearchActive=true;
  explorerSelected.clear();
  explorerAnchor=-1;
  explorerNextCursor="";
  explorerVisibleLimit=EXPLORER_RENDER_LIMIT;
  const root=$("workspace-objects");
  root.innerHTML='<div class="file-empty"><span class="operation-spinner"></span><strong>Searching remote paths…</strong>Matching files and folders across this location.</div>';

  const result=await send({
    type:"cfSearchObjects",
    targets:explorerSearchTargets(),
    query:q,
    limit:200
  });
  if(requestId!==explorerSearchRequestId)return;
  if(!result?.ok){
    explorerItems=[];
    $("explorer-status").textContent=friendlyError(new Error(result?.error||""),"search remote files");
    return renderFileItems();
  }

  explorerItems=(result.results||[]).map((entry)=>{
    const key=String(entry.key||"");
    const object=entry.object||{};
    const basename=key.replace(/\/$/,"").split("/").pop()||key;
    const parent=key.replace(/\/$/,"").split("/").slice(0,-1).join("/");
    return {
      id:"search:"+entry.accountId+":"+entry.bucketName+":"+key,
      name:basename,
      key,
      folder:Boolean(entry.folder),
      kind:entry.folder?"folder":fileKind(key,String(object?.httpMetadata?.contentType||object?.contentType||"")),
      type:(entry.accountName?entry.accountName+" · ":"")+entry.bucketName+(parent?" · /"+parent:""),
      size:entry.folder?0:Number(object.size||0),
      modified:itemDate(object),
      object,
      searchResult:true,
      accountId:entry.accountId,
      accountName:entry.accountName||accountName(entry.accountId),
      bucketName:entry.bucketName
    };
  });
  $("explorer-status").textContent=explorerItems.length
    ? `Found ${explorerItems.length} remote match${explorerItems.length===1?"":"es"} for “${q}”.`
    : `No remote files or folders matched “${q}”.`;
  renderFileItems();
}
function scheduleExplorerSearch() {
  clearTimeout(explorerSearchTimer);
  explorerSearchTimer=setTimeout(()=>runExplorerSearch($("workspace-search")?.value||""),220);
}
async function goToSearchResult(item) {
  if(!item?.searchResult)return;
  const query=$("workspace-search");
  if(query)query.value="";
  explorerSearchActive=false;
  explorerSearchRequestId++;
  const clean=item.key.replace(/\/$/,"");
  const parent=clean.split("/").slice(0,-1).join("/");
  await goLocation(item.accountId,item.bucketName,parent);
  const targetId=item.folder?"folder:"+item.key:"file:"+item.key;
  const real=explorerItems.find((entry)=>entry.id===targetId||entry.key===item.key);
  if(real) await selectSingleExplorerItem(real,{focus:true});
}

function setExplorerBusy(busy,message=""){
  const explorer=$("explorer");
  if(!explorer)return;
  explorer.classList.toggle("busy",Boolean(busy));
  explorer.setAttribute("aria-busy",busy?"true":"false");
  if(message&&busy)setOperation("navigate",message);
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
  const message=safeUiMessage(explorerOperation.message);
  el.innerHTML = `${explorerOperation.state === "running" ? '<span class="connect-progress" aria-label="Connecting"><i></i><i></i><i></i><i></i><i></i></span>' : ""}${message}${progress}`;
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
function isTransientBucketAccessError(error) {
  const raw = error?.message || String(error || "");
  return /unauthorized|\b401\b|\b403\b|worker.*(not ready|unreachable)|propagat|reachability|dns/i.test(raw);
}
function friendlyError(error, action = "complete that action") {
  const raw = error?.message || String(error);
  if (isTransientBucketAccessError(error))
    return "Preparing bucket… REDOWN is still verifying Cloudflare access.";
  if (/not found|404/i.test(raw)) return "The item is no longer available.";
  return `Could not ${action}.`;
}
async function refreshProfiles() {
  profiles = (await chrome.storage.local.get("profiles")).profiles || [];
  renderWorkspaceProfiles();
}
async function ensurePrepared(target = workspaceTarget) {
  if (!target?.accountId || !target?.bucketName)
    throw new Error("Choose a bucket first.");

  const id = `${target.accountId}:${target.bucketName}`;
  if (explorerPreparing.has(id)) return explorerPreparing.get(id);

  const task = (async () => {
    setOperation(
      "prepare",
      "Preparing bucket… Verifying Cloudflare access…",
    );

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
        result?.error || "Cloudflare access is still propagating",
      );

      // Temporary Worker/auth propagation is a readiness state, not a user-facing error.
      explorerOperation.message =
        "Preparing bucket… Verifying Cloudflare access. This can take a few minutes.";
      explorerOperation.state = "running";
      renderOperation();

      // Clearly non-transient errors should still fail promptly.
      if (!isTransientBucketAccessError(lastError)) break;

      if (attempt < 9)
        await new Promise((resolve) => setTimeout(resolve, 30000));
    }

    finishOperation(
      "REDOWN could not finish preparing this bucket yet. Try again in a moment.",
      true,
    );
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
  explorerSearchActive = false;
  explorerSearchRequestId++;
  explorerBucketAccountId = "";
  const bucket = (explorerBuckets.get(accountId) || []).find(
    (b) => b.name === bucketName,
  );
  if (!bucket) {
    finishOperation("That bucket is no longer available.", true);
    return;
  }

  workspaceTarget = {
    accountId,
    bucketName,
    accountName: accountName(accountId),
    bucket,
  };
  workspacePrefix = normalizePrefix(prefix);
  explorerArchive = null;
  explorerSelected.clear();
  explorerAnchor = -1;

  if ($("explorer-location"))
    $("explorer-location").value = `${accountId}|${bucketName}`;

  if (remember) rememberLocation();

  // Navigation feedback must happen before any secondary form synchronization.
  setExplorerBusy(true, workspacePrefix ? "Opening folder…" : "Opening bucket…");
  renderExplorerChrome();

  try {
    await browseWorkspace();
  } finally {
    setExplorerBusy(false);
  }

  // Keep the separate local-upload form synchronized, but never block Explorer
  // navigation on its potentially expensive folder-prefix scan.
  queueMicrotask(async()=>{
    try{
      const currentUploadPrefix=workspacePrefix.replace(/\/$/,"");
      if($("local-prefix")){
        ensureUploadLocationOption(currentUploadPrefix);
        uploadLocationSegments=currentUploadPrefix
          ? currentUploadPrefix.split("/").filter(Boolean)
          : [""];
        renderUploadLocationBuilder();
      }

      const localProfileSelect=$("local-profile");
      if(localProfileSelect){
        const matching=Array.from(localProfileSelect.options).find((option)=>
          option.dataset.accountId===accountId&&option.dataset.bucketName===bucketName
        );
        if(matching){
          localProfileSelect.value=matching.value;
          await loadUploadLocations({preserve:false});
          ensureUploadLocationOption(currentUploadPrefix);
        }
      }
    }catch(error){
      console.warn("REDOWN upload chooser sync failed:",error?.message||String(error));
    }
  });
}
function updateNavButtons() {
  $("explorer-back").disabled = explorerHistoryIndex <= 0;
  $("explorer-forward").disabled =
    explorerHistoryIndex >= explorerHistory.length - 1;
  $("explorer-up").disabled = !workspaceTarget || (!workspacePrefix && !explorerArchive);
}
function renderExplorerChrome() {
  const crumbs = $("explorer-breadcrumbs");
  crumbs.replaceChildren();
  if (!workspaceTarget) {
    const rootButton = document.createElement("button");
    rootButton.className = "crumb";
    rootButton.textContent = "Cloudflare";
    rootButton.onclick = () => showBucketRows();
    crumbs.append(rootButton);
    if (explorerBucketAccountId && explorerBucketAccountId !== "__all__") {
      const accountButton = document.createElement("button");
      accountButton.className = "crumb";
      accountButton.textContent = accountName(explorerBucketAccountId);
      accountButton.onclick = () => showBucketRows(explorerBucketAccountId);
      crumbs.append(accountButton);
    }
    document.querySelectorAll(".source-item").forEach((el) => el.classList.remove("active"));
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
  if (explorerArchive) {
    parts.push({ label: explorerArchive.name + " · Archive", archivePrefix:"" });
    let archivePath = "";
    for (const part of explorerArchive.prefix.split("/").filter(Boolean)) {
      archivePath += part + "/";
      parts.push({ label:part, archivePrefix:archivePath });
    }
  }
  parts.forEach((part, index) => {
    const button = document.createElement("button");
    button.className = "crumb";
    button.textContent = part.label;
    button.onclick = () => {
      if (Object.hasOwn(part, "archivePrefix")) return renderArchiveFolder(part.archivePrefix);
      if (part.kind === "root") return showBucketRows();
      if (part.kind === "account") return showBucketRows(workspaceTarget.accountId);
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
    const label = document.createElement("button");
    label.className = "account-label account-button";
    label.type = "button";
    label.textContent = account.name || account.id;
    label.title = "Show this account's buckets";
    label.onclick = () => showBucketRows(account.id);
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
      button.onclick = async () => {
        if(button.disabled)return;
        button.disabled=true;
        button.classList.add("loading");
        try{await goLocation(account.id,bucket.name);}
        finally{button.disabled=false;button.classList.remove("loading");}
      };
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
function showBucketRows(accountId = "") {
  explorerSearchActive = false;
  explorerSearchRequestId++;
  explorerBucketAccountId = accountId || "__all__";
  workspaceTarget = null;
  workspacePrefix = "";
  explorerArchive = null;
  explorerNextCursor = "";
  explorerVisibleLimit = EXPLORER_RENDER_LIMIT;
  explorerSelected.clear();
  explorerAnchor = -1;

  const accounts = accountId
    ? explorerAccounts.filter((account) => account.id === accountId)
    : explorerAccounts;

  explorerItems = accounts.flatMap((account) =>
    (explorerBuckets.get(account.id) || []).map((bucket) => ({
      id: "bucket:" + account.id + ":" + bucket.name,
      name: bucket.name,
      key: bucket.name,
      folder: false,
      kind: "bucket",
      type: accountId
        ? "Cloudflare R2 bucket"
        : "Cloudflare R2 · " + (account.name || account.id),
      size: 0,
      modified: null,
      accountId: account.id,
      bucketName: bucket.name,
      accountName: account.name || account.id,
      bucket,
    })),
  );

  renderExplorerChrome();
  renderFileItems();
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
  renderWorkspaceProfiles();
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
  if (valid) {
    await goLocation(stored.accountId, stored.bucketName, stored.prefix);
  } else {
    const preferred = uploadProfile() || r2Profiles()[0];
    const preferredValid = preferred &&
      (explorerBuckets.get(preferred.accountId) || []).some((b) => b.name === preferred.bucketName);
    if (preferredValid)
      await goLocation(preferred.accountId, preferred.bucketName, "");
    else
      showBucketRows();
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
      '<div class="file-empty"><span class="operation-spinner"></span><strong>Preparing bucket…</strong>Verifying Cloudflare access</div>';
    $("explorer-status").textContent = "";
    explorerRawObjects = [];
    explorerNextCursor = "";
    explorerVisibleLimit = EXPLORER_RENDER_LIMIT;
  }

  let result=null;
  let lastError=null;
  const maxAttempts=7;

  for(let attempt=0;attempt<maxAttempts;attempt++){
    result = await send({
      type: "cfObjects",
      accountId: workspaceTarget.accountId,
      bucketName: workspaceTarget.bucketName,
      prefix: workspacePrefix,
      cursor: append ? explorerNextCursor : "",
    });

    if(result?.ok)break;

    lastError=new Error(result?.error||"Cloudflare access is still propagating");

    if(!isTransientBucketAccessError(lastError))break;

    if(!append){
      root.innerHTML =
        '<div class="file-empty"><span class="operation-spinner"></span><strong>Preparing bucket…</strong>Waiting for Cloudflare propagation and verifying access. This can take a minute or two.</div>';
      $("explorer-status").textContent="";
    }

    // Ask REDOWN to validate/repair the bucket while keeping transient
    // 401/403 states out of the user-facing error surface.
    try{
      await ensurePrepared(workspaceTarget);
    }catch(error){
      lastError=error;
      if(!isTransientBucketAccessError(error))break;
    }

    if(attempt<maxAttempts-1)
      await new Promise((resolve)=>setTimeout(resolve,20000));
  }

  if (!result?.ok) {
    if (!append) explorerItems = [];
    if(isTransientBucketAccessError(lastError)){
      if(!append){
        root.innerHTML =
          '<div class="file-empty"><strong>Still preparing this bucket</strong>Cloudflare has not finished propagating access yet. Try Refresh in a moment.</div>';
      }
      $("explorer-status").textContent =
        "REDOWN is still waiting for Cloudflare to finish preparing this bucket.";
    }else{
      $("explorer-status").textContent = safeUiMessage(friendlyError(
        lastError || new Error(result?.error || ""),
        "load this folder",
      ));
    }
  } else {
    explorerRawObjects.push(...(result.objects || []));
    explorerNextCursor = result.cursor || "";
    explorerItems = buildDirectoryItems(explorerRawObjects, workspacePrefix);
    $("explorer-status").textContent="";
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
  if (explorerSearchActive && !items.length)
    root.innerHTML = `<div class="file-empty"><strong>No remote matches for “${query}”</strong>Try a filename, folder name, or path fragment.</div>`;
  else if (!workspaceTarget && !items.length)
    root.innerHTML =
      '<div class="file-empty"><strong>No R2 buckets found</strong>Create a bucket to begin.</div>';
  else if (!items.length)
    root.innerHTML = `<div class="file-empty"><strong>${workspacePrefix ? "This folder is empty." : "This bucket is empty."}</strong>Drop files here or choose Upload.</div>`;
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
  $("explorer-count").textContent = explorerSearchActive
    ? `${all.length} search result${all.length === 1 ? "" : "s"}`
    : workspaceTarget
      ? `${all.length}${explorerNextCursor ? "+" : ""} item${all.length === 1 ? "" : "s"}`
      : explorerBucketAccountId
        ? `${all.length} bucket${all.length === 1 ? "" : "s"}`
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
  row.draggable = item.kind !== "bucket";
  row.setAttribute("role", "row");
  row.setAttribute("aria-selected", String(explorerSelected.has(item.id)));
  const name = document.createElement("div");
  name.className = "file-cell file-name";
  const icon = document.createElement("span");
  icon.className = "file-icon";
  icon.innerHTML = iconSvg(item.kind === "bucket" ? "bucket" : item.folder ? "folder" : item.kind);
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
  row.onclick = (e) => {
    if (item.searchResult) return goToSearchResult(item);
    if (item.kind === "bucket") {
      setExplorerBusy(true,"Opening bucket…");
      return goLocation(item.accountId,item.bucketName);
    }
    selectExplorerItem(item, index, e);
  };
  row.ondblclick = () => {
    if (item.searchResult) return goToSearchResult(item);
    if (item.kind === "bucket") {
      setExplorerBusy(true,"Opening bucket…");
      return goLocation(item.accountId,item.bucketName);
    }
    openExplorerItem(item);
  };
  row.oncontextmenu = (e) => {
    if(item.searchResult){
      e.preventDefault();
      return goToSearchResult(item);
    }
    e.preventDefault();
    if (!explorerSelected.has(item.id)) {
      explorerSelected = new Set([item.id]);
      renderFileItems();
    }
    showExplorerMenu(e.clientX, e.clientY, item);
  };
  row.ondragstart = (e) => {
    if (item.kind === "bucket") {
      e.preventDefault();
      return;
    }
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
function previewableExplorerItems() {
  return sortedVisibleItems().filter(
    (item) => item.kind !== "bucket" && !item.folder,
  );
}
async function previewExplorerItem(item) {
  if (!item || item.kind === "bucket") return;
  if (item.folder) {
    const root = $("workspace-preview");
    root.replaceChildren();
    const head=document.createElement("div");head.className="preview-head";
    const title=document.createElement("div");title.className="preview-title";title.textContent=item.name;
    const controls=document.createElement("div");controls.className="preview-nav";
    const lightbox=document.createElement("button");lightbox.className="ghost";lightbox.type="button";lightbox.textContent=workspaceLightboxOpen()?"Close lightbox":"Lightbox";lightbox.addEventListener("click",()=>setWorkspacePreviewLightbox(!workspaceLightboxOpen()));
    const expand=document.createElement("button");expand.className="ghost";expand.type="button";expand.textContent=workspacePreviewExpanded?"Collapse":"Expand";expand.addEventListener("click",()=>setWorkspacePreviewExpanded(!workspacePreviewExpanded));
    controls.append(lightbox,expand);head.append(title,controls);
    const note=document.createElement("div");note.className="preview-folder";note.innerHTML=iconSvg("folder")+"<strong>Folder</strong><span>Press Enter to open this folder.</span>";
    root.append(head,note);
    return;
  }
  if (item.archiveEntry) return previewArchiveEntry(item);
  return showWorkspacePreview(item.object || { key:item.key, size:item.size }, rootRow(item.id));
}
async function selectSingleExplorerItem(item, { focus = false, scroll = true } = {}) {
  if (!item || item.kind === "bucket") return;
  explorerSelected = new Set([item.id]);
  const items = sortedVisibleItems();
  explorerAnchor = Math.max(0, items.findIndex((entry) => entry.id === item.id));
  renderFileItems();
  const row = rootRow(item.id);
  if (scroll) row?.scrollIntoView({ block:"nearest" });
  if (focus) row?.focus({ preventScroll:true });
  await previewExplorerItem(item);
}
async function navigateExplorerSelection(delta) {
  const items = sortedVisibleItems().filter((item) => item.kind !== "bucket");
  if (!items.length) return;
  const selected = selectedExplorerItems()[0];
  let index = selected ? items.findIndex((item) => item.id === selected.id) : -1;
  if (index < 0) index = delta > 0 ? -1 : 0;
  index = Math.max(0, Math.min(items.length - 1, index + delta));
  await selectSingleExplorerItem(items[index], { focus:true });
}
async function navigatePreview(delta) {
  const items = previewableExplorerItems();
  if (!items.length) return;
  const selected = selectedExplorerItems()[0];
  let index = selected ? items.findIndex((item) => item.id === selected.id) : -1;
  if (index < 0) index = delta > 0 ? -1 : 0;
  index = (index + delta + items.length) % items.length;
  await selectSingleExplorerItem(items[index], { focus:false });
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
  if (explorerSelected.size === 1)
    previewExplorerItem(item);
}
function rootRow(id) {
  return Array.from(
    document.querySelectorAll("#workspace-objects .file-row"),
  ).find((x) => x.dataset.id === id);
}
async function openExplorerItem(item) {
  if(!item)return;
  setExplorerBusy(true,item.folder?"Opening folder…":"Opening preview…");
  try{
    if (item.archiveEntry && item.folder) {
      renderArchiveFolder(item.key);
      finishOperation("Folder opened");
      return;
    }
    if (item.folder) {
      await goLocation(
        workspaceTarget.accountId,
        workspaceTarget.bucketName,
        item.key,
      );
      return;
    }
    if (item.kind === "archive" && /\.(zip|cbz)$/i.test(item.key)) {
      await openArchive(item);
      return;
    }
    if (item.archiveEntry) {
      await previewArchiveEntry(item);
      finishOperation("Preview ready");
      return;
    }
    await showWorkspacePreview(item.object || {key:item.key,size:item.size}, rootRow(item.id));
    finishOperation("Preview ready");
  }catch(error){
    finishOperation(friendlyError(error,item.folder?"open this folder":"open this preview"),true);
  }finally{
    setExplorerBusy(false);
  }
}
async function openArchive(item) {
  setOperation("archive", "Inspecting archive…");
  const result = await send({ type:"cfArchiveEntries", ...explorerSource(), key:item.key });
  if (!result?.ok) return finishOperation(friendlyError(new Error(result?.error || ""), "inspect this archive"), true);
  explorerArchive = { key:item.key, name:item.name, type:result.archive?.type || "zip", entries:result.archive?.entries || [], prefix:"" };
  finishOperation(`${explorerArchive.entries.length} archive entries`);
  renderArchiveFolder();
  renderExplorerChrome();
}
function renderArchiveFolder(prefix = "") {
  if (!explorerArchive) return;
  explorerArchive.prefix = prefix;
  const folders = new Map(), files = [];
  for (const entry of explorerArchive.entries) {
    if (!entry.name.startsWith(prefix) || entry.name === prefix) continue;
    const rest = entry.name.slice(prefix.length), slash = rest.indexOf("/");
    if (slash >= 0) {
      const name = rest.slice(0, slash);
      folders.set(name, { id:`archive:${prefix}${name}/`, name, key:prefix + name + "/", folder:true, kind:"folder", type:"Folder", size:0, archiveEntry:true });
    } else if (!entry.directory) files.push({ id:`archive:${entry.name}`, name:rest, key:entry.name, folder:false, kind:fileKind(entry.name), type:itemType(entry.name), size:entry.size || 0, object:entry, archiveEntry:true });
  }
  explorerItems = [...folders.values(), ...files];
  explorerSelected.clear(); explorerAnchor = -1;
  renderFileItems();
}
async function previewArchiveEntry(item) {
  const contentType=objectContentType(item.object,item.key);
  const result=await send({type:"cfArchiveEntryUrl",...explorerSource(),key:explorerArchive.key,entry:item.key,contentType});
  if(!result?.ok)return finishOperation(friendlyError(new Error(result?.error||""),"preview this archive entry"),true);
  await showWorkspacePreview({...item.object,key:item.key,httpMetadata:{contentType}},rootRow(item.id),result.url);
}
async function extractArchiveSelection(items = selectedExplorerItems(), destinationPrefix = workspacePrefix) {
  const entries = items.filter(item => item.archiveEntry && !item.folder).map(item => item.key);
  if (!explorerArchive || !entries.length) return;
  setOperation("extract", `Extracting ${entries.length} file${entries.length === 1 ? "" : "s"}…`, entries.length);
  const result = await send({ type:"cfExtractArchive", ...explorerSource(), key:explorerArchive.key, entries, destinationPrefix });
  if (!result?.ok) return finishOperation(friendlyError(new Error(result?.error || ""), "extract archive entries"), true);
  const completed=(result.results || []).filter(x=>x.status==="extracted").length, failed=(result.results || []).length-completed;
  finishOperation(failed ? `${completed} files extracted · ${failed} files could not be extracted` : `${completed} files extracted`, Boolean(failed));
}
function selectedExplorerItems() {
  return explorerItems.filter((x) => explorerSelected.has(x.id));
}
function clipboardEntries(items = selectedExplorerItems()) {
  const expanded=items.flatMap((item)=>item.archiveEntry&&item.folder
    ? explorerArchive.entries.filter((entry)=>!entry.directory&&entry.name.startsWith(item.key)).map((entry)=>({...item,key:entry.name,folder:false,displayName:entry.name.split("/").pop()}))
    : [item]);
  return expanded.map((item) => ({
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
    archiveKey: items.some((item) => item.archiveEntry) ? explorerArchive?.key : null,
  };
  await chrome.storage.session.set({ explorerClipboard });
  renderFileItems();
}
async function pasteExplorer(
  destination = { ...explorerSource(), prefix: workspacePrefix },
) {
  if (!explorerClipboard?.entries?.length) return;
  if (explorerClipboard.archiveKey) {
    const files=explorerClipboard.entries.filter((entry)=>!entry.folder);
    setOperation("extract",`Extracting ${files.length} file${files.length===1?"":"s"} to destination…`,files.length);
    const result=await send({type:"cfTransferArchive",source:{accountId:explorerClipboard.accountId,bucketName:explorerClipboard.bucketName,accountName:explorerClipboard.accountName},destination,key:explorerClipboard.archiveKey,entries:files.map((entry)=>entry.key)});
    if(!result?.ok)return finishOperation(friendlyError(new Error(result?.error||""),"send archive entries"),true);
    const completed=(result.results||[]).filter((entry)=>entry.status==="extracted").length,failed=(result.results||[]).length-completed;
    finishOperation(failed?`${completed} files extracted · ${failed} files could not be extracted`:`${completed} files extracted`,Boolean(failed));
    return;
  }
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
  await loadUploadLocations({ preserve:false });
  ensureUploadLocationOption(normalizePrefix(prefix).replace(/\/$/, ""));
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

  const sep = () => {
    const e = document.createElement("div");
    e.className = "menu-separator";
    e.role = "separator";
    menu.append(e);
  };
  const section = (text) => {
    const label = document.createElement("div");
    label.className = "menu-label";
    label.textContent = text;
    menu.append(label);
  };

  if (item?.kind === "bucket") {
    const destination = {
      accountId: item.accountId,
      bucketName: item.bucketName,
      accountName: item.accountName,
      prefix: "",
    };
    menu.append(
      menuButton("Open", () => goLocation(item.accountId, item.bucketName)),
      menuButton("Paste into bucket", () => pasteExplorer(destination), Boolean(explorerClipboard)),
    );
    sep();
    menu.append(
      menuButton("Upload files here", async () => {
        await goLocation(item.accountId, item.bucketName);
        $("local-files").click();
      }),
      menuButton("Refresh buckets", () => loadExplorerInventory()),
    );
    menu.hidden = false;
    requestAnimationFrame(() => {
      menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
      menu.querySelector("button:not(:disabled)")?.focus();
    });
    return;
  }

  const selected = selectedExplorerItems();
  const hasSelection = selected.length > 0;

  if (item) {
    if (item.archiveEntry)
      menu.append(menuButton("Extract", () => extractArchiveSelection(selected)));

    menu.append(
      menuButton(item.folder ? "Open" : "Open / Preview", () => openExplorerItem(item)),
    );

    if (!item.folder)
      menu.append(
        menuButton("Download", () =>
          selected.filter((entry) => !entry.folder).forEach(explorerDownload),
        ),
      );

    sep();
    menu.append(
      menuButton("Cut", () => setExplorerClipboard("move"), hasSelection),
      menuButton("Copy", () => setExplorerClipboard("copy"), hasSelection),
      menuButton(
        "Paste",
        () => pasteExplorer(item.folder ? { ...explorerSource(), prefix: item.key } : undefined),
        Boolean(explorerClipboard),
      ),
    );

    sep();
    section("Move to");
    for (const account of explorerAccounts) {
      for (const bucket of explorerBuckets.get(account.id) || []) {
        if (
          workspaceTarget &&
          account.id === workspaceTarget.accountId &&
          bucket.name === workspaceTarget.bucketName
        ) continue;
        menu.append(
          menuButton(
            account.name + " · " + bucket.name,
            async () => {
              await setExplorerClipboard("move");
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
    }

    sep();
    section("Send to");
    for (const account of explorerAccounts) {
      for (const bucket of explorerBuckets.get(account.id) || []) {
        if (
          workspaceTarget &&
          account.id === workspaceTarget.accountId &&
          bucket.name === workspaceTarget.bucketName
        ) continue;
        menu.append(
          menuButton(
            account.name + " · " + bucket.name,
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
    }

    sep();
    menu.append(
      menuButton("Rename", () => beginExplorerRename(item), selected.length === 1),
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
    if (
      !item.folder &&
      workspaceTarget &&
      r2Profiles().some(
        (profile) =>
          profile.accountId === workspaceTarget.accountId &&
          profile.bucketName === workspaceTarget.bucketName &&
          profile.publicAssetsEnabled,
      )
    )
      menu.append(menuButton("Copy public URL", () => copyItemUrl(item)));

    menu.append(
      menuButton("Properties", () => showProperties(item), selected.length === 1),
      menuButton("Refresh", () => browseWorkspace()),
    );
  } else if (workspaceTarget) {
    menu.append(
      menuButton("Paste", pasteExplorer, Boolean(explorerClipboard)),
      menuButton("New folder", beginNewFolder),
      menuButton("Upload files", () => $("local-files").click()),
      menuButton("Refresh", () => browseWorkspace()),
    );
  } else {
    menu.append(
      menuButton("Refresh buckets", () => loadExplorerInventory()),
    );
  }

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
      await uploadLocalFiles(picker.files);
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
      uploadLocalFiles(e.dataTransfer?.files);
  }
  const bucketSelect = $("local-profile");
  if (bucketSelect) {
    bucketSelect.onchange = async () => {
      uploadLocationSegments=[""];
      await loadUploadLocations({ preserve:false });
    };
  }

  $("workspace-refresh").onclick = () => workspaceTarget ? browseWorkspace() : loadExplorerInventory();
  $("workspace-search").oninput = scheduleExplorerSearch;
  $("workspace-search").onkeydown = (e) => {
    if(e.key==="Enter" && explorerSearchActive && explorerItems.length){
      e.preventDefault();
      goToSearchResult(explorerItems[0]);
    }
  };
  $("preview-expand")?.addEventListener("click", () =>
    setWorkspacePreviewExpanded(!workspacePreviewExpanded),
  );
  $("preview-lightbox")?.addEventListener("click", () =>
    setWorkspacePreviewLightbox(!workspaceLightboxOpen()),
  );
  $("explorer-new-folder").onclick = () => workspaceTarget && beginNewFolder();
  $("explorer-upload").onclick = async () => {
    if (!workspaceTarget) return;
    const profile = await ensurePrepared(workspaceTarget);
    await refreshProfiles();
    const uploadSelect=$("local-profile");
    const matching=Array.from(uploadSelect.options).find((option)=>
      option.dataset.accountId===workspaceTarget.accountId&&option.dataset.bucketName===workspaceTarget.bucketName
    );
    if(matching)uploadSelect.value=matching.value;
    await loadUploadLocations({ preserve:false });
    ensureUploadLocationOption(workspacePrefix.replace(/\/$/, ""));
    picker.click();
  };
  $("properties-close").onclick = () => $("explorer-properties").close();
  $("explorer-back").onclick = () => navigateHistory(-1);
  $("explorer-forward").onclick = () => navigateHistory(1);
  $("explorer-up").onclick = () => {
    if (explorerArchive) {
      const archiveParts=explorerArchive.prefix.split("/").filter(Boolean);
      if (archiveParts.length) { archiveParts.pop(); return renderArchiveFolder(archiveParts.join("/") + (archiveParts.length ? "/" : "")); }
      const parent=explorerArchive.key.split("/").slice(0,-1).join("/");
      return goLocation(workspaceTarget.accountId,workspaceTarget.bucketName,parent);
    }
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
    } else if (e.key === "Enter" && selected.length === 1) {
      e.preventDefault();
      openExplorerItem(selected[0]);
    } else if (!e.altKey && !command && e.key === "ArrowDown") {
      e.preventDefault();
      navigateExplorerSelection(1);
    } else if (!e.altKey && !command && e.key === "ArrowUp") {
      e.preventDefault();
      navigateExplorerSelection(-1);
    } else if (!e.altKey && !command && e.key === "ArrowRight") {
      e.preventDefault();
      navigatePreview(1);
    } else if (!e.altKey && !command && e.key === "ArrowLeft") {
      e.preventDefault();
      navigatePreview(-1);
    } else if (e.key === "Escape") {
      hideExplorerMenu();
      if (workspaceLightboxOpen()) {
        e.preventDefault();
        setWorkspacePreviewLightbox(false);
      } else if (workspacePreviewExpanded) {
        e.preventDefault();
        setWorkspacePreviewExpanded(false);
      } else {
        explorerSelected.clear();
        renderFileItems();
      }
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
  await loadExplorerInventory().catch((error)=>{
    $("explorer-status").textContent=safeUiMessage(friendlyError(error,"load Cloudflare storage"));
  });
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
