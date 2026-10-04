/* Nested menu locations share the same hierarchy in settings and background. */
(() => {
  function name(value) {
    const clean=String(value || '').trim();
    if(!clean || clean==='.' || clean==='..' || /[\\/\x00-\x1f]/.test(clean)) throw new Error('Enter one folder name, without slashes.');
    return clean;
  }
  function path(parent,child) { return [String(parent || '').replace(/^\/+|\/+$/g,''),name(child)].filter(Boolean).join('/'); }
  function blank() { return {id:crypto.randomUUID(),name:'',ready:false,children:[]}; }
  function invalidate(node) {
    node.ready=false;node.needsSelection=true;
    for(const child of node.children || []) invalidate(child);
  }
  function setLocation(node,value) {
    if(node.name!==value) for(const child of node.children || []) invalidate(child);
    node.name=value; node.ready=true;delete node.needsSelection;
  }
  function fromLegacy(profile) {
    const roots=[];
    function convert(items,parent='') {
      return (items || []).map(old => {
        const full=String(old.prefix || '').trim().replace(/^\/+|\/+$/g,'');
        // Preserve explicit descendant paths; old bare names become actual children.
        const relative=parent && full.startsWith(parent+'/') ? full.slice(parent.length+1) : full;
        const segments=relative.split('/').filter(Boolean);
        if(!segments.length) return {...blank(),previousLabel:old.label || '',children:convert(old.children,parent)};
        let first=null,last=null,current=parent;
        for(const segment of segments) {
          const entry={...blank(),name:segment,previousLabel:old.label || ''};
          if(last)last.children.push(entry);else first=entry;
          last=entry; current=path(current,segment);
        }
        last.children=convert(old.children,current);
        return first;
      });
    }
    if(profile.bucketName) roots.push({id:crypto.randomUUID(),bucketName:profile.bucketName,ready:false,children:convert(profile.menuTree)});
    return {version:1,enabled:Boolean(profile.menuTree?.length),roots,imported:Boolean(profile.menuTree?.length)};
  }
  function destinations(model) {
    if(!model?.enabled)return [];
    const result=[];
    function walk(nodes,root,parent,ids) {
      for(const node of nodes || []) {
        if(!node.ready || !node.name)continue;
        const prefix=path(parent,node.name),chain=[...ids,node.id];
        result.push({rootId:root.id,bucketName:root.bucketName,nodeId:node.id,ids:chain,prefix,name:node.name});
        walk(node.children,root,prefix,chain);
      }
    }
    for(const root of model.roots || []) {
      if(!root.ready || !root.bucketName)continue;
      result.push({rootId:root.id,bucketName:root.bucketName,nodeId:root.id,ids:[],prefix:'',name:root.bucketName});
      walk(root.children,root,'',[]);
    }
    return result;
  }
  globalThis.RedownNestedLocations={name,path,blank,invalidate,setLocation,fromLegacy,destinations};
})();
