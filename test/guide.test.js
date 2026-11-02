import test from 'node:test';import assert from 'node:assert/strict';
import {PracticeGuide,assessNoise,assessQuality,tuningReading} from '../src/guide.js';
import {FirstLesson} from '../src/lesson.js';import {Analyzer,frames} from '../src/dsp.js';import {noise,tone} from '../src/fixtures.js';
const observation=(time,pitch=64,rms=.1)=>({timeMs:time,endTimeMs:time+86,centeredRms:rms,level:{peak:rms*2,clipped:false},pitch:{midi:pitch,confidence:pitch===null?0:.99}});
test('noise calibration uses DC-free PCM and rejects silence/playing/transients',()=>{
 const x=noise(48000*3);for(let i=0;i<x.length;i++)x[i]=x[i]*.002+.2;
 const a=new Analyzer(),results=[...frames([x],48000)].map(f=>a.process(f));const measured=assessNoise(results);assert(measured.ok);assert(measured.noiseRms<.003);
 assert(!assessNoise(Array.from({length:20},(_,i)=>observation(i*50,null,0))).ok);
 assert(!assessNoise(Array.from({length:20},(_,i)=>observation(i*50,64,.01))).ok);
 const transient=Array.from({length:20},(_,i)=>observation(i*50,null,i<4?.1:.001));assert(!assessNoise(transient).ok);
});
test('tuner preserves wrong octave, wrong note and low confidence as failures',()=>{
 assert.equal(tuningReading({midi:52,confidence:.99},40).kind,'octave');assert.equal(tuningReading({midi:45,confidence:.99},40).kind,'different');assert.equal(tuningReading({midi:40,confidence:.2},40).kind,'unknown');assert.equal(tuningReading({midi:40.1,confidence:.99},40).cents.toFixed(0),'10');
});
test('guide needs sustained tuning and records manual skips separately',()=>{
 const g=new PracticeGuide();g.connect('device');g.next();g.start();g.observe(observation(0,40));assert.equal(g.strings[0].status,'pending');
 for(let t=50;t<=450;t+=50)g.observe(observation(t,40));assert.equal(g.strings[0].status,'measured');g.next();g.next();assert.equal(g.strings[1].status,'manual-skip');g.connect('new-rate');assert.equal(g.stage,'noise');assert(g.strings.every(x=>x.status==='pending'));assert.equal(g.noiseRms,null);
});
test('PCM wrong octave does not pass tuning target',()=>{
 const g=new PracticeGuide();g.connect('pcm');g.next();g.start();const a=new Analyzer();for(const f of frames([tone([52],1,48000)],48000))g.observe(a.process(f));assert.equal(g.strings[0].status,'pending');assert.match(g.message,/倍频/);
});
test('quality reports clipping, weak signal and noisy input without hardware diagnosis',()=>{
 assert.equal(assessQuality([observation(0,64,.001)],.0001).status,'weak');assert.equal(assessQuality([observation(0,64,.2)],.15).status,'noisy');assert.equal(assessQuality([{...observation(0),level:{peak:1.1,clipped:true}}],.001).status,'clipped');
});
test('waiting practice and blind challenge have different feedback timing',()=>{
 const l=new FirstLesson();l.start('follow',0,100);l.accept({midi:64,confidence:1,onsetMs:50});assert.equal(l.cursor,0);l.accept({midi:65,confidence:1,onsetMs:101});assert.equal(l.cursor,0);l.accept({midi:64,confidence:.2,onsetMs:102});assert.match(l.message,/没听清/);l.accept({midi:64,confidence:1,onsetMs:103});assert.equal(l.cursor,1);
 l.start('blind',1000);const message=l.message;l.accept({midi:60,confidence:1,onsetMs:200});assert.equal(l.message,message);assert.deepEqual(l.labels(),['无提示挑战进行中']);assert(!l.tick(8999));assert(l.tick(9000));assert(l.result);assert.match(l.message,/未观测到/);l.stop();assert(!l.active);
});
