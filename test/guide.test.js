import test from 'node:test';import assert from 'node:assert/strict';
import {PracticeGuide,guideAnalysisConfig,assessNoise,assessQuality,tuningReading} from '../src/guide.js';
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

test('new start/retry cannot retain an earlier successful noise or string result',()=>{
 const g=new PracticeGuide();g.connect('device');g.noiseStatus='measured';g.noiseRms=.001;g.start();assert.equal(g.noiseRms,null);
 for(let t=0;t<=2000;t+=100)g.observe(observation(t,64,.014));assert.equal(g.noiseStatus,'rejected');g.next();assert.equal(g.history.at(-1).status,'manual-skip');
 g.strings[0]={status:'measured',cents:0};g.start();for(let t=0;t<=500;t+=100)g.observe(observation(t,45));assert.equal(g.strings[0].status,'pending');g.next();assert.equal(g.strings[0].status,'manual-skip');
 g.strings[1]={status:'measured',cents:0};g.resetAttempt();assert.equal(g.strings[1].status,'pending');g.connect('restarted');assert.equal(g.noiseStatus,'unset');
});
test('old noise gate cannot hide weak tonal contamination during same-domain recalibration',()=>{
 const x=Float32Array.from({length:48000*3},(_,i)=>.2+.02*Math.sin(2*Math.PI*330*i/48000)),g=new PracticeGuide();g.connect('device');g.noiseRms=.01;g.noiseStatus='measured';
 const old=new Analyzer(guideAnalysisConfig(true,.01,g));assert.equal(old.process([...frames([x],48000)][0]).pitch.midi,null);
 g.start();const config=guideAnalysisConfig(false,.01,g);assert.deepEqual(config,{enabled:true,noiseRms:null});const a=new Analyzer(config);
 for(const f of frames([x],48000))g.observe(a.process(f));assert.equal(g.noiseStatus,'rejected');assert.equal(g.noiseRms,null);assert.match(g.message,/混入/);
});
