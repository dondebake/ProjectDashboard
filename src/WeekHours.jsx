import React,{useState} from 'react';
import {day} from './engine.js';
import {itemColor} from './hierarchy.js';
import {taskTeamSummary} from './team.js';
import {defaultWeek,weekLabel,weekHours,weekActivities} from './weeks.js';
const hours=value=>value===null?'—':`${new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2}).format(value)} u`;
export default function WeekHours({project,taskRows,readOnly=false,onHours,onProgress,onEdit}) {
  const [week,setWeek]=useState(()=>defaultWeek()),[all,setAll]=useState(false);
  const shown=new Set(weekActivities(project,week,{all}).map(t=>t.id)),rows=taskRows.filter(row=>shown.has(row.task.id));
  const members=(project.teamMembers||[]).filter(m=>project.tasks.some(t=>t.teamAssignments?.some(a=>a.memberId===m.id)));
  const entries=(project.timeEntries||[]).filter(e=>e.week===week&&shown.has(e.taskId)),total=key=>value=>entries.filter(e=>e[key]===value).reduce((sum,e)=>sum+e.hours,0);
  const memberTotal=total('memberId'),taskTotal=total('taskId');
  return <>
    <div className="week-bar"><button type="button" aria-label="Vorige week" onClick={()=>setWeek(day(week,-7))}>‹</button><strong>{weekLabel(week)}</strong><button type="button" aria-label="Volgende week" onClick={()=>setWeek(day(week,7))}>›</button><button type="button" onClick={()=>setWeek(defaultWeek())}>Laatste week</button>
      <label className="week-all"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>Ook afgeronde en latere activiteiten</label></div>
    <div className="expenses-scroll"><table className="week-hours"><thead><tr><th scope="col">Activiteit</th>{members.map(m=><th scope="col" key={m.id}>{m.name}</th>)}<th scope="col">Totaal week</th><th scope="col">Geschreven / budget</th><th scope="col">Gereed (%)</th></tr></thead>
      <tbody>{rows.map(({task:t,isSubtask})=>{const team=taskTeamSummary(project,t),over=team.spentCount&&team.spentHours>team.hours;
        return <tr key={t.id}><th scope="row" style={{borderLeft:`4px solid ${itemColor(t,project)}`,paddingLeft:12+(isSubtask?18:0)}}><button type="button" onClick={()=>onEdit(t)}>{t.title}</button></th>
          {members.map(m=>t.teamAssignments?.some(a=>a.memberId===m.id)?<td key={m.id}><input disabled={readOnly} aria-label={`${t.title} · uren ${m.name} · ${weekLabel(week)}`} type="number" min="0" step="any" placeholder="—" value={weekHours(project,week,t.id,m.id)??''} onChange={e=>onHours(week,t.id,m.id,e.target.value)}/></td>:<td key={m.id} className="not-assigned" title={`${m.name} staat niet op deze activiteit. Wijs toe via de taak.`}/>)}
          <td className="money">{hours(taskTotal(t.id))}</td>
          <td className={`money ${over?'loss':''}`}>{hours(team.spentCount?team.spentHours:0)} / {hours(team.hours)}</td>
          <td><input disabled={readOnly} required aria-label={`${t.title} · percentage gereed`} type="number" min="0" max="100" step="1" value={t.progress} onChange={e=>onProgress(t.id,e.target.value)}/></td></tr>;})}</tbody>
      <tfoot><tr><th scope="row">Totaal week</th>{members.map(m=><td key={m.id} className="money">{hours(memberTotal(m.id))}</td>)}<td className="money">{hours(entries.reduce((sum,e)=>sum+e.hours,0))}</td><td/><td/></tr></tfoot>
    </table>
    {!rows.length&&<div className="empty"><h3>Geen activiteiten in deze week</h3><p>{members.length?'Er lopen deze week geen activiteiten met teamleden. Vink "Ook afgeronde en latere activiteiten" aan om alles te tonen.':'Wijs eerst teamleden toe aan activiteiten via de taak.'}</p></div>}
    </div>
    <div className="expenses-note">Vul per week de uren per teamlid in. Geschreven uren = startsaldo (in "Per activiteit & teamlid") + alle weekuren. Een cel leegmaken verwijdert de weekregel; vul 0 in als iemand niets heeft geschreven. <strong>Pas wijzigingen toe en sla daarna je projectbestand op.</strong></div>
  </>;
}
