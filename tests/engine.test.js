import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,schedule,finish,parseProject,addWork,validDate} from '../src/engine.js';
const task=(id,start='2026-10-23',duration=1)=>({id,title:id,start,duration,progress:0,groupId:null});
function project(tasks,deps=[]){return {...emptyProject(),tasks,dependencies:deps};}
test('FS zero lag starts Monday after Friday, skips holiday and preserves input',()=>{
  const p=project([task('a'),task('b')],[{from:'a',to:'b',type:'FS',lag:0}]);
  p.calendar.holidays=['2026-10-26']; const next=schedule(p);
  assert.equal(next.tasks[1].start,'2026-10-27');assert.equal(p.tasks[1].start,'2026-10-23');
});
test('diamond graph evaluates all predecessors before merged successor, regardless of input order',()=>{
  const p=project([task('d'),task('c','2026-10-23',5),task('b','2026-10-23',2),task('a')],[{from:'a',to:'b',type:'FS',lag:0},{from:'a',to:'c',type:'FS',lag:0},{from:'b',to:'d',type:'FS',lag:0},{from:'c',to:'d',type:'FS',lag:0}]);
  const next=schedule(p); assert.equal(next.tasks.find(t=>t.id==='d').start,'2026-11-02');
});
test('SS, FF and SF enforce the correct task endpoint',()=>{
  for(const [type,expected] of [['SS','2026-10-28'],['FF','2026-10-29'],['SF','2026-10-27']]){
    const p=project([task('a','2026-10-26',3),task('b','2026-10-01',2)],[{from:'a',to:'b',type,lag:2}]);
    assert.equal(schedule(p).tasks[1].start,expected,type);
  }
});
test('negative lag allows overlap; existing slack is retained',()=>{
  const p=project([task('a','2026-10-26',5),task('b','2026-10-23')],[{from:'a',to:'b',type:'FS',lag:-2}]);
  assert.equal(schedule(p).tasks[1].start,'2026-10-29');p.tasks[1].start='2026-11-10';assert.equal(schedule(p).tasks[1].start,'2026-11-10');
});
test('milestones have no duration and allow same-day successor',()=>{
  const p=project([task('a','2026-10-26',0),task('b')],[{from:'a',to:'b',type:'FS',lag:0}]);
  const next=schedule(p);assert.equal(next.tasks[1].start,'2026-10-26');assert.equal(finish(next.tasks[0],p.calendar),'2026-10-26');
});
test('cycle, duplicate edges and missing task IDs are rejected',()=>{
  const edge={from:'a',to:'b',type:'FS',lag:0},p=project([task('a'),task('b')],[edge]);
  assert.throws(()=>schedule({...p,dependencies:[edge,{...edge,from:'b',to:'a'}]}),/cirkel/);
  assert.throws(()=>schedule({...p,dependencies:[edge,edge]}),/bestaat al/);
  assert.throws(()=>schedule({...p,dependencies:[{...edge,from:'missing'}]}),/Ongeldige/);
});
test('calendar validates dates and rejects no workdays',()=>{
  assert.equal(validDate('2026-02-30'),false); assert.equal(validDate('2028-02-29'),true);
  const p=project([task('a')]);p.calendar.workweek=[];assert.throws(()=>schedule(p),/kalender/);
  assert.equal(addWork('2026-10-26',-1,emptyProject().calendar),'2026-10-23');
});
test('group hierarchy rejects cycles',()=>{
  const p=emptyProject();p.groups=[{id:'a',name:'A',parentId:'b'},{id:'b',name:'B',parentId:'a'}];assert.throws(()=>schedule(p),/cirkel/);
});
test('native project roundtrip preserves all fields and planning',()=>{
  const p=schedule(project([task('a'),task('b')],[{from:'a',to:'b',type:'FS',lag:2}]));p.custom={notes:'bewaren'};
  assert.deepEqual(parseProject(JSON.stringify(p)),p);
});
test('legacy Flask JSON import maps dependencies and retains original data',()=>{
  const old={project:{name:'Oud project',budget:1000},groups:[{id:1,name:'Groep',parent_id:null}],tasks:[{id:1,title:'A',start_date:'2026-10-23',duration_working_days:1,group_id:1,dependencies:[]},{id:2,title:'B',start_date:'2026-10-23',duration_working_days:2,dependencies:[{predecessor_id:1,type:'finish_to_start',lag_days:0}]}]};
  const p=parseProject(old);assert.equal(p.name,'Oud project');assert.equal(p.tasks[1].start,'2026-10-26');assert.equal(p.tasks[0].groupId,'1');assert.deepEqual(p.legacySource,old);
});
test('unsupported schema and invalid JSON are rejected',()=>{assert.throws(()=>parseProject('{'));assert.throws(()=>parseProject({...emptyProject(),schemaVersion:2}),/bestandsversie/);});
