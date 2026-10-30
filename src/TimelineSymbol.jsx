import React,{useEffect,useId,useState} from 'react';
import {createPortal} from 'react-dom';
import {MEETING_TYPES,recurrenceLabel,DEADLINE_COLOR,MOVING_COLOR,timeRange} from './events.js';
export const fullDate=s=>new Date(`${s}T12:00:00Z`).toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
export function SymbolIcon({kind='other',mode}) {
  if(mode)return <svg viewBox="0 0 24 24" aria-hidden="true">{mode==='deadline'?<><path d="M6 21V3m0 1h14l-4 5 4 5H6" fill="none" stroke="currentColor" strokeWidth="2"/></>:<path d="M12 2 22 12 12 22 2 12Z" fill="currentColor"/>}</svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {kind==='team'?<><circle cx="8" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 21v-3a6 6 0 0 1 12 0v3m1-7a5 5 0 0 1 7 5v2"/></>:kind==='stakeholder'?<><path d="M3 3h18v11H11l-5 5v-5H3Z"/><circle cx="8" cy="8" r=".6"/><circle cx="12" cy="8" r=".6"/><circle cx="16" cy="8" r=".6"/></>:kind==='steering'?<><path d="M12 2 21 6v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m7 12 3 3 6-7"/></>:kind==='workshop'?<><path d="m4 16 12-12 4 4-12 12-5 1Z"/><path d="m13 7 4 4M3 3h7M3 7h3"/></>:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-12 4h6"/></>}
  </svg>;
}
export function symbolDescription(item) {
  if(item.mode)return `${item.mode==='deadline'?'Vaste deadline':'Meeschuivende mijlpaal'}: ${item.title} — ${fullDate(item.date)}${item.late?' — taak eindigt te laat':''}`;
  return `${MEETING_TYPES[item.kind]?.label}: ${item.title} — ${fullDate(item.date)}${item.time?` · ${timeRange(item)}`:''}${item.overridden?' · aangepast':''}`;
}
export default function TimelineSymbol({x,y,items,onClick,small=false,blocked=false}) {
  const [position,setPosition]=useState(null),id=useId(),item=items[0];
  const color=blocked?DEADLINE_COLOR:item.mode?(item.mode==='deadline'?DEADLINE_COLOR:MOVING_COLOR):MEETING_TYPES[item.kind].color;
  useEffect(()=>{if(!position)return;const hide=()=>setPosition(null);window.addEventListener('scroll',hide,true);return()=>window.removeEventListener('scroll',hide,true);},[position]);
  function show(e){const r=e.currentTarget.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(window.innerWidth-338,r.left)),top:r.bottom+8,above:r.bottom+260>window.innerHeight,bottom:window.innerHeight-r.top+8});}
  return <>
    <button className={`timeline-symbol ${small?'end-symbol':''} ${item.mode?'milestone-symbol':''} ${blocked||item.late?'symbol-alert':''}`} style={{left:x,top:y,'--symbol-color':color}} onMouseEnter={show} onMouseLeave={()=>setPosition(null)} onFocus={show} onBlur={()=>setPosition(null)} onClick={()=>onClick(items)} aria-describedby={position?id:undefined} aria-label={items.length===1?symbolDescription(item):`${items.length} momenten; klik voor de lijst`}>
      <SymbolIcon kind={item.kind} mode={item.mode}/>{items.length>1&&<span className="symbol-count">{items.length}</span>}{(blocked||item.late)&&<span className="symbol-warning">!</span>}
    </button>
    {position&&createPortal(<div id={id} role="tooltip" className="timeline-tooltip" style={{left:position.left,maxHeight:Math.max(90,window.innerHeight-(position.above?position.bottom:position.top)-10),overflow:'hidden',...(position.above?{bottom:position.bottom}:{top:position.top})}}>
      {items.slice(0,8).map((value,index)=><div className="tooltip-item" key={index}><strong>{value.title}</strong><span>{fullDate(value.date)}{value.time?` · ${timeRange(value)}`:''}{value.overridden?' · aangepast t.o.v. reeks':''}</span>{value.mode?<><span>{value.mode==='deadline'?'Vaste deadline — schuift niet mee':'Mijlpaal — volgt het taakeinde'}</span><span>Taak: {value.taskTitle}</span>{value.mode==='deadline'&&<span>Gepland einde: {fullDate(value.planned)}</span>}{value.late&&<b className="loss">Deadline overschreden</b>}</>:<><span>{MEETING_TYPES[value.kind].label} · {recurrenceLabel(value)}</span>{value.location&&<span>{value.location}</span>}{value.description&&<span>{value.description}</span>}</>}</div>)}
      {items.length>8&&<span>En {items.length-8} andere momenten. Klik voor de volledige lijst.</span>}{blocked&&<strong className="loss">Een vereiste voorganger is niet op tijd gepland.</strong>}<small>Klik om details te bekijken.</small>
    </div>,document.body)}
  </>;
}
