// Nederlandse feestdagen die per project aan te vinken zijn. De datums worden per jaar berekend.
export const PUBLIC_HOLIDAYS={newYear:'Nieuwjaarsdag',easterMonday:'2e paasdag',kingsDay:'Koningsdag',ascension:'Hemelvaartsdag',whitMonday:'2e pinksterdag',christmas:'1e en 2e kerstdag'};
const iso=date=>date.toISOString().slice(0,10);
const utc=(year,month,dayOfMonth)=>new Date(Date.UTC(year,month-1,dayOfMonth,12));
const shift=(date,days)=>new Date(date.getTime()+days*864e5);
// Paaszondag volgens de Gregoriaanse kalender (anonieme algoritme van Meeus/Jones/Butcher).
export function easterSunday(year) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),dayOfMonth=((h+l-7*m+114)%31)+1;
  return utc(year,month,dayOfMonth);
}
const cache=new Map();
export function publicHolidayDates(year) {
  if(!cache.has(year)) {
    const easter=easterSunday(year),kingsDay=utc(year,4,27);
    cache.set(year,{
      newYear:[iso(utc(year,1,1))],
      easterMonday:[iso(shift(easter,1))],
      // Valt 27 april op zondag, dan is Koningsdag op zaterdag 26 april.
      kingsDay:[iso(kingsDay.getUTCDay()===0?shift(kingsDay,-1):kingsDay)],
      ascension:[iso(shift(easter,39))],
      whitMonday:[iso(shift(easter,50))],
      christmas:[iso(utc(year,12,25)),iso(utc(year,12,26))],
    });
  }
  return cache.get(year);
}
export function publicHoliday(date,keys) {
  if(!keys?.length)return null;
  const dates=publicHolidayDates(Number(date.slice(0,4)));
  return keys.find(key=>dates[key]?.includes(date))||null;
}
