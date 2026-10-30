import {buildRows} from './hierarchy.js';
import {expandMeetings,milestoneItems,clusterSymbols,MEETING_TYPES} from './events.js';
import {taskBounds} from './routing.js';
import {finish} from './engine.js';
import {ROW_HEIGHT} from './layout.js';

export function timelineRows(project,collapsed=new Set()) {
  const meetingRows=collapsed.has('meetings')?[]:Object.keys(MEETING_TYPES).filter(kind=>(project.meetings||[]).some(m=>m.kind===kind)).map(meetingKind=>({kind:'meetingType',meetingKind}));
  return [{kind:'meetingGroup'},...meetingRows,...buildRows(project,collapsed).filter(row=>row.kind!=='task'||row.task.duration!==0||row.hasChildren),{kind:'milestones'}];
}
export function timelineDates(project) {
  return [...project.tasks.flatMap(t=>[t.start,finish(t,project.calendar)]),...milestoneItems(project).map(m=>m.date),...expandMeetings(project).map(m=>m.date)];
}
export function timelineGeometry(project,rows,start,zoom,rowHeight=ROW_HEIGHT) {
  const tasks=taskBounds(rows,start,zoom,project.calendar,rowHeight),obstacles=new Map(tasks);
  const occurrences=expandMeetings(project),meetings=new Map(Object.keys(MEETING_TYPES).map(kind=>[kind,clusterSymbols(occurrences.filter(m=>m.kind===kind),start,zoom)])),milestones=clusterSymbols(milestoneItems(project),start,zoom);
  const rowCenter=index=>index*rowHeight+rowHeight/2;
  function add(key,group,index){const y=rowCenter(index);obstacles.set(key,{id:key,left:group.x-13,right:group.x+13,top:y-14,bottom:y+14,y,x:group.x,end:group.x+13});}
  const meetingRows=new Map(rows.flatMap((row,i)=>row.kind==='meetingType'?[[row.meetingKind,i]]:[])),milestoneRow=rows.findIndex(row=>row.kind==='milestones');
  for(const [kind,groups] of meetings){if(!meetingRows.has(kind))continue;groups.forEach((group,i)=>{
    add(`meeting-symbol:${kind}:${i}`,group,meetingRows.get(kind));
    for(const meeting of group.items){const geometry=obstacles.get(`meeting-symbol:${kind}:${i}`);obstacles.set(meeting.occurrenceId,{...geometry,id:meeting.occurrenceId});}
  });}
  milestones.forEach((group,i)=>{
    add(`milestone-symbol:${i}`,group,milestoneRow);
    // Dependencies van bestaande losse nuldaagse taken blijven gekoppeld.
    for(const m of group.items)if(m.standalone&&!tasks.has(m.taskId)){const geometry=obstacles.get(`milestone-symbol:${i}`);obstacles.set(m.taskId,{...geometry,id:m.taskId});}
  });
  const ends=milestoneItems(project).flatMap(m=>{const t=tasks.get(m.taskId);return !t||m.standalone?[]:[{...m,x:t.right+24,y:t.y}];});
  for(const m of ends)obstacles.set(`end-symbol:${m.taskId}`,{id:`end-symbol:${m.taskId}`,left:m.x-7,right:m.x+7,top:m.y-8,bottom:m.y+8,x:m.x,end:m.x+7,y:m.y});
  return {tasks,obstacles,meetings,milestones,ends,meetingRows,milestoneRow,rowCenter};
}
