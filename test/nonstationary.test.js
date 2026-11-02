import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {floatWav,verifyPairs} from '../experiments/nonstationary/audio.js';import {analyze} from '../experiments/nonstationary/analyze.js';
const config=JSON.parse(readFileSync(new URL('../experiments/nonstationary/config.json',import.meta.url)));
function wav(x){const b=Buffer.alloc(44+x.length*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(192000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(x.length*4,40);x.forEach((v,i)=>b.writeFloatLE(v,44+4*i));return b;}
test('N1 float WAV and paired conditions preserve linear stems, reject corruption/nonfinite',()=>{
 const x=floatWav(wav([.1,.2]));assert.equal(x.sampleRateHz,48000);assert.throws(()=>floatWav(wav([NaN])));const b=wav([.1]);assert.throws(()=>floatWav(b.subarray(0,b.length-1)));
 const inputs={};for(const [n,v] of [['room-only',.1],['speech-only',.02],['transients-only',.03],['room-speech',.12],['room-speech-transients',.15],['speech-transients-only',.05]])inputs[n]=floatWav(wav([v,v]));verifyPairs(inputs);inputs['speech-only'].pcm[0]=.2;assert.throws(()=>verifyPairs(inputs),/Unpaired/);
});
test('N1 negative event rates use processed duration and no target; same guard stays visible',()=>{
 const pcm=new Float32Array(48000);const silent=analyze(pcm,[],config);assert.equal(silent.events.falseEventsPerMinute,0);assert.equal(silent.pitch.voicingFalseAlarm,0);assert.ok(silent.unprocessedTailMs>=0&&silent.unprocessedTailMs<1024/48);
 for(let i=9600;i<36000;i++)pcm[i]=.2*Math.sin(2*Math.PI*330*i/48000);
 const notes=[{midi:64,onsetMs:200,durationMs:550}];const positive=analyze(pcm,notes,config),negative=analyze(pcm,[],config);assert.ok(positive.frameCounts['boundary-guard']>0);assert.equal(negative.frameCounts.mono,0);assert.ok(negative.events.falseEventsPerMinute>0);assert.ok(positive.pitch.voicedFrames>0);
});
import {targetNotes,lockedFiles,loadBundle,sha} from '../experiments/nonstationary/bundle.js';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('N1 actual delayed-label structure uses performed SMF gates once and rejects double delay',()=>{
 const n={noteId:'note-01',midi:52,velocity:78,performedOnsetSeconds:.4,performedGateEndSeconds:.8802083333333334,physicalDelaySeconds:.0014577259475218659,fractionalDelaySeconds:.0018140589569160999,targetOnsetSeconds:.403271784904438,targetGateEndSeconds:.8834801182377714,onsetSample48000:19357,gateEndSample48000:42407};
 const doc={notes:[n],negativeConditionsHaveTargetNotes:false,negativeReference:[],resampleAdditionalDelaySeconds:0};const out=targetNotes(doc,1,1)[0];assert.equal(out.onsetMs,n.targetOnsetSeconds*1000);assert.ok(Math.abs(out.durationMs-480.2083333333334)<1e-8);assert.throws(()=>targetNotes({...doc,notes:[{...n,targetOnsetSeconds:n.targetOnsetSeconds+n.physicalDelaySeconds}]},1,1));
 assert.equal(lockedFiles({files:[{path:'labels/a.json',sha256:'a'.repeat(64)}]}).get('labels/a.json'),'a'.repeat(64));
});
test('N1 bundle validation to six-condition analysis with synthetic hashed assets, never real-scene inference',()=>{
 const root=mkdtempSync(join(tmpdir(),'n1-smoke-'));try{
  mkdirSync(join(root,'conditions'));mkdirSync(join(root,'labels'));const entries=[];const put=(p,b)=>{writeFileSync(join(root,p),b);entries.push({path:p,sha256:sha(b)});return sha(b);};
  const hashes={};for(const name of config.conditions){const value=name==='room-only'?.1:name==='speech-only'?.02:name==='transients-only'?.03:name==='room-speech'?.12:name==='room-speech-transients'?.15:.05;hashes[name]=put(`conditions/${name}.wav`,wav(new Array(48000).fill(value)));}
  const notes=Array.from({length:12},(_,i)=>{const t=.15+i*.05;return {noteId:`n${i}`,midi:64,performedOnsetSeconds:t,performedGateEndSeconds:t+.03,physicalDelaySeconds:0,fractionalDelaySeconds:0,targetOnsetSeconds:t,targetGateEndSeconds:t+.03,onsetSample48000:Math.round(t*48000),gateEndSample48000:Math.round((t+.03)*48000)};});
  put('labels/performed-and-delayed.json',Buffer.from(JSON.stringify({notes,negativeConditionsHaveTargetNotes:false,negativeReference:[],resampleAdditionalDelaySeconds:0})));const manifestHash=put('manifest.json',Buffer.from('{}'));const lockBytes=Buffer.from(JSON.stringify({files:entries}));writeFileSync(join(root,'input-lock.json'),lockBytes);
  const binding={inputManifestSha256:manifestHash,inputLockSha256:sha(lockBytes),conditions:hashes,samples:48000,sampleRateHz:48000,pairTolerance:1e-7,pairId:'synthetic-only'};const b=loadBundle(root,binding,config);assert.equal(b.notes.length,12);
  for(const name of config.conditions){const report=analyze(b.inputs[name].pcm,name.startsWith('room-')?b.notes:[],config);assert.ok(report.analysisFrames>0);assert.equal(report.events.falseEventsPerMinute===null,name.startsWith('room-'));}
  writeFileSync(join(root,'labels/performed-and-delayed.json'),'{}');assert.throws(()=>loadBundle(root,binding,config));
 }finally{rmSync(root,{recursive:true,force:true});}
});
