import {validDate,addWork} from './engine.js';
import {isMonday} from './weeks.js';
const numeric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const money=value=>Math.round((value+Number.EPSILON)*100)/100;

export function validateTeam(project) {
  if(project.teamMembers!==undefined&&!Array.isArray(project.teamMembers))throw Error('Projectteam moet een lijst van teamleden zijn.');
  const members=new Map();
  for(const member of project.teamMembers||[]) {
    if(typeof member.id!=='string'||!member.id||members.has(member.id)||typeof member.name!=='string'||!member.name.trim()||!Array.isArray(member.rates))throw Error('Ongeldig teamlid. Controleer naam en tarieven.');
    members.set(member.id,member);
    const ids=new Set(),periods=[...member.rates].sort((a,b)=>a.start?.localeCompare(b.start||'')||0);
    for(let i=0;i<periods.length;i++) {
      const rate=periods[i];
      if(typeof rate.id!=='string'||!rate.id||ids.has(rate.id)||!validDate(rate.start)||!validDate(rate.end)||rate.end<rate.start||!numeric(rate.hourlyRate))throw Error(`Ongeldige tariefperiode voor ${member.name}. Vul start, eind en een positief tarief of nul in.`);
      ids.add(rate.id);
      if(i&&periods[i-1].end>=rate.start)throw Error(`Tariefperiodes van ${member.name} overlappen. Begin- en einddatum tellen beide mee.`);
    }
  }
  for(const task of project.tasks||[]) {
    if(task.teamAssignments!==undefined&&!Array.isArray(task.teamAssignments))throw Error('Teamtoewijzingen moeten een lijst zijn.');
    const assigned=new Set();
    for(const a of task.teamAssignments||[]) {
      if(!members.has(a.memberId))throw Error(`Kies een bestaand teamlid voor ${task.title}.`);
      if(assigned.has(a.memberId))throw Error(`Een teamlid kan maar één keer aan ${task.title} toegewezen worden.`);
      assigned.add(a.memberId);
      if(!numeric(a.budgetHours))throw Error(`Vul een urenbudget van nul of meer in voor ${task.title}.`);
      if(a.spentHours!==undefined&&a.spentHours!==null&&!numeric(a.spentHours))throw Error(`Geschreven uren voor ${task.title} moeten nul of meer zijn.`);
    }
  }
  if(project.timeEntries!==undefined&&!Array.isArray(project.timeEntries))throw Error('Weekuren moeten een lijst zijn.');
  const tasks=new Map((project.tasks||[]).map(t=>[t.id,t])),entries=new Set();
  for(const e of project.timeEntries||[]) {
    const task=tasks.get(e.taskId),member=members.get(e.memberId),key=`${e.week}:${e.taskId}:${e.memberId}`;
    if(!isMonday(e.week)||!task||!member||entries.has(key))throw Error('Ongeldige of dubbele weekregel in de urenregistratie.');
    entries.add(key);
    if(!task.teamAssignments?.some(a=>a.memberId===e.memberId))throw Error(`${member.name} heeft weekuren bij ${task.title}. Verwijder eerst die weekuren voordat je de toewijzing weghaalt.`);
    if(!numeric(e.hours))throw Error(`Weekuren van ${member.name} bij ${task.title} moeten nul of meer zijn.`);
  }
}

export function rateOn(member,date) {
  return member?.rates.find(rate=>rate.start<=date&&rate.end>=date)||null;
}

export function assignmentEstimate(project,task,assignment) {
  const member=project.teamMembers?.find(m=>m.id===assignment.memberId);
  // Geschreven uren = startsaldo (uren van vóór de weekregistratie) + de som van de weekuren.
  const hours=numeric(assignment.budgetHours)?assignment.budgetHours:null,openingHours=numeric(assignment.spentHours)?assignment.spentHours:null;
  const entries=(project.timeEntries||[]).filter(e=>e.taskId===task.id&&e.memberId===assignment.memberId&&numeric(e.hours)),weekHours=entries.reduce((sum,e)=>sum+e.hours,0);
  const spentHours=openingHours===null&&!entries.length?null:(openingHours||0)+weekHours;
  if(!member||hours===null||!validDate(task.start)||!Number.isInteger(task.duration)||task.duration<0||task.duration>36600)return {member,hours,spentHours,openingHours,weekHours,cost:null,spentCost:null,averageRate:null,periods:[],missing:[],reason:'Vul een geldig teamlid, urenbudget en taakplanning in.'};
  // Een nuldaagse mijlpaal gebruikt zijn eigen datum voor het tarief.
  const days=Math.max(1,task.duration),periods=new Map(),missing=[];
  let date=task.start,totalRates=0;
  for(let i=0;i<days;i++) {
    const rate=rateOn(member,date);
    if(!rate)missing.push(date);
    else {
      totalRates+=rate.hourlyRate;
      if(!periods.has(rate.id))periods.set(rate.id,{...rate,days:0,first:date,last:date});
      const period=periods.get(rate.id);period.days++;period.last=date;
    }
    if(i<days-1)date=addWork(date,1,project.calendar);
  }
  // Geschreven uren hebben geen datum; ze worden gewaardeerd tegen het gemiddelde tarief over de taakperiode.
  const averageRate=missing.length?null:totalRates/days;
  return {member,hours,spentHours,openingHours,weekHours,averageRate,cost:averageRate===null?null:money(hours*averageRate),spentCost:averageRate===null||spentHours===null?null:money(spentHours*averageRate),periods:[...periods.values()].map(p=>({...p,hours:hours*p.days/days})),missing,reason:missing.length?`Geen tarief op ${missing[0]}${missing.length>1?` en ${missing.length-1} andere werkdag(en)`:''}.`:null};
}

export function taskTeamSummary(project,task) {
  const assignments=(task.teamAssignments||[]).map(a=>({...a,...assignmentEstimate(project,task,a)}));
  return {assignments,count:assignments.length,hours:assignments.reduce((sum,a)=>sum+(a.hours||0),0),cost:assignments.length&&assignments.every(a=>a.cost!==null)?money(assignments.reduce((sum,a)=>sum+a.cost,0)):null,incomplete:assignments.some(a=>a.cost===null),...spentTotals(assignments)};
}

// Leeg = nog niet ingevuld; het besteed bedrag is pas bekend als alle ingevulde uren een tarief hebben.
export function spentTotals(assignments) {
  const known=assignments.filter(a=>a.spentHours!==null);
  return {spentCount:known.length,spentHours:known.reduce((sum,a)=>sum+a.spentHours,0),spentCost:known.length&&known.every(a=>a.spentCost!==null)?money(known.reduce((sum,a)=>sum+a.spentCost,0)):null};
}

export function memberSummary(project,memberId) {
  const assignments=project.tasks.flatMap(task=>(task.teamAssignments||[]).filter(a=>a.memberId===memberId).map(a=>({task,...assignmentEstimate(project,task,a)})));
  return {assignments,taskCount:assignments.length,hours:assignments.reduce((sum,a)=>sum+(a.hours||0),0),cost:assignments.every(a=>a.cost!==null)?money(assignments.reduce((sum,a)=>sum+a.cost,0)):null,incomplete:assignments.some(a=>a.cost===null)};
}

export function deleteTeamMember(project,id) {
  if(project.tasks.some(task=>task.teamAssignments?.some(a=>a.memberId===id)))throw Error('Dit teamlid is nog aan taken toegewezen. Verwijder eerst die toewijzingen.');
  const next=structuredClone(project);next.teamMembers=(next.teamMembers||[]).filter(m=>m.id!==id);return next;
}
