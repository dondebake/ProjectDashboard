export const GROUP_COLOR='#154273';
export const TASK_COLOR='#007bc7';
export const validColor=color=>color==null||color===''||/^#[\da-f]{6}$/i.test(color);

export function validateHierarchy(project) {
  const tasks=new Map(project.tasks.map(t=>[t.id,t]));
  for(const item of [...project.groups,...project.tasks])if(!validColor(item.color))throw Error('Gebruik een geldige kleur (#RRGGBB).');
  for(const t of project.tasks) {
    if(!t.parentTaskId)continue;
    const parent=tasks.get(t.parentTaskId);
    if(!parent||parent===t)throw Error('Kies een bestaande bovenliggende taak.');
    if(parent.parentTaskId)throw Error('Maximaal drie niveaus: groep, taak en subtaak.');
    if((t.groupId||null)!==(parent.groupId||null))throw Error('Een subtaak hoort bij dezelfde groep als zijn taak.');
  }
}

export function buildRows(project,collapsed=new Set()) {
  const rows=[];
  function addTask(t,depth) {
    const children=project.tasks.filter(child=>child.parentTaskId===t.id);
    rows.push({kind:'task',task:t,depth,hasChildren:children.length>0,isSubtask:Boolean(t.parentTaskId)});
    if(!collapsed.has(`task:${t.id}`))for(const child of children)rows.push({kind:'task',task:child,depth:depth+1,hasChildren:false,isSubtask:true});
  }
  function addGroup(g,depth=0) {
    rows.push({kind:'group',group:g,depth});
    if(collapsed.has(`group:${g.id}`))return;
    for(const t of project.tasks.filter(t=>t.groupId===g.id&&!t.parentTaskId))addTask(t,depth+1);
    // Oude bestanden met geneste groepen blijven volledig zichtbaar.
    for(const child of project.groups.filter(x=>x.parentId===g.id))addGroup(child,depth+1);
  }
  for(const g of project.groups.filter(g=>!g.parentId))addGroup(g);
  for(const t of project.tasks.filter(t=>!t.groupId&&!t.parentTaskId))addTask(t,0);
  return rows;
}

export function itemColor(item,project,isGroup=false) {
  if(item.color)return item.color;
  if(isGroup)return GROUP_COLOR;
  const parent=project.tasks.find(t=>t.id===item.parentTaskId);
  if(parent?.color)return parent.color;
  const group=project.groups.find(g=>g.id===item.groupId);
  return group?(group.color||GROUP_COLOR):TASK_COLOR;
}
export function textColor(color) {
  const rgb=color.slice(1).match(/../g).map(s=>parseInt(s,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  const luminance=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  return (luminance+.05)/.05>1.05/(luminance+.05)?'#111111':'#ffffff';
}

export function upsertTask(project,task) {
  const p=structuredClone(project),{isNew,...t}=task;
  if(t.parentTaskId){const parent=p.tasks.find(x=>x.id===t.parentTaskId);if(!parent)throw Error('Bovenliggende taak ontbreekt.');t.groupId=parent.groupId||null;}
  const index=p.tasks.findIndex(x=>x.id===t.id);
  if(index<0)p.tasks.push(t);else p.tasks[index]=t;
  for(const child of p.tasks.filter(x=>x.parentTaskId===t.id))child.groupId=t.groupId||null;
  validateHierarchy(p);return p;
}

export function deleteTaskTree(project,id) {
  const p=structuredClone(project),ids=new Set([id,...p.tasks.filter(t=>t.parentTaskId===id).map(t=>t.id)]);
  p.tasks=p.tasks.filter(t=>!ids.has(t.id));p.dependencies=p.dependencies.filter(d=>!ids.has(d.from)&&!ids.has(d.to));
  // Vaste kosten van een verwijderde taak blijven bestaan, als projectbrede kosten.
  if(p.fixedCosts)p.fixedCosts=p.fixedCosts.map(c=>ids.has(c.taskId)?{...c,taskId:null}:c);
  if(p.timeEntries)p.timeEntries=p.timeEntries.filter(e=>!ids.has(e.taskId));
  return p;
}
export function deleteGroup(project,id) {
  const p=structuredClone(project),group=p.groups.find(g=>g.id===id);
  p.groups=p.groups.filter(g=>g.id!==id).map(g=>g.parentId===id?{...g,parentId:group?.parentId||null}:g);
  p.tasks=p.tasks.map(t=>t.groupId===id?{...t,groupId:null}:t);return p;
}

// Verplaats een taak of subtaak naar een nieuwe plek in de structuur. De volgorde in project.tasks
// bepaalt de volgorde onder broers en zussen; datums, uren, kosten en dependencies blijven ongewijzigd.
// target: {kind:'group',id} = bovenaan in die groep; {kind:'task',id,position:'before'|'after'} = naast die rij,
// op hetzelfde niveau; {kind:'task',id,position:'inside'} = als laatste subtaak onder die taak.
export function moveTaskTo(project,sourceId,target) {
  const p=structuredClone(project),source=p.tasks.find(t=>t.id===sourceId);
  if(!source)throw Error('De te verplaatsen taak bestaat niet.');
  if(target.kind==='task'&&target.id===sourceId)return p;
  const hasChildren=p.tasks.some(t=>t.parentTaskId===sourceId);
  let groupId,parentTaskId,anchor,after;
  if(target.kind==='group') {
    if(!p.groups.some(g=>g.id===target.id))throw Error('Kies een bestaande groep.');
    groupId=target.id;parentTaskId=null;after=false;
    anchor=p.tasks.find(t=>t.groupId===target.id&&!t.parentTaskId&&t.id!==sourceId);
  }else {
    const t=p.tasks.find(x=>x.id===target.id);
    if(!t)throw Error('Kies een bestaande taak.');
    if(target.position==='inside') {
      if(t.parentTaskId)throw Error('Maximaal drie niveaus: groep, taak en subtaak.');
      groupId=t.groupId||null;parentTaskId=t.id;after=true;
      anchor=p.tasks.filter(x=>x.parentTaskId===t.id&&x.id!==sourceId).at(-1)||t;
    }else if(['before','after'].includes(target.position)) {
      groupId=t.groupId||null;parentTaskId=t.parentTaskId||null;after=target.position==='after';anchor=t;
    }else throw Error('Ongeldige plek om naartoe te verplaatsen.');
  }
  if(parentTaskId&&hasChildren)throw Error('Een taak met subtaken kan geen subtaak worden. Verplaats eerst de subtaken.');
  p.tasks=p.tasks.filter(t=>t.id!==sourceId);
  source.groupId=groupId;source.parentTaskId=parentTaskId;
  p.tasks.splice(anchor?p.tasks.indexOf(anchor)+(after?1:0):p.tasks.length,0,source);
  for(const child of p.tasks)if(child.parentTaskId===sourceId)child.groupId=groupId;
  validateHierarchy(p);return p;
}
// Eén plek omhoog (-1) of omlaag (+1) tussen taken met dezelfde groep en dezelfde bovenliggende taak.
export function stepTask(project,id,delta) {
  const p=structuredClone(project),task=p.tasks.find(t=>t.id===id);
  if(!task)return p;
  const siblings=p.tasks.filter(t=>(t.groupId||null)===(task.groupId||null)&&(t.parentTaskId||null)===(task.parentTaskId||null));
  const other=siblings[siblings.indexOf(task)+delta];
  if(!other)return p;
  const i=p.tasks.indexOf(task),j=p.tasks.indexOf(other);
  [p.tasks[i],p.tasks[j]]=[p.tasks[j],p.tasks[i]];return p;
}

// Alleen de groepsvolgorde verandert; taken en subtaken blijven gekoppeld via ID.
export function reorderGroup(project,sourceId,targetId,after=false) {
  const p=structuredClone(project),source=p.groups.find(g=>g.id===sourceId),target=p.groups.find(g=>g.id===targetId);
  if(!source||!target||sourceId===targetId)return p;
  if((source.parentId||null)!==(target.parentId||null))throw Error('Verplaats een groep tussen groepen op hetzelfde niveau.');
  p.groups=p.groups.filter(g=>g.id!==sourceId);
  p.groups.splice(p.groups.findIndex(g=>g.id===targetId)+(after?1:0),0,source);
  p.groups.forEach((g,i)=>g.sort_order=i);return p;
}
