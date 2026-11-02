import {readFileSync,writeFileSync} from 'node:fs';
import {pitchMetrics,latencySummary} from '../../src/metrics.js';
const models=[];
for(const capacity of ['tiny','small']){
 const raw=JSON.parse(readFileSync(`reports/crepe/${capacity}.json`));
 const {rows,...meta}=raw;
 models.push({...meta,rows:rows.map(({reference,prediction,stable,...r})=>({...r,allFrames:pitchMetrics(reference,prediction),stableFrames:pitchMetrics(reference.filter((_,i)=>stable[i]),prediction.filter((_,i)=>stable[i])),compute:latencySummary(r.wholeClipComputeMs,2400)}))});
}
writeFileSync('experiments/crepe/results.json',JSON.stringify({experiment:'C1 official CREPE tiny/small, synthetic only',fixtures:JSON.parse(readFileSync('reports/yin/manifest.json')).cases.map(({id,sha256,noiseSeed,noiseGain,snrDb})=>({id,sha256,noiseSeed,noiseGain,snrDb})),limitations:'Native CREPE 64ms windows/10ms hop differ from Y1; not directly pooled. Offline batch invocation, no Viterbi; center=false timestamps shifted +32ms for labels. No actual hardware, true guitar or realtime integration.',models},null,2)+'\n');
console.table(models.flatMap(m=>m.rows.map(r=>({model:m.capacity,case:r.id,threshold:r.threshold,RPA50:r.allFrames.rpa[50],coverage:r.allFrames.voicedCoverage,falseAlarm:r.allFrames.voicingFalseAlarm,clipP50ms:r.compute.p50Ms}))));
