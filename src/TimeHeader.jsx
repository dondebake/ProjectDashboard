import React from 'react';
import {day,working} from './engine.js';
function isoWeek(s) {
  const d=new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d-yearStart)/86400000)+1)/7);
}
function bands(start,totalDays,kind) {
  const result=[];
  for(let i=0;i<totalDays;i++) {
    const s=day(start,i),d=new Date(`${s}T12:00:00Z`);
    const key=kind==='year'?s.slice(0,4):kind==='month'?s.slice(0,7):day(s,-((d.getUTCDay()+6)%7));
    const label=kind==='year'?key:kind==='month'?d.toLocaleDateString('nl-NL',{month:'long',year:'numeric',timeZone:'UTC'}):`Week ${isoWeek(s)}`;
    if(result.at(-1)?.key===key)result.at(-1).days++;
    else result.push({key,label,days:1});
  }
  return result;
}
export default function TimeHeader({start,totalDays,zoom,mode,calendar}) {
  const scale=mode==='fit'?(zoom>=24?'day':zoom>=12?'week':'month'):mode;
  return <>
    <div className="calendar-band">{bands(start,totalDays,scale==='month'?'year':'month').map(b=><div key={b.key} style={{width:b.days*zoom}} title={b.label}>{b.label}</div>)}</div>
    <div className="calendar-ticks">{scale==='day'?Array.from({length:totalDays},(_,i)=>{const s=day(start,i);return <div key={s} style={{width:zoom}} className={!working(s,calendar)?'nonwork':''} title={s}>{s.slice(8)}</div>;}):bands(start,totalDays,scale==='week'?'week':'month').map(b=><div key={b.key} style={{width:b.days*zoom}} title={b.label}>{b.label}</div>)}</div>
  </>;
}
