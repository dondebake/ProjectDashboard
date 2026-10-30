import {daysBetween,finish} from './engine.js';
import {barTop,ROW_HEIGHT} from './layout.js';

const CLEARANCE = 6;
const EPS = 1e-6;
export function taskBounds(rows,rangeStart,zoom,calendar,rowHeight=ROW_HEIGHT) {
  return new Map(rows.flatMap((row,i)=>{
    if(row.kind!=='task')return [];
    const t=row.task,x=daysBetween(rangeStart,t.start)*zoom;
    const barWidth=t.duration===0?18:Math.max(12,(daysBetween(t.start,finish(t,calendar))+1)*zoom);
    const radius=9*Math.SQRT2;
    const left=t.duration===0?x-radius:x,right=t.duration===0?x+radius:x+barWidth;
    const bar=barTop(i,rowHeight),y=bar+(t.duration===0?11:12);
    const top=t.duration===0?y-radius:bar,bottom=t.duration===0?y+radius:bar+24;
    return [[t.id,{id:t.id,x,end:right,y,left,right,top,bottom,barWidth}]];
  }));
}

export function segmentBlocked(a,b,rect) {
  if(Math.abs(a.x-b.x)<EPS) return a.x>rect.left+EPS&&a.x<rect.right-EPS&&Math.max(a.y,b.y)>rect.top+EPS&&Math.min(a.y,b.y)<rect.bottom-EPS;
  if(Math.abs(a.y-b.y)<EPS) return a.y>rect.top+EPS&&a.y<rect.bottom-EPS&&Math.max(a.x,b.x)>rect.left+EPS&&Math.min(a.x,b.x)<rect.right-EPS;
  throw Error('Een dependencyroute moet uit rechte horizontale of verticale segmenten bestaan.');
}
const inside=(p,r)=>p.x>r.left+EPS&&p.x<r.right-EPS&&p.y>r.top+EPS&&p.y<r.bottom-EPS;
function simplify(points) {
  const result=[];
  for(const p of points) {
    if(result.length&&Math.abs(result.at(-1).x-p.x)<EPS&&Math.abs(result.at(-1).y-p.y)<EPS)continue;
    while(result.length>1) {
      const a=result.at(-2),b=result.at(-1);
      if((Math.abs(a.x-b.x)<EPS&&Math.abs(b.x-p.x)<EPS)||(Math.abs(a.y-b.y)<EPS&&Math.abs(b.y-p.y)<EPS))result.pop();else break;
    }
    result.push(p);
  }
  return result;
}

class Heap {
  values=[];
  push(item){const a=this.values;a.push(item);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].score<=item.score)break;a[i]=a[p];i=p;}a[i]=item;}
  pop(){const a=this.values,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].score<a[c].score)c++;if(a[c].score>=last.score)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}

// A* over een orthogonaal raster langs de randen van alle zichtbare obstakels.
// Zowel taakbalken als de volledige gedraaide mijlpaal krijgen vrije ruimte.
function freeRoute(start,end,rects,width,height) {
  if([start,end].some(p=>p.x<0||p.x>width||p.y<0||p.y>height||rects.some(r=>inside(p,r))))return null;
  const xs=[...new Set([0,width,start.x,end.x,...rects.flatMap(r=>[r.left,r.right])].filter(x=>x>=0&&x<=width))].sort((a,b)=>a-b);
  const ys=[...new Set([0,height,start.y,end.y,...rects.flatMap(r=>[r.top,r.bottom])].filter(y=>y>=0&&y<=height))].sort((a,b)=>a-b);
  const nx=xs.length,ny=ys.length;
  const begin=ys.indexOf(start.y)*nx+xs.indexOf(start.x),goal=ys.indexOf(end.y)*nx+xs.indexOf(end.x);
  const point=id=>({x:xs[id%nx],y:ys[Math.floor(id/nx)]});
  const clearEdges=new Map();
  function clear(a,b){const key=a<b?`${a}:${b}`:`${b}:${a}`;if(!clearEdges.has(key))clearEdges.set(key,!rects.some(r=>segmentBlocked(point(a),point(b),r)));return clearEdges.get(key);}
  const heap=new Heap(),distance=new Map(),parent=new Map();
  const initial=begin*3+1;distance.set(initial,0);heap.push({key:initial,cost:0,score:Math.abs(start.x-end.x)+Math.abs(start.y-end.y)});
  while(heap.values.length) {
    const current=heap.pop();if(current.cost!==distance.get(current.key))continue;
    const id=Math.floor(current.key/3),dir=current.key%3,p=point(id);
    if(id===goal){const path=[];let key=current.key;while(key!==undefined){path.push(point(Math.floor(key/3)));key=parent.get(key);}return path.reverse();}
    const x=id%nx,y=Math.floor(id/nx),neighbors=[];
    if(x>0)neighbors.push([id-1,1]);if(x<nx-1)neighbors.push([id+1,1]);if(y>0)neighbors.push([id-nx,2]);if(y<ny-1)neighbors.push([id+nx,2]);
    for(const [next,nextDir] of neighbors) {
      if(!clear(id,next))continue;
      const q=point(next),cost=current.cost+Math.abs(p.x-q.x)+Math.abs(p.y-q.y)+(dir===nextDir?0:10),key=next*3+nextDir;
      if(cost>=(distance.get(key)??Infinity))continue;
      distance.set(key,cost);parent.set(key,current.key);heap.push({key,cost,score:cost+Math.abs(q.x-end.x)+Math.abs(q.y-end.y)});
    }
  }
  return null;
}

export function routeDependency(dependency,bounds,{width,height}) {
  const a=bounds.get(dependency.from),b=bounds.get(dependency.to);
  if(!a||!b)return null;
  const fromFinish=dependency.type[0]==='F',toFinish=dependency.type[1]==='F';
  const start={x:fromFinish?a.right:a.left,y:a.y},end={x:toFinish?b.right:b.left,y:b.y};
  const exit={x:start.x+(fromFinish?1:-1)*(CLEARANCE+3),y:start.y};
  const entry={x:end.x+(toFinish?1:-1)*(CLEARANCE+3),y:end.y};
  const obstacles=[...bounds.values()];
  const padded=obstacles.map(r=>({...r,left:r.left-CLEARANCE,right:r.right+CLEARANCE,top:r.top-CLEARANCE,bottom:r.bottom+CLEARANCE}));
  const portsClear=!obstacles.some(r=>(r.id!==a.id&&segmentBlocked(start,exit,r))||(r.id!==b.id&&segmentBlocked(entry,end,r)));
  const middle=portsClear?freeRoute(exit,entry,padded,width,height):null;
  const fallbackY=(start.y+end.y)/2;
  const points=simplify(middle?[start,...middle,end]:[start,exit,{x:exit.x,y:fallbackY},{x:entry.x,y:fallbackY},entry,end]);
  // Laatste controle op echte, getekende balkafmetingen: nooit een kruising
  // als doorgetrokken lijn tonen, ook niet bij een onmogelijke aansluiting.
  const collision=points.some((p,i)=>i>0&&obstacles.some(r=>segmentBlocked(points[i-1],p,r)));
  return {points,dashed:!middle||collision,path:points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')};
}
