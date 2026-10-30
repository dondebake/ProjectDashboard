import React from 'react';
import {COST_CATEGORIES,COST_STATUS,costAmounts,exVatFromIncl,newFixedCost} from './costs.js';
const currency=value=>value===null?'—':new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(value);
const sum=(costs,key)=>costs.reduce((total,cost)=>total+(costAmounts(cost)[key]||0),0);
export default function FixedCosts({project,taskRows,readOnly=false,onChange}) {
  const costs=project.fixedCosts||[];
  const update=(id,changes)=>onChange(costs.map(c=>c.id===id?{...c,...changes}:c));
  const number=raw=>raw===''?null:Number(raw);
  const byStatus=status=>costs.filter(c=>c.status===status);
  return <>
    <div className="expenses-scroll"><table className="fixed-costs"><thead><tr><th scope="col">Omschrijving</th><th scope="col">Categorie</th><th scope="col">Activiteit</th><th scope="col">Datum</th><th scope="col">Status</th><th scope="col">Ex BTW (€)</th><th scope="col">BTW %</th><th scope="col">BTW (€)</th><th scope="col">Incl BTW (€)</th><th scope="col" aria-label="Acties"/></tr></thead>
      <tbody>{costs.map(c=>{const amounts=costAmounts(c);return <tr key={c.id}>
        <th scope="row"><input disabled={readOnly} required aria-label="Omschrijving" placeholder="Bijv. treinreis Delft" value={c.description} onChange={e=>update(c.id,{description:e.target.value})}/></th>
        <td><input disabled={readOnly} aria-label="Categorie" list="cost-categories" placeholder="Categorie" value={c.category||''} onChange={e=>update(c.id,{category:e.target.value})}/></td>
        <td><select disabled={readOnly} aria-label="Activiteit" value={c.taskId||''} onChange={e=>update(c.id,{taskId:e.target.value||null})}><option value="">Projectbreed</option>{taskRows.map(({task,isSubtask})=><option key={task.id} value={task.id}>{isSubtask?'— ':''}{task.title}</option>)}</select></td>
        <td><input disabled={readOnly} aria-label="Datum" type="date" value={c.date||''} onChange={e=>update(c.id,{date:e.target.value||null})}/></td>
        <td><select disabled={readOnly} aria-label="Status" value={c.status} onChange={e=>update(c.id,{status:e.target.value})}>{Object.entries(COST_STATUS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></td>
        <td><input disabled={readOnly} required aria-label="Bedrag ex BTW" type="number" min="0" step="0.01" placeholder="—" value={c.amountExVat??''} onChange={e=>update(c.id,{amountExVat:number(e.target.value)})}/></td>
        <td><input disabled={readOnly} required aria-label="BTW-percentage" className="vat-input" type="number" min="0" max="100" step="any" list="vat-rates" value={c.vatRate??''} onChange={e=>update(c.id,{vatRate:number(e.target.value)})}/></td>
        <td className="money">{currency(amounts.vat)}</td>
        <td><input disabled={readOnly||c.vatRate===null} aria-label="Bedrag incl BTW" title="Vul incl BTW in; het bedrag ex BTW wordt teruggerekend" type="number" min="0" step="0.01" placeholder="—" value={amounts.inclVat??''} onChange={e=>{const incl=number(e.target.value);update(c.id,{amountExVat:incl===null?null:exVatFromIncl(incl,c.vatRate||0)});}}/></td>
        <td>{!readOnly&&<button type="button" className="row-control row-delete" aria-label={`${c.description||'Kostenregel'} verwijderen`} onClick={()=>onChange(costs.filter(x=>x.id!==c.id))}>×</button>}</td>
      </tr>;})}</tbody>
      <tfoot>{[['spent','Totaal gemaakt',byStatus('spent')],['expected','Totaal verwacht',byStatus('expected')],['all','Totaal vaste kosten',costs]].map(([key,label,rows])=><tr key={key}><th scope="row" colSpan="5">{label} · {rows.length} regel(s)</th><td className="money">{currency(sum(rows,'exVat'))}</td><td/><td className="money">{currency(sum(rows,'vat'))}</td><td className="money">{currency(sum(rows,'inclVat'))}</td><td/></tr>)}</tfoot>
    </table>
    {!costs.length&&<div className="empty"><h3>Nog geen vaste kosten</h3><p>Voeg kosten toe die niet uit uren × uurtarief komen, zoals reis- en verblijfkosten, rekencluster of drukwerk.</p></div>}
    {!readOnly&&<div className="panel-add"><button type="button" className="add-row" onClick={()=>onChange([...costs,newFixedCost(crypto.randomUUID())])}>+ Kostenregel</button></div>}
    <datalist id="cost-categories">{COST_CATEGORIES.map(c=><option key={c} value={c}/>)}</datalist><datalist id="vat-rates">{[21,9,0].map(v=><option key={v} value={v}/>)}</datalist>
    </div>
    <div className="expenses-note">Vaste kosten zijn kosten die niet uit uren × uurtarief komen. <strong>Gemaakt</strong> telt mee in de gemaakte kosten, <strong>Verwacht</strong> in nog verwacht. Totalen en resultaat rekenen ex BTW; incl BTW is ter informatie. Zonder activiteit tellen de kosten projectbreed. <strong>Pas wijzigingen toe en sla daarna je projectbestand op.</strong></div>
  </>;
}
