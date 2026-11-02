import {writeFileSync} from 'node:fs';
import {tone,melody,noise} from '../src/fixtures.js';
import {pitch,chord,level,Analyzer,frames} from '../src/dsp.js';
import {preprocess} from '../src/preprocess.js';
const rate=48000,notes=[64,65,67,65];
function add(x,kind,snr){
 const n=kind==='accompaniment'?tone([55,59,62],x.length/rate,rate,true):noise(x.length);
 const scale=level(x).rms/(10**(snr/20)*Math.max(1e-8,level(n).rms));
 return {samples:Float32Array.from(x,(v,i)=>v+n[i]*scale+(kind==='dc'?.15:0)),noiseRms:level(n).rms*scale};
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
  const mp=add(melody(notes,rate,.6),kind,snr),a=new Analyzer({enabled,noiseRms:mp.noiseRms});
  for(const f of frames([mp.samples],rate))a.process(f);
  const confident=a.events.filter(e=>e.confidence>=.8&&e.midi!==null);
  const pairs=confident.map(e=>({e,i:Math.round((e.onsetMs-200)/600)}));
  const good=pairs.filter(({e,i})=>i>=0&&i<notes.length&&Math.abs(e.midi-notes[i])<.5&&Math.abs(e.onsetMs-200-i*600)<100);
  const falseNotes=pairs.length-good.length;
  rows.push({kind,snrDb:kind==='clean'?null:snr,preprocess:enabled,pitchTrials:4,pitchErrors,octaveErrors,unknownPitch,onsets:a.events.length,falseNotes,matchedOnsets:good.length,onsetMeanAbsErrorMs:good.length?good.reduce((s,{e,i})=>s+Math.abs(e.onsetMs-200-i*600),0)/good.length:null,chordWrong,chordUnknown,cpuMs:Math.round(performance.now()-start)});
 }
}
const report={description:'Deterministic synthetic harmonic-rich notes + seeded stationary noise / tonal accompaniment. Noise RMS is known from construction (oracle); not speech or real-room validation. No waveform denoising claim.',window:4096,hop:1024,chordWindow:16384,rate,rows};
writeFileSync('docs/noise-benchmark.json',JSON.stringify(report,null,2)+'\n');console.table(rows);
