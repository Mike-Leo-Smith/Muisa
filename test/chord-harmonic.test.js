import test from 'node:test';import assert from 'node:assert/strict';
import {HarmonicChord,magnitude} from '../experiments/chords/harmonic.js';
import {synth} from '../experiments/chords/controlled.js';
import {chord} from '../src/dsp.js';import {allAcceptedPrecision,baselineChecks,rejectionCounts} from '../experiments/chords/diagnostics.js';
const model=new HarmonicChord();
test('FFT Hann peak agrees with exact bin sinusoid and finite input checks',()=>{
 const n=2048,k=32,x=Float32Array.from({length:n},(_,i)=>Math.sin(2*Math.PI*k*i/n)),s=magnitude(x);
 assert.equal(s.indexOf(Math.max(...s)),k);assert.ok(Math.abs(s[k]-(n-1)/4)<.01);
 assert.throws(()=>magnitude(new Float32Array(1025)));assert.throws(()=>model.process(new Float32Array(1024)));
 const bad=new Float32Array(16384);bad[1]=NaN;assert.throws(()=>model.process(bad));
});
test('fixed harmonic candidate recognizes seven canonical triads without score input',()=>{
 for(const [label,notes]of Object.entries({C:[48,52,55],Am:[45,48,52],G:[43,47,50],Em:[40,43,47],D:[50,54,57],Dm:[50,53,57],F:[41,45,48]}))assert.equal(model.process(synth(notes)).label,label);
});
test('weak third rejection is diagnosed independently of candidate result',()=>{
 const pcm=synth([48,52,55],{amplitudes:[1,.25,1]}),b=chord(pcm,48000),c=baselineChecks(b,pcm);
 assert.equal(b.label,null);assert.equal(c.weakest,false);assert.equal(c.evidence,true);assert.equal(model.process(pcm).label,'C');
 const summary=rejectionCounts([{reference:{stratum:'stable',kind:'supported',label:'C'},prediction:null,baselineChecks:c,topLabel:b.candidates[0].label}]);
 assert.equal(summary['stable/supported'].weakestFailed,1);assert.equal(summary['stable/supported'].topMismatch,0);
});
test('missing third single note seventh and unsupported triad remain unknown',()=>{
 for(const notes of [[48,55],[48],[48,52,55,58],[48,53,55],[42,46,49]])assert.equal(model.process(synth(notes)).label,null);
 assert.equal(model.process(new Float32Array(16384)).label,null);
 const x=synth([48,52,55]);x[20]=1;assert.equal(model.process(x).reason,'clipped');
});
test('inversion and strum window; fixed prefix unaffected by unrelated future windows',()=>{
 const x=synth([52,55,60]),before=model.process(x);assert.equal(before.label,'C');
 assert.equal(model.process(synth([48,52,55],{offsets:[0,1200,2400],attackSamples:240})).label,'C');
 model.process(synth([45,48,52]));assert.deepEqual(model.process(x),before);
});
test('accepted precision includes OOV and no-chord; unknown truth excluded explicitly',()=>{
 const s=allAcceptedPrecision({stable:{correct:29,acceptedSupported:29,oovAccepted:11,noChordAccepted:0,unknownAccepted:2}}).stable;
 assert.equal(s.acceptedKnownTruthPrecision,.725);assert.equal(s.acceptedKnownTruth,40);assert.equal(s.acceptedUnknownTruthExcluded,2);
});
