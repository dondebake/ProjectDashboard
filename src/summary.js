import {taskTeamSummary} from './team.js';
import {fixedCostTotals} from './costs.js';
// Ontbrekende financiële gegevens blijven onbekend; nooit als nul presenteren.
const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const cents = value => Math.round((value+Number.EPSILON)*100);
const sumMoney = values => values.reduce((total,value)=>total+cents(value),0)/100;
// Gemaakte kosten worden niet ingevoerd maar berekend: geschreven uren × uurtarief per teamlid,
// plus de gemaakte vaste kosten (ex BTW) van de activiteit.
// null = nog niets geschreven of geboekt, of een ontbrekend tarief maakt het bedrag onbekend.
export function taskSpent(project,task) {
  const team=taskTeamSummary(project,task),fixed=fixedCostTotals(project,task.id);
  const teamCost=team.spentCount?team.spentCost:0,entered=team.spentCount>0||fixed.spentCount>0;
  return {value:!entered||teamCost===null?null:sumMoney([teamCost,fixed.spent]),entered,team:team.spentCount?team.spentCost:null,fixed:fixed.spent};
}
// Nog verwacht = handmatige prognose + verwachte vaste kosten. Zonder handmatige prognose blijft het onbekend.
export function taskRemaining(project,task) {
  const manual=amount(task.finances?.remaining),fixed=fixedCostTotals(project,task.id);
  return {value:manual===null?null:sumMoney([manual,fixed.expected]),manual,fixed:fixed.expected};
}
export function taskFinancialTotals(project) {
  const budgets=project.tasks.map(t=>amount(t.finances?.budget)).filter(value=>value!==null);
  const totals={budget:{sum:sumMoney(budgets),count:budgets.length,complete:project.tasks.length>0&&budgets.length===project.tasks.length}};
  const projectFixed=fixedCostTotals(project,null);
  const remaining=project.tasks.map(t=>taskRemaining(project,t).value).filter(value=>value!==null);
  totals.remaining={sum:sumMoney([...remaining,projectFixed.expected]),count:remaining.length,complete:project.tasks.length>0&&remaining.length===project.tasks.length};
  // Taken zonder geschreven uren of vaste kosten hebben (nog) geen kosten; alleen een ontbrekend tarief maakt het totaal onbekend.
  const spent=project.tasks.map(t=>taskSpent(project,t)).filter(s=>s.entered);
  if(projectFixed.spentCount)spent.push({value:projectFixed.spent});
  const values=spent.map(s=>s.value).filter(value=>value!==null);
  totals.spent={sum:sumMoney(values),count:spent.length,complete:spent.length>0&&values.length===spent.length};
  return totals;
}
export function financialInputs(project) {
  const legacy = project.legacySource?.project || {};
  const totals=taskFinancialTotals(project);
  const totalOrFallback=(key,fallback)=>totals[key].complete?totals[key].sum:totals[key].count>0?null:amount(fallback);
  return {
    budget: totalOrFallback('budget',project.finances?.budget ?? project.budget ?? legacy.budget),
    spent: totalOrFallback('spent',project.finances?.spent ?? project.spent ?? legacy.spent),
    remaining: totalOrFallback('remaining',project.finances?.remaining),
  };
}
export function projectSummary(project) {
  const tasks = project.tasks;
  // Uren bepalen het gewicht wanneer alle taken een urenraming hebben.
  // Anders telt iedere taak even zwaar, inclusief mijlpalen.
  const hours = tasks.map(t => amount(t.estimated_hours));
  const weighted = tasks.length > 0 && hours.every(h => h !== null) && hours.reduce((a,b)=>a+b,0) > 0;
  const denominator = weighted ? hours.reduce((a,b)=>a+b,0) : tasks.length;
  const progress = denominator ? tasks.reduce((sum,t,i)=>sum+t.progress*(weighted?hours[i]:1),0)/denominator : 0;
  return {
    progress, progressBasis: weighted ? 'gewogen naar geraamde uren' : 'gemiddelde van alle taken',
    ...financialSummary(financialInputs(project)),
  };
}

export function financialSummary({budget=null,spent=null,remaining=null}) {
  const forecast = spent !== null && remaining !== null ? sumMoney([spent,remaining]) : null;
  return {
    budget, spent, remaining, forecast,
    utilization: budget !== null && budget > 0 && spent !== null ? spent/budget*100 : null,
    forecastUtilization: budget !== null && budget > 0 && forecast !== null ? forecast/budget*100 : null,
    result: budget !== null && forecast !== null ? (cents(budget)-cents(forecast))/100 : null,
  };
}

export function validateFinances(project) {
  const records=[{finances:project.finances,label:''},...(Array.isArray(project.tasks)?project.tasks.map(t=>({finances:t.finances,label:` (${t.title})`})) : [])];
  for(const record of records) {
    if(!record.finances)continue;
    for (const [key, label] of [['budget','Budget'],['spent','Gemaakte kosten'],['remaining','Nog verwachte kosten']]) {
      const value=record.finances[key];
      if(value !== null && value !== undefined && amount(value) === null) throw Error(`${label}${record.label} moet een bedrag van nul of meer zijn.`);
    }
  }
}
