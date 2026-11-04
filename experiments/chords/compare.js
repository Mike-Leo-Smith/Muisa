// Hash-bound prepared C1 input. No git executable required in evaluation environment.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {chord} from '../../src/dsp.js';import {HarmonicChord} from './harmonic.js';import {referenceAt,summarize} from './labels.js';import {baselineChecks,rejectionCounts,allAcceptedPrecision,rawCounterfactual} from './diagnostics.js';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const root=process.argv[2],out=process.argv[3];if(!root||!out)throw Error('Usage: node experiments/chords/compare.js C1_PREPARED NEW_OUTPUT');
if(fs.existsSync(out))throw Error('Output exists');
const configBytes=fs.readFileSync(new URL('./candidate-config.json',import.meta.url)),c=JSON.parse(configBytes),pbytes=fs.readFileSync(path.join(root,'prepared.json')),p=JSON.parse(pbytes);
if(p.configSha256!==c.evaluationConfigSha256||p.split!==c.allowedSplit)throw Error('Require unchanged C1 R1 development input; R2 not used for candidate development');
if(hash(fs.readFileSync(new URL('../../src/dsp.js',import.meta.url)))!==c.baselineDspSha256)throw Error('Baseline DSP changed');
const evaluation=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url)));if(hash(fs.readFileSync(new URL('./config.json',import.meta.url)))!==c.evaluationConfigSha256||JSON.stringify(evaluation)!==JSON.stringify(p.config))throw Error('Evaluation configuration changed');
const expected=JSON.parse(fs.readFileSync(new URL('./results-c1.json',import.meta.url))).splits.R1.recordings;
if(p.recordings.length!==6||p.recordings.some(r=>!expected.some(e=>r.id===e.id&&r.pcmSha256===e.pcmSha256)))throw Error('C1 R1 resampled PCM identity differs; no implicit resampling');
fs.mkdirSync(out);const model=new HarmonicChord(c.analysisSampleRateHz,c.windowSamples,c.harmonicModel),all={baseline:[],rawThresholdOnly:[],raw24:[],harmonic24:[]},records=[];
for(const r of p.recordings){
 const f=path.resolve(root,r.pcmFile);if(path.dirname(f)!==path.resolve(root))throw Error('Unsafe PCM');const bytes=fs.readFileSync(f);if(hash(bytes)!==r.pcmSha256||bytes.length!==r.samples*4)throw Error('PCM mismatch');
 const x=Float32Array.from({length:r.samples},(_,i)=>bytes.readFloatLE(i*4));if(!x.every(Number.isFinite))throw Error('Nonfinite input');
 const rows=Object.fromEntries(Object.keys(all).map(k=>[k,[]])),timings={baseline:[],harmonic24:[]};
 for(let end=c.windowSamples;end<=x.length;end+=c.hopSamples){
  const start=end-c.windowSamples,frame=x.subarray(start,end),reference=referenceAt(r.segments,start/c.analysisSampleRateHz,end/c.analysisSampleRateHz,evaluation.boundaryGuardSeconds,evaluation.candidateLabels),t=performance.now(),b=chord(frame,c.analysisSampleRateHz),u=performance.now(),h=model.process(frame),v=performance.now();timings.baseline.push(u-t);timings.harmonic24.push(v-u);
  const base={availableSeconds:end/c.analysisSampleRateHz,reference};rows.baseline.push({...base,prediction:b.label,baselineChecks:baselineChecks(b,frame),topLabel:b.candidates[0]?.label??null,evidence:b.candidates[0]??null,margin:b.margin??null});
  rows.rawThresholdOnly.push({...base,prediction:rawCounterfactual(b,c.harmonicModel)});rows.raw24.push({...base,prediction:rawCounterfactual(b,c.harmonicModel,true)});rows.harmonic24.push({...base,prediction:h.label,bestAll24:h.bestAll24,checks:h.checks,relativeResidual:h.relativeResidual,reason:h.reason});
 }
 const metrics={};for(const k of Object.keys(rows)){all[k].push(...rows[k]);metrics[k]=allAcceptedPrecision(summarize(rows[k]));}
 const compute={};for(const [key,ts]of Object.entries(timings)){ts.sort((a,b)=>a-b);compute[key]={frames:ts.length,p50Ms:ts[Math.floor((ts.length-1)*.5)],p95Ms:ts[Math.floor((ts.length-1)*.95)],deadlineMisses:ts.filter(t=>t>c.hopSamples/c.analysisSampleRateHz*1000).length};}
 fs.writeFileSync(path.join(out,r.id+'-private.json'),JSON.stringify(rows));records.push({id:r.id,player:r.player,pcmSha256:r.pcmSha256,metrics,compute,rejectionCounts:rejectionCounts(rows.baseline)});
}
const report={protocol:c.protocol,configSha256:hash(configBytes),preparedSha256:hash(pbytes),sourceHashes:Object.fromEntries(['compare.js','harmonic.js','diagnostics.js','labels.js'].map(n=>[n,hash(fs.readFileSync(new URL('./'+n,import.meta.url)))])),runtime:process.version,split:p.split,windowMs:c.windowSamples/c.analysisSampleRateHz*1000,hopMs:c.hopSamples/c.analysisSampleRateHz*1000,stableLatencyMeasured:false,recordings:records,pooled:Object.fromEntries(Object.entries(all).map(([k,rows])=>[k,allAcceptedPrecision(summarize(rows))])),rejectionCounts:rejectionCounts(all.baseline),limitations:['Development only; no unseen evaluation or online deployment','Counterfactuals diagnose thresholds/competition, not independent trials','Same C1 PCM/labels/grid; no target-score input to classifier','Fixed harmonic dictionary is approximate, not trained; missing fundamentals/inharmonicity can mislead','Shared CPU single run; overlapping frames correlated; no end-to-end latency']};
fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pooled:report.pooled,rejectionCounts:report.rejectionCounts},null,2));
