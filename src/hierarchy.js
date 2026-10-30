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

// Alleen de groepsvolgorde verandert; taken en subtaken blijven gekoppeld via ID.
export function reorderGroup(project,sourceId,targetId,after=false) {
  const p=structuredClone(project),source=p.groups.find(g=>g.id===sourceId),target=p.groups.find(g=>g.id===targetId);
  if(!source||!target||sourceId===targetId)return p;
  if((source.parentId||null)!==(target.parentId||null))throw Error('Verplaats een groep tussen groepen op hetzelfde niveau.');
  p.groups=p.groups.filter(g=>g.id!==sourceId);
  p.groups.splice(p.groups.findIndex(g=>g.id===targetId)+(after?1:0),0,source);
  p.groups.forEach((g,i)=>g.sort_order=i);return p;
}
