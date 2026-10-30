import React from 'react';
import {taskTeamSummary} from './team.js';
const currency=value=>value===null?'—':new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(value);
const hours=value=>new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2}).format(value);
export default function AssignmentFields({task,project,onChange,readOnly}) {
  const members=project.teamMembers||[],assignments=task.teamAssignments||[],summary=taskTeamSummary(project,task);
  function update(index,key,value){onChange(assignments.map((a,i)=>i===index?{...a,[key]:value}:a));}
  function add(){const member=members.find(m=>!assignments.some(a=>a.memberId===m.id));if(member)onChange([...assignments,{memberId:member.id,budgetHours:null}]);}
  return <fieldset className="task-finances assignment-fields"><legend>Projectteam · urenbudget per teamlid</legend>
    {!members.length&&<p className="form-hint">Voeg eerst teamleden en tariefperiodes toe op de tab Projectteam.</p>}
    {assignments.length>0&&<div className="assignment-head"><span>Teamlid</span><span>Urenbudget</span><span title="Uren van vóór de weekregistratie; weekuren vul je in bij Bestedingen en kosten → Weekuren">Startsaldo uren</span><span>Budget / besteed</span><span/></div>}
    {assignments.map((a,index)=>{const estimate=summary.assignments[index];return <div className="assignment-entry" key={index}><div className="assignment-row"><select aria-label="Toegewezen teamlid" value={a.memberId} onChange={e=>update(index,'memberId',e.target.value)}>{members.filter(m=>m.id===a.memberId||!assignments.some(other=>other.memberId===m.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><input aria-label={`Urenbudget ${estimate.member?.name||''}`} required type="number" min="0" step="any" value={a.budgetHours??''} onChange={e=>update(index,'budgetHours',e.target.value===''?null:Number(e.target.value))}/><input aria-label={`Startsaldo geschreven uren ${estimate.member?.name||''}`} type="number" min="0" step="any" placeholder="—" value={a.spentHours??''} onChange={e=>update(index,'spentHours',e.target.value===''?null:Number(e.target.value))}/><strong className="numeric-cell">{currency(estimate.cost)}<small>{currency(estimate.spentCost)} besteed{estimate.weekHours>0&&` · ${hours(estimate.spentHours)} u geschreven`}</small></strong>{!readOnly&&<button type="button" aria-label="Teamtoewijzing verwijderen" onClick={()=>onChange(assignments.filter((_,i)=>i!==index))}>×</button>}</div>
      {estimate.reason&&<small className="allocation-warning">{estimate.reason}</small>}{estimate.periods.length>0&&<details className="assignment-breakdown"><summary>Tariefverdeling · {estimate.periods.length} periode(s)</summary>{estimate.periods.map(p=><div key={p.id}><span>{p.first} t/m {p.last}</span><span>{hours(p.hours)} u × {currency(p.hourlyRate)} / uur</span></div>)}</details>}
    </div>;})}
    {!readOnly&&members.length>0&&<button type="button" onClick={add} disabled={assignments.length>=members.length}>+ Teamlid toewijzen</button>}
    {assignments.length>0&&<div className="assignment-total"><strong>Totaal urenbudget: {hours(summary.hours)} u</strong><strong>Teambudget: {currency(summary.cost)}</strong><strong>Gemaakte kosten: {currency(summary.spentCount?summary.spentCost:null)}</strong></div>}
    <p className="form-hint">Uren worden gelijkmatig verdeeld over de werkdagen van de taak. Bij een tariefwijziging wordt ieder deel apart berekend. Dit is het geplande teambudget; de opbrengst en gemaakte kosten blijven aparte velden.</p>
  </fieldset>;
}
