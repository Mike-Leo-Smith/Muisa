// Maximum-cardinality one-to-one matching. Evaluation only; never used to steer DSP.
function pairs(reference,predicted,eligible){
 const assigned=new Map();
 function visit(i,seen){
  const candidates=predicted.map((p,j)=>({j,error:Math.abs(reference[i].onsetMs-p.onsetMs)})).filter(({j})=>eligible(reference[i],predicted[j])).sort((a,b)=>a.error-b.error);
  for(const {j} of candidates){if(seen.has(j))continue;seen.add(j);if(!assigned.has(j)||visit(assigned.get(j),seen)){assigned.set(j,i);return true;}}
  return false;
 }
 reference.forEach((_,i)=>visit(i,new Set()));return [...assigned].map(([j,i])=>[i,j]);
}
export function eventMetrics(reference,events,{durationMs,onsetToleranceMs=50,pitchToleranceCents=50,noiseOnly=false}={}){
 const accepted=events.filter(e=>Number.isFinite(e.midi)&&e.confidence>=.8);
 const summarize=(matched,predictions)=>{const tp=matched.length,precision=predictions.length?tp/predictions.length:null,recall=reference.length?tp/reference.length:null;
 return {tp,fp:predictions.length-tp,fn:reference.length-tp,precision,recall,f1:reference.length+predictions.length?2*tp/(reference.length+predictions.length):null,signedOnsetBiasMs:tp?matched.reduce((s,[i,j])=>s+predictions[j].onsetMs-reference[i].onsetMs,0)/tp:null};};
 const detected=events.filter(e=>Number.isFinite(e.onsetMs));
 const onset=(r,p)=>Math.abs(r.onsetMs-p.onsetMs)<=onsetToleranceMs;
 return {onset:summarize(pairs(reference,detected,onset),detected),note:summarize(pairs(reference,accepted,(r,p)=>onset(r,p)&&Math.abs(r.midi-p.midi)*100<=pitchToleranceCents),accepted),eventAcceptanceCoverage:events.length?accepted.length/events.length:0,unknownEvents:events.length-accepted.length,falseEventsPerMinute:noiseOnly&&durationMs>0?accepted.length*60000/durationMs:null,falseOnsetsPerMinute:noiseOnly&&durationMs>0?detected.length*60000/durationMs:null,offsetEvaluated:false};
}
export function pitchMetrics(reference,predicted){
 if(reference.length!==predicted.length)throw new RangeError('Pitch frames must share a timeline');
 const voiced=reference.filter(Number.isFinite).length,unvoiced=reference.length-voiced;
 let accepted=0,acceptedTarget=0,falseVoiced=0,octaveErrors=0;const correct={10:0,25:0,50:0};
 reference.forEach((r,i)=>{const p=predicted[i];if(!Number.isFinite(p))return;accepted++;if(!Number.isFinite(r)){falseVoiced++;return;}acceptedTarget++;const cents=Math.abs(p-r)*100;for(const t of [10,25,50])if(cents<=t)correct[t]++;if(cents>=1150&&Math.abs(cents-Math.round(cents/1200)*1200)<=50)octaveErrors++;});
 return {voicedFrames:voiced,unvoicedFrames:unvoiced,rpa:Object.fromEntries([10,25,50].map(t=>[t,voiced?correct[t]/voiced:null])),acceptedPrecision50:accepted?correct[50]/accepted:null,voicedCoverage:voiced?acceptedTarget/voiced:null,voicingFalseAlarm:unvoiced?falseVoiced/unvoiced:null,octaveErrors};
}
export function latencySummary(values,deadlineMs){const x=[...values].sort((a,b)=>a-b);const q=p=>x.length?x[Math.min(x.length-1,Math.ceil(p*x.length)-1)]:null;return {count:x.length,p50Ms:q(.5),p95Ms:q(.95),deadlineMs,deadlineMisses:x.filter(v=>v>deadlineMs).length};}
export function mixAtSnr(clean,noise,active,snrDb){
 if(clean.length!==noise.length||clean.length!==active.length)throw new RangeError('Inputs and active mask must align');
 let targetEnergy=0,noiseEnergy=0;for(let i=0;i<clean.length;i++)if(active[i]){targetEnergy+=clean[i]**2;noiseEnergy+=noise[i]**2;}
 if(!targetEnergy||!noiseEnergy)throw new RangeError('Active-region target/noise energy must be nonzero');
 const noiseGain=Math.sqrt(targetEnergy/noiseEnergy/10**(snrDb/10));return {samples:Float32Array.from(clean,(x,i)=>x+noiseGain*noise[i]),noiseGain,snrDb,activeSampleCount:active.reduce((s,x)=>s+Number(Boolean(x)),0)};
}
