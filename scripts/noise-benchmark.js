import {writeFileSync} from 'node:fs';
import {tone,melody,noise} from '../src/fixtures.js';
import {pitch,chord,level,Analyzer,frames} from '../src/dsp.js';
import {eventMetrics,mixAtSnr} from '../src/metrics.js';
import {preprocess} from '../src/preprocess.js';
const rate=48000,notes=[64,65,67,65];
function add(x,kind,snr,active=new Uint8Array(x.length).fill(1)){
 if(kind==='clean')return {samples:x.slice(),noiseRms:0,noiseGain:0};
 const n=kind==='accompaniment'?tone([55,59,62],x.length/rate,rate,true):noise(x.length);
 const {noiseGain:scale}=mixAtSnr(x,n,active,snr);
 return {samples:Float32Array.from(x,(v,i)=>v+n[i]*scale+(kind==='dc'?.15:0)),noiseRms:level(n).rms*scale,noiseGain:scale};
}
const rows=[];
for(const [kind,snr] of [['clean',100],['static',20],['static',10],['static',0],['static',-5],['dc',10],['accompaniment',10]]){
 for(const enabled of [false,true]){
  const start=performance.now();let pitchErrors=0,octaveErrors=0,unknownPitch=0,chordWrong=0,chordUnknown=0;
  for(const m of [40,52,64,67]){
   const pair=add(tone([m],4096/rate,rate,true),kind,snr),config={enabled,noiseRms:pair.noiseRms};
   const pre=preprocess(pair.samples,config),r=pre.uncertain?{midi:null}:pitch(pre.samples,rate);
   if(r.midi===null)unknownPitch++;else if(Math.abs(r.midi-m)>.5){pitchErrors++;if(Math.abs(Math.abs(r.midi-m)-12)<.5)octaveErrors++;}
  }
  const cp=add(tone([48,52,55],16384/rate),kind,snr),pr=preprocess(cp.samples,{enabled,noiseRms:cp.noiseRms});
  const cr=pr.uncertain?{label:null}:chord(pr.samples,rate);if(cr.label===null)chordUnknown++;else if(cr.label!=='C')chordWrong++;
  const cleanMelody=melody(notes,rate,.6),mask=Uint8Array.from(cleanMelody,(_,i)=>notes.some((m,j)=>i/rate>=.2+j*.6&&i/rate<.2+j*.6+.33)?1:0);
  const mp=add(cleanMelody,kind,snr,mask),a=new Analyzer({enabled,noiseRms:mp.noiseRms});
  for(const f of frames([mp.samples],rate))a.process(f);
  const confident=a.events.filter(e=>e.confidence>=.8&&e.midi!==null);
  const event=eventMetrics(notes.map((midi,i)=>({midi,onsetMs:200+i*600})),a.events,{durationMs:mp.samples.length/rate*1000});
  rows.push({kind,ratio:kind==='accompaniment'?'SIR':'SNR',melodyNoiseGain:mp.noiseGain,chordNoiseGain:cp.noiseGain,snrDb:kind==='clean'?null:snr,preprocess:enabled,pitchTrials:4,pitchErrors,octaveErrors,unknownPitch,onsets:a.events.length,event,chordWrong,chordUnknown,cpuMs:Math.round(performance.now()-start)});
 }
}
const onlyNoise=new Analyzer();for(const f of frames([noise(rate*3)],rate))onlyNoise.process(f);
const report={seed:123,calibrationMode:'oracle (noise-only ground truth); UI calibration tested separately',noiseOnly:eventMetrics([],onlyNoise.events,{durationMs:3000,noiseOnly:true}),metricVersion:2,description:'Deterministic synthetic harmonic-rich notes + seeded stationary noise / tonal accompaniment. SNR/SIR uses labeled target-active regions; gains are retained. Noise RMS is known from construction (oracle); not speech or real-room validation. No waveform denoising claim.',window:4096,hop:1024,chordWindow:16384,rate,rows};
writeFileSync('docs/noise-benchmark.json',JSON.stringify(report,null,2)+'\n');console.table(rows.map(({event,...r})=>({...r,notePrecision:event.note.precision,noteRecall:event.note.recall,noteF1:event.note.f1,coverage:event.eventAcceptanceCoverage})));
console.log('noise-only',report.noiseOnly);
