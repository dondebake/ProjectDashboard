import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,schedule,finish,working,parseProject} from '../src/engine.js';
import {easterSunday,publicHolidayDates,publicHoliday,PUBLIC_HOLIDAYS} from '../src/holidays.js';
const all=Object.keys(PUBLIC_HOLIDAYS);

test('Easter-based holidays are calculated for any year',()=>{
  for(const [year,easter] of [[2025,'2025-04-20'],[2026,'2026-04-05'],[2027,'2027-03-28'],[2038,'2038-04-25']])assert.equal(easterSunday(year).toISOString().slice(0,10),easter);
  assert.deepEqual(publicHolidayDates(2026),{newYear:['2026-01-01'],easterMonday:['2026-04-06'],kingsDay:['2026-04-27'],ascension:['2026-05-14'],whitMonday:['2026-05-25'],christmas:['2026-12-25','2026-12-26']});
});
test('King\'s Day moves to Saturday when 27 April is a Sunday',()=>{
  assert.deepEqual(publicHolidayDates(2025).kingsDay,['2025-04-26']);assert.deepEqual(publicHolidayDates(2031).kingsDay,['2031-04-26']);
});
test('only ticked holidays are days off',()=>{
  const calendar={workweek:[1,2,3,4,5],holidays:[],publicHolidays:['christmas']};
  assert.equal(working('2026-12-25',calendar),false);assert.equal(working('2026-04-06',calendar),true);
  assert.equal(publicHoliday('2026-04-06',all),'easterMonday');assert.equal(publicHoliday('2026-04-07',all),null);
  assert.equal(working('2026-04-06',{workweek:[1,2,3,4,5],holidays:[]}),true,'existing projects without the setting are unchanged');
});
test('tasks skip ticked holidays and the setting survives saving',()=>{
  const p={...emptyProject(),tasks:[{id:'t',title:'Rapport',start:'2026-12-24',duration:3,progress:0,groupId:null}]};
  assert.equal(finish(p.tasks[0],p.calendar),'2026-12-28');
  p.calendar.publicHolidays=['christmas','newYear'];assert.equal(finish(p.tasks[0],p.calendar),'2026-12-29');
  assert.deepEqual(parseProject(JSON.stringify(p)).calendar.publicHolidays,['christmas','newYear']);
  p.calendar.publicHolidays=['sinterklaas'];assert.throws(()=>schedule(p),/werkkalender/);
});
