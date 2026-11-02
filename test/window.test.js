import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {analyzeWindows} from '../experiments/window/analyze.js';import {pitch} from '../src/dsp.js';
const c=JSON.parse(readFileSync(new URL('../experiments/window/config.json',import.meta.url)));
test('W1 baseline exactly reproduces original R1 JS; short window shares all centers',()=>{
 const x=Float32Array.from({length:22050},(_,i)=>i<5000?0:.1*Math.sin(2*Math.PI*82.4069*i/22050));const rows=analyzeWindows(x,c);const original=[];
 for(let i=0;i+4096<=x.length;i+=512){const p=pitch(x.subarray(i,i+4096),22050);original.push(p.confidence>=.8?p.midi:null);}
 assert.deepEqual(rows[0].prediction,original);assert.equal(rows[1].prediction.length,original.length);
 assert.ok(rows.every(r=>r.prediction.some(p=>p!==null&&Math.abs(p-40)<.5)));
});
test('W1 estimates available for a fixed prefix cannot change with future samples',()=>{
 const a=Float32Array.from({length:16000},(_,i)=>.1*Math.sin(2*Math.PI*330*i/22050));const b=new Float32Array(24000);b.set(a);b.fill(.2,16000);
 const short=analyzeWindows(a,c),long=analyzeWindows(b,c);
 for(let i=0;i<2;i++)assert.deepEqual(long[i].prediction.slice(0,short[i].prediction.length),short[i].prediction);
});
