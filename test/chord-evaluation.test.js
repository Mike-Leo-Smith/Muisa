import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLabel,referenceAt,summarize} from '../experiments/chords/labels.js';
import {CANDIDATES,chord} from '../src/dsp.js';
import {tone} from '../src/fixtures.js';
const candidates=Object.keys(CANDIDATES);
test('chord labels preserve OOV quality, unknown, no-chord and inversion scope',()=>{
 assert.equal(parseLabel('C:maj/3',candidates).label,'C');
 assert.equal(parseLabel('C:maj/3',candidates).bass,'3');
 assert.equal(parseLabel('A:min',candidates).label,'Am');
 for(const label of ['C:7','C:maj7','C:maj(9)','C:sus4','F#:maj'])assert.equal(parseLabel(label,candidates).kind,'out-of-vocabulary');
 assert.equal(parseLabel('N',candidates).kind,'no-chord');assert.equal(parseLabel('X',candidates).kind,'unknown');
 assert.equal(parseLabel('not-a-label',candidates).kind,'unknown');
});
test('stable classification requires complete trailing window and boundary guard',()=>{
 const segments=[{start:0,end:1,label:'C:maj'},{start:1,end:2,label:'A:min'}];
 assert.equal(referenceAt(segments,.1,.5,.15,candidates).stratum,'transition');
 assert.equal(referenceAt(segments,.2,.6,.15,candidates).stratum,'stable');
 assert.equal(referenceAt(segments,.8,1.2,.15,candidates).stratum,'transition');
 assert.equal(referenceAt(segments,1.6,2.1,.15,candidates).kind,'unknown');
});
test('coverage OOV false acceptance and unknown remain separate denominators',()=>{
 const rows=[['C:maj','C'],['C:maj',null],['A:min','C'],['C:7','C'],['N',null],['X','C']].map(([raw,prediction])=>({reference:{...parseLabel(raw,candidates),stratum:'stable'},prediction}));
 const s=summarize(rows).stable;
 assert.equal(s.supported,3);assert.equal(s.supportedAccuracy,1/3);assert.equal(s.supportedCoverage,2/3);
 assert.equal(s.acceptedSupportedPrecision,1/2);assert.equal(s.oovFalseAcceptance,1);assert.equal(s.noChordFalseAcceptance,0);
 assert.equal(s.unknown,1);assert.equal(s.unknownAccepted,1);assert.equal(s.confusion['Am -> C'],1);
 assert.equal(summarize([{reference:{kind:'unknown',stratum:'annotation-gap'},prediction:null}])['annotation-gap'].supportedAccuracy,null);
});
test('frozen baseline evaluated from PCM, not simulated chord decisions',()=>{
 assert.equal(chord(tone([48,52,55],16384/48000),48000).label,'C');
 assert.equal(chord(tone([48,52,55,58],16384/48000),48000).label,null);
});
