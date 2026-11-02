import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {LiveAligner,alignOffline} from '../../src/score.js';
import {OnlineDP} from './online-dp.js';
const notes=[60,62,64,64,65,67,69,71,72,74,76,77].map((midi,i)=>({midi,beat:i}));
const make=(ids,times=ids.map((_,i)=>200+i*500))=>ids.map((index,i)=>({event:{midi:notes[index].midi,confidence:.99,onsetMs:times[i]},truth:index}));
const full=notes.map((_,i)=>i),cases=[
 {id:'clean',items:make(full)},
 {id:'miss-one',items:make(full.filter(i=>i!==4))},
 {id:'miss-four-forward-jump',items:make([0,1,6,7,8,9,10,11])},
 {id:'extra-wrong',items:make(full)},
 {id:'duplicate-pluck',items:make(full)},
 {id:'duplicate-at-repeated-pitch',items:make(full)},
 {id:'unknown',items:make(full)},
 {id:'accelerate',items:make(full,full.map(i=>200+800*i-20*i*i))},
 {id:'pause',items:make(full,full.map(i=>200+i*500+(i>=5?4000:0)))},
 {id:'backward-repeat-section',items:make([0,1,2,3,4,5,2,3,4,5,6,7,8,9,10,11])},
 {id:'noise-only',items:full.map(i=>({event:{midi:null,confidence:.1,onsetMs:i*500},truth:null}))},
 {id:'confident-unrelated',items:full.map(i=>({event:{midi:35+i%2,confidence:.99,onsetMs:i*500},truth:null}))}
];
cases.find(c=>c.id==='extra-wrong').items.splice(5,0,{event:{midi:48,confidence:.99,onsetMs:2450},truth:null});
cases.find(c=>c.id==='duplicate-pluck').items.splice(2,0,{event:{midi:62,confidence:.99,onsetMs:950},truth:null});
cases.find(c=>c.id==='duplicate-at-repeated-pitch').items.splice(3,0,{event:{midi:64,confidence:.99,onsetMs:1450},truth:null});
cases.find(c=>c.id==='unknown').items[4]={event:{midi:null,confidence:.1,onsetMs:2200},truth:4};
const rows=[];
for(const c of cases){
 for(const [name,Type] of [['current-lookahead3',LiveAligner],['online-dp',OnlineDP]]){
  const follower=new Type(notes),outputs=[],compute=[];
  for(const {event} of c.items){const t=performance.now();outputs.push(follower.push({...event}));compute.push(performance.now()-t);}
  // Every prefix must match the same prefix with two different future continuations.
  for(let n=1;n<=c.items.length;n++){
   const prefix=c.items.slice(0,n).map(x=>({...x.event}));
   for(const future of [[{midi:40,confidence:.99,onsetMs:prefix.at(-1).onsetMs+1000}],[{midi:77,confidence:.99,onsetMs:prefix.at(-1).onsetMs+2000}]]){
    const f=new Type(notes),got=[...prefix,...future].map(e=>f.push(e)).slice(0,n);assert.deepEqual(got,outputs.slice(0,n));
   }
  }
  const targets=c.items.filter(i=>i.truth!==null).length,accepted=outputs.filter(o=>o.kind==='match').length,correct=outputs.filter((o,i)=>o.kind==='match'&&o.index===c.items[i].truth).length;
  const recoveryStart=c.id==='miss-four-forward-jump'?2:null;
  let recoveryAfterObservations=null;
  if(recoveryStart!==null)for(let i=recoveryStart;i+1<outputs.length;i++){if([i,i+1].every(j=>outputs[j].kind==='match'&&outputs[j].index===c.items[j].truth)){recoveryAfterObservations=i-recoveryStart+1;break;}}
  const falseAdvance=outputs.filter((o,i)=>o.kind==='match'&&o.index!==c.items[i].truth).length;
  rows.push({case:c.id,method:name,targets,accepted,correct,recoveryAfterObservations,precision:accepted?correct/accepted:null,coverage:targets?correct/targets:null,falseAdvance,unknown:outputs.filter(o=>o.kind==='unknown').length,computeMs:compute,outputs});
 }
 const offline=alignOffline(notes,c.items.map(x=>x.event));rows.push({case:c.id,method:'offline-edit-distance-noncausal',path:offline.path});
}
const d=new OnlineDP(notes);d.push({midi:60,confidence:.99,onsetMs:100});assert.throws(()=>d.push({midi:62,confidence:.99,onsetMs:99}),RangeError);
assert(rows.filter(r=>r.case==='noise-only'||r.case==='confident-unrelated').filter(r=>r.method!=='offline-edit-distance-noncausal').every(r=>r.accepted===0));
const report={experiment:'A1 event-level causal alignment, not audio recognition accuracy',notes,fixtures:cases,parameters:{skipCost:.65,extraCost:.8,wrongCost:2.5,margin:.15},limitations:'No acoustic DSP evaluated. Pitch-only DTW-style edit lattice, no tempo model. Backward section jumps unsupported. Repeated equal pitches can be intrinsically ambiguous. Online DP emits provisional current positions, never rewrites past outputs; not irreversible pedagogical scoring.',prefixInvariancePassed:true,rows};
writeFileSync('experiments/following/results.json',JSON.stringify(report,null,2)+'\n');console.table(rows.filter(r=>r.method!=='offline-edit-distance-noncausal').map(({case:id,method,precision,coverage,falseAdvance})=>({case:id,method,precision,coverage,falseAdvance})));
