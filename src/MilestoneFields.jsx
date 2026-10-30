import React from 'react';
import {finish,validDate,today} from './engine.js';
export default function MilestoneFields({task,calendar,onChange}) {
  const m=task.endMilestone;
  const defaultDate=validDate(task.start)&&Number.isInteger(task.duration)&&task.duration>=0&&task.duration<=36600?finish(task,calendar):today();
  return <fieldset className="task-finances milestone-fields"><legend>Mijlpaal aan het einde van de taak</legend>
    <label>Kenmerk<select value={m?.mode||''} onChange={e=>onChange(!e.target.value?null:{...m,mode:e.target.value,date:m?.date||defaultDate,title:m?.title||''})}><option value="">Geen eindmijlpaal</option><option value="moving">Mijlpaal — schuift mee met het taakeinde</option><option value="deadline">Deadline — vaste datum</option></select></label>
    {m&&<div className="form-grid"><label>Naam (optioneel)<input value={m.title||''} placeholder={task.title||'Taaknaam gebruiken'} onChange={e=>onChange({...m,title:e.target.value})}/></label>{m.mode==='deadline'?<label>Vaste deadline<input required type="date" value={m.date||''} onChange={e=>onChange({...m,date:e.target.value})}/></label>:<p className="form-hint">Deze mijlpaal volgt de einddatum van de taak, ook na het doorschuiven door dependencies.</p>}</div>}
    <p className="form-hint">Paars = meeschuivend. Rood = vaste deadline. Beide staan rechts van de taakbalk en onderaan in de rij Mijlpalen. Een overschreden deadline blijft op de vaste datum staan en krijgt een waarschuwing.</p>
  </fieldset>;
}
