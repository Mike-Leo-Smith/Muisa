import test from 'node:test';
import assert from 'node:assert/strict';
import {Analyzer,frames,pitch} from '../src/dsp.js';
import {tone,melody,noise} from '../src/fixtures.js';
import {alignOffline,score} from '../src/score.js';
function analyze(x,rate=48000){const a=new Analyzer();for(const f of frames([x],rate))a.process(f);return a;}
const frame=(startSample=0)=>({streamId:'test',sampleRateHz:48000,startSample,hopSize:1024,channels:[new Float32Array(4096)]});
test('32/96 kHz and octaves retain absolute pitch',()=>{for(const rate of [32000,96000])for(const midi of [40,52,64,76]){const p=pitch(tone([midi],4096/rate,rate,true),rate);assert.ok(Math.abs(p.midi-midi)<.25,JSON.stringify({rate,midi,p}));}});
test('weak decay moves to unknown without hallucinating new attacks',()=>{
 const rate=48000,x=new Float32Array(rate*2),t=tone([64],1.5,rate,true);for(let i=0;i<t.length;i++)x[9600+i]=t[i]*Math.min(1,i/240)*Math.exp(-i/rate*4);
 const a=analyze(x);assert.equal(a.events.length,1);assert.ok(Math.abs(a.events[0].midi-64)<.2);
 assert.equal(pitch(x.subarray(x.length-4096),rate).midi,null);
});
test('seeded noise-only PCM yields no confident musical events',()=>{const a=analyze(noise(48000));assert.ok(a.events.every(e=>e.midi===null||e.confidence<.8));assert.equal(a.lastChord.label,null);assert.equal(analyze(new Float32Array(48000)).events.length,0);});
test('PCM extra distinct note remains an insertion',()=>{const a=analyze(melody([64,65,72,67,65,64,67,65,64]));const r=alignOffline(score.notes,a.events);assert.equal(r.path.filter(x=>x.kind==='extra').length,1);assert.equal(r.path.filter(x=>x.kind==='match').length,8);});
test('accelerating separated PCM aligns sequence but does not assert local timing grade',()=>{const rate=48000,onsets=[.2,.95,1.6,2.15],notes=[64,65,67,65],x=new Float32Array(rate*3);notes.forEach((m,i)=>x.set(tone([m],.25,rate,true),Math.round(onsets[i]*rate)));const a=analyze(x),r=alignOffline(notes.map((midi,i)=>({midi,beat:i*2})),a.events);assert.equal(r.cost,0);assert.equal(a.events.length,4);a.events.forEach((e,i)=>assert.ok(Math.abs(e.onsetMs-onsets[i]*1000)<45));});
test('known limitation: fast repeated notes below refractory period are merged',()=>{const a=analyze(melody([64,64,64,64,64,64],48000,.1));assert.ok(a.events.length<6);});
test('forward capture gap clears accumulated chord evidence',()=>{
 const a=new Analyzer();let last;for(const f of frames([tone([48,52,55],.5)],48000))last=a.process(f);assert.equal(last.chord.label,'C');
 const after=a.process({...frame(48000),streamId:'file'});assert.equal(after.discontinuity,true);assert.equal(after.chord,null);assert.equal(after.event,null);
});
test('duplicate/backward timestamp rejected without mutating analyzer state',()=>{const a=new Analyzer();a.process(frame(1024));for(const start of [1024,0])assert.throws(()=>a.process(frame(start)),/timestamps must increase/);assert.equal(a.lastStart,1024);assert.equal(a.process(frame(2048)).discontinuity,false);});
test('invalid samples/rate/hop and changed source fail explicitly',()=>{
 for(const bad of [{sampleRateHz:0},{hopSize:0},{channels:[new Float32Array([NaN])]}, {startSample:-1}])assert.throws(()=>new Analyzer().process({...frame(),...bad}),RangeError);
 const a=new Analyzer();a.process(frame());assert.throws(()=>a.process({...frame(1024),sampleRateHz:44100}),/Source changed/);assert.throws(()=>a.process({...frame(1024),streamId:'other'}),/Source changed/);
});
test('actual background calibration with DC offset does not gate clean musical signal',async()=>{
 const {backgroundRms,noiseEstimate,preprocess}=await import('../src/preprocess.js');
 const backgrounds=Array.from({length:48},()=>Float32Array.from(noise(4096),v=>.2+v*.02));
 const estimated=noiseEstimate(backgrounds.map(backgroundRms));assert.ok(estimated<.01);
 const played=Float32Array.from(tone([64],4096/48000),v=>v+.2),r=preprocess(played,{enabled:true,noiseRms:estimated});
 assert.equal(r.uncertain,false);assert.ok(Math.abs(pitch(r.samples,48000).midi-64)<.2);
 assert.equal(preprocess(backgrounds[0],{enabled:true,noiseRms:estimated}).uncertain,true);
});
test('capture gap must not manufacture a new attack on a sustained note',()=>{
 const a=new Analyzer(),pcm=tone([64],1);const list=[...frames([pcm],48000)];
 for(const f of list.slice(0,12))a.process(f);const before=a.events.length;
 for(const f of list.slice(20,27))a.process(f);assert.equal(a.events.length,before);
});
test('known boundary limitation: no-lead-in attack is localized at first tail hop',()=>{const a=analyze(tone([64],.4));assert.equal(a.events.length,1);assert.equal(a.events[0].onsetMs,64);});
test('truncated final window is not padded into invented onset evidence',()=>{assert.equal([...frames([new Float32Array(4095)],48000)].length,0);const x=new Float32Array(48000);x.set(tone([64],.02),48000-960);const a=analyze(x);assert.equal(a.events.length,0);});
