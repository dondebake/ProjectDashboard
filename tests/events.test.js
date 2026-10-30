import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,schedule,parseProject,finish} from '../src/engine.js';
import {expandMeetings,nthWeekday,milestoneItems,planningNodes,dependencyConflicts,clusterSymbols} from '../src/events.js';
import {timelineRows,timelineGeometry,timelineDates} from '../src/timeline.js';
import {routeDependency} from '../src/routing.js';
const task=(id,start='2026-10-26',duration=3)=>({id,title:id,start,duration,progress:0,groupId:null});
const meeting=(id='m',date='2026-11-02')=>({id,title:'Projectteam',kind:'team',date,time:'10:00'});
const fixture=()=>({...emptyProject(),tasks:[task('a')],meetings:[meeting()]});

test('first Monday of the month handles month boundaries and the new year',()=>{
  const p=fixture();p.meetings[0].recurrence={frequency:'monthly',interval:1,ordinal:1,weekday:1,until:'2027-03-31'};
  assert.deepEqual(expandMeetings(p).map(m=>m.date),['2026-11-02','2026-12-07','2027-01-04','2027-02-01','2027-03-01']);
});
test('last weekdays and missing fifth weekdays are computed without overflowing the month',()=>{
  assert.equal(nthWeekday(2028,1,2,-1),'2028-02-29');assert.equal(nthWeekday(2026,1,1,5),null);
  assert.equal(nthWeekday(2026,2,1,5),'2026-03-30');
});
test('recurrences start on or after the chosen date and honor intervals and exclusions',()=>{
  const p=fixture();p.meetings[0].date='2026-11-03';p.meetings[0].recurrence={frequency:'monthly',interval:2,ordinal:1,weekday:1,until:'2027-05-31'};p.meetings[0].exceptions=['2027-03-01'];
  assert.deepEqual(expandMeetings(p).map(m=>m.date),['2027-01-04','2027-05-03']);
});
test('weekly meetings keep their weekday through DST without becoming multiday tasks',()=>{
  const p=fixture();p.meetings[0].date='2026-10-19';p.meetings[0].recurrence={frequency:'weekly',interval:1,weekday:1,until:'2026-11-02'};
  assert.deepEqual(expandMeetings(p).map(m=>m.date),['2026-10-19','2026-10-26','2026-11-02']);
  assert.equal(schedule(p).tasks.length,1);assert.equal(schedule(p).dependencies.length,0);
});
test('invalid or unbounded recurrence rules are rejected',()=>{
  for(const rule of [{frequency:'monthly',interval:0,ordinal:1,weekday:1,until:'2027-01-01'},{frequency:'monthly',interval:1,ordinal:6,weekday:1,until:'2027-01-01'},{frequency:'weekly',interval:1,weekday:1,until:'2040-01-01'}]){
    const p=fixture();p.meetings[0].recurrence=rule;assert.throws(()=>schedule(p),/herhaling|weekdag/);
  }
});
test('one-off meeting IDs stay stable when the meeting date changes',()=>{
  const p=fixture(),id=expandMeetings(p)[0].occurrenceId;p.meetings[0].date='2026-11-09';assert.equal(expandMeetings(p)[0].occurrenceId,id);
});
test('a meeting prerequisite that finishes too late is flagged without moving the meeting',()=>{
  const p=fixture();p.tasks[0].start='2026-11-04';p.dependencies=[{from:'a',to:expandMeetings(p)[0].occurrenceId,type:'FS',lag:0}];
  const next=schedule(p);assert.equal(next.meetings[0].date,'2026-11-02');assert.equal(dependencyConflicts(next).length,1);
});
test('a preparation task can finish on the same calendar day as a meeting',()=>{
  const p=fixture();p.tasks[0]=task('a','2026-11-02',1);p.dependencies=[{from:'a',to:expandMeetings(p)[0].occurrenceId,type:'FS',lag:0}];
  assert.equal(dependencyConflicts(schedule(p)).length,0);
});
test('meeting to task dependencies schedule work on a working day',()=>{
  const p=fixture();p.meetings[0].date='2026-11-01';p.dependencies=[{from:expandMeetings(p)[0].occurrenceId,to:'a',type:'FS',lag:0}];
  assert.equal(schedule(p).tasks[0].start,'2026-11-02');assert.equal(schedule(p).meetings[0].date,'2026-11-01');
});
test('a recurring occurrence can have its own dependency and cycles include meetings',()=>{
  const p=fixture();p.meetings[0].recurrence={frequency:'weekly',interval:1,weekday:1,until:'2026-11-16'};
  const id=expandMeetings(p)[1].occurrenceId;p.dependencies=[{from:'a',to:id,type:'FS',lag:0}];assert.doesNotThrow(()=>schedule(p));
  p.dependencies.push({from:id,to:'a',type:'FS',lag:0});assert.throws(()=>schedule(p),/cirkel/);
});
test('moving milestones track task end, deadlines retain their date and flag overruns',()=>{
  const p=fixture();p.tasks[0].endMilestone={mode:'moving',title:'Concept klaar'};
  const first=milestoneItems(schedule(p))[0];p.tasks[0].start='2026-11-02';const later=milestoneItems(schedule(p))[0];assert.ok(later.date>first.date);
  p.tasks[0].endMilestone={mode:'deadline',date:'2026-10-30'};const fixed=milestoneItems(schedule(p))[0];assert.equal(fixed.date,'2026-10-30');assert.equal(fixed.late,true);assert.equal(fixed.planned,finish(p.tasks[0],p.calendar));
});
test('deadlines may fall on a nonworking day and invalid deadlines are rejected',()=>{
  const p=fixture();p.tasks[0].endMilestone={mode:'deadline',date:'2026-11-01'};assert.equal(milestoneItems(schedule(p))[0].date,'2026-11-01');p.tasks[0].endMilestone.date='2026-02-30';assert.throws(()=>schedule(p),/deadline/);
});
test('meetings are grouped on separate type rows and all milestones occupy the last row',()=>{
  const p=fixture();p.meetings.push({...meeting('s'),kind:'stakeholder'});p.tasks.push(task('zero','2026-11-03',0));p.tasks[0].endMilestone={mode:'moving'};
  const rows=timelineRows(p);assert.deepEqual(rows.slice(0,3).map(r=>r.kind),['meetingGroup','meetingType','meetingType']);assert.equal(rows.at(-1).kind,'milestones');assert.equal(rows.some(r=>r.task?.id==='zero'),false);
  const g=timelineGeometry(p,rows,'2026-10-23',20);assert.equal(g.milestones.flatMap(c=>c.items).length,2);assert.ok(g.obstacles.has('zero'));assert.ok(g.obstacles.has(expandMeetings(p)[0].occurrenceId));
});
test('meeting group collapse hides symbols without losing meeting data',()=>{
  const p=fixture(),rows=timelineRows(p,new Set(['meetings'])),g=timelineGeometry(p,rows,'2026-10-23',20);
  assert.equal(rows.some(r=>r.kind==='meetingType'),false);assert.equal(g.obstacles.has(expandMeetings(p)[0].occurrenceId),false);assert.equal(p.meetings.length,1);
});
test('endpoint milestone symbols leave room for solid obstacle-free dependency routes',()=>{
  const p=fixture();p.tasks[0].endMilestone={mode:'moving'};p.tasks.push(task('b','2026-11-05',2));p.dependencies=[{from:'a',to:'b',type:'FS',lag:0}];
  const next=schedule(p),rows=timelineRows(next),g=timelineGeometry(next,rows,'2026-10-23',20),route=routeDependency(next.dependencies[0],g.obstacles,{width:800,height:rows.length*48+48});assert.equal(route.dashed,false);
});
test('compact symbols cluster onto one row while preserving every underlying item',()=>{
  const items=Array.from({length:8},(_,i)=>({id:String(i),date:`2026-11-${String(i+1).padStart(2,'0')}`})),groups=clusterSymbols(items,'2026-11-01',5);
  assert.equal(groups.flatMap(g=>g.items).length,8);assert.ok(groups.length<8);
});
test('JSON roundtrip preserves recurring meetings, occurrence dependencies and fixed milestones',()=>{
  const p=fixture();p.tasks[0].endMilestone={mode:'deadline',date:'2026-11-02',title:'Bespreekversie'};p.dependencies=[{from:'a',to:expandMeetings(p)[0].occurrenceId,type:'FS',lag:0}];
  const next=schedule(p);assert.deepEqual(parseProject(JSON.stringify(next)),next);assert.ok(timelineDates(next).includes('2026-11-02'));assert.equal(planningNodes(next).length,2);
});

test('meeting dependency arrows use the actual occurrence symbol without crossing task bars',()=>{
  const p=fixture(),id=expandMeetings(p)[0].occurrenceId;p.dependencies=[{from:'a',to:id,type:'FS',lag:0}];
  const next=schedule(p),rows=timelineRows(next),g=timelineGeometry(next,rows,'2026-10-23',20);
  const route=routeDependency(next.dependencies[0],g.obstacles,{width:800,height:rows.length*48+48});
  assert.ok(route);assert.equal(route.dashed,false);assert.equal(route.points.at(-1).y,g.meetingRows.get('team')*48+24);
});

test('dependencies between meetings respect their times on the same date',()=>{
  const p=fixture();p.meetings=[{...meeting('a'),time:'14:00'},{...meeting('b'),time:'10:00'}];
  const nodes=expandMeetings(p);p.dependencies=[{from:nodes.find(n=>n.id==='a').occurrenceId,to:nodes.find(n=>n.id==='b').occurrenceId,type:'FS',lag:0}];
  assert.equal(dependencyConflicts(schedule(p))[0].timeConflict,true);
  p.meetings[1].time='15:00';assert.equal(dependencyConflicts(schedule(p)).length,0);
});
