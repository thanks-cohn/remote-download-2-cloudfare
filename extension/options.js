const $=id=>document.getElementById(id);
let profiles=[];
let cfAccounts=[];
let currentAccountId="";
let browseTarget=null;

function uid(){return crypto.randomUUID();}
function setStatus(id,msg,kind=""){const el=$(id);el.textContent=msg||"";el.className="status"+(kind?" "+kind:"");}
async function send(message){return chrome.runtime.sendMessage(message);}
async function saveProfiles(){await chrome.storage.local.set({profiles});}
function displayName(p){return p.name||p.bucketName||p.repository||"Destination";}

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
        ["3d","3D"],["2d","2D"],["files","Files"]
      ],p.defaultCategory||"files",v=>p.defaultCategory=v),
      field("Order",String(p.menuOrder??index),v=>p.menuOrder=Number(v)||0,"number")
    );

    if(p.type==="cloudflare-r2"){
      grid.append(
        field("3D prefix",p.folders?.["3d"]||"3d",v=>(p.folders??={})["3d"]=v),
        field("2D prefix",p.folders?.["2d"]||"2d",v=>(p.folders??={})["2d"]=v),
        field("Files prefix",p.folders?.files||"files",v=>(p.folders??={}).files=v)
      );
    }else{
      grid.append(
        field("Repository",p.repository||"",v=>p.repository=v,"text","owner/repository"),
        field("Branch",p.branch||"main",v=>p.branch=v),
        field("GitHub token",p.token||"",v=>p.token=v,"password"),
        field("3D path",p.paths?.["3d"]||"assets/3d",v=>(p.paths??={})["3d"]=v),
        field("2D path",p.paths?.["2d"]||"assets/2d",v=>(p.paths??={})["2d"]=v),
        field("Files path",p.paths?.files||"assets/files",v=>(p.paths??={}).files=v)
      );
    }

    const actions=document.createElement("div");actions.className="row-actions";
    const toggle=document.createElement("label");toggle.className="toggle";
    const check=document.createElement("input");check.type="checkbox";check.checked=p.showInContextMenu!==false;
    check.addEventListener("change",()=>p.showInContextMenu=check.checked);
    toggle.append(check,document.createTextNode("Show in right-click menu"));
    actions.append(toggle);

    if(p.type==="cloudflare-r2"){
      const browse=document.createElement("button");browse.className="ghost";browse.textContent="Browse bucket";
      browse.addEventListener("click",()=>openBrowser(p));
      actions.append(browse);
    }
    const up=document.createElement("button");up.className="ghost";up.textContent="Move up";
    up.addEventListener("click",()=>{p.menuOrder=(p.menuOrder??index)-1;renderProfiles();});
    const down=document.createElement("button");down.className="ghost";down.textContent="Move down";
    down.addEventListener("click",()=>{p.menuOrder=(p.menuOrder??index)+1;renderProfiles();});
    const remove=document.createElement("button");remove.className="danger";remove.textContent="Remove preset";
    remove.addEventListener("click",()=>{profiles=profiles.filter(x=>x.id!==p.id);renderProfiles();saveProfiles();});
    actions.append(up,down,remove);

    card.append(top,grid,actions);
    root.append(card);
  });

  saveProfiles();
}

function field(labelText,value,onInput,type="text",placeholder=""){
  const wrap=document.createElement("div");
  const label=document.createElement("label");label.textContent=labelText;
  const input=document.createElement("input");input.type=type;input.value=value??"";input.placeholder=placeholder;
  input.addEventListener("input",()=>onInput(input.value));
  wrap.append(label,input);return wrap;
}
function selectField(labelText,items,value,onInput){
  const wrap=document.createElement("div");
  const label=document.createElement("label");label.textContent=labelText;
  const select=document.createElement("select");
  items.forEach(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;o.selected=v===value;select.append(o);});
  select.addEventListener("change",()=>onInput(select.value));
  wrap.append(label,select);return wrap;
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
    const span=document.createElement("span");span.textContent=[bucket.location,bucket.jurisdiction].filter(Boolean).join(" · ")||"R2 bucket";
    el.append(strong,span);
    el.addEventListener("click",()=>addBucketPreset(bucket.name));
    root.append(el);
  });
  setStatus("cf-status",(result.buckets||[]).length?"Click a bucket to make it a REDOWN preset.":"No buckets yet. Create one above.");
}
async function addBucketPreset(bucketName){
  const account=cfAccounts.find(a=>a.id===currentAccountId);
  if(!account)return;
  setStatus("cf-status",`Preparing ${bucketName} for REDOWN…`);
  const result=await send({
    type:"cfProvision",
    accountId:account.id,
    accountName:account.name,
    bucketName,
    profileName:bucketName,
    folders:{"3d":"3d","2d":"2d","files":"files"}
  });
  if(!result?.ok){setStatus("cf-status",result?.error||"Could not prepare bucket","bad");return;}
  const stored=await chrome.storage.local.get("profiles");
  profiles=stored.profiles||[];
  renderProfiles();
  setStatus("cf-status",`${bucketName} is ready. It now appears in the right-click menu.`,"ok");
}
async function openBrowser(profile){
  browseTarget=profile;
  $("browser-panel").hidden=false;
  $("browser-title").textContent=`${profile.bucketName} · contents`;
  $("browse-prefix").value="";
  $("browser-panel").scrollIntoView({behavior:"smooth"});
  await browse();
}
async function browse(){
  if(!browseTarget)return;
  const result=await send({type:"cfObjects",accountId:browseTarget.accountId,bucketName:browseTarget.bucketName,prefix:$("browse-prefix").value.trim()});
  const root=$("objects");root.replaceChildren();
  if(!result?.ok){const e=document.createElement("div");e.className="object";e.textContent=result?.error||"Could not browse bucket";root.append(e);return;}
  const objects=result.objects||[];
  if(!objects.length){const e=document.createElement("div");e.className="object";e.textContent="No objects under this prefix.";root.append(e);return;}
  objects.slice(0,200).forEach(obj=>{const e=document.createElement("div");e.className="object";e.textContent=obj.key||obj.name||String(obj);root.append(e);});
}

$("connect-cloudflare").addEventListener("click",async()=>{
  setStatus("hero-status","Opening Cloudflare…");
  const result=await send({type:"cfConnect"});
  if(!result?.ok){setStatus("hero-status",result?.error||"Cloudflare connection failed","bad");return;}
  setStatus("hero-status","Cloudflare connected.","ok");
  await refreshCloudflare();
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
    paths:{"2d":"assets/2d","3d":"assets/3d","files":"assets/files"},
    defaultCategory:"files",showInContextMenu:true,menuOrder:profiles.length
  });
  renderProfiles();
  document.querySelector("#profiles .card:last-child")?.scrollIntoView({behavior:"smooth"});
});
$("browse-refresh").addEventListener("click",browse);
$("close-browser").addEventListener("click",()=>{$("browser-panel").hidden=true;browseTarget=null;});

(async()=>{
  const stored=await chrome.storage.local.get(["profiles","cloudflareAuth"]);
  profiles=stored.profiles||[];
  renderProfiles();
  await refreshCloudflare();
})();