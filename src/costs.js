import {validDate} from './engine.js';
// Vaste kosten: alles wat niet uit uren × uurtarief komt (reis- en verblijfkosten, rekencluster, drukwerk, ...).
// Opgeslagen wordt het bedrag ex BTW plus het BTW-percentage; BTW en incl. BTW worden berekend.
// Projecttotalen rekenen ex BTW, net als budgetten en uurtarieven.
export const COST_CATEGORIES=['Reis- en verblijfkosten','Rekencluster','Druk- en printwerk','Inhuur derden','Software en licenties','Overig'];
export const COST_STATUS={spent:'Gemaakt',expected:'Verwacht'};
export const DEFAULT_VAT=21;
const numeric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const money=value=>Math.round((value+Number.EPSILON)*100)/100;

export function newFixedCost(id) {
  return {id,description:'',category:'',taskId:null,date:null,status:'spent',amountExVat:null,vatRate:DEFAULT_VAT};
}
export function costAmounts(cost) {
  if(!numeric(cost.amountExVat)||!numeric(cost.vatRate))return {exVat:null,vat:null,inclVat:null};
  const vat=money(cost.amountExVat*cost.vatRate/100);
  return {exVat:cost.amountExVat,vat,inclVat:money(cost.amountExVat+vat)};
}
// Invoer incl. BTW wordt teruggerekend naar ex BTW, afgerond op centen.
export function exVatFromIncl(inclVat,vatRate) {
  return money(inclVat/(1+vatRate/100));
}
export function validateFixedCosts(project) {
  if(project.fixedCosts===undefined)return;
  if(!Array.isArray(project.fixedCosts))throw Error('Vaste kosten moeten een lijst zijn.');
  const ids=new Set(),tasks=new Set((project.tasks||[]).map(t=>t.id));
  for(const cost of project.fixedCosts) {
    const label=cost.description?.trim()?` (${cost.description.trim()})`:'';
    if(typeof cost.id!=='string'||!cost.id||ids.has(cost.id))throw Error('Ongeldige of dubbele vaste-kostenregel.');
    ids.add(cost.id);
    if(typeof cost.description!=='string'||!cost.description.trim())throw Error('Vul voor iedere vaste-kostenregel een omschrijving in.');
    if(!numeric(cost.amountExVat))throw Error(`Vul een bedrag ex BTW van nul of meer in${label}.`);
    if(!numeric(cost.vatRate)||cost.vatRate>100)throw Error(`Het BTW-percentage moet tussen 0 en 100 liggen${label}.`);
    if(!COST_STATUS[cost.status])throw Error(`Kies of de kosten gemaakt of verwacht zijn${label}.`);
    if(cost.taskId&&!tasks.has(cost.taskId))throw Error(`De gekoppelde activiteit bestaat niet meer${label}.`);
    if(cost.date&&!validDate(cost.date))throw Error(`Ongeldige datum${label}.`);
  }
}
// taskId: een taak-ID, of null voor projectbrede kosten (niet aan een activiteit gekoppeld).
export function fixedCostTotals(project,taskId) {
  const totals={spent:0,expected:0,spentCount:0,expectedCount:0};
  for(const cost of project.fixedCosts||[]) {
    if((cost.taskId||null)!==taskId)continue;
    const {exVat}=costAmounts(cost);
    if(exVat===null)continue;
    totals[cost.status]=money(totals[cost.status]+exVat);totals[`${cost.status}Count`]++;
  }
  return totals;
}
