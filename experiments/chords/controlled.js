import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {chord,hz} from '../../src/dsp.js';import {HarmonicChord} from './harmonic.js';import {baselineChecks,rawCounterfactual} from './diagnostics.js';
export function synth(midis,{amplitudes=midis.map(()=>1),partials=6,decay=1.4,cents=0,gain=.05,attackSamples=0,offsets=midis.map(()=>0),size=16384,rate=48000}={}){
 return Float32Array.from({length:size},(_,i)=>midis.reduce((sum,m,j)=>{const t=i-offsets[j];if(t<0)return sum;const envelope=attackSamples?Math.min(1,t/attackSamples):1;let v=0;for(let h=1;h<=partials;h++)v+=Math.sin(2*Math.PI*hz(m+cents/100)*h*t/rate)/h**decay;return sum+amplitudes[j]*v*envelope;},0)*gain);
}
export function cases(){
 const voicings={C:[48,52,55],Am:[45,48,52],G:[43,47,50],Em:[40,43,47],D:[50,54,57],Dm:[50,53,57],F:[41,45,48]},result=[];
 for(const [label,notes] of Object.entries(voicings))for(const [condition,ns,options]of [['sine',notes,{partials:1}],['harmonic',notes,{}],['weak-third',notes,{amplitudes:[1,.25,1]}],['inversion',[notes[1],notes[2],notes[0]+12],{}],['strum',notes,{offsets:[0,1200,2400],attackSamples:240}],['detuned20cents',notes,{cents:20}]])result.push({id:label+'-'+condition,label,condition,pcm:synth(ns,options)});
 for(const [id,notes]of [['missing-third',[48,55]],['single',[48]],['seventh',[48,52,55,58]],['sus',[48,53,55]],['OOV-Fsharp',[42,46,49]]])result.push({id,label:null,condition:id,pcm:synth(notes)});
 result.push({id:'weak-seventh',label:null,condition:'weak-OOV-extension',pcm:synth([48,52,55,58],{amplitudes:[1,1,1,.25]})});
 result.push({id:'quiet-C',label:null,condition:'gate',pcm:synth([48,52,55],{gain:.001})});
 result.push({id:'silence',label:null,condition:'gate',pcm:new Float32Array(16384)});
 let seed=123;result.push({id:'noise-only',label:null,condition:'negative',pcm:Float32Array.from({length:16384},()=>{seed=(1664525*seed+1013904223)>>>0;return(seed/2**32-.5)*.08;})});
 // Ambiguous changing/weak fourth pitch examples remain diagnostic, not asserted wins.
 const x=synth([48,52,55]);x.set(synth([45,48,52],{size:8192}),8192);result.push({id:'mid-window-change',label:null,condition:'transition-unknown',pcm:x});
 return result;
}
export function run(){const config=JSON.parse(fs.readFileSync(new URL('./candidate-config.json',import.meta.url))),model=new HarmonicChord(48000,16384,config.harmonicModel);return cases().map(({pcm,...c})=>{const t=performance.now(),old=chord(pcm,48000),u=performance.now(),next=model.process(pcm),v=performance.now();return {...c,baseline:old.label,rawThresholdOnly:rawCounterfactual(old,config.harmonicModel),raw24:rawCounterfactual(old,config.harmonicModel,true),harmonic24:next.label,baselineChecks:baselineChecks(old,pcm),baselineTop:old.candidates[0]??null,candidateTop:next.candidates[0]??null,candidateChecks:next.checks??null,relativeResidual:next.relativeResidual??null,computeMs:{baseline:u-t,harmonic24:v-u}};});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const rows=run(),report={status:'mathematical-synthetic-development-only-not-real-guitar',cases:rows.length,methods:Object.fromEntries(['baseline','rawThresholdOnly','raw24','harmonic24'].map(k=>[k,{correct:rows.filter(r=>r[k]===r.label).length,total:rows.length}])),rows};if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({cases:report.cases,methods:report.methods,failures:rows.filter(r=>r.harmonic24!==r.label).map(r=>({id:r.id,prediction:r.harmonic24,checks:r.candidateChecks}))},null,2));}
