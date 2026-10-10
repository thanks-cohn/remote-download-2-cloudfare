/* RFIS Phase B: browser-local, incremental asset observations.
   Observations are facts; external moves are never inferred from missing keys. */
(() => {
  "use strict";
  const DB_NAME="redown-rfis"; const DB_VERSION=1;
  let opening;
  function db() {
    if(!opening)opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const database=request.result;
        if(!database.objectStoreNames.contains("files")){
          const store=database.createObjectStore("files",{keyPath:"locator"});
          store.createIndex("file_id","file_id",{unique:true});
        }
        if(!database.objectStoreNames.contains("events")){
          const store=database.createObjectStore("events",{keyPath:"event_id"});
          store.createIndex("file_id","file_id");
        }
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>{opening=null;reject(request.error);};
    });
    return opening;
  }
  function txDone(tx) {
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error("RFIS write failed"));
      tx.onabort=()=>reject(tx.error||new Error("RFIS transaction aborted"));
    });
  }
  function asPromise(request) {
    return new Promise((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }
  const locator=(accountId,bucketName,key)=>JSON.stringify([accountId,bucketName,key]);
  const stamp=()=>new Date().toISOString();
  function digest(value){return value===undefined||value===null?null:String(value);}
  function metadata(object) {
    return {
      size:Number.isFinite(Number(object.size))?Number(object.size):null,
      etag:digest(object.etag),
      provider_modified_at:digest(object.uploaded||object.lastModified||object.last_modified||object.modified)
    };
  }
  async function observe(accountId,bucketName,objects) {
    if(!accountId||!bucketName||!Array.isArray(objects)||!objects.length)return {observed:0};
    const database=await db();let changed=0;
    // Serial read/compare/write transactions per small batch avoid gigantic resident state.
    for(const object of objects) {
      const key=String(object.key||object.name||"");
      if(!key)continue;
      const address=locator(accountId,bucketName,key);
      const transaction=database.transaction(["files","events"],"readwrite");
      const files=transaction.objectStore("files");
      const old=await asPromise(files.get(address));
      const data=metadata(object);
      if(!old) {
        const file_id=crypto.randomUUID(),now=stamp();
        files.put({locator:address,file_id,account_id:accountId,bucket:bucketName,key,
          first_seen_at:now,last_observed_at:now,metadata:data,identity_state:"local-observation"});
        transaction.objectStore("events").put({
          event_id:crypto.randomUUID(),file_id,kind:"first_observed",observed_at:now,
          source:"r2-listing",locator:address,metadata:data
        });
        changed++;
      } else if(JSON.stringify(old.metadata)!==JSON.stringify(data)){
        const now=stamp();
        files.put({...old,last_observed_at:now,metadata:data});
        transaction.objectStore("events").put({
          event_id:crypto.randomUUID(),file_id:old.file_id,kind:"metadata_changed",
          observed_at:now,source:"r2-listing",locator:address,
          previous:old.metadata,current:data
        });
        changed++;
      }
      // Unchanged observations are intentionally not written.
      await txDone(transaction);
    }
    return {observed:objects.length,changes:changed};
  }
  async function all(storeName) {
    const database=await db();
    const transaction=database.transaction(storeName,"readonly");
    const result=await asPromise(transaction.objectStore(storeName).getAll());
    await txDone(transaction);
    return result;
  }
  async function exportJSON() {
    return {
      format:"rfis",schemaVersion:1,exported_at:stamp(),complete:false,
      provenance:"Observed through REDOWN R2 listings; historical moves outside REDOWN are not inferred.",
      files:await all("files"),events:await all("events")
    };
  }
  globalThis.RedownRFIS={observe,exportJSON};
})();