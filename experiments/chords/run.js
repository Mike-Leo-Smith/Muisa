import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chord} from '../../src/dsp.js';
import {referenceAt,summarize} from './labels.js';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const configBytes=fs.readFileSync(new URL('./config.json',import.meta.url)),config=JSON.parse(configBytes);
const work=path.resolve(process.argv[2]??'');
if(!process.argv[2])throw Error('Usage: node experiments/chords/run.js PREPARED_WORK');
const out=path.join(work,'baseline-report.json');if(fs.existsSync(out))throw Error('Refuse overwrite existing results');
const bytes=fs.readFileSync(path.join(work,'prepared.json')),prepared=JSON.parse(bytes);
if(prepared.configSha256!==hash(configBytes)||JSON.stringify(prepared.config)!==JSON.stringify(config))throw Error('Config mismatch');
// Baseline source bytes must equal the preregistered revision, even if runner commits advance.
const original=execFileSync('git',['show',config.baselineRevision+':src/dsp.js']);
if(hash(original)!==hash(fs.readFileSync(new URL('../../src/dsp.js',import.meta.url))))throw Error('Baseline DSP changed');
const results=[],allRows=[];
for(const r of prepared.recordings){
 const file=path.resolve(work,r.pcmFile);if(path.dirname(file)!==work)throw Error('Unsafe PCM path');
 const raw=fs.readFileSync(file);if(hash(raw)!==r.pcmSha256||raw.length!==r.samples*4)throw Error('PCM hash/length mismatch');
 const x=Float32Array.from({length:r.samples},(_,i)=>raw.readFloatLE(i*4));if(!x.every(Number.isFinite))throw Error('Nonfinite PCM');
 const rows=[],timings=[];let lastEnd=0;
 for(let end=config.windowSamples;end<=x.length;end+=config.hopSamples){
  const start=end-config.windowSamples,t=performance.now(),prediction=chord(x.subarray(start,end),config.analysisSampleRateHz);timings.push(performance.now()-t);
  rows.push({availableSeconds:end/config.analysisSampleRateHz,prediction:prediction.label,reason:prediction.reason,reference:referenceAt(r.segments,start/config.analysisSampleRateHz,end/config.analysisSampleRateHz,config.boundaryGuardSeconds,config.candidateLabels)});lastEnd=end;
 }
 allRows.push(...rows);timings.sort((a,b)=>a-b);const percentile=p=>timings.length?timings[Math.min(timings.length-1,Math.floor((timings.length-1)*p))]:null;
 fs.writeFileSync(path.join(work,r.id+'-baseline-private.json'),JSON.stringify(rows));
 results.push({id:r.id,player:r.player,style:r.style,pcmSha256:r.pcmSha256,seconds:x.length/config.analysisSampleRateHz,frameCount:rows.length,tailSeconds:(x.length-lastEnd)/config.analysisSampleRateHz,metrics:summarize(rows),scoredGridSeconds:rows.length*config.hopSamples/config.analysisSampleRateHz,initialUnscoredSeconds:(config.windowSamples-config.hopSamples)/config.analysisSampleRateHz,compute:{p50Ms:percentile(.5),p95Ms:percentile(.95),hopDeadlineMs:config.hopSamples/config.analysisSampleRateHz*1000,deadlineMisses:timings.filter(t=>t>config.hopSamples/config.analysisSampleRateHz*1000).length}});
}
for(const r of results)for(const bucket of Object.values(r.metrics)){bucket.gridSeconds=bucket.frames*config.hopSamples/config.analysisSampleRateHz;bucket.supportedSeconds=bucket.supported*config.hopSamples/config.analysisSampleRateHz;bucket.oovSeconds=bucket.oov*config.hopSamples/config.analysisSampleRateHz;bucket.unknownSeconds=bucket.unknown*config.hopSamples/config.analysisSampleRateHz;}
const keys=['supportedAccuracy','supportedCoverage','acceptedSupportedPrecision','oovFalseAcceptance','noChordFalseAcceptance','supportedFraction'];const macro={};
for(const stratum of ['stable','transition','annotation-gap']){macro[stratum]={};for(const key of keys){const values=results.map(r=>r.metrics[stratum]?.[key]).filter(v=>v!==null&&v!==undefined);macro[stratum][key]={mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,definedRecordings:values.length};}}
const report={protocol:config.protocol,executionStatus:'completed',split:prepared.split,codeRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),configSha256:hash(configBytes),preparedSha256:hash(bytes),selectionSha256:prepared.selectionSha256,baselineDspSha256:hash(original),frameWeightSeconds:config.hopSamples/config.analysisSampleRateHz,stableDetectionLatencyEvaluated:false,windowMs:config.windowSamples/config.analysisSampleRateHz*1000,hopMs:config.hopSamples/config.analysisSampleRateHz*1000,recordings:results,macro,pooledEqualDurationGrid:summarize(allRows),limitations:['Performed chord labels retain lead-sheet root/segmentation prior; not independent auditory truth','Observed GuitarSet development data, same players; no untouched test claim','Fixed unnormalized PCM, no score-conditioned classifier, no tuning','Root/quality only; bass/inversion not predicted; unsupported qualities not collapsed to triads','Stable subset and transitions reported separately, not all-frame accuracy','One shared-host run, no device/browser end-to-end latency; no noise-robustness claim']};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:out,macro},null,2));
