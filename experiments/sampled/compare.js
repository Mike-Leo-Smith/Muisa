import {readFileSync,writeFileSync} from 'node:fs';
import {Analyzer,frames} from '../../src/dsp.js';
import {backgroundRms} from '../../src/preprocess.js';
import {pitchMetrics,eventMetrics,latencySummary} from '../../src/metrics.js';
const manifest=JSON.parse(readFileSync('reports/sampled/manifest.json'));const rows=[];
for(const c of manifest.cases){
 const b=readFileSync('reports/sampled/'+c.file);let data;
 for(let i=12;i+8<=b.length;){const size=b.readUInt32LE(i+4);if(b.toString('ascii',i,i+4)==='data')data=b.subarray(i+8,i+8+size);i+=8+size+(size%2);}
 const x=Float32Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768);
 // First 185.8ms is before every MIDI onset (300ms). Measured, not oracle noise.
 const noiseRms=backgroundRms(x.subarray(0,4096));
 for(const mode of ['raw','dc','dc-calibrated-gate']){
  const analyzer=new Analyzer({enabled:mode!=='raw',noiseRms:mode==='dc-calibrated-gate'?noiseRms:null}),pred=[],midiRef=[],acousticRef=[],compute=[];
  for(const f of frames([x],22050)){
   const t=performance.now(),r=analyzer.process(f);compute.push(performance.now()-t);pred.push(r.pitch.confidence>=.8?r.pitch.midi:null);
   const center=(f.startSample+2048)/22050*1000;
   midiRef.push(c.notes.find(n=>center>=n.onsetMs&&center<n.onsetMs+n.durationMs)?.midi??null);
   acousticRef.push(c.notes.find(n=>center>=n.acousticOnsetMs&&center<n.onsetMs+n.durationMs)?.midi??null);
  }
  const acoustic=c.notes.map(n=>({...n,onsetMs:n.acousticOnsetMs}));
  rows.push({id:c.id,mode,noiseRms,calibration:'measured first4096samples before signal; same DC-free domain',midiPitch:pitchMetrics(midiRef,pred),acousticProxyPitch:pitchMetrics(acousticRef,pred),midiEvents:eventMetrics(c.notes,analyzer.events),acousticProxyEvents:eventMetrics(acoustic,analyzer.events),compute:latencySummary(compute,1024/22050*1000),events:analyzer.events});
 }
}
const result={experiment:'M2 raw/DC/measured-noise confidence gating on paired sampled guitar',limitations:'Not speech denoising. Automatic dry attack proxy with threshold sensitivity, not human ground truth. MIDI gate end retained; release tails can be counted as false voicing. No real hardware, no held-out bank/room family. PCM16 sample renderer, no independent per-case normalization.',rows};
writeFileSync('experiments/sampled/results.json',JSON.stringify(result,null,2)+'\n');
console.table(rows.map(r=>({case:r.id,mode:r.mode,RPA50:r.acousticProxyPitch.rpa[50],coverage:r.acousticProxyPitch.voicedCoverage,F1:r.acousticProxyEvents.note.f1})));
