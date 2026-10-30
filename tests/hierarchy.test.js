import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,parseProject,schedule} from '../src/engine.js';
import {buildRows,upsertTask,deleteTaskTree,deleteGroup,reorderGroup,itemColor,textColor} from '../src/hierarchy.js';
const task=(id,groupId='g',parentTaskId=null)=>({id,title:id,groupId,parentTaskId,start:'2026-10-26',duration:2,progress:0});
function fixture(){return {...emptyProject(),groups:[{id:'g',name:'Groep',parentId:null,color:'#154273'},{id:'h',name:'Tweede',parentId:null,color:'#ff9900'}],tasks:[task('a'),task('b'),task('s','g','a'),task('c','h')]};}
test('three-level rows place subtasks directly under their task and keep IDs distinct',()=>{
  const rows=buildRows(fixture());assert.deepEqual(rows.map(r=>r.kind==='group'?r.group.id:r.task.id),['g','a','s','b','h','c']);
  assert.deepEqual(rows.slice(0,3).map(r=>r.depth),[0,1,2]);assert.equal(rows[1].hasChildren,true);assert.equal(rows[2].isSubtask,true);
});
test('group and task collapse hide exactly their own descendants',()=>{
  assert.deepEqual(buildRows(fixture(),new Set(['task:a'])).map(r=>r.task?.id||r.group.id),['g','a','b','h','c']);
  assert.deepEqual(buildRows(fixture(),new Set(['group:g'])).map(r=>r.task?.id||r.group.id),['g','h','c']);
});
test('fourth level, missing parent, self-parent and mismatched groups are rejected',()=>{
  for(const t of [task('deep','g','s'),task('missing','g','absent'),task('self','g','self'),task('wrong','h','a')]){
    const p=fixture();p.tasks.push(t);assert.throws(()=>schedule(p));
  }
});
test('moving a task to another group moves its subtasks without altering their dates or costs',()=>{
  const p=fixture();p.tasks[2].finances={budget:500,spent:100,remaining:100};
  const next=upsertTask(p,{...p.tasks[0],groupId:'h'});
  assert.equal(next.tasks.find(t=>t.id==='s').groupId,'h');assert.deepEqual(next.tasks[2].finances,p.tasks[2].finances);assert.equal(p.tasks[2].groupId,'g');
});
test('a new subtask inherits group membership even when the editor passed a different group',()=>{
  const next=upsertTask(fixture(),task('new','h','a'));assert.equal(next.tasks.at(-1).groupId,'g');assert.doesNotThrow(()=>schedule(next));
});
test('deleting a task also removes its subtasks and all affected dependencies',()=>{
  const p=fixture();p.dependencies=[{from:'s',to:'b',type:'FS',lag:0}];
  const next=deleteTaskTree(p,'a');assert.deepEqual(next.tasks.map(t=>t.id),['b','c']);assert.deepEqual(next.dependencies,[]);assert.equal(p.tasks.length,4);
});
test('deleting a group preserves its tasks, subtask membership and all task data',()=>{
  const next=deleteGroup(fixture(),'g');assert.equal(next.groups.length,1);assert.equal(next.tasks.length,4);assert.equal(next.tasks[2].parentTaskId,'a');assert.equal(next.tasks[2].groupId,null);assert.doesNotThrow(()=>schedule(next));
});
test('dragging groups above and below moves full groups and survives save/reopen',()=>{
  const p=fixture(),next=reorderGroup(p,'h','g',false),reopened=parseProject(JSON.stringify(next));
  assert.deepEqual(reopened.groups.map(g=>g.id),['h','g']);assert.deepEqual(buildRows(reopened).map(r=>r.task?.id||r.group.id),['h','c','g','a','s','b']);
  assert.deepEqual(reorderGroup(next,'h','g',true).groups.map(g=>g.id),['g','h']);assert.deepEqual(p.groups.map(g=>g.id),['g','h']);
});
test('legacy nested groups cannot accidentally be reparented by dragging',()=>{
  const p=fixture();p.groups.push({id:'nested',name:'Bestaand',parentId:'g'});assert.throws(()=>reorderGroup(p,'nested','h'),/hetzelfde niveau/);
});
test('color inheritance is group to task to subtask, with independent overrides',()=>{
  const p=fixture();assert.equal(itemColor(p.tasks[2],p),'#154273');p.tasks[0].color='#ff0000';assert.equal(itemColor(p.tasks[2],p),'#ff0000');p.tasks[2].color='#00ff00';assert.equal(itemColor(p.tasks[2],p),'#00ff00');
  const reopened=parseProject(JSON.stringify(p));assert.equal(reopened.tasks[2].color,'#00ff00');assert.equal(textColor('#000000'),'#ffffff');assert.equal(textColor('#ffffff'),'#111111');
});
test('invalid custom colors are rejected on import',()=>{const p=fixture();p.tasks[0].color='url(evil)';assert.throws(()=>parseProject(p),/kleur/);});
