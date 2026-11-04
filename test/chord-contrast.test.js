import test from 'node:test';import assert from 'node:assert/strict';
import {contrast} from '../experiments/chords/contrast.js';import {chord} from '../src/dsp.js';import {synth} from '../experiments/chords/controlled.js';
test('C3 recognizes canonical PCM triads and preserves feature input',()=>{
 for(const [label,notes]of Object.entries({C:[48,52,55],Am:[45,48,52],G:[43,47,50],Em:[40,43,47],D:[50,54,57],Dm:[50,53,57],F:[41,45,48]})){
  const b=chord(synth(notes),48000),before=structuredClone(b);assert.equal(contrast(b).label,label);assert.deepEqual(b,before);
 }
});
test('C3 rejects equal-strength seventh sus missing third and unsupported root',()=>{
 for(const notes of [[48,52,55,58],[48,53,55],[48,55],[48],[42,46,49]])assert.equal(contrast(chord(synth(notes),48000)).label,null);
 assert.equal(contrast({reason:'quiet',candidates:[]}).label,null);assert.equal(contrast({chroma:Array(12).fill(0)}).reason,'empty-chroma');
});
test('expanded competitors are distinct from raw triads and expose ambiguous roots',()=>{
 const x=Array(12).fill(0);x[0]=x[2]=x[7]=1;const r=contrast({chroma:x});assert.equal(r.label,null);assert.equal(r.candidates.length,108);assert.equal(r.margin,0);
 assert.equal(contrast({chroma:x},{includeExtended:false}).candidates.length,24);
});
test('contrast validation and prefix results independent of later calls',()=>{
 const b=chord(synth([48,52,55]),48000),r=contrast(b);contrast(chord(synth([45,48,52]),48000));assert.deepEqual(contrast(b),r);
 assert.throws(()=>contrast({chroma:Array(12).fill(NaN)}));assert.throws(()=>contrast(b,{exponent:NaN}));assert.throws(()=>contrast(b,{includeExtended:1}));
});
