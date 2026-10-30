import test from 'node:test';
import assert from 'node:assert/strict';
import {routeDependency,segmentBlocked,taskBounds} from '../src/routing.js';
import {emptyProject} from '../src/engine.js';
const rect=(id,left,right,y)=>({id,left,right,y,top:y-12,bottom:y+12});
function assertClear(route,bounds){assert.equal(route.dashed,false);for(let i=1;i<route.points.length;i++)for(const r of bounds.values())assert.equal(segmentBlocked(route.points[i-1],route.points[i],r),false,`Route kruist ${r.id}`);}

test('dependency detours around an intervening bar that the old midpoint route crosses',()=>{
  const bounds=new Map([['a',rect('a',20,100,25)],['blocker',rect('blocker',90,210,73)],['b',rect('b',200,280,121)]]);
  assert.equal(segmentBlocked({x:150,y:25},{x:150,y:121},bounds.get('blocker')),true);
  assertClear(routeDependency({from:'a',to:'b',type:'FS'},bounds,{width:400,height:200}),bounds);
});

test('all four dependency types use their own start/end sides without crossing any task',()=>{
  const bounds=new Map([['a',rect('a',60,180,25)],['middle',rect('middle',30,260,73)],['b',rect('b',100,220,121)]]);
  for(const type of ['FS','SS','FF','SF'])for(const [from,to] of [['a','b'],['b','a']]){
    const route=routeDependency({from,to,type},bounds,{width:400,height:200});assertClear(route,bounds);
    assert.equal(route.points[0].x,type[0]==='F'?bounds.get(from).right:bounds.get(from).left);
    assert.equal(route.points.at(-1).x,type[1]==='F'?bounds.get(to).right:bounds.get(to).left);
  }
});

test('an impossible passage is dotted, never presented as a clear solid route',()=>{
  const bounds=new Map([['a',rect('a',20,80,25)],['wall',{id:'wall',left:0,right:300,top:50,bottom:100,y:75}],['b',rect('b',150,220,130)]]);
  const route=routeDependency({from:'a',to:'b',type:'FS'},bounds,{width:300,height:180});
  assert.equal(route.dashed,true);
  assert.ok(route.points.some((p,i)=>i>0&&segmentBlocked(route.points[i-1],p,bounds.get('wall'))));
});

test('minimum-width bars and rotated milestones use their actual visual bounds at month zoom',()=>{
  const calendar=emptyProject().calendar;
  const bounds=taskBounds([{kind:'task',task:{id:'a',start:'2026-10-26',duration:1}},{kind:'group'},{kind:'task',task:{id:'m',start:'2026-10-27',duration:0}}],'2026-10-23',2,calendar);
  assert.equal(bounds.get('a').right-bounds.get('a').left,12);
  assert.equal(bounds.get('a').y,25);assert.equal(bounds.get('m').y,120);
  assert.ok(Math.abs(bounds.get('m').right-bounds.get('m').left-18*Math.SQRT2)<1e-6);
});

test('collapsed or otherwise hidden endpoints do not draw orphan arrows',()=>{
  assert.equal(routeDependency({from:'a',to:'missing',type:'FS'},new Map([['a',rect('a',30,80,25)]]),{width:300,height:200}),null);
});

test('deterministic crowded projects keep all solid arrows outside every bar',()=>{
  let seed=7123;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
  for(let sample=0;sample<12;sample++){
    const bounds=new Map(Array.from({length:14},(_,i)=>{const left=30+Math.floor(rand()*300);return [String(i),rect(String(i),left,left+30+Math.floor(rand()*170),i*48+25)];}));
    for(const type of ['FS','SS','FF','SF'])assertClear(routeDependency({from:'0',to:'13',type},bounds,{width:650,height:720}),bounds);
  }
});
