import {day,validDate,today} from './engine.js';
// Weken worden opgeslagen als de datum van hun maandag (JJJJ-MM-DD); weeknummers volgen ISO 8601.
const weekday=s=>new Date(`${s}T12:00:00Z`).getUTCDay();
const shortDate=s=>new Date(`${s}T12:00:00Z`).toLocaleDateString('nl-NL',{day:'numeric',month:'short',timeZone:'UTC'});
export function mondayOf(date) { return day(date,-((weekday(date)+6)%7)); }
export function isMonday(s) { return validDate(s)&&weekday(s)===1; }
export function isoWeek(monday) {
  const thursday=day(monday,3),year=Number(thursday.slice(0,4));
  return {year,week:Math.floor((Date.parse(`${thursday}T12:00:00Z`)-Date.parse(`${year}-01-01T12:00:00Z`))/864e5/7)+1};
}
export function weekLabel(monday) {
  const {week}=isoWeek(monday),sunday=day(monday,6);
  return `Week ${week} · ${shortDate(monday)} – ${shortDate(sunday)} ${sunday.slice(0,4)}`;
}
// Tot en met woensdag gaat de invoer meestal over de vorige week.
export function defaultWeek(date=today()) {
  const monday=mondayOf(date),d=weekday(date);
  return d>=1&&d<=3?day(monday,-7):monday;
}
export function weekHours(project,monday,taskId,memberId) {
  return (project.timeEntries||[]).find(e=>e.week===monday&&e.taskId===taskId&&e.memberId===memberId)?.hours??null;
}
// Activiteiten voor de weekinvoer: begonnen, nog niet gereed en met teamleden; of al uren in deze week.
export function weekActivities(project,monday,{all=false}={}) {
  const sunday=day(monday,6),booked=new Set((project.timeEntries||[]).filter(e=>e.week===monday).map(e=>e.taskId));
  return project.tasks.filter(t=>booked.has(t.id)||Boolean(t.teamAssignments?.length)&&(all||t.start<=sunday&&t.progress<100));
}
