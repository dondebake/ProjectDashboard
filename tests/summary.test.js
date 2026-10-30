import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, parseProject } from '../src/engine.js';
import { projectSummary, financialInputs, validateFinances, taskFinancialTotals, financialSummary, taskSpent } from '../src/summary.js';

test('forecast combines actual and remaining costs and shows profit or loss', () => {
  const p={...emptyProject(),finances:{budget:10000,spent:4500,remaining:4000}};
  const s=projectSummary(p);
  assert.equal(s.forecast,8500);assert.equal(s.result,1500);assert.equal(s.utilization,45);assert.equal(s.forecastUtilization,85);
  p.finances.remaining=6500;assert.equal(projectSummary(p).result,-1000);
});
test('unknown financial inputs never invent a zero cost or a profit', () => {
  const p={...emptyProject(),finances:{budget:10000,spent:0,remaining:null}};
  assert.equal(projectSummary(p).result,null);assert.equal(projectSummary(p).forecast,null);
  assert.equal(projectSummary(emptyProject()).utilization,null);
  p.finances.budget=0;assert.equal(projectSummary(p).utilization,null);
});
test('old exports supply budget and actual costs but no invented forecast', () => {
  const p={...emptyProject(),legacySource:{project:{budget:20000,spent:2500}}};
  assert.deepEqual(financialInputs(p),{budget:20000,spent:2500,remaining:null});
});
test('progress includes all tasks; complete hour estimates enable weighting', () => {
  const p={...emptyProject(),tasks:[{progress:100,estimated_hours:10},{progress:0,estimated_hours:30}]};
  assert.equal(projectSummary(p).progress,25);
  delete p.tasks[1].estimated_hours;assert.equal(projectSummary(p).progress,50);
});
test('negative or nonnumeric finance inputs are rejected and valid data roundtrips', () => {
  const p={...emptyProject(),finances:{budget:100,spent:-10,remaining:0}};
  assert.throws(()=>validateFinances(p),/Gemaakte kosten/);
  assert.throws(()=>parseProject(JSON.stringify(p)),/Gemaakte kosten/);
  p.finances.spent=10;
  assert.deepEqual(parseProject(JSON.stringify(p)).finances,p.finances);
});

const team=(hourlyRate=100)=>[{id:'m',name:'Mila',rates:[{id:'r',start:'2026-01-01',end:'2026-12-31',hourlyRate}]}];
test('task budgets and costs are the source for project totals and survive saving',()=>{
  const p={...emptyProject(),finances:{budget:99999,spent:99999,remaining:99999},teamMembers:team(),tasks:[
    {id:'a',title:'A',start:'2026-10-23',duration:1,progress:50,groupId:null,finances:{budget:1000,remaining:400},teamAssignments:[{memberId:'m',budgetHours:5,spentHours:3}]},
    {id:'b',title:'B',start:'2026-10-23',duration:1,progress:100,groupId:null,finances:{budget:500,remaining:0},teamAssignments:[{memberId:'m',budgetHours:5,spentHours:4.5}]},
  ]};
  const reopened=parseProject(JSON.stringify(p));
  const s=projectSummary(reopened);
  assert.equal(s.budget,1500);assert.equal(s.spent,750);assert.equal(s.forecast,1150);assert.equal(s.result,350);assert.equal(s.progress,75);
  assert.deepEqual(taskFinancialTotals(p).budget,{sum:1500,count:2,complete:true});
});

test('a missing tariff makes the project costs unknown instead of partial',()=>{
  const p={...emptyProject(),finances:{budget:10000,spent:0,remaining:0},teamMembers:team(),tasks:[
    {id:'a',title:'A',start:'2026-10-23',duration:1,progress:0,teamAssignments:[{memberId:'m',budgetHours:5,spentHours:3}]},
    {id:'b',title:'B',start:'2027-01-04',duration:1,progress:0,teamAssignments:[{memberId:'m',budgetHours:5,spentHours:2}]}]};
  const s=projectSummary(p);
  assert.equal(s.spent,null);assert.equal(s.result,null);assert.equal(taskFinancialTotals(p).spent.sum,300);
});

test('costs are calculated from written hours; manual task costs and unwritten hours are ignored',()=>{
  const p={...emptyProject(),teamMembers:team(),tasks:[
    {id:'a',title:'A',start:'2026-10-23',duration:1,progress:0,finances:{spent:99999},teamAssignments:[{memberId:'m',budgetHours:8,spentHours:2.5}]},
    {id:'b',title:'B',start:'2026-10-23',duration:1,progress:0,teamAssignments:[{memberId:'m',budgetHours:8}]},{id:'c',title:'C',start:'2026-10-23',duration:1,progress:0}]};
  assert.equal(taskSpent(p,p.tasks[0]).value,250);assert.equal(taskSpent(p,p.tasks[0]).entered,true);assert.equal(taskSpent(p,p.tasks[1]).value,null);assert.equal(taskSpent(p,p.tasks[1]).entered,false);
  assert.equal(projectSummary(p).spent,250);
});

test('invalid task costs are rejected by the shared planning and import validator',()=>{
  const p={...emptyProject(),tasks:[{id:'a',title:'A',start:'2026-10-23',duration:1,progress:10,groupId:null,finances:{budget:-50}}]};
  assert.throws(()=>parseProject(p),/Budget.*A/);
});

test('euro cents never produce a tiny false loss through floating point arithmetic',()=>{
  assert.equal(financialSummary({budget:0.3,spent:0.1,remaining:0.2}).result,0);
  const p={...emptyProject(),teamMembers:team(0.1),tasks:[{id:'a',title:'A',start:'2026-10-23',duration:1,progress:0,finances:{budget:0.1,remaining:0},teamAssignments:[{memberId:'m',budgetHours:1,spentHours:1}]},{id:'b',title:'B',start:'2026-10-23',duration:1,progress:0,finances:{budget:0.2,remaining:0},teamAssignments:[{memberId:'m',budgetHours:2,spentHours:2}]}]};
  assert.equal(projectSummary(p).budget,0.3);assert.equal(projectSummary(p).result,0);
});
