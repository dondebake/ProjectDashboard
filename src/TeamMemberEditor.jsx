import React,{useState} from 'react';
import Modal from './Modal.jsx';
import {today,day,validDate} from './engine.js';
export default function TeamMemberEditor({member,project,error,onSave,onDelete,onClose,readOnly}) {
  const [m,setM]=useState(member);
  const used=project.tasks.some(t=>t.teamAssignments?.some(a=>a.memberId===m.id));
  function updateRate(id,key,value){setM({...m,rates:m.rates.map(r=>r.id===id?{...r,[key]:value}:r)});}
  function addRate(){const last=[...m.rates].sort((a,b)=>a.end.localeCompare(b.end)).at(-1),start=validDate(last?.end)?day(last.end,1):today();setM({...m,rates:[...m.rates,{id:crypto.randomUUID(),start,end:`${start.slice(0,4)}-12-31`,hourlyRate:last?.hourlyRate??null}]});}
  return <Modal title={m.isNew?'Teamlid toevoegen':readOnly?'Teamlid bekijken':'Teamlid bewerken'} onClose={onClose}>{error&&<div className="message error" role="alert">{error}</div>}<form onSubmit={e=>{e.preventDefault();onSave(m);}}><fieldset className="task-edit-fields" disabled={readOnly}>
    <div className="form-grid"><label>Naam<input required autoFocus value={m.name} onChange={e=>setM({...m,name:e.target.value})}/></label><label>Rol<input value={m.role||''} onChange={e=>setM({...m,role:e.target.value})}/></label></div>
    <h3>Uurtarieven per periode</h3><p className="form-hint">Begin- en einddatum tellen mee. Periodes mogen niet overlappen; gebruik voor een volgend tarief de volgende kalenderdag.</p>
    <div className="rate-editor"><div className="rate-editor-head"><span>Startdatum</span><span>Einddatum</span><span>Tarief (EUR/uur)</span><span/></div>{m.rates.map(r=><div className="rate-editor-row" key={r.id}><input aria-label="Startdatum tariefperiode" required type="date" value={r.start} onChange={e=>updateRate(r.id,'start',e.target.value)}/><input aria-label="Einddatum tariefperiode" required type="date" min={r.start} value={r.end} onChange={e=>updateRate(r.id,'end',e.target.value)}/><input aria-label="Uurtarief in euro" required type="number" min="0" step="0.01" value={r.hourlyRate??''} onChange={e=>updateRate(r.id,'hourlyRate',e.target.value===''?null:Number(e.target.value))}/><button type="button" aria-label="Tariefperiode verwijderen" onClick={()=>setM({...m,rates:m.rates.filter(x=>x.id!==r.id)})}>×</button></div>)}</div>
    {!m.rates.length&&<p className="allocation-warning">Zonder tariefperiodes kunnen toegewezen uren niet naar een bedrag worden omgerekend.</p>}{!readOnly&&<button type="button" onClick={addRate}>+ Tariefperiode</button>}
    </fieldset><div className="modal-actions">{!readOnly&&!m.isNew&&<button type="button" className="danger" disabled={used} title={used?'Verwijder eerst de taaktoewijzingen':'Teamlid verwijderen'} onClick={()=>onDelete(m.id)}>Verwijderen</button>}<button type="button" onClick={onClose}>Sluiten</button>{!readOnly&&<button className="primary">Teamlid bewaren</button>}</div>{used&&<p className="form-hint">Dit teamlid is aan taken toegewezen. Naam en tarieven kun je wijzigen; verwijderen kan nadat de toewijzingen zijn verwijderd.</p>}
  </form></Modal>;
}
