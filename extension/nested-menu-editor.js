/* Settings editor: choose existing locations OR explicitly create a new one. */
(() => {
  const M=RedownNestedLocations;
  let context,container,renderVersion=0,lastStatus={text:"",bad:false};
  const collapsed=new Set(),pending=new Set(),drafts=new Map();
  const nodeElement=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  function button(text,action,className='ghost') {
    const el=nodeElement('button',className,text);el.type='button';el.addEventListener('click',event=>{Promise.resolve().then(()=>{if(pending.size)return;return action(event);}).catch(error=>live(error?.message || 'Could not save this change.',true));});return el;
  }
  function selectedOption(select,value,text) {const option=nodeElement('option','',text);option.value=value;select.append(option);}
  async function save(profile) { await context.save(profile); }
  function live(text,bad=false) {lastStatus={text,bad};if(!container)return;const status=container.querySelector('.nested-status');status.textContent=text;status.classList.toggle('bad',bad);}
  async function run(key,controls,task,reconcile) {
    if(pending.size)return;
    pending.add(key);container.setAttribute("aria-busy","true");const locked=[...container.querySelectorAll("input,select,button")];const previous=locked.map(el=>el.disabled);locked.forEach(el=>el.disabled=true);
    try {await task();} catch(error) {live(error?.message || 'Could not finish. Retry.',true);}
    finally {pending.delete(key);container.setAttribute("aria-busy","false");locked.forEach((el,index)=>{if(el.isConnected)el.disabled=previous[index];});if(reconcile)reconcile();}
  }
  function render(profiles) {
    if(!container)return;
    if(pending.size)return;
    const version=++renderVersion;
    const reads=new Map();
    const read=message=>{const key=JSON.stringify(message);if(!reads.has(key))reads.set(key,context.send(message));return reads.get(key);};
    container.replaceChildren();
    const status=nodeElement('div','status nested-status');status.setAttribute('aria-live','polite');container.append(status);live(lastStatus.text,lastStatus.bad);
    const cloudflare=profiles.filter(p=>p.type==='cloudflare-r2'&&!p.explorerManaged);
    if(!cloudflare.length){container.append(nodeElement('div','empty','Connect Cloudflare and choose a bucket to configure nested destinations.'));return;}
    for(const profile of cloudflare) {
      const model=profile.nestedMenu ||= M.fromLegacy(profile);
      // Persisted account/bucket selections are the starting point; no user re-selection should be necessary.
      const card=nodeElement('article','nested-card');
      const head=nodeElement('div','nested-heading');
      const title=nodeElement('div');title.append(nodeElement('h3','',profile.accountName || profile.name || profile.bucketName),nodeElement('div','meta','Existing locations and new locations are separate choices.'));
      const toggle=nodeElement('label','toggle');const enabled=nodeElement('input');enabled.type='checkbox';enabled.checked=model.enabled;
      enabled.addEventListener('change',async()=>{model.enabled=enabled.checked;try{await save(profile);live(model.enabled?'Included in Nested mode.':'Excluded from Nested mode. Your locations are kept.');}catch(error){enabled.checked=!model.enabled;model.enabled=enabled.checked;live(error.message,true);}});
      toggle.append(enabled,document.createTextNode('Show this account in the Nested right-click menu'));head.append(title,toggle);card.append(head);
      if(model.imported)card.append(nodeElement('div','nested-import-note','Previous entries are checked against Cloudflare. Missing folders need to be selected or created; no existing files are moved.'));
      const headings=nodeElement('div','nested-columns');['Existing location','Create a new location here','Actions'].forEach(text=>headings.append(nodeElement('span','',text)));card.append(headings);
      const roots=nodeElement('div','nested-roots');card.append(roots);
      const current=()=>version===renderVersion && card.isConnected;
      const rerender=()=>render(context.profiles());
      function rootRow(root) {
        const group=nodeElement('div','nested-group');const row=nodeElement('div','nested-location-row');
        const select=nodeElement('select','nested-existing');select.setAttribute('aria-label','Existing buckets');selectedOption(select,'','Loading buckets…');select.disabled=true;
        const newName=nodeElement('input','nested-new');newName.placeholder='New bucket name';newName.setAttribute('aria-label','New bucket name');newName.autocomplete='off';newName.value=drafts.get(root.id) || '';newName.addEventListener('input',()=>drafts.set(root.id,newName.value));
        const create=button('Create',()=>run(root.id,[create,newName,select],async()=>{
          const name=newName.value.trim().toLowerCase();
          if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name))throw new Error('Bucket names use 3–63 lowercase letters, numbers, or hyphens.');
          live('Creating bucket…');const result=await context.send({type:'cfCreateBucket',accountId:profile.accountId,name});
          if(!result?.ok)throw new Error(result?.error || 'Could not create bucket.');
          if(!current())return;
          if(root.bucketName!==name)root.children.forEach(M.invalidate);
          root.bucketName=result.bucket?.name || name;root.ready=true;newName.value='';drafts.delete(root.id);
          await save(profile);select.replaceChildren();selectedOption(select,root.bucketName,root.bucketName);select.value=root.bucketName;add.disabled=false;location.textContent=`${root.bucketName} /`;live('Bucket created.');
        },()=>{if(group.isConnected)add.disabled=!root.ready;}), 'secondary');
        const actions=nodeElement('div','nested-actions');
        const add=button('+ Child',()=>run(root.id,[],async()=>{if(!root.ready)return;const fresh=M.blank();root.children.push(fresh);collapsed.delete(root.id);children.hidden=false;fold.textContent='▾';fold.setAttribute('aria-expanded','true');await save(profile);folderRow(root,fresh,children,'',root.ready,0);}));add.disabled=true;add.setAttribute('aria-label','Add a folder inside this bucket');
        const remove=button('Remove',()=>run(root.id,[],async()=>{model.roots=model.roots.filter(item=>item!==root);await save(profile);group.remove();}));remove.setAttribute('aria-label','Remove this bucket from the nested menu only');
        actions.append(add,remove);
        const choose=nodeElement('div','nested-choice');const fold=button('▾',()=>{collapsed.has(root.id)?collapsed.delete(root.id):collapsed.add(root.id);children.hidden=collapsed.has(root.id);fold.textContent=collapsed.has(root.id)?'▸':'▾';fold.setAttribute('aria-expanded',String(!collapsed.has(root.id)));},'nested-collapse ghost');fold.setAttribute('aria-expanded',String(!collapsed.has(root.id)));fold.setAttribute('aria-label','Expand or collapse bucket children');fold.textContent=collapsed.has(root.id)?'▸':'▾';choose.append(fold,select);
        const creator=nodeElement('form','nested-create');creator.append(newName,create);creator.addEventListener('submit',event=>{event.preventDefault();create.click();});
        row.append(choose,creator,actions);group.append(row);
        const location=nodeElement('div','nested-path',root.bucketName?`${root.bucketName} /`:'Choose an existing bucket or create a new one.');group.append(location);
        const children=nodeElement('div','nested-children');children.hidden=collapsed.has(root.id);group.append(children);roots.append(group);
        select.addEventListener('change',()=>run(root.id,[select,create,newName,add],async()=>{
          if(!select.value)return;
          if(root.bucketName!==select.value)root.children.forEach(M.invalidate);
          root.bucketName=select.value;root.ready=true;
          // The adjacent creation field is deliberately untouched.
          await save(profile);location.textContent=`${root.bucketName} /`;children.replaceChildren();for(const node of root.children)folderRow(root,node,children,'',true,0);
        },()=>{if(group.isConnected)add.disabled=!root.ready;}));
        async function populate() {
          try {
            const result=await read({type:'cfBuckets',accountId:profile.accountId});if(!current())return;
            if(!result?.ok)throw new Error(result?.error || 'Could not load buckets.');
            select.replaceChildren();selectedOption(select,'','Choose an existing bucket…');
            for(const bucket of result.buckets || [])selectedOption(select,bucket.name,bucket.name);
            const exists=(result.buckets || []).some(bucket=>bucket.name===root.bucketName);
            root.ready=exists;select.value=exists?root.bucketName:'';select.disabled=false;add.disabled=!exists;
            location.textContent=exists?`${root.bucketName} /`:root.bucketName?`Previous bucket unavailable: ${root.bucketName}`:'Choose an existing bucket or create a new one.';
            await save(profile);if(!current())return;
            if(!collapsed.has(root.id))for(const node of root.children)folderRow(root,node,children,'',root.ready,0);
          } catch(error) {if(!current())return;root.ready=false;root.children.forEach(M.invalidate);add.disabled=true;select.replaceChildren();selectedOption(select,'','Could not load buckets');live(error.message,true);}
        }
        populate();
      }
      function folderRow(root,node,parent,parentPath,parentReady,depth) {
        const group=nodeElement('div','nested-group');group.dataset.nodeId=node.id;
        const row=nodeElement('div','nested-location-row');
        const select=nodeElement('select','nested-existing');select.setAttribute('aria-label',`Existing folders inside ${root.bucketName}/${parentPath}`);selectedOption(select,'',parentReady?'Loading folders…':'Choose the parent first');select.disabled=true;
        const newName=nodeElement('input','nested-new');newName.placeholder='New folder name';newName.setAttribute('aria-label',`New folder inside ${root.bucketName}/${parentPath}`);newName.disabled=!parentReady;newName.autocomplete='off';newName.value=drafts.get(node.id) || '';newName.addEventListener('input',()=>drafts.set(node.id,newName.value));
        let known=[];
        const create=button('Create',()=>run(node.id,[create,newName,select,add],async()=>{
          const name=M.name(newName.value);
          if(known.includes(name))throw new Error('That folder already exists here. Select it from the dropdown.');
          live('Creating child folder…');
          const result=await context.send({type:'cfCreateFolder',accountId:profile.accountId,bucketName:root.bucketName,accountName:profile.accountName,prefix:parentPath,name});
          if(!result?.ok)throw new Error(result?.error || 'Could not create child folder.');
          if(!current())return;
          M.setLocation(node,name);newName.value='';drafts.delete(node.id);
          await save(profile);select.replaceChildren();selectedOption(select,name,name);select.value=name;node.ready=true;add.disabled=false;location.textContent=`${root.bucketName}/${M.path(parentPath,name)}/`;live(`Created ${root.bucketName}/${M.path(parentPath,name)}/`);
        },()=>{if(group.isConnected)repaint();}),'secondary');create.disabled=true;
        const creator=nodeElement('form','nested-create');creator.append(newName,create);creator.addEventListener('submit',event=>{event.preventDefault();create.click();});
        const add=button('+ Child',()=>run(node.id,[],async()=>{if(!node.ready)return;const fresh=M.blank();node.children.push(fresh);collapsed.delete(node.id);children.hidden=false;fold.textContent='▾';fold.setAttribute('aria-expanded','true');await save(profile);folderRow(root,fresh,children,M.path(parentPath,node.name),true,depth+1);fold.disabled=false;}));add.disabled=true;add.setAttribute('aria-label','Add a child inside this folder');
        const remove=button('Remove',()=>run(node.id,[],async()=>{const siblings=findChildren(root,node.id);const index=siblings.indexOf(node);if(index>=0)siblings.splice(index,1);await save(profile);group.remove();}));remove.setAttribute('aria-label','Remove this menu branch without deleting any Cloudflare folders');
        const actions=nodeElement('div','nested-actions');actions.append(add,remove);
        const choose=nodeElement('div','nested-choice');const fold=button(collapsed.has(node.id)?'▸':'▾',()=>{collapsed.has(node.id)?collapsed.delete(node.id):collapsed.add(node.id);children.hidden=collapsed.has(node.id);fold.textContent=collapsed.has(node.id)?'▸':'▾';fold.setAttribute('aria-expanded',String(!collapsed.has(node.id)));},'nested-collapse ghost');fold.setAttribute('aria-expanded',String(!collapsed.has(node.id)));fold.setAttribute('aria-label','Expand or collapse folder children');fold.disabled=!node.children.length;choose.append(fold,select);
        row.append(choose,creator,actions);group.append(row);
        const location=nodeElement('div','nested-path');group.append(location);
        const children=nodeElement('div','nested-children');children.hidden=collapsed.has(node.id);group.append(children);parent.append(group);
        const repaint=()=>{
          location.textContent=node.ready?`${root.bucketName}/${M.path(parentPath,node.name)}/`:node.name?`Previous entry: ${node.name} · choose an existing folder or create it here.`:`Inside ${root.bucketName}/${parentPath}${parentPath?'/':''}`;
          add.disabled=!parentReady || !node.ready;
          if(!collapsed.has(node.id) && !children.childElementCount)for(const child of node.children)folderRow(root,child,children,node.name?M.path(parentPath,node.name):parentPath,parentReady&&node.ready,depth+1);
        };
        select.addEventListener('change',()=>run(node.id,[select,create,newName,add],async()=>{
          if(!select.value)return;
          M.setLocation(node,select.value);
          // Choosing an existing folder never assigns to newName.value.
          await save(profile);children.replaceChildren();location.textContent=`${root.bucketName}/${M.path(parentPath,node.name)}/`;for(const child of node.children)folderRow(root,child,children,M.path(parentPath,node.name),true,depth+1);
        },()=>{if(group.isConnected)repaint();}));
        if(!parentReady){node.ready=false;repaint();return;}
        (async()=>{
          try {
            const result=await read({type:'cfFolderChildren',accountId:profile.accountId,bucketName:root.bucketName,parentPrefix:parentPath,limit:100000});if(!current())return;
            if(!result?.ok)throw new Error(result?.error || 'Could not load child folders.');
            known=result.children || [];select.replaceChildren();selectedOption(select,'',known.length?'Choose an existing folder…':'No folders here yet');
            for(const name of known)selectedOption(select,name,name);
            node.ready=Boolean(node.name) && known.includes(node.name);if(node.ready)delete node.needsSelection;select.value=node.ready?node.name:'';select.disabled=false;create.disabled=false;
            if(!node.ready)node.children.forEach(M.invalidate);
            await save(profile);if(current())repaint();
          }catch(error){if(!current())return;node.ready=false;node.children.forEach(M.invalidate);select.replaceChildren();selectedOption(select,'','Could not load folders');create.disabled=true;newName.disabled=true;repaint();live(error.message,true);}
        })();
      }
      function findChildren(root,id) {
        function walk(items){if(items.some(item=>item.id===id))return items;for(const item of items){const found=walk(item.children);if(found)return found;}return null;}
        return walk(root.children) || [];
      }
      model.roots.forEach(rootRow);
      const footer=nodeElement('div','nested-footer');
      footer.append(button('+ Add bucket',()=>run('add-bucket',[],async()=>{const newRoot={id:crypto.randomUUID(),bucketName:'',ready:false,children:[]};model.roots.push(newRoot);await save(profile);rootRow(newRoot);})),button('Refresh locations',()=>rerender()));
      card.append(footer);container.append(card);
    }
  }
  globalThis.RedownNestedEditor={mount(root,dependencies){container=root;context=dependencies;render(context.profiles());},render};
})();
