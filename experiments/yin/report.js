import {readFileSync,writeFileSync} from 'node:fs';
import {pitchMetrics,latencySummary} from '../../src/metrics.js';
const m=JSON.parse(readFileSync('reports/yin/manifest.json')),p=JSON.parse(readFileSync('reports/yin/python.json'));
const rows=[];
for(const c of m.cases){
 const variants=[{method:'muisa-js',variant:'native energy/confidence gates',prediction:c.js.prediction,compute:c.js.compute,rssBytes:c.js.rssBytes},...p.results.filter(r=>r.id===c.id)];
 for(const v of variants){const {prediction,...rest}=v;rows.push({id:c.id,...rest,allFrames:pitchMetrics(c.reference,prediction),stableFrames:pitchMetrics(c.reference.filter((_,i)=>c.stable[i]),prediction.filter((_,i)=>c.stable[i])),...(v.wholeClipComputeMs?{clipCompute:latencySummary(v.wholeClipComputeMs,m.durationSeconds*1000)}:{})});}
}
const report={experiment:'Y1 synthetic-only paired pitch comparison',librosa:p.librosa,python:p.python,platform:p.platform,jitWarmupMs:p.jitWarmupMs,windowSize:m.windowSize,sampleRateHz:m.sampleRateHz,hopSize:m.hopSize,fixtures:m.cases.map(({id,sha256,notes,noiseSeed,noiseGain,snrDb})=>({id,sha256,notes,noiseSeed,noiseGain,snrDb})),limitations:'No true guitar, onset/chord/end-to-end latency evaluation. pYIN HMM uses whole future clip despite center=false. Process peak RSS includes interpreter/libraries/JIT; JS RSS is a different process and not incremental model memory. Three clip timings are exploratory, not robust p95 inference.',rows};
writeFileSync('experiments/yin/results.json',JSON.stringify(report,null,2)+'\n');console.table(rows.map(r=>({case:r.id,method:r.method,variant:r.variant,RPA50:r.allFrames.rpa[50],coverage:r.allFrames.voicedCoverage,falseAlarm:r.allFrames.voicingFalseAlarm,stableRPA:r.stableFrames.rpa[50]})));
