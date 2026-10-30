import {validateFinances} from './summary.js';
import {validateHierarchy} from './hierarchy.js';
import {validateTimeline,planningNodes,dependencyRequirement} from './events.js';
import {validateTeam} from './team.js';
import {validateFixedCosts} from './costs.js';
import {PUBLIC_HOLIDAYS,publicHoliday} from './holidays.js';
export const TYPES = { FS: 'Einde → start', SS: 'Start → start', FF: 'Einde → einde', SF: 'Start → einde' };
const legacyTypes = { finish_to_start: 'FS', start_to_start: 'SS', finish_to_finish: 'FF', start_to_finish: 'SF' };
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0,10) === s; }
export function day(s, n = 0) { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
export const daysBetween = (a,b) => Math.round((Date.parse(b)-Date.parse(a))/86400000);
export function working(s, calendar) { return calendar.workweek.includes(new Date(`${s}T12:00:00Z`).getUTCDay()) && !calendar.holidays.includes(s) && !publicHoliday(s,calendar.publicHolidays); }
export function snap(s, calendar, direction = 1) { let count=0; while (!working(s,calendar)) { if (++count>36600) throw Error('Geen werkdag gevonden in de kalender.'); s=day(s,direction); } return s; }
export function addWork(s,n,calendar) { let result=s; for(let i=0;i<Math.abs(n);i++) result=snap(day(result,Math.sign(n)),calendar,Math.sign(n)); return result; }
export function finish(task, calendar) { return task.duration === 0 ? task.start : addWork(task.start,task.duration-1,calendar); }
export function durationBetween(start,end,calendar) { let n=0; for(let s=start;s<=end;s=day(s,1)) if(working(s,calendar)) n++; return Math.max(1,n); }
export function emptyProject() { return { schemaVersion:1, name:'Nieuw project', calendar:{workweek:[1,2,3,4,5],holidays:[]}, groups:[], tasks:[], dependencies:[] }; }
export function validate(project) {
  validateTeam(project);
  validateTimeline(project);
  validateFinances(project);
  validateFixedCosts(project);
  if(project.schemaVersion!==1) throw Error('Deze bestandsversie wordt niet ondersteund.');
  if(typeof project.name!=='string'||!project.name.trim()) throw Error('Vul een projectnaam in.');
  const c=project.calendar;
  if(!c||!Array.isArray(c.workweek)||!c.workweek.length||c.workweek.some(x=>!Number.isInteger(x)||x<0||x>6)||!Array.isArray(c.holidays)||c.holidays.some(x=>!validDate(x))||c.publicHolidays!==undefined&&(!Array.isArray(c.publicHolidays)||c.publicHolidays.some(x=>!PUBLIC_HOLIDAYS[x]))) throw Error('De werkkalender is ongeldig.');
  if(!Array.isArray(project.tasks)||!Array.isArray(project.groups)||!Array.isArray(project.dependencies)) throw Error('Taken, groepen of dependencies ontbreken.');
  const groupIds=new Set(project.groups.map(g=>g.id));
  if(groupIds.size!==project.groups.length) throw Error('Dubbele groeps-ID.');
  for(const g of project.groups) {
    if(typeof g.id!=='string'||typeof g.name!=='string'||!g.name.trim()||(g.parentId&&!groupIds.has(g.parentId))) throw Error('Ongeldige groep.');
    const seen=new Set([g.id]); let parent=g.parentId;
    while(parent) { if(seen.has(parent)) throw Error('Groepen mogen geen cirkel vormen.'); seen.add(parent); parent=project.groups.find(x=>x.id===parent)?.parentId; }
  }
  const ids=new Set();
  for(const t of project.tasks) {
    if(typeof t.id!=='string'||ids.has(t.id)) throw Error('Ongeldig of dubbel taak-ID.'); ids.add(t.id);
    if(typeof t.title!=='string'||!t.title.trim()||!validDate(t.start)||!Number.isInteger(t.duration)||t.duration<0||t.duration>36600||!Number.isFinite(t.progress)||t.progress<0||t.progress>100||(t.groupId&&!groupIds.has(t.groupId))) throw Error(`Ongeldige taak: ${t.title||t.id}`);
  }
  validateHierarchy(project);
  for(const node of planningNodes(project))if(node.nodeType==='meeting'){if(ids.has(node.id))throw Error('Dubbel ID van een bijeenkomst.');ids.add(node.id);}
  const edges=new Set();
  for(const d of project.dependencies) {
    if(!ids.has(d.from)||!ids.has(d.to)||d.from===d.to||!TYPES[d.type]||!Number.isInteger(d.lag)||Math.abs(d.lag)>36600) throw Error('Ongeldige dependency.');
    const key=`${d.from}:${d.to}`; if(edges.has(key)) throw Error('Deze dependency bestaat al.'); edges.add(key);
  }
  topological(project); return project;
}
function topological(p,nodes=planningNodes(p)) {
  const indegree=new Map(nodes.map(t=>[t.id,0])); const outgoing=new Map(nodes.map(t=>[t.id,[]]));
  for(const d of p.dependencies) { indegree.set(d.to,indegree.get(d.to)+1); outgoing.get(d.from).push(d.to); }
  const queue=nodes.filter(t=>!indegree.get(t.id)).map(t=>t.id), result=[];
  for(let i=0;i<queue.length;i++) { const id=queue[i]; result.push(id); for(const to of outgoing.get(id)) { indegree.set(to,indegree.get(to)-1); if(!indegree.get(to)) queue.push(to); } }
  if(result.length!==nodes.length) throw Error('Deze dependency veroorzaakt een cirkel.'); return result;
}
export function schedule(input) {
  const p=structuredClone(input); validate(p); const nodes=planningNodes(p),map=new Map(nodes.map(t=>[t.id,t]));
  const incoming=new Map(nodes.map(t=>[t.id,[]])); for(const d of p.dependencies) incoming.get(d.to).push(d);
  for(const id of topological(p,nodes)) {
    const t=map.get(id); if(t.nodeType==='meeting')continue;t.start=snap(t.start,p.calendar);
    for(const d of incoming.get(id)) {
      const pred=map.get(d.from),required=snap(dependencyRequirement(pred,t,d,p.calendar),p.calendar);
      if(required>t.start) t.start=required;
    }
  } return p;
}
export function parseProject(raw) {
  let p=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);
  if(p.schemaVersion!==undefined) return schedule(p);
  if(!Array.isArray(p.tasks)) throw Error('Geen geldig projectbestand.');
  const old=p; p={...emptyProject(),legacySource:old,name:old.project?.name||old.name||'Geïmporteerd project'};
  p.groups=(old.groups||old.task_groups||[]).map(g=>({...g,id:String(g.id),parentId:g.parent_id==null?null:String(g.parent_id)}));
  p.tasks=old.tasks.map(t=>({...t,id:String(t.id),title:t.title||t.name,start:t.start_date||today(),duration:Number(t.duration_working_days??1),progress:Number(t.progress??0),groupId:t.group_id==null?null:String(t.group_id)}));
  p.dependencies=old.tasks.flatMap(t=>(t.dependencies||[]).map(d=>({from:String(d.predecessor_id),to:String(t.id),type:legacyTypes[d.type||d.dependency_type]||d.type||'FS',lag:Number(d.lag_days||0)})));
  return schedule(p);
}
export function demoProject() {
  const p=emptyProject(); p.name='Website vernieuwing'; const start=snap(today(),p.calendar);
  p.groups=[{id:'discovery',name:'01 · Voorbereiding',parentId:null},{id:'build',name:'02 · Ontwerp & realisatie',parentId:null}];
  p.tasks=[{id:'a',title:'Briefing & scope',start,duration:3,progress:100,groupId:'discovery'}, {id:'b',title:'Onderzoek & inhoud',start,duration:5,progress:60,groupId:'discovery'}, {id:'c',title:'Visueel ontwerp',start,duration:6,progress:25,groupId:'build'}, {id:'d',title:'Frontend bouwen',start,duration:8,progress:0,groupId:'build'}, {id:'e',title:'Testen & opleveren',start,duration:3,progress:0,groupId:'build'}, {id:'f',title:'Livegang',start,duration:0,progress:0,groupId:'build'}];
  p.dependencies=[{from:'a',to:'b',type:'FS',lag:0},{from:'b',to:'c',type:'FS',lag:0},{from:'c',to:'d',type:'SS',lag:2},{from:'c',to:'e',type:'FS',lag:0},{from:'d',to:'e',type:'FS',lag:0},{from:'e',to:'f',type:'FS',lag:0}]; return schedule(p);
}
