import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,parseProject,schedule} from '../src/engine.js';
import {costAmounts,exVatFromIncl,fixedCostTotals} from '../src/costs.js';
import {projectSummary,taskSpent,taskRemaining} from '../src/summary.js';
import {deleteTaskTree} from '../src/hierarchy.js';
const cost=(id,amountExVat,extra={})=>({id,description:'Kosten '+id,category:'Overig',taskId:null,date:null,status:'spent',amountExVat,vatRate:21,...extra});
const task=(id,finances={})=>({id,title:id,start:'2026-10-23',duration:1,progress:0,groupId:null,finances});

test('VAT is calculated from the amount ex VAT and incl VAT converts back to cents',()=>{
  assert.deepEqual(costAmounts(cost('a',100)),{exVat:100,vat:21,inclVat:121});
  assert.deepEqual(costAmounts(cost('a',100,{vatRate:9})),{exVat:100,vat:9,inclVat:109});
  assert.equal(exVatFromIncl(121,21),100);assert.equal(exVatFromIncl(50,0),50);
  assert.deepEqual(costAmounts(cost('a',null)),{exVat:null,vat:null,inclVat:null});
});
test('spent fixed costs add to the activity costs, expected ones to the forecast, ex VAT',()=>{
  const p={...emptyProject(),tasks:[task('t',{budget:1000,remaining:100})],fixedCosts:[cost('a',200,{taskId:'t'}),cost('b',50,{taskId:'t',status:'expected'}),cost('c',30)]};
  assert.equal(taskSpent(p,p.tasks[0]).value,200);assert.equal(taskRemaining(p,p.tasks[0]).value,150);
  const s=projectSummary(p);assert.equal(s.spent,230);assert.equal(s.remaining,150);assert.equal(s.result,620);
  assert.deepEqual(fixedCostTotals(p,null),{spent:30,expected:0,spentCount:1,expectedCount:0});
});
test('expected fixed costs never make an unknown manual forecast look known',()=>{
  const p={...emptyProject(),tasks:[task('t')],fixedCosts:[cost('a',50,{taskId:'t',status:'expected'})]};
  assert.equal(taskRemaining(p,p.tasks[0]).value,null);
});
test('invalid fixed costs are rejected and valid ones survive saving',()=>{
  const base=()=>({...emptyProject(),tasks:[task('t')],fixedCosts:[cost('a',10,{taskId:'t',date:'2026-10-23'})]});
  assert.deepEqual(parseProject(JSON.stringify(base())).fixedCosts,base().fixedCosts);
  for(const [change,pattern] of [[{description:' '},/omschrijving/],[{amountExVat:-1},/ex BTW/],[{vatRate:120},/BTW-percentage/],[{status:'x'},/gemaakt of verwacht/],[{taskId:'nope'},/bestaat niet/],[{date:'2026-13-01'},/datum/]]){
    const p=base();Object.assign(p.fixedCosts[0],change);assert.throws(()=>schedule(p),pattern);
  }
});
test('deleting an activity keeps its fixed costs as project-wide costs',()=>{
  const p={...emptyProject(),tasks:[task('t')],fixedCosts:[cost('a',10,{taskId:'t'})]};
  const next=deleteTaskTree(p,'t');assert.equal(next.fixedCosts[0].taskId,null);assert.doesNotThrow(()=>schedule(next));
});
