const $ = (id) => document.getElementById(id);
const urlInput=$("url"), filenameInput=$("filename"), profileSelect=$("profile"), categorySelect=$("category");
const send=$("send"), setup=$("setup"), status=$("status");

function setStatus(message, kind=""){
  status.textContent=message||"";
  status.className="status"+(kind ? " "+kind : "");
}
async function loadProfiles(){
  const {profiles=[]}=await chrome.storage.local.get("profiles");
  profileSelect.replaceChildren();
  for(const profile of profiles){
    const option=document.createElement("option");
    option.value=profile.id;
    const detail=profile.type==="cloudflare-r2" ? profile.bucketName : profile.repository;
    option.textContent=profile.name+(detail ? " · "+detail : "");
    profileSelect.append(option);
  }
  const empty=!profiles.length;
  send.hidden=empty;
  setup.hidden=!empty;
  if(empty){
    const option=document.createElement("option");
    option.textContent="No destination yet";
    profileSelect.append(option);
    profileSelect.disabled=true;
    setStatus("Connect Cloudflare or GitHub once, then REDOWN is ready.");
  }else{
    profileSelect.disabled=false;
    setStatus("");
  }
}
$("settings").addEventListener("click",()=>chrome.runtime.openOptionsPage());
setup.addEventListener("click",()=>chrome.runtime.openOptionsPage());

send.addEventListener("click",async()=>{
  const sourceUrl=urlInput.value.trim();
  if(!sourceUrl) return setStatus("Paste a remote HTTPS URL first.","bad");
  if(!profileSelect.value) return setStatus("Choose a destination first.","bad");
  send.disabled=true;
  send.textContent="Sending…";
  setStatus("The file is moving remotely. It does not download through this computer.");
  try{
    const result=await chrome.runtime.sendMessage({
      type:"ingest", sourceUrl, filename:filenameInput.value.trim(),
      profileId:profileSelect.value, category:categorySelect.value
    });
    if(!result?.ok) throw new Error(result?.error||"Unknown error");
    setStatus("Stored → "+result.location,"ok");
  }catch(error){
    setStatus(error?.message||String(error),"bad");
  }finally{
    send.disabled=false;
    send.textContent="Send with REDOWN";
  }
});
loadProfiles();