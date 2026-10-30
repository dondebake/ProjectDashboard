import React,{useState} from 'react';
import Modal from './Modal.jsx';
import DependencyEditor from './DependencyEditor.jsx';
import {MEETING_TYPES,expandMeetings,recurrenceLabel,weekdayNames} from './events.js';
import {today,day,validDate} from './engine.js';
import {SymbolIcon,fullDate} from './TimelineSymbol.jsx';
const newMeeting=(kind='team')=>({id:crypto.randomUUID(),title:'',kind,date:today(),time:'10:00',location:'',description:'',recurrence:null,isNew:true});
function MeetingForm({meeting,project,occurrenceId,onSave,onDelete,onClose,onDependency,onConnect,readOnly}) {
  const [m,setM]=useState(meeting),[selected,setSelected]=useState(occurrenceId||'');
  const set=(key,value)=>setM({...m,[key]:value});
  const occurrences=expandMeetings(project).filter(item=>item.seriesId===meeting.id);
  const current=occurrences.find(item=>item.occurrenceId===selected)||occurrences[0];
  function frequency(value){const base=validDate(m.date)?m.date:today();setM({...m,date:base,recurrence:!value?null:{frequency:value,interval:1,weekday:new Date(`${base}T12:00:00Z`).getUTCDay(),ordinal:Math.floor((Number(base.slice(8))-1)/7)+1,until:day(base,365)}});}
  return <><form onSubmit={e=>{e.preventDefault();onSave(m);}}><fieldset className="task-edit-fields" disabled={readOnly}>
    <label>Naam bijeenkomst<input required autoFocus value={m.title} onChange={e=>set('title',e.target.value)}/></label>
    <div className="form-grid"><label>Type<select value={m.kind} onChange={e=>set('kind',e.target.value)}>{Object.entries(MEETING_TYPES).map(([key,type])=><option key={key} value={key}>{type.label}</option>)}</select></label><label>{m.recurrence?'Herhalen vanaf':'Datum'}<input required type="date" value={m.date} onChange={e=>set('date',e.target.value)}/></label><label>Tijd<input type="time" value={m.time||''} onChange={e=>set('time',e.target.value)}/></label><label>Locatie<input value={m.location||''} onChange={e=>set('location',e.target.value)}/></label></div>
    <label>Herhalen<select value={m.recurrence?.frequency||''} onChange={e=>frequency(e.target.value)}><option value="">Niet herhalen</option><option value="weekly">Wekelijks</option><option value="monthly">Maandelijks op een vaste weekdag</option></select></label>
    {m.recurrence&&<div className="recurrence-fields form-grid"><label>Elke … {m.recurrence.frequency==='weekly'?'weken':'maanden'}<input type="number" min="1" max="120" required value={m.recurrence.interval} onChange={e=>set('recurrence',{...m.recurrence,interval:Number(e.target.value)})}/></label>{m.recurrence.frequency==='monthly'&&<label>Welke weekdag<select value={m.recurrence.ordinal} onChange={e=>set('recurrence',{...m.recurrence,ordinal:Number(e.target.value)})}>{[[1,'Eerste'],[2,'Tweede'],[3,'Derde'],[4,'Vierde'],[5,'Vijfde'],[-1,'Laatste']].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}<label>Weekdag<select value={m.recurrence.weekday} onChange={e=>set('recurrence',{...m.recurrence,weekday:Number(e.target.value)})}>{weekdayNames.map((label,key)=><option key={key} value={key}>{label}</option>)}</select></label><label>Herhalen tot en met<input required type="date" min={m.date} value={m.recurrence.until} onChange={e=>set('recurrence',{...m.recurrence,until:e.target.value})}/></label></div>}
    <label>Notities<textarea rows="3" value={m.description||''} onChange={e=>set('description',e.target.value)}/></label><p className="form-hint">Bijeenkomsten zijn vaste momenten, ook in weekenden of op vrije dagen. Bij een vijfde weekdag wordt een maand zonder die dag overgeslagen.</p>
    </fieldset><div className="modal-actions">{!readOnly&&!m.isNew&&<button type="button" className="danger" onClick={()=>onDelete(m.id)}> {m.recurrence?'Hele reeks verwijderen':'Verwijderen'}</button>}<button type="button" onClick={onClose}>Sluiten</button>{!readOnly&&<button className="primary">{m.recurrence?'Reeks bewaren':'Bijeenkomst bewaren'}</button>}</div></form>
    {!m.isNew&&current&&<><div className="occurrence-select"><label>Dependencies voor deze datum<select value={current.occurrenceId} onChange={e=>setSelected(e.target.value)}>{occurrences.map(item=><option key={item.occurrenceId} value={item.occurrenceId}>{fullDate(item.date)}{item.time?' · '+item.time:''}</option>)}</select></label><small>Iedere datum heeft eigen dependencies. Wijzigingen in het formulier gelden voor de hele reeks na bewaren.</small></div><DependencyEditor project={project} nodeId={current.occurrenceId} onChange={onDependency} onConnect={onConnect} readOnly={readOnly}/></>}
    {m.isNew&&<p className="form-hint meeting-save-hint">Bewaar eerst de bijeenkomst of reeks om dependencies toe te voegen.</p>}
  </>;
}
export default function MeetingsDialog({project,initial,error,onSave,onDelete,onDependency,onConnect,onClose,readOnly}) {
  const [selected,setSelected]=useState(initial?.new?newMeeting(initial.kind):project.meetings?.find(m=>m.id===initial?.meetingId)||null);
  return <Modal title={selected?(selected.isNew?'Bijeenkomst toevoegen':selected.recurrence?'Bijeenkomstenreeks':'Bijeenkomst'):'Bijeenkomsten'} onClose={onClose}>
    {error&&<div className="message error" role="alert">{error}</div>}
    <div className="meetings-navigation">{selected&&<button onClick={()=>setSelected(null)}>← Overzicht</button>}{!readOnly&&<button onClick={()=>setSelected(newMeeting(initial?.kind))}>+ Bijeenkomst</button>}</div>
    {selected?<MeetingForm key={selected.id} meeting={selected} project={project} occurrenceId={initial?.occurrenceId} onSave={onSave} onDelete={onDelete} onClose={onClose} onDependency={onDependency} onConnect={onConnect} readOnly={readOnly}/>:<div className="meetings-list">{(project.meetings||[]).map(m=><button key={m.id} onClick={()=>setSelected(m)}><span style={{color:MEETING_TYPES[m.kind].color}}><SymbolIcon kind={m.kind}/></span><div><strong>{m.title}</strong><small>{MEETING_TYPES[m.kind].label} · {recurrenceLabel(m)}</small><small>Vanaf {fullDate(m.date)}{m.time?' · '+m.time:''}</small></div><span>›</span></button>)}{!(project.meetings||[]).length&&<p>Nog geen bijeenkomsten. Voeg een los moment of een herhalende reeks toe.</p>}</div>}
  </Modal>;
}
