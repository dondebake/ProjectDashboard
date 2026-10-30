import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,schedule,parseProject} from '../src/engine.js';
import {mondayOf,isoWeek,defaultWeek,weekActivities,weekHours} from '../src/weeks.js';
import {taskTeamSummary} from '../src/team.js';
import {deleteTaskTree} from '../src/hierarchy.js';
const rate=(hourlyRate)=>[{id:'r',start:'2026-01-01',end:'2026-12-31',hourlyRate}];
function fixture(){return {...emptyProject(),teamMembers:[{id:'a',name:'Anna',rates:rate(100)},{id:'b',name:'Bas',rates:rate(150)}],tasks:[
  {id:'t',title:'Onderzoek',start:'2026-10-19',duration:15,progress:20,groupId:null,teamAssignments:[{memberId:'a',budgetHours:40,spentHours:6},{memberId:'b',budgetHours:20}]},
  {id:'later',title:'Rapport',start:'2026-12-01',duration:5,progress:0,groupId:null,teamAssignments:[{memberId:'a',budgetHours:8}]}],
  timeEntries:[{week:'2026-10-19',taskId:'t',memberId:'a',hours:8},{week:'2026-10-26',taskId:'t',memberId:'a',hours:4},{week:'2026-10-26',taskId:'t',memberId:'b',hours:6}]};}

test('weeks start on Monday and follow ISO week numbers',()=>{
  assert.equal(mondayOf('2026-10-30'),'2026-10-26');assert.equal(mondayOf('2026-11-01'),'2026-10-26');assert.equal(mondayOf('2026-10-26'),'2026-10-26');
  assert.deepEqual(isoWeek('2026-10-26'),{year:2026,week:44});assert.deepEqual(isoWeek('2026-12-28'),{year:2026,week:53});assert.deepEqual(isoWeek('2027-01-04'),{year:2027,week:1});
  assert.equal(defaultWeek('2026-10-28'),'2026-10-19');assert.equal(defaultWeek('2026-10-30'),'2026-10-26');
});
test('written hours are the opening balance plus all weekly hours, valued at the tariff',()=>{
  const p=fixture(),s=taskTeamSummary(p,p.tasks[0]);
  assert.equal(s.assignments[0].spentHours,18);assert.equal(s.assignments[0].openingHours,6);assert.equal(s.assignments[0].weekHours,12);assert.equal(s.assignments[0].spentCost,1800);
  assert.equal(s.assignments[1].spentHours,6);assert.equal(s.assignments[1].spentCost,900);assert.equal(s.spentHours,24);
  assert.equal(weekHours(p,'2026-10-26','t','b'),6);assert.equal(weekHours(p,'2026-10-26','later','a'),null);
});
test('the week view shows running activities with team members, and booked ones',()=>{
  const p=fixture();
  assert.deepEqual(weekActivities(p,'2026-10-26').map(t=>t.id),['t']);
  assert.deepEqual(weekActivities(p,'2026-10-26',{all:true}).map(t=>t.id),['t','later']);
  p.tasks[0].progress=100;assert.deepEqual(weekActivities(p,'2026-10-26').map(t=>t.id),['t'],'booked hours keep a finished activity visible');
  assert.deepEqual(weekActivities(p,'2026-11-02').map(t=>t.id),[]);
});
test('weekly hours are validated and survive saving',()=>{
  assert.deepEqual(parseProject(JSON.stringify(fixture())).timeEntries,fixture().timeEntries);
  for(const [change,pattern] of [[{week:'2026-10-27'},/weekregel/],[{taskId:'x'},/weekregel/],[{hours:-1},/nul of meer/],[{taskId:'later',memberId:'b'},/Verwijder eerst/]]){
    const p=fixture();Object.assign(p.timeEntries[0],change);assert.throws(()=>schedule(p),pattern);
  }
  const p=fixture();p.timeEntries.push({...p.timeEntries[0]});assert.throws(()=>schedule(p),/dubbele/);
});
test('deleting an activity also deletes its weekly hours',()=>{
  const next=deleteTaskTree(fixture(),'t');assert.equal(next.timeEntries.length,0);assert.doesNotThrow(()=>schedule(next));
});
