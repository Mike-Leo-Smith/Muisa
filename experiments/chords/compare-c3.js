// Hash-bound prepared C1 input. No git executable required in evaluation environment.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {chord} from '../../src/dsp.js';import {contrast} from './contrast.js';import {referenceAt,summarize} from './labels.js';import {baselineChecks,rejectionCounts,allAcceptedPrecision,rawCounterfactual} from './diagnostics.js';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const root=process.argv[2],out=process.argv[3];if(!root||!out)throw Error('Usage: node experiments/chords/compare-c3.js C1_PREPARED NEW_OUTPUT');
if(fs.existsSync(out))throw Error('Output exists');
const configBytes=fs.readFileSync(new URL('./c3-config.json',import.meta.url)),c=JSON.parse(configBytes),pbytes=fs.readFileSync(path.join(root,'prepared.json')),p=JSON.parse(pbytes);
if(p.configSha256!==c.evaluationConfigSha256||p.split!==c.allowedSplit)throw Error('Require unchanged C1 R1 development input; R2 not used for candidate development');
if(hash(fs.readFileSync(new URL('../../src/dsp.js',import.meta.url)))!==c.baselineDspSha256)throw Error('Baseline DSP changed');
const evaluation=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url)));if(hash(fs.readFileSync(new URL('./config.json',import.meta.url)))!==c.evaluationConfigSha256||JSON.stringify(evaluation)!==JSON.stringify(p.config))throw Error('Evaluation configuration changed');
const expected=JSON.parse(fs.readFileSync(new URL('./results-c1.json',import.meta.url))).splits.R1.recordings;
if(p.recordings.length!==6||p.recordings.some(r=>!expected.some(e=>r.id===e.id&&r.pcmSha256===e.pcmSha256)))throw Error('C1 R1 resampled PCM identity differs; no implicit resampling');
if(hash(fs.readFileSync(new URL('./candidate-config.json',import.meta.url)))!==c.counterfactualConfigSha256)throw Error('Counterfactual config changed');
fs.mkdirSync(out);const oldThresholds=JSON.parse(fs.readFileSync(new URL('./candidate-config.json',import.meta.url))).harmonicModel,all={baseline:[],rawThresholdOnly:[],sqrtTriads:[],linearExpanded:[],contrastExpanded:[]},records=[];
for(const r of p.recordings){
 const f=path.resolve(root,r.pcmFile);if(path.dirname(f)!==path.resolve(root))throw Error('Unsafe PCM');const bytes=fs.readFileSync(f);if(hash(bytes)!==r.pcmSha256||bytes.length!==r.samples*4)throw Error('PCM mismatch');
 const x=Float32Array.from({length:r.samples},(_,i)=>bytes.readFloatLE(i*4));if(!x.every(Number.isFinite))throw Error('Nonfinite input');
 const rows=Object.fromEntries(Object.keys(all).map(k=>[k,[]])),timings={baseline:[],contrastIncrement:[],contrastPipeline:[]};
 for(let end=c.windowSamples;end<=x.length;end+=c.hopSamples){
  const start=end-c.windowSamples,frame=x.subarray(start,end),reference=referenceAt(r.segments,start/c.analysisSampleRateHz,end/c.analysisSampleRateHz,evaluation.boundaryGuardSeconds,evaluation.candidateLabels),t=performance.now(),b=chord(frame,c.analysisSampleRateHz),u=performance.now(),h=contrast(b,c.contrast),v=performance.now();timings.baseline.push(u-t);timings.contrastIncrement.push(v-u);timings.contrastPipeline.push(v-t);
  const base={availableSeconds:end/c.analysisSampleRateHz,reference};rows.baseline.push({...base,prediction:b.label,baselineChecks:baselineChecks(b,frame),topLabel:b.candidates[0]?.label??null,evidence:b.candidates[0]??null,margin:b.margin??null});
  rows.rawThresholdOnly.push({...base,prediction:rawCounterfactual(b,oldThresholds)});rows.sqrtTriads.push({...base,prediction:contrast(b,{...c.contrast,includeExtended:false}).label});rows.linearExpanded.push({...base,prediction:contrast(b,{...c.contrast,exponent:1}).label});rows.contrastExpanded.push({...base,prediction:h.label,topLabel:h.topLabel,checks:h.checks,margin:h.margin,similarity:h.candidates[0]?.similarity??null,reason:h.reason});
 }
 const metrics={};for(const k of Object.keys(rows)){all[k].push(...rows[k]);metrics[k]=allAcceptedPrecision(summarize(rows[k]));}
 const compute={};for(const [key,ts]of Object.entries(timings)){ts.sort((a,b)=>a-b);compute[key]={frames:ts.length,p50Ms:ts[Math.floor((ts.length-1)*.5)],p95Ms:ts[Math.floor((ts.length-1)*.95)],deadlineMisses:ts.filter(t=>t>c.hopSamples/c.analysisSampleRateHz*1000).length};}
 fs.writeFileSync(path.join(out,r.id+'-private.json'),JSON.stringify(rows));records.push({id:r.id,player:r.player,pcmSha256:r.pcmSha256,metrics,compute,rejectionCounts:rejectionCounts(rows.baseline)});
}
const report={protocol:c.protocol,configSha256:hash(configBytes),preparedSha256:hash(pbytes),sourceHashes:Object.fromEntries(['compare-c3.js','contrast.js','diagnostics.js','labels.js','candidate-config.json'].map(n=>[n,hash(fs.readFileSync(new URL('./'+n,import.meta.url)))])),runtime:process.version,split:p.split,windowMs:c.windowSamples/c.analysisSampleRateHz*1000,hopMs:c.hopSamples/c.analysisSampleRateHz*1000,stableLatencyMeasured:false,recordings:records,pooled:Object.fromEntries(Object.entries(all).map(([k,rows])=>[k,allAcceptedPrecision(summarize(rows))])),rejectionCounts:rejectionCounts(all.baseline),limitations:['Development only; no unseen evaluation or online deployment','Counterfactuals diagnose thresholds/competition, not independent trials','Same C1 PCM/labels/grid; no target-score input to classifier; no clip/quiet gate change','Compressed chroma and expanded templates are fixed; missing notes and harmonic overtones remain ambiguous','Shared CPU single run; overlapping frames correlated; no end-to-end latency; pipeline includes reused baseline frontend plus contrast increment; other ablations not timed independently']};
fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pooled:report.pooled,rejectionCounts:report.rejectionCounts},null,2));
