// Experimental causal edit-distance lattice over event x score position.
// Uses pitch only: arbitrary tempo/pause does not imply rhythm correctness.
export class OnlineDP {
 constructor(notes){this.notes=notes;this.cost=Array.from({length:notes.length+1},(_,i)=>i*.65);this.lastTime=-Infinity;}
 push(event){
  if(!Number.isFinite(event.onsetMs)||event.onsetMs<=this.lastTime)throw new RangeError('Event timestamps must strictly increase');
  this.lastTime=event.onsetMs;
  if(!Number.isFinite(event.midi)||!Number.isFinite(event.confidence)||event.confidence<.8)return {kind:'unknown'};
  const next=[this.cost[0]+.8],operation=['extra'];
  for(let j=1;j<=this.notes.length;j++){
   const same=Math.abs(event.midi-this.notes[j-1].midi)<.5;
   const choices=[{value:this.cost[j]+.8,op:'extra'},{value:this.cost[j-1]+(same?0:2.5),op:same?'match':'wrong'},{value:next[j-1]+.65,op:'skip'}];
   choices.sort((a,b)=>a.value-b.value);next[j]=choices[0].value;operation[j]=choices[0].op;
  }
  const ranked=next.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value),best=ranked[0],margin=ranked[1].value-best.value;
  this.cost=next.map(value=>value-best.value);
  if(margin<.15)return {kind:'unknown',reason:'ambiguous-position',margin};
  return operation[best.index]==='match'?{kind:'match',index:best.index-1,margin}:{kind:'extra',margin};
 }
}
