import React,{useState} from 'react';
import {itemColor} from './hierarchy.js';
import {MEETING_TYPES,expandMeetings,milestoneItems} from './events.js';
import {SymbolIcon} from './TimelineSymbol.jsx';
export default function TaskPanel({rows,project,collapsed,onToggle,onEditTask,onNewTask,onDeleteTask,onEditGroup,onNewGroup,onDeleteGroup,onColor,onGroupMove,onTaskMove,onTaskStep,onConnect,linkFrom,readOnly=false,onMeetings,onNewMeeting,onMilestones,panelResizer,rowHeight,onRowResize,onRowHeightReset}) {
  const [dragging,setDragging]=useState(null),[drop,setDrop]=useState(null);
  function clear(){setDragging(null);setDrop(null);}
  // Waar komt het gesleepte item terecht? Groepen alleen tussen groepen; taken boven/onder een rij,
  // in een groep (bovenaan), of in het midden van een taakrij als subtaak.
  function dropTarget(e,row) {
    if(!dragging)return null;
    const rect=e.currentTarget.getBoundingClientRect(),y=(e.clientY-rect.top)/rect.height;
    if(dragging.kind==='group') {
      const source=project.groups.find(g=>g.id===dragging.id);
      if(row.kind!=='group'||row.group.id===dragging.id||(row.group.parentId||null)!==(source?.parentId||null))return null;
      return {kind:'group',id:row.group.id,position:y>.5?'after':'before'};
    }
    if(row.kind==='group')return {kind:'group',id:row.group.id,position:'inside'};
    const target=row.task,hasChildren=project.tasks.some(t=>t.parentTaskId===dragging.id);
    if(target.id===dragging.id||(hasChildren&&target.parentTaskId))return null;
    if(!target.parentTaskId&&!hasChildren&&y>.3&&y<.7)return {kind:'task',id:target.id,position:'inside'};
    return {kind:'task',id:target.id,position:y>.5?'after':'before'};
  }
  function dropProps(row,key) {
    return {
      onDragOver:e=>{const target=dropTarget(e,row);if(!target)return;e.preventDefault();e.dataTransfer.dropEffect='move';if(drop?.key!==key||drop.position!==target.position)setDrop({key,position:target.position});},
      onDragLeave:e=>{if(!e.currentTarget.contains(e.relatedTarget))setDrop(d=>d?.key===key?null:d);},
      onDrop:e=>{const target=dropTarget(e,row);if(!target)return;e.preventDefault();if(dragging.kind==='group')onGroupMove(dragging.id,target.id,target.position==='after');else onTaskMove(dragging.id,target);clear();},
    };
  }
  const dropClass=key=>drop?.key===key?`drop-${drop.position}`:'';
  function grip(kind,id,label,onStep) {
    return <button className="drag-grip row-control edit-only" draggable={!readOnly} title={`${kind==='group'?'Groep':'Taak'} verslepen: boven of onder een rij, in een groep, of midden op een taak als subtaak · pijltjestoetsen omhoog/omlaag`} aria-label={`${label} verplaatsen`}
      onDragStart={e=>{setDragging({kind,id});e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';}} onDragEnd={clear}
      onKeyDown={e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();onStep(e.key==='ArrowDown'?1:-1);}}>⠿</button>;
  }
  return <div className="task-list sticky-left">
    {rows.map(row=>{
      if(row.kind==='meetingGroup')return <div key="meetings" className="group-row moments-group-row"><button className="row-control collapse" aria-label="Bijeenkomsten in- of uitklappen" onClick={()=>onToggle('meetings')}>{collapsed.has('meetings')?'▸':'▾'}</button><button className="row-name" onClick={()=>onMeetings()}>Bijeenkomsten</button><span className="duration">{expandMeetings(project).length}</span><button className="row-control edit-only" title="Bijeenkomst of reeks toevoegen" onClick={()=>onNewMeeting()}>+</button></div>;
      if(row.kind==='meetingType'){const type=MEETING_TYPES[row.meetingKind];return <div key={`meetingType:${row.meetingKind}`} className="task-row meeting-type-row" style={{'--row-color':type.color,'--row-tint':`${type.color}14`}}><span className="meeting-type-icon" style={{color:type.color}}><SymbolIcon kind={row.meetingKind}/></span><button className="task-name" onClick={()=>onMeetings(row.meetingKind)}>{type.label}</button><button className="row-control edit-only" title={`${type.label}: moment toevoegen`} onClick={()=>onNewMeeting(row.meetingKind)}>+</button></div>;}
      if(row.kind==='milestones')return <div key="milestones" className="group-row milestones-panel-row"><span className="milestones-panel-icon">◆</span><button className="row-name" title="Alle mijlpalen bekijken; koppel een eindmijlpaal via de taakmodal" onClick={onMilestones}>Mijlpalen</button><span className="duration">{milestoneItems(project).length}</span></div>;
      const isGroup=row.kind==='group',item=isGroup?row.group:row.task,color=itemColor(item,project,isGroup),key=`${isGroup?'group':'task'}:${item.id}`;
      // Groeps-, taak- en subtaakrijen hebben allemaal een sleepgreep; de inspringing toont het niveau.
      const rowStyle={paddingLeft:8+row.depth*22,'--row-color':color,'--row-tint':`${color}14`};
      if(isGroup)return <div key={key} className={`group-row colored-row ${dropClass(key)}`} style={rowStyle} {...dropProps(row,key)}>
        {grip('group',item.id,item.name,delta=>{const siblings=project.groups.filter(g=>(g.parentId||null)===(item.parentId||null)),i=siblings.findIndex(g=>g.id===item.id),target=siblings[i+delta];if(target)onGroupMove(item.id,target.id,delta>0);})}
        <button className="row-control collapse" aria-label={`${item.name} ${collapsed.has(key)?'uitklappen':'inklappen'}`} onClick={()=>onToggle(key)}>{collapsed.has(key)?'▸':'▾'}</button>
        <input className="row-color" disabled={readOnly} aria-label={`Kleur groep ${item.name}`} title="Groepskleur wijzigen" type="color" value={color} onChange={e=>onColor('group',item.id,e.target.value)}/>
        <button className="group-name row-name" title="Groep bewerken" onClick={()=>readOnly?onToggle(key):onEditGroup(item)}>{item.name}</button>
        <button className="row-control edit-only" title="Taak toevoegen aan groep" aria-label={`Taak toevoegen aan ${item.name}`} onClick={()=>onNewTask(item.id)}>+</button>
        <button className="row-control row-delete edit-only" title="Groep verwijderen; taken behouden" aria-label={`Groep ${item.name} verwijderen`} onClick={()=>onDeleteGroup(item.id)}>×</button>
      </div>;
      return <div key={key} className={`task-row colored-row ${row.isSubtask?'subtask-row':''} ${dropClass(key)}`} style={rowStyle} {...dropProps(row,key)}>
        {grip('task',item.id,item.title,delta=>onTaskStep(item.id,delta))}
        {row.hasChildren?<button className="row-control collapse" aria-label={`${item.title} ${collapsed.has(key)?'uitklappen':'inklappen'}`} onClick={()=>onToggle(key)}>{collapsed.has(key)?'▸':'▾'}</button>:<span className="row-spacer"/>}
        <input className="row-color" disabled={readOnly} aria-label={`Kleur ${row.isSubtask?'subtaak':'taak'} ${item.title}`} title="Kleur wijzigen" type="color" value={color} onChange={e=>onColor('task',item.id,e.target.value)}/>
        <button className="task-name row-name" title={`${row.isSubtask?'Subtaak':'Taak'} bewerken`} onClick={()=>onEditTask(item)}>{item.title}</button>
        <span className="duration">{item.duration===0?'◆':`${item.duration} d`}</span>
        {!row.isSubtask&&<button className="row-control edit-only" title="Subtaak toevoegen" aria-label={`Subtaak toevoegen aan ${item.title}`} onClick={()=>onNewTask(item.groupId,item.id)}>+</button>}
        <button className={`connector row-control edit-only ${linkFrom===item.id?'selected':''}`} title="Dependency maken: klik voorganger, daarna opvolger" onClick={()=>onConnect(item.id)}>⌁</button>
        <button className="row-control row-delete edit-only" title={`${row.isSubtask?'Subtaak':'Taak'} verwijderen`} aria-label={`${item.title} verwijderen`} onClick={()=>onDeleteTask(item.id)}>×</button>
      </div>;
    })}
    <div className="panel-add edit-only"><button className="add-row" onClick={onNewGroup}>+ Groep</button><button className="add-row" onClick={()=>onNewTask()}>+ Taak</button></div>
    {rows.map((row,i)=><span key={`resize:${i}`} className="row-resizer" style={{top:(i+1)*rowHeight}} title="Sleep om de rijhoogte te wijzigen · dubbelklik herstelt" onPointerDown={e=>onRowResize(e,i)} onDoubleClick={onRowHeightReset}/>)}
    {panelResizer}
  </div>;
}
