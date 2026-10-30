function database() { return new Promise((resolve,reject)=>{ const req=indexedDB.open('project-planner-local',1); req.onupgradeneeded=()=>req.result.createObjectStore('recovery'); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); }
export async function recoveryGet() { const db=await database(); try { return await new Promise((resolve,reject)=>{const tx=db.transaction('recovery');const r=tx.objectStore('recovery').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}); } finally {db.close();} }
export async function recoveryPut(record) { const db=await database(); try { await new Promise((resolve,reject)=>{const tx=db.transaction('recovery','readwrite');tx.objectStore('recovery').put(record,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);}); } finally {db.close();} }
export async function writeProject(project, handle, saveAs=false, {readOnly=false}={}) {
  if(readOnly)throw Error('Deze kijkversie kan geen projectbestanden opslaan.');
  const name=`${project.name.replace(/[^\p{L}\p{N} _-]/gu,'_')||'project'}.json`;
  const savedAt=new Date().toISOString();
  const json=JSON.stringify({...project,savedAt},null,2);
  if(window.showSaveFilePicker) {
    const target=saveAs||!handle?await window.showSaveFilePicker({suggestedName:name,types:[{description:'Projectbestand',accept:{'application/json':['.json']}}]}):handle;
    const stream=await target.createWritable(); await stream.write(json); await stream.close(); return {handle:target,download:false,savedAt};
  }
  const url=URL.createObjectURL(new Blob([json],{type:'application/json'})); const a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return {handle:null,download:true,savedAt};
}
