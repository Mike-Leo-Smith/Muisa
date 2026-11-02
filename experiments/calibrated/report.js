import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Analyzer,frames} from '../../src/dsp.js';
import {pitchMetrics,eventMetrics,latencySummary} from '../../src/metrics.js';
const root='reports/calibrated',m=JSON.parse(readFileSync(root+'/manifest.json')),crepe=JSON.parse(readFileSync(root+'/crepe/tiny.json'));const rows=[];
for(const c of m.cases){
 const bytes=readFileSync(root+'/'+c.file);assert.equal(createHash('sha256').update(bytes).digest('hex'),c.sha256);let data;
 for(let i=12;i+8<=bytes.length;){const size=bytes.readUInt32LE(i+4);if(bytes.toString('ascii',i,i+4)==='data')data=bytes.subarray(i+8,i+8+size);i+=8+size+(size%2);}
 const x=Float32Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768),a=new Analyzer(),js=[],compute=[];
 for(const f of frames([x],22050)){const t=performance.now(),r=a.process(f);compute.push(performance.now()-t);js.push(r.pitch.confidence>=.8?r.pitch.midi:null);}
 const variants=[{name:'JS-native',prediction:js,firstCenter:2048/22050*1000,hop:1024/22050*1000,window:4096/22050*1000,processRssBytes:process.memoryUsage().rss,computePerFrame:latencySummary(compute,1024/22050*1000)},...crepe.rows.filter(r=>r.id===c.id).map(r=>({name:'CREPE-tiny-'+r.threshold,prediction:r.prediction,firstCenter:32,hop:10,window:64,wholeClipComputeMs:r.wholeClipComputeMs,wholeClipCpuMs:r.wholeClipCpuMs,processPeakRssKiB:r.processPeakRssKiB}))];
 for(const side of ['source','microphone']){
  const {reference,eligible}=c.referenceGrids[side],notes=side==='source'?c.sourceNotes:c.notes;
  for(const v of variants){
   const mapped=c.gridMs.map(t=>{const i=Math.round((t-v.firstCenter)/v.hop);assert(i>=0&&i<v.prediction.length);return v.prediction[i];});
   const {prediction,...meta}=v;
   rows.push({id:c.id,inputSha256:c.sha256,levelMode:c.levelMode,side,method:v.name,referenceGridSha256:createHash('sha256').update(JSON.stringify({times:c.gridMs,reference,eligible})).digest('hex'),referenceGridCount:reference.length,eligibleCount:eligible.filter(Boolean).length,excludedCount:eligible.filter(x=>!x).length,metrics:pitchMetrics(reference.filter((_,i)=>eligible[i]),mapped.filter((_,i)=>eligible[i])),native:meta,...(v.name==='JS-native'?{noteEvents:eventMetrics(notes,a.events)}:{})});
  }
 }
}
writeFileSync('reports/calibrated/pitch-results.json',JSON.stringify({experiment:'M3 common 10ms grid; identical per-side eligibility for all pitch methods',rows},null,2)+'\n');console.log('Compared',rows.length,'pitch rows on fixed source/microphone masks');
