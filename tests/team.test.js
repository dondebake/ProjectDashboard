import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,schedule,parseProject} from '../src/engine.js';
import {assignmentEstimate,taskTeamSummary,memberSummary,rateOn,deleteTeamMember} from '../src/team.js';
import {projectSummary} from '../src/summary.js';
const rate=(id,start,end,hourlyRate)=>({id,start,end,hourlyRate});
function fixture(){return {...emptyProject(),teamMembers:[{id:'a',name:'Anna',role:'Adviseur',rates:[rate('2026','2026-01-01','2026-12-31',100)]},{id:'b',name:'Bas',rates:[rate('2026','2026-01-01','2026-12-31',150)]}],tasks:[{id:'t',title:'Onderzoek',start:'2026-10-26',duration:5,progress:0,groupId:null,teamAssignments:[{memberId:'a',budgetHours:10},{memberId:'b',budgetHours:4}]}]};}
test('multiple team members have their own hours budget and calculated cost',()=>{
  const p=fixture(),summary=taskTeamSummary(p,p.tasks[0]);assert.equal(summary.hours,14);assert.equal(summary.cost,1600);assert.equal(summary.assignments[0].cost,1000);assert.equal(summary.assignments[1].cost,600);
});
test('tariff start and end dates are inclusive',()=>{const p=fixture();assert.equal(rateOn(p.teamMembers[0],'2026-01-01').hourlyRate,100);assert.equal(rateOn(p.teamMembers[0],'2026-12-31').hourlyRate,100);assert.equal(rateOn(p.teamMembers[0],'2027-01-01'),null);});
test('a task spanning rate periods allocates hours evenly over working days',()=>{
  const p=fixture();p.tasks[0].start='2026-12-30';p.tasks[0].duration=4;p.tasks[0].teamAssignments=[{memberId:'a',budgetHours:16}];p.teamMembers[0].rates.push(rate('2027','2027-01-01','2027-12-31',120));
  const a=assignmentEstimate(p,p.tasks[0],p.tasks[0].teamAssignments[0]);assert.equal(a.cost,1760);assert.deepEqual(a.periods.map(r=>r.hours),[8,8]);
});
test('holidays and weekends do not receive a share of the hours',()=>{
  const p=fixture();p.tasks[0].start='2026-12-31';p.tasks[0].duration=2;p.calendar.holidays=['2027-01-01'];p.teamMembers[0].rates.push(rate('2027','2027-01-01','2027-12-31',200));
  const a=assignmentEstimate(p,p.tasks[0],{memberId:'a',budgetHours:10});assert.equal(a.cost,1500);assert.equal(a.periods[1].first,'2027-01-04');
});
test('missing rates preserve hours but do not invent a zero cost',()=>{
  const p=fixture();p.tasks[0].start='2026-12-31';p.tasks[0].duration=3;const a=assignmentEstimate(p,p.tasks[0],{memberId:'a',budgetHours:12});assert.equal(a.hours,12);assert.equal(a.cost,null);assert.equal(a.missing[0],'2027-01-01');assert.equal(taskTeamSummary(p,p.tasks[0]).incomplete,true);
});
test('overlapping periods including a shared boundary date are rejected',()=>{
  const p=fixture();p.teamMembers[0].rates.push(rate('new','2026-12-31','2027-12-31',120));assert.throws(()=>schedule(p),/overlappen/);p.teamMembers[0].rates[1].start='2027-01-01';assert.doesNotThrow(()=>schedule(p));
});
test('invalid rates, reversed dates, duplicate members and bad hours are rejected',()=>{
  const p=fixture();p.teamMembers[0].rates[0].hourlyRate=-1;assert.throws(()=>schedule(p),/tariefperiode/);p.teamMembers[0].rates[0].hourlyRate=100;p.teamMembers[0].rates[0].end='2025-01-01';assert.throws(()=>schedule(p),/tariefperiode/);
  const q=fixture();q.tasks[0].teamAssignments.push({memberId:'a',budgetHours:1});assert.throws(()=>schedule(q),/maar één keer/);
  const r=fixture();r.tasks[0].teamAssignments[0].budgetHours=-1;assert.throws(()=>schedule(r),/urenbudget/);
});
test('task rescheduling recalculates costs without altering the hours budget',()=>{
  const p=fixture();p.teamMembers[0].rates.push(rate('2027','2027-01-01','2027-12-31',120));const before=memberSummary(p,'a').cost;p.tasks[0].start='2027-01-04';p.tasks[0].teamAssignments=p.tasks[0].teamAssignments.filter(a=>a.memberId==='a');const after=schedule(p);assert.equal(before,1000);assert.equal(memberSummary(after,'a').cost,1200);assert.equal(after.tasks[0].teamAssignments[0].budgetHours,10);
});
test('member totals include tasks and subtasks exactly once',()=>{
  const p=fixture();p.tasks.push({...p.tasks[0],id:'sub',parentTaskId:'t',teamAssignments:[{memberId:'a',budgetHours:3}]});assert.equal(memberSummary(p,'a').taskCount,2);assert.equal(memberSummary(p,'a').hours,13);assert.equal(memberSummary(p,'a').cost,1300);
});
test('assigned members cannot be removed, unassigned members can',()=>{
  const p=fixture();assert.throws(()=>deleteTeamMember(p,'a'),/nog aan taken/);p.tasks[0].teamAssignments=[];const next=deleteTeamMember(p,'a');assert.equal(next.teamMembers.length,1);assert.equal(p.teamMembers.length,2);
});
test('zero tariffs are valid and milestones use their own date for cost estimates',()=>{
  const p=fixture();p.teamMembers[0].rates[0].hourlyRate=0;p.tasks[0].duration=0;assert.equal(assignmentEstimate(p,p.tasks[0],{memberId:'a',budgetHours:5}).cost,0);assert.doesNotThrow(()=>schedule(p));
});
test('team budgets do not overwrite the agreed task revenue or manual cost forecast',()=>{
  const p=fixture();p.tasks[0].finances={budget:5000,remaining:1200};p.tasks[0].teamAssignments[0].spentHours=5;const before=projectSummary(p);assert.equal(before.budget,5000);assert.equal(before.forecast,1700);assert.equal(before.result,3300);assert.equal(taskTeamSummary(p,p.tasks[0]).cost,1600);
});
test('JSON roundtrip preserves team members, rate history and individual task allocations',()=>{const p=schedule(fixture());assert.deepEqual(parseProject(JSON.stringify(p)),p);assert.deepEqual(parseProject(JSON.stringify(emptyProject())),emptyProject());});
test('written hours are valued at the average tariff and may exceed the budget',()=>{
  const p=fixture();p.tasks[0].teamAssignments[0].spentHours=12;p.tasks[0].teamAssignments[1].spentHours=null;const s=taskTeamSummary(p,p.tasks[0]);
  assert.equal(s.assignments[0].spentCost,1200);assert.equal(s.assignments[1].spentCost,null);assert.equal(s.spentCount,1);assert.equal(s.spentHours,12);assert.equal(s.spentCost,1200);
  p.tasks[0].teamAssignments[0].spentHours=-1;assert.throws(()=>schedule(p),/Geschreven uren/);
});
