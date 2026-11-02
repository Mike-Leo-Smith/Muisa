export const score={id:'three-notes-v1',bpm:60,notes:[64,65,67,65,64,67,65,64].map((midi,i)=>({midi,beat:i*2}))};
const cost=(a,b)=>b.midi===null||b.confidence<.8?.8:Math.abs(a.midi-b.midi)<.5?0:1.5;
// Causal sequence follower. It never revises committed matches, nor uses future events.
export class LiveAligner {
  constructor(notes){this.notes=notes;this.cursor=0;this.matches=[];}
  push(event){
    if(event.midi===null||event.confidence<.8)return {kind:'unknown',event};
    let index=this.cursor;
    while(index<Math.min(this.cursor+3,this.notes.length)&&cost(this.notes[index],event)!==0)index++;
    if(index>=Math.min(this.cursor+3,this.notes.length)) return {kind:'extra',event};
    const result={kind:'match',index,skipped:Array.from({length:index-this.cursor},(_,j)=>this.cursor+j),event};
    this.cursor=index+1;this.matches.push(result);return result;
  }
}
// Offline edit-distance alignment uses the full sequence; not a live timing score.
export function alignOffline(notes,events){
  const n=notes.length,m=events.length,d=Array.from({length:n+1},()=>new Float64Array(m+1));
  for(let i=0;i<=n;i++)d[i][0]=i;for(let j=0;j<=m;j++)d[0][j]=j;
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+cost(notes[i-1],events[j-1]));
  let i=n,j=m;const path=[];
  while(i||j){
    if(i&&j&&Math.abs(d[i][j]-d[i-1][j-1]-cost(notes[i-1],events[j-1]))<1e-8){
      path.push({kind:cost(notes[i-1],events[j-1])===0?'match':events[j-1].midi===null||events[j-1].confidence<.8?'unknown':'wrong',index:--i,eventIndex:--j});
    }else if(i&&d[i][j]===d[i-1][j]+1)path.push({kind:'unobserved',index:--i});
    else path.push({kind:'extra',eventIndex:--j});
  }
  path.reverse();
  const matches=path.filter(x=>x.kind==='match');
  let tempo=null;
  if(matches.length>=2){
    const a=matches[0],b=matches.at(-1),delta=events[b.eventIndex].onsetMs-events[a.eventIndex].onsetMs;
    if(delta>0)tempo=60000*(notes[b.index].beat-notes[a.index].beat)/delta;
  }
  return {path,cost:d[n][m],estimatedBpm:tempo};
}
