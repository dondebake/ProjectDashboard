import {day,daysBetween,validDate,finish,addWork} from './engine.js';

export const MEETING_TYPES={team:{label:'Projectteam',color:'#007bc7'},stakeholder:{label:'Stakeholders',color:'#b36b00'},steering:{label:'Stuurgroep',color:'#166d56'},workshop:{label:'Werksessie',color:'#7452a3'},other:{label:'Overig',color:'#566779'}};
export const MOVING_COLOR='#7c3aed';
export const DEADLINE_COLOR='#ce303d';
export const weekdayNames=['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];

export function validateTimeline(project) {
  if(project.meetings!==undefined&&!Array.isArray(project.meetings))throw Error('Bijeenkomsten moeten een lijst zijn.');
  const ids=new Set();
  for(const m of project.meetings||[]) {
    if(typeof m.id!=='string'||!m.id||ids.has(m.id)||typeof m.title!=='string'||!m.title.trim()||!MEETING_TYPES[m.kind]||!validDate(m.date))throw Error('Ongeldige bijeenkomst. Controleer naam, soort en datum.');
    ids.add(m.id);
    if(m.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time))throw Error('Gebruik een geldige tijd (UU:MM).');
    const r=m.recurrence;
    if(!r)continue;
    if(!['weekly','monthly'].includes(r.frequency)||!Number.isInteger(r.interval)||r.interval<1||r.interval>120||!validDate(r.until)||r.until<m.date||daysBetween(m.date,r.until)>3660||!Number.isInteger(r.weekday)||r.weekday<0||r.weekday>6)throw Error('Ongeldige herhaling. Kies een weekdag, interval en einddatum (maximaal 10 jaar).');
    if(r.frequency==='monthly'&&![1,2,3,4,5,-1].includes(r.ordinal))throw Error('Kies de eerste, tweede, derde, vierde, vijfde of laatste weekdag.');
    if(m.exceptions!==undefined&&(!Array.isArray(m.exceptions)||m.exceptions.some(s=>!validDate(s))))throw Error('Ongeldige uitgezonderde bijeenkomstdatum.');
  }
  for(const task of project.tasks||[]) {
    const m=task.endMilestone;if(!m)continue;
    if(!['moving','deadline'].includes(m.mode))throw Error('Kies een meeschuivende mijlpaal of een vaste deadline.');
    if(m.mode==='deadline'&&!validDate(m.date))throw Error(`Vul een vaste deadlinedatum in voor ${task.title}.`);
    if(m.title!==undefined&&typeof m.title!=='string')throw Error('Ongeldige mijlpaalnaam.');
  }
}

export function nthWeekday(year,month,weekday,ordinal) {
  const first=new Date(Date.UTC(year,month,1,12)),last=new Date(Date.UTC(year,month+1,0,12));
  const number=ordinal===-1?last.getUTCDate()-((last.getUTCDay()-weekday+7)%7):1+((weekday-first.getUTCDay()+7)%7)+(ordinal-1)*7;
  if(number>last.getUTCDate())return null;
  return `${year}-${String(month+1).padStart(2,'0')}-${String(number).padStart(2,'0')}`;
}

export function expandMeetings(project) {
  const result=[];
  for(const m of project.meetings||[]) {
    const dates=[],r=m.recurrence;
    if(!r)dates.push(m.date);
    else if(r.frequency==='weekly') {
      const dow=new Date(`${m.date}T12:00:00Z`).getUTCDay();
      for(let s=day(m.date,(r.weekday-dow+7)%7);s<=r.until;s=day(s,7*r.interval))dates.push(s);
    }else {
      const start=new Date(`${m.date}T12:00:00Z`),end=new Date(`${r.until}T12:00:00Z`),last=end.getUTCFullYear()*12+end.getUTCMonth();
      for(let index=start.getUTCFullYear()*12+start.getUTCMonth();index<=last;index+=r.interval) {
        const date=nthWeekday(Math.floor(index/12),index%12,r.weekday,r.ordinal);
        if(date&&date>=m.date&&date<=r.until)dates.push(date);
      }
    }
    for(const date of dates)if(!(m.exceptions||[]).includes(date))result.push({...m,date,seriesId:m.id,occurrenceId:m.recurrence?`@meeting:${m.id}:${date}`:`@meeting:${m.id}`});
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')||a.title.localeCompare(b.title));
}

export function planningNodes(project) {
  return [...project.tasks,...expandMeetings(project).map(m=>({...m,id:m.occurrenceId,seriesId:m.seriesId,start:m.date,duration:0,nodeType:'meeting'}))];
}

export function dependencyRequirement(pred,successor,dependency,calendar) {
  const lag=dependency.lag;
  if(dependency.type==='FS')return dayConstraint(finish(pred,calendar),lag+((pred.duration===0||successor.nodeType==='meeting')?0:1),calendar);
  if(dependency.type==='SS')return dayConstraint(pred.start,lag,calendar);
  const endpoint=dependency.type==='FF'?finish(pred,calendar):pred.start;
  return dayConstraint(dayConstraint(endpoint,lag,calendar),-Math.max(0,successor.duration-1),calendar);
}
function dayConstraint(date,n,calendar) {
  // Gebruik dezelfde werkdagrekenregels als taken, maar snap het vaste
  // bijeenkomstenmoment zelf nooit naar een andere dag.
  return addWork(date,n,calendar);
}
export function dependencyConflicts(project) {
  const nodes=new Map(planningNodes(project).map(node=>[node.id,node]));
  return project.dependencies.flatMap(d=>{
    const pred=nodes.get(d.from),target=nodes.get(d.to);
    if(!pred||!target||target.nodeType!=='meeting')return [];
    const required=dependencyRequirement(pred,target,d,project.calendar);
    const timeConflict=required===target.start&&pred.nodeType==='meeting'&&pred.time&&target.time&&pred.time>target.time;
    return required>target.start||timeConflict?[{dependency:d,meeting:target,predecessor:pred,required,timeConflict:Boolean(timeConflict)}]:[];
  });
}

export function milestoneItems(project) {
  return project.tasks.flatMap(task=>{
    const definition=task.endMilestone;
    if(!definition&&task.duration!==0)return [];
    const mode=definition?.mode||'moving',planned=finish(task,project.calendar),date=mode==='deadline'?definition.date:planned;
    return [{id:`milestone:${task.id}`,taskId:task.id,title:definition?.title?.trim()||task.title,taskTitle:task.title,date,planned,mode,color:mode==='deadline'?DEADLINE_COLOR:MOVING_COLOR,late:mode==='deadline'&&planned>date,standalone:task.duration===0}];
  });
}

export function recurrenceLabel(meeting) {
  const r=meeting.recurrence;if(!r)return 'Eenmalig';
  const order={1:'eerste',2:'tweede',3:'derde',4:'vierde',5:'vijfde',[-1]:'laatste'};
  return r.frequency==='weekly'?`Elke ${r.interval===1?'':r.interval+' weken op '}${weekdayNames[r.weekday]} t/m ${r.until}`:`${order[r.ordinal]} ${weekdayNames[r.weekday]} van ${r.interval===1?'elke maand':`elke ${r.interval} maanden`} t/m ${r.until}`;
}

// Markeringen die op dezelfde plek vallen blijven op één rij: een badge
// maakt alle onderliggende datums en items via hover en de keuzelijst bereikbaar.
export function clusterSymbols(items,start,zoom) {
  const groups=[];
  for(const item of [...items].sort((a,b)=>a.date.localeCompare(b.date))) {
    const x=(daysBetween(start,item.date)+.5)*zoom;
    let group={x,items:[item]};
    while(groups.length&&group.x-groups.at(-1).x<28) {
      const previous=groups.pop(),all=[...previous.items,...group.items];
      group={x:(previous.x*previous.items.length+group.x*group.items.length)/all.length,items:all};
    }
    groups.push(group);
  }
  return groups;
}
