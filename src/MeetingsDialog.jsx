import React,{useState} from 'react';
import Modal from './Modal.jsx';
import DependencyEditor from './DependencyEditor.jsx';
import {MEETING_TYPES,expandMeetings,recurrenceLabel,weekdayNames,seriesDates,timeRange,OCCURRENCE_FIELDS} from './events.js';
import {today,day,validDate} from './engine.js';
import {SymbolIcon,fullDate} from './TimelineSymbol.jsx';
const newMeeting=(kind='team')=>({id:crypto.randomUUID(),title:'',kind,date:today(),time:'10:00',endTime:'11:00',location:'',description:'',recurrence:null,isNew:true});
// Aanpassingen en overgeslagen datums die niet meer in de reeks vallen, vervallen bij het bewaren van de reeks.
function pruneSeries(m) {
  if(!m.recurrence){const {overrides,exceptions,...single}=m;return single;}
  const dates=new Set(seriesDates(m)),overrides=Object.fromEntries(Object.entries(m.overrides||{}).filter(([date])=>dates.has(date)));
  return {...m,overrides,exceptions:(m.exceptions||[]).filter(date=>dates.has(date))};
}
function OccurrenceEditor({meeting,project,originalDate,onSave,onDependency,onConnect,readOnly}) {
  const occurrence=expandMeetings(project).find(item=>item.seriesId===meeting.id&&item.originalDate===originalDate),skipped=(meeting.exceptions||[]).includes(originalDate);
  const [o,setO]=useState(()=>Object.fromEntries(OCCURRENCE_FIELDS.map(key=>[key,(occurrence||meeting)[key]||''])));
  const base={...meeting,date:originalDate};
  const set=(key,value)=>setO({...o,[key]:value});
  function save(){if(!validDate(o.date))return;const changes=Object.fromEntries(OCCURRENCE_FIELDS.filter(key=>(o[key]||'')!==(base[key]||'')).map(key=>[key,o[key]]));const overrides={...meeting.overrides};if(Object.keys(changes).length)overrides[originalDate]=changes;else delete overrides[originalDate];onSave({...meeting,overrides});}
  function reset(){const overrides={...meeting.overrides};delete overrides[originalDate];onSave({...meeting,overrides});}
  function skip(value){onSave({...meeting,exceptions:value?[...(meeting.exceptions||[]),originalDate]:(meeting.exceptions||[]).filter(date=>date!==originalDate)});}
  if(skipped)return <div className="occurrence-edit"><p className="form-hint">Deze datum wordt overgeslagen en staat niet in de planning.</p>{!readOnly&&<button type="button" onClick={()=>skip(false)}>Weer opnemen in de reeks</button>}</div>;
  return <><fieldset className="occurrence-edit task-edit-fields" disabled={readOnly}><legend>Alleen deze datum{occurrence?.overridden?' · aangepast':''}</legend>
    <div className="form-grid"><label>Datum<input required type="date" value={o.date} onChange={e=>set('date',e.target.value)}/></label><label>Locatie<input value={o.location} onChange={e=>set('location',e.target.value)}/></label><label>Begintijd<input type="time" value={o.time} onChange={e=>set('time',e.target.value)}/></label><label>Eindtijd<input type="time" min={o.time||undefined} value={o.endTime} onChange={e=>set('endTime',e.target.value)}/></label></div>
    <label>Notities voor deze datum<textarea rows="2" value={o.description} onChange={e=>set('description',e.target.value)}/></label>
    {!readOnly&&<div className="modal-actions"><button type="button" className="danger" onClick={()=>skip(true)}>Deze datum overslaan</button>{occurrence?.overridden&&<button type="button" onClick={reset}>Terug naar de reeks</button>}<button type="button" className="primary" onClick={save}>Alleen deze datum bewaren</button></div>}
  </fieldset>
  {occurrence&&<DependencyEditor project={project} nodeId={occurrence.occurrenceId} onChange={onDependency} onConnect={onConnect} readOnly={readOnly}/>}</>;
}
function MeetingForm({meeting,project,occurrenceId,onSave,onSaveOccurrence,onDelete,onClose,onDependency,onConnect,readOnly}) {
  const [m,setM]=useState(meeting);
  const occurrences=expandMeetings(project).filter(item=>item.seriesId===meeting.id),dates=meeting.recurrence?seriesDates(meeting):[];
  const [selected,setSelected]=useState(()=>occurrences.find(item=>item.occurrenceId===occurrenceId)?.originalDate||occurrences.find(item=>item.date>=today())?.originalDate||dates[0]);
  const set=(key,value)=>setM({...m,[key]:value});
  function frequency(value){const base=validDate(m.date)?m.date:today();setM({...m,date:base,recurrence:!value?null:{frequency:value,interval:1,weekday:new Date(`${base}T12:00:00Z`).getUTCDay(),ordinal:Math.floor((Number(base.slice(8))-1)/7)+1,until:day(base,365)}});}
  const label=date=>{const item=occurrences.find(x=>x.originalDate===date);return item?`${fullDate(item.date)}${item.time?' · '+timeRange(item):''}${item.overridden?' · aangepast':''}`:`${fullDate(date)} · overgeslagen`;};
  return <><form onSubmit={e=>{e.preventDefault();onSave(pruneSeries(m));}}><fieldset className="task-edit-fields" disabled={readOnly}>
    <label>Naam bijeenkomst<input required autoFocus value={m.title} onChange={e=>set('title',e.target.value)}/></label>
    <div className="form-grid"><label>Type<select value={m.kind} onChange={e=>set('kind',e.target.value)}>{Object.entries(MEETING_TYPES).map(([key,type])=><option key={key} value={key}>{type.label}</option>)}</select></label><label>{m.recurrence?'Herhalen vanaf':'Datum'}<input required type="date" value={m.date} onChange={e=>set('date',e.target.value)}/></label><label>Begintijd<input type="time" value={m.time||''} onChange={e=>set('time',e.target.value)}/></label><label>Eindtijd<input type="time" min={m.time||undefined} value={m.endTime||''} onChange={e=>set('endTime',e.target.value)}/></label></div>
    <label>Locatie<input value={m.location||''} onChange={e=>set('location',e.target.value)}/></label>
    <label>Herhalen<select value={m.recurrence?.frequency||''} onChange={e=>frequency(e.target.value)}><option value="">Niet herhalen</option><option value="weekly">Wekelijks</option><option value="monthly">Maandelijks op een vaste weekdag</option></select></label>
    {m.recurrence&&<div className="recurrence-fields form-grid"><label>Elke … {m.recurrence.frequency==='weekly'?'weken':'maanden'}<input type="number" min="1" max="120" required value={m.recurrence.interval} onChange={e=>set('recurrence',{...m.recurrence,interval:Number(e.target.value)})}/></label>{m.recurrence.frequency==='monthly'&&<label>Welke weekdag<select value={m.recurrence.ordinal} onChange={e=>set('recurrence',{...m.recurrence,ordinal:Number(e.target.value)})}>{[[1,'Eerste'],[2,'Tweede'],[3,'Derde'],[4,'Vierde'],[5,'Vijfde'],[-1,'Laatste']].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}<label>Weekdag<select value={m.recurrence.weekday} onChange={e=>set('recurrence',{...m.recurrence,weekday:Number(e.target.value)})}>{weekdayNames.map((label,key)=><option key={key} value={key}>{label}</option>)}</select></label><label>Herhalen tot en met<input required type="date" min={m.date} value={m.recurrence.until} onChange={e=>set('recurrence',{...m.recurrence,until:e.target.value})}/></label></div>}
    <label>Notities<textarea rows="3" value={m.description||''} onChange={e=>set('description',e.target.value)}/></label><p className="form-hint">Bijeenkomsten zijn vaste momenten, ook in weekenden of op vrije dagen. Bij een vijfde weekdag wordt een maand zonder die dag overgeslagen.{m.recurrence&&' Wijzigingen hier gelden voor de hele reeks; datums die je apart hebt aangepast houden hun eigen afwijkingen.'}</p>
    </fieldset><div className="modal-actions">{!readOnly&&!m.isNew&&<button type="button" className="danger" onClick={()=>onDelete(m.id)}> {m.recurrence?'Hele reeks verwijderen':'Verwijderen'}</button>}<button type="button" onClick={onClose}>Sluiten</button>{!readOnly&&<button className="primary">{m.recurrence?'Reeks bewaren':'Bijeenkomst bewaren'}</button>}</div></form>
    {!m.isNew&&meeting.recurrence&&selected&&<><div className="occurrence-select"><label>Datum uit de reeks<select value={selected} onChange={e=>setSelected(e.target.value)}>{dates.map(date=><option key={date} value={date}>{label(date)}</option>)}</select></label><small>Pas één datum aan zonder de rest van de reeks te wijzigen. Iedere datum heeft eigen dependencies.</small></div>
      <OccurrenceEditor key={`${selected}:${JSON.stringify(meeting.overrides?.[selected]||{})}:${(meeting.exceptions||[]).includes(selected)}`} meeting={meeting} project={project} originalDate={selected} onSave={onSaveOccurrence} onDependency={onDependency} onConnect={onConnect} readOnly={readOnly}/></>}
    {!m.isNew&&!meeting.recurrence&&occurrences[0]&&<DependencyEditor project={project} nodeId={occurrences[0].occurrenceId} onChange={onDependency} onConnect={onConnect} readOnly={readOnly}/>}
    {m.isNew&&<p className="form-hint meeting-save-hint">Bewaar eerst de bijeenkomst of reeks om dependencies toe te voegen.</p>}
  </>;
}
export default function MeetingsDialog({project,initial,error,onSave,onSaveOccurrence,onDelete,onDependency,onConnect,onClose,readOnly}) {
  const [selected,setSelected]=useState(initial?.new?newMeeting(initial.kind):project.meetings?.find(m=>m.id===initial?.meetingId)||null);
  // Na het bewaren van één datum blijft de dialoog open; toon dan de actuele versie van de reeks.
  const current=selected&&!selected.isNew?project.meetings?.find(m=>m.id===selected.id)||selected:selected;
  return <Modal title={current?(current.isNew?'Bijeenkomst toevoegen':current.recurrence?'Bijeenkomstenreeks':'Bijeenkomst'):'Bijeenkomsten'} onClose={onClose}>
    {error&&<div className="message error" role="alert">{error}</div>}
    <div className="meetings-navigation">{current&&<button onClick={()=>setSelected(null)}>← Overzicht</button>}{!readOnly&&<button onClick={()=>setSelected(newMeeting(initial?.kind))}>+ Bijeenkomst</button>}</div>
    {current?<MeetingForm key={current.id} meeting={current} project={project} occurrenceId={initial?.occurrenceId} onSave={onSave} onSaveOccurrence={onSaveOccurrence} onDelete={onDelete} onClose={onClose} onDependency={onDependency} onConnect={onConnect} readOnly={readOnly}/>:<div className="meetings-list">{(project.meetings||[]).map(m=><button key={m.id} onClick={()=>setSelected(m)}><span style={{color:MEETING_TYPES[m.kind].color}}><SymbolIcon kind={m.kind}/></span><div><strong>{m.title}</strong><small>{MEETING_TYPES[m.kind].label} · {recurrenceLabel(m)}</small><small>Vanaf {fullDate(m.date)}{m.time?' · '+timeRange(m):''}{Object.keys(m.overrides||{}).length?` · ${Object.keys(m.overrides).length} datum(s) aangepast`:''}</small></div><span>›</span></button>)}{!(project.meetings||[]).length&&<p>Nog geen bijeenkomsten. Voeg een los moment of een herhalende reeks toe.</p>}</div>}
  </Modal>;
}
