import React,{useState} from 'react';
import Modal from './Modal.jsx';
import {GROUP_COLOR} from './hierarchy.js';
export default function GroupEditor({group,error,onSave,onDelete,onClose}) {
  const [g,setG]=useState(group);
  return <Modal title={g.isNew?'Nieuwe groep':'Groep bewerken'} onClose={onClose}>
    {error&&<div className="message error" role="alert">{error}</div>}
    <form onSubmit={e=>{e.preventDefault();onSave(g);}}>
      <label>Groepsnaam<input required autoFocus value={g.name} onChange={e=>setG({...g,name:e.target.value})}/></label>
      <label>Kleur<div className="color-field"><input aria-label="Groepskleur" type="color" value={g.color||GROUP_COLOR} onChange={e=>setG({...g,color:e.target.value})}/><span>{g.color||GROUP_COLOR}</span></div></label>
      <label>Notities<textarea rows="3" value={g.description||''} onChange={e=>setG({...g,description:e.target.value})}/></label>
      <div className="form-hint">De kleur verschijnt in de rij en wordt overgenomen door taken en subtaken zonder eigen kleur. Sleep de groep aan de greep in het paneel om de volgorde te wijzigen.</div>
      <div className="modal-actions">{!g.isNew&&<button type="button" className="danger" onClick={()=>onDelete(g.id)}>Groep verwijderen</button>}<button type="button" onClick={onClose}>Annuleren</button><button className="primary">Groep bewaren</button></div>
    </form>
  </Modal>;
}
