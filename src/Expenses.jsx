import React,{useEffect,useState} from 'react';
import {projectSummary,taskFinancialTotals,financialSummary,taskSpent,taskRemaining} from './summary.js';
import {fixedCostTotals} from './costs.js';
import FixedCosts from './FixedCosts.jsx';
import WeekHours from './WeekHours.jsx';
import {buildRows,itemColor} from './hierarchy.js';
import {taskTeamSummary,spentTotals} from './team.js';
const currency=value=>value===null?'—':new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(value);
const hours=value=>value===null?'—':`${new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2}).format(value)} u`;
const VIEWS={totals:'Totalen',team:'Per activiteit & teamlid',weeks:'Weekuren',fixed:'Vaste kosten'};
const HEADINGS={totals:'per taak',team:'per activiteit en teamlid',weeks:'· weekuren',fixed:'· vaste kosten'};
const INTROS={totals:'Bedragen in euro, ex BTW. Budget is de afgesproken opbrengst; verwacht resultaat = budget − gemaakte kosten − nog verwachte kosten.',team:'Toegewezen urenbudget en geschreven uren per teamlid. Bedragen volgen de uurtarieven uit Projectteam.',weeks:'Uren per week, per activiteit en per teamlid, en het percentage gereed per activiteit.',fixed:'Reis- en verblijfkosten, rekencluster, druk- en printwerk en andere kosten buiten de uren. Regels vrij toe te voegen.'};
export default function Expenses({project,onCommit,onPendingChange,onEdit,readOnly=false}) {
  const [draft,setDraft]=useState(null),[localError,setLocalError]=useState(''),[view,setView]=useState('totals');
  const model=draft||project;
  const summary=projectSummary(model),totals=taskFinancialTotals(model);
  const teamSummaries=model.tasks.map(t=>taskTeamSummary(model,t)),teamHours=teamSummaries.reduce((sum,t)=>sum+t.hours,0),teamCost=teamSummaries.some(t=>t.count)&&teamSummaries.every(t=>!t.incomplete)?teamSummaries.reduce((sum,t)=>sum+(t.cost||0),0):null;
  const taskRows=buildRows(model).filter(row=>row.kind==='task');
  useEffect(()=>{setDraft(null);setLocalError('');},[project]);
  useEffect(()=>{onPendingChange(Boolean(draft));},[draft,onPendingChange]);
  function update(id,key,raw) {
    const next=structuredClone(draft||project),task=next.tasks.find(t=>t.id===id);
    if(key==='progress')task.progress=raw===''?'':Number(raw);
    else task.finances={...task.finances,[key]:raw===''?null:Number(raw)};
    setDraft(next);setLocalError('');
  }
  function updateAssignment(id,memberId,key,raw) {
    const next=structuredClone(draft||project),assignment=next.tasks.find(t=>t.id===id).teamAssignments.find(a=>a.memberId===memberId);
    assignment[key]=raw===''?null:Number(raw);
    setDraft(next);setLocalError('');
  }
  function updateWeekHours(week,taskId,memberId,raw) {
    const next=structuredClone(draft||project),entries=(next.timeEntries||[]).filter(e=>!(e.week===week&&e.taskId===taskId&&e.memberId===memberId));
    if(raw!=='')entries.push({week,taskId,memberId,hours:Number(raw)});
    next.timeEntries=entries;
    setDraft(next);setLocalError('');
  }
  function updateFixedCosts(fixedCosts) {
    const next=structuredClone(draft||project);next.fixedCosts=fixedCosts;
    setDraft(next);setLocalError('');
  }
  function apply(e) {
    e.preventDefault();
    if(model.tasks.some(t=>typeof t.progress!=='number'||!Number.isFinite(t.progress)||t.progress<0||t.progress>100)){setLocalError('Vul voor iedere taak een percentage van 0 tot en met 100 in.');return;}
    if(model.tasks.some(t=>(t.teamAssignments||[]).some(a=>a.budgetHours===null))){setLocalError('Vul voor ieder toegewezen teamlid een urenbudget in (0 mag).');return;}
    if((model.fixedCosts||[]).some(c=>!c.description.trim()||c.amountExVat===null||c.vatRate===null)){setView('fixed');setLocalError('Vul bij iedere vaste-kostenregel een omschrijving, bedrag en BTW-percentage in.');return;}
    if(onCommit(model)){setDraft(null);setLocalError('');}
  }
  const taskHead=(t,row)=><th scope="row" style={{borderLeft:`4px solid ${itemColor(t,model)}`,background:`${itemColor(t,model)}14`,paddingLeft:12+(row.isSubtask?18:0)}}><button type="button" onClick={()=>onEdit(t)}>{t.title}</button><small>{model.groups.find(g=>g.id===t.groupId)?.name||'Zonder groep'}{t.parentTaskId&&` / ${model.tasks.find(parent=>parent.id===t.parentTaskId)?.title} / subtaak`}</small></th>;
  const allAssignments=teamSummaries.flatMap(s=>s.assignments),spentAll=spentTotals(allAssignments),projectFixed=fixedCostTotals(model,null);
  return <section className="expenses" aria-label="Bestedingen en kosten">
    <form onSubmit={apply}>
      <div className="expenses-toolbar"><div><h2>Bestedingen en kosten {HEADINGS[view]}</h2><p>{INTROS[view]}</p></div>
        <div className="view-switch" role="tablist" aria-label="Weergave bestedingen en kosten">{Object.entries(VIEWS).map(([key,label])=><button key={key} type="button" role="tab" aria-selected={view===key} onClick={()=>setView(key)}>{label}</button>)}</div>
        <div className="expense-actions edit-only"><span role="status">{draft?'Niet toegepast':'Alle wijzigingen toegepast'}</span><button type="button" disabled={!draft} onClick={()=>{setDraft(null);setLocalError('');}}>Annuleren</button><button className="primary" disabled={!draft}>Wijzigingen toepassen</button></div></div>
      {localError&&<div className="message error" role="alert">{localError}</div>}
      {view==='totals'&&<>
      <div className="expenses-scroll"><table><thead><tr><th scope="col">Taak / groep</th><th scope="col">Budget (€)</th><th scope="col">Gereed (%)</th><th scope="col" title="Berekend: geschreven uren × uurtarief + gemaakte vaste kosten">Gemaakte kosten (€) <small>berekend</small></th><th scope="col" title="Handmatige prognose + verwachte vaste kosten">Nog verwacht (€)</th><th scope="col">Verwacht totaal</th><th scope="col">Winst / verlies</th><th scope="col">Teamuren</th><th scope="col">Teambudget (EUR)</th></tr></thead><tbody>{taskRows.map(row=>{const t=row.task;
        const f=t.finances||{},spentParts=taskSpent(model,t),spent=spentParts.value,remaining=taskRemaining(model,t),{forecast,result}=financialSummary({budget:f.budget??null,spent,remaining:remaining.value}),team=taskTeamSummary(model,t);
        return <tr key={t.id}>{taskHead(t,row)}{['budget','progress','spent','remaining'].map(key=>key==='spent'?<td key={key} className="money computed" title={`Uren: ${currency(spentParts.team)} · vaste kosten: ${currency(spentParts.fixed)}`}>{currency(spent)}{team.spentCount>0&&spent===null&&<small className="allocation-warning">Tarief ontbreekt</small>}</td>:<td key={key}><input disabled={readOnly} aria-label={`${t.title} · ${{budget:'budget',progress:'percentage gereed',spent:'gemaakte kosten',remaining:'nog verwachte kosten'}[key]}`} type="number" min="0" max={key==='progress'?100:undefined} step={key==='progress'?'1':'0.01'} required={key==='progress'} placeholder="—" value={key==='progress'?t.progress:f[key]??''} onChange={e=>update(t.id,key,e.target.value)}/>{key==='remaining'&&remaining.fixed>0&&<small className="fixed-hint">+ {currency(remaining.fixed)} vaste kosten</small>}</td>)}<td className="money">{currency(forecast)}</td><td className={`money ${result===null?'':result<0?'loss':'profit'}`}>{result===null?'—':`${result<0?'−':'+'}${currency(Math.abs(result))}`}</td><td className="money" title={team.assignments.map(a=>`${a.member?.name}: ${a.hours} u`).join('; ')}>{team.count?hours(team.hours):'—'}</td><td className="money">{currency(team.cost)}{team.incomplete&&<small className="allocation-warning">Tarief ontbreekt</small>}</td></tr>;
      })}{(projectFixed.spentCount>0||projectFixed.expectedCount>0)&&<tr className="project-fixed-row"><th scope="row"><button type="button" onClick={()=>setView('fixed')}>Projectbrede vaste kosten</button><small>Niet aan een activiteit gekoppeld</small></th><td className="money">—</td><td className="money">—</td><td className="money computed">{currency(projectFixed.spent)}</td><td className="money">{currency(projectFixed.expected)}</td><td className="money">{currency(projectFixed.spent+projectFixed.expected)}</td><td className="money">—</td><td className="money">—</td><td className="money">—</td></tr>}</tbody><tfoot><tr><th scope="row">Totaal ingevulde bedragen</th><td className="money">{currency(totals.budget.sum)}</td><td className="money">{Math.round(summary.progress)}%</td><td className="money">{currency(totals.spent.sum)}</td><td className="money">{currency(totals.remaining.sum)}</td><td className="money">{currency(summary.forecast)}</td><td className={`money ${summary.result===null?'':summary.result<0?'loss':'profit'}`}>{summary.result===null?'—':`${summary.result<0?'−':'+'}${currency(Math.abs(summary.result))}`}</td><td className="money">{hours(teamHours)}</td><td className="money">{currency(teamCost)}</td></tr></tfoot></table>{!model.tasks.length&&<div className="empty"><h3>Nog geen taken</h3><p>Voeg eerst taken toe in de tab Planning.</p></div>}</div>
      <div className="expenses-note">Ingevuld: budget {totals.budget.count}/{model.tasks.length} taken · gemaakte kosten bij {totals.spent.count} post(en) · nog verwacht {totals.remaining.count}/{model.tasks.length}. Leeg betekent onbekend; vul 0 in wanneer er geen kosten (meer) zijn. Gemaakte kosten = geschreven uren × uurtarief per teamlid + gemaakte vaste kosten. Nog verwacht = je eigen prognose + verwachte vaste kosten. <strong>Pas wijzigingen toe en sla daarna je projectbestand op.</strong>{!totals.budget.complete&&summary.budget!==null&&<span> De projectbalk gebruikt voorlopig het bestaande projectbudget totdat alle taakbudgetten zijn ingevuld.</span>}</div>
      </>}
      {view==='team'&&<>
      <div className="expenses-scroll"><table className="team-expenses"><thead><tr><th scope="col">Activiteit / teamlid</th><th scope="col">Urenbudget</th><th scope="col">Teambudget (€)</th><th scope="col" title="Startsaldo (uren van vóór de weekregistratie) + alle weekuren">Geschreven uren <small>startsaldo + weken</small></th><th scope="col">Besteed (€)</th><th scope="col">Resterend</th><th scope="col">Verbruik</th></tr></thead>
        {taskRows.map(row=>{const t=row.task,team=taskTeamSummary(model,t);
          return <tbody key={t.id} className="activity-block"><tr className="activity-row">{taskHead(t,row)}{team.count?<UsageCells budgetHours={team.hours} cost={team.cost} spentHours={team.spentCount?team.spentHours:null} spentCost={team.spentCost} incomplete={team.incomplete}/>:<td colSpan="6" className="activity-empty">Geen teamleden toegewezen. Wijs ze toe via de taak.</td>}</tr>
            {team.assignments.map(a=><tr key={a.memberId} className="member-row"><th scope="row"><span>{a.member?.name||'Onbekend teamlid'}</span>{a.member?.role&&<small>{a.member.role}</small>}</th>
              <td><input disabled={readOnly} required aria-label={`${t.title} · urenbudget ${a.member?.name||''}`} type="number" min="0" step="any" placeholder="—" value={a.budgetHours??''} onChange={e=>updateAssignment(t.id,a.memberId,'budgetHours',e.target.value)}/></td>
              <td className="money">{currency(a.cost)}{a.reason&&a.cost===null&&<small className="allocation-warning">{a.reason}</small>}</td>
              <td><input disabled={readOnly} aria-label={`${t.title} · startsaldo geschreven uren ${a.member?.name||''}`} title="Startsaldo: uren van vóór de weekregistratie" type="number" min="0" step="any" placeholder="—" value={a.openingHours??''} onChange={e=>updateAssignment(t.id,a.memberId,'spentHours',e.target.value)}/>{a.weekHours>0&&<small className="fixed-hint">+ {hours(a.weekHours)} weken = {hours(a.spentHours)}</small>}</td>
              <UsageCells budgetHours={a.hours} spentHours={a.spentHours} spentCost={a.spentCost} only="usage"/></tr>)}
          </tbody>;})}
        <tfoot><tr><th scope="row">Totaal projectteam</th><UsageCells budgetHours={teamHours} cost={teamCost} spentHours={spentAll.spentCount?spentAll.spentHours:null} spentCost={spentAll.spentCost}/></tr></tfoot></table>{!model.tasks.length&&<div className="empty"><h3>Nog geen taken</h3><p>Voeg eerst taken toe in de tab Planning.</p></div>}</div>
      <div className="expenses-note">Geschreven uren: {spentAll.spentCount}/{allAssignments.length} toewijzingen ingevuld. Geschreven = startsaldo + weekuren (zie Weekuren). Leeg betekent nog niet bijgewerkt. Geschreven uren worden gewaardeerd tegen het gemiddelde uurtarief over de taakperiode en vormen samen met de gemaakte vaste kosten de gemaakte kosten in Totalen. <strong>Pas wijzigingen toe en sla daarna je projectbestand op.</strong></div>
      </>}
      {view==='weeks'&&<WeekHours project={model} taskRows={taskRows} readOnly={readOnly} onHours={updateWeekHours} onProgress={(id,raw)=>update(id,'progress',raw)} onEdit={onEdit}/>}
      {view==='fixed'&&<FixedCosts project={model} taskRows={taskRows} readOnly={readOnly} onChange={updateFixedCosts}/>}
    </form>
  </section>;
}
// Toont budget/besteed/resterend/verbruik; `only="usage"` laat de urenbudget-, teambudget- en geschreven-urenkolom weg (die zijn dan invoervelden).
function UsageCells({budgetHours,cost=null,spentHours,spentCost,incomplete=false,only}) {
  const remaining=budgetHours!==null&&spentHours!==null?budgetHours-spentHours:null,usage=budgetHours>0&&spentHours!==null?spentHours/budgetHours*100:null,over=remaining!==null&&remaining<0;
  return <>
    {only!=='usage'&&<><td className="money">{hours(budgetHours)}</td><td className="money">{currency(cost)}{incomplete&&<small className="allocation-warning">Tarief ontbreekt</small>}</td><td className="money">{hours(spentHours)}</td></>}
    <td className="money">{currency(spentCost)}</td>
    <td className={`money ${over?'loss':''}`}>{remaining===null?'—':over?`${hours(-remaining)} over`:hours(remaining)}</td>
    <td className={`money ${over?'loss':''}`}>{usage===null?'—':<span className="usage"><progress max="100" value={Math.min(100,usage)}/>{Math.round(usage)}%</span>}</td>
  </>;
}
