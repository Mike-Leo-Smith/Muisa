import test from 'node:test';import assert from 'node:assert/strict';
import {eventMetrics,pitchMetrics,mixAtSnr} from '../src/metrics.js';
import {Analyzer,frames} from '../src/dsp.js';import {melody,noise} from '../src/fixtures.js';
test('one-to-one metrics penalize duplicate/extra predictions with signed bias',()=>{const r=eventMetrics([{onsetMs:100,midi:64}],[{onsetMs:110,midi:64,confidence:1},{onsetMs:120,midi:64,confidence:1}],{durationMs:1000});assert.equal(r.note.tp,1);assert.equal(r.note.fp,1);assert.equal(r.note.signedOnsetBiasMs,10);assert.equal(r.note.precision,.5);});
test('octave/voicing errors and unknown reduce coverage rather than hiding errors',()=>{const r=pitchMetrics([64,64,64,null],[64,76,null,60]);assert.equal(r.rpa[50],1/3);assert.equal(r.voicedCoverage,2/3);assert.equal(r.acceptedPrecision50,1/3);assert.equal(r.octaveErrors,1);assert.equal(r.voicingFalseAlarm,1);const n=eventMetrics([],[{onsetMs:0,midi:64,confidence:1}],{durationMs:30000,noiseOnly:true});assert.equal(n.falseEventsPerMinute,2);});
test('active-region SNR gain ignores silence padding',()=>{const r=mixAtSnr(Float32Array.of(0,1,1,0),Float32Array.of(10,1,1,10),[0,1,1,0],20);assert.equal(r.noiseGain,.1);assert.equal(r.activeSampleCount,2);});
test('causal DSP emitted prefix is invariant to appended future audio',()=>{
 const prefix=melody([64,65],48000,.6),a=new Float32Array(prefix.length+48000),b=a.slice();a.set(prefix);b.set(prefix);b.set(noise(48000),prefix.length);
 function emitted(x){const d=new Analyzer(),out=[];for(const f of frames([x],48000)){if(f.startSample+4096>prefix.length)break;const r=d.process(f);if(r.event)out.push(r.event);}return out;}
 assert.ok(emitted(a).length>0);assert.deepEqual(emitted(a),emitted(b));
});
