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
