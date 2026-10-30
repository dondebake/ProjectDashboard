import React from 'react';
import {memberSummary,rateOn} from './team.js';
import {today} from './engine.js';
const currency=value=>value===null?'—':new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(value);
const hours=value=>new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2}).format(value);
export default function ProjectTeam({project,onEdit,onNew,readOnly}) {
  const members=project.teamMembers||[],summaries=members.map(m=>memberSummary(project,m.id));
  const totalHours=summaries.reduce((sum,s)=>sum+s.hours,0),totalCost=summaries.every(s=>s.cost!==null)?summaries.reduce((sum,s)=>sum+s.cost,0):null;
  return <section className="project-team"><div className="team-toolbar"><div><h2>Projectteam</h2><p>Uurtarieven gelden van startdatum tot en met einddatum. Urenbudgetten wijs je toe in de taakmodal.</p></div>{!readOnly&&<button className="primary" onClick={onNew}>+ Teamlid</button>}</div>
    <div className="team-scroll"><table className="team-table"><thead><tr><th>Teamlid</th><th>Rol</th><th>Tariefperiodes (inclusief start en eind)</th><th>Toegewezen taken</th><th>Urenbudget</th><th>Berekend teambudget</th><th aria-label="Acties"/></tr></thead><tbody>{members.map((member,index)=>{
      const summary=summaries[index],current=rateOn(member,today());
      return <tr key={member.id}><th scope="row"><button onClick={()=>onEdit(member)}>{member.name}</button>{current&&<small>Nu: {currency(current.hourlyRate)} / uur</small>}</th><td>{member.role||'—'}</td><td>{[...member.rates].sort((a,b)=>a.start.localeCompare(b.start)).map(r=><div className="rate-line" key={r.id}><span>{r.start} t/m {r.end}</span><strong>{currency(r.hourlyRate)} / uur</strong></div>)}{!member.rates.length&&<span className="allocation-warning">Nog geen tariefperiode</span>}</td><td className="numeric-cell">{summary.taskCount}</td><td className="numeric-cell">{hours(summary.hours)} u</td><td className="numeric-cell">{currency(summary.cost)}{summary.incomplete&&<small className="allocation-warning">Tarief ontbreekt bij een taak</small>}</td><td><button onClick={()=>onEdit(member)}>{readOnly?'Bekijken':'Bewerken'}</button></td></tr>;
    })}</tbody><tfoot><tr><th colSpan="4">Totaal projectteam · {members.length} teamleden</th><td className="numeric-cell">{hours(totalHours)} u</td><td className="numeric-cell">{currency(totalCost)}</td><td/></tr></tfoot></table>{!members.length&&<div className="empty"><h3>Stel je projectteam samen</h3><p>Voeg teamleden met hun tariefperiodes toe. Daarna kun je per taak of subtaak een urenbudget per persoon instellen.</p>{!readOnly&&<button className="primary" onClick={onNew}>+ Eerste teamlid</button>}</div>}</div>
    <div className="expenses-note">Uren worden evenredig verdeeld over de werkdagen tussen de start- en einddatum van elke taak. Het bedrag volgt de tarieven op die dagen. Een ontbrekend tarief maakt het bedrag onbekend. Dit teambudget staat apart van opbrengsten, gemaakte kosten en de handmatige kostenprognose.</div>
  </section>;
}
