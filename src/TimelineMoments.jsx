import React from 'react';
import TimelineSymbol from './TimelineSymbol.jsx';
export default function TimelineMoments({geometry,conflicts,onMeetingClick,onMilestoneClick}) {
  const blocked=new Set(conflicts.map(c=>c.meeting.id));
  return <>
    {[...geometry.meetings].flatMap(([kind,groups])=>!geometry.meetingRows.has(kind)?[]:groups.map((group,i)=><TimelineSymbol key={`meeting:${kind}:${i}`} x={group.x} y={geometry.rowCenter(geometry.meetingRows.get(kind))} items={group.items} blocked={group.items.some(m=>blocked.has(m.occurrenceId))} onClick={onMeetingClick}/>))}
    {geometry.milestones.map((group,i)=><TimelineSymbol key={`milestone:${i}`} x={group.x} y={geometry.rowCenter(geometry.milestoneRow)} items={group.items} onClick={onMilestoneClick}/>)}
    {geometry.ends.map(m=><TimelineSymbol key={`end:${m.taskId}`} x={m.x} y={m.y} items={[m]} small onClick={onMilestoneClick}/>)}
  </>;
}
