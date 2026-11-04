import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {chord} from '../../../src/dsp.js';import {contrast} from '../contrast.js';import {allAcceptedPrecision,rawCounterfactual} from '../diagnostics.js';import {summarize} from '../labels.js';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),root=process.argv[2],out=process.argv[3],split=process.argv[4];
if(!root||!out||!['development','heldout'].includes(split))throw Error('Usage: node evaluate.js FROZEN_ROOT NEW_OUTPUT development|heldout');
if(fs.existsSync(out))throw Error('Output exists');
const lockBytes=fs.readFileSync(new URL('./engines.lock.json',import.meta.url)),lock=JSON.parse(lockBytes),repo=fileURLToPath(new URL('../../../',import.meta.url));
for(const [file,digest]of Object.entries(lock.sha256))if(hash(fs.readFileSync(path.join(repo,file)))!==digest)throw Error('Frozen engine changed: '+file);
const cfgBytes=fs.readFileSync(new URL('./config.json',import.meta.url)),c=JSON.parse(cfgBytes),bytes=fs.readFileSync(path.join(root,'frozen.json')),p=JSON.parse(bytes);
if(hash(bytes)!==fs.readFileSync(path.join(root,'frozen.sha256'),'utf8').trim()||p.configSha256!==hash(cfgBytes)||p.enginesLockSha256!==hash(lockBytes)||!p.readyToFreeze||p.missingCoverage.length)throw Error('Frozen corpus/config/engine-lock mismatch');
const chosen=p.recordings.filter(r=>r.split===split);if(!chosen.length)throw Error('Empty selected split');
const c3=JSON.parse(fs.readFileSync(new URL('../c3-config.json',import.meta.url))),c2=JSON.parse(fs.readFileSync(new URL('../candidate-config.json',import.meta.url)));
function reference(r,start,end){const s=r.segments.find(s=>s.start<=end&&end<s.end);if(!s)return {kind:'unknown',raw:null,label:null,stratum:'annotation-gap'};
 const label=s.label,kind=label==='N'?'no-chord':label==='OOV'?'out-of-vocabulary':label==='X'?'unknown':'supported';
 return {kind,label:kind==='supported'?label:null,raw:label==='OOV'?s.rawLabel:label,stratum:start>=s.start+c.boundaryGuardSeconds&&end<=s.end-c.boundaryGuardSeconds?'stable':'transition'};
}
fs.mkdirSync(out);const all=Object.fromEntries(c.methods.map(k=>[k,[]])),records=[];
for(const r of chosen){const file=path.resolve(root,r.pcmFile);if(path.dirname(file)!==path.resolve(root))throw Error('Unsafe PCM path');const raw=fs.readFileSync(file);if(hash(raw)!==r.pcmSha256||raw.length!==r.analysisSamples*4)throw Error('PCM mismatch');
 const x=Float32Array.from({length:r.analysisSamples},(_,i)=>raw.readFloatLE(i*4));if(!x.every(Number.isFinite))throw Error('Nonfinite PCM');const rows=Object.fromEntries(c.methods.map(k=>[k,[]]));
 for(let end=c.windowSamples;end<=x.length;end+=c.hopSamples){const start=end-c.windowSamples,b=chord(x.subarray(start,end),48000),ref=reference(r,start/48000,end/48000),predictions={baseline:b.label,rawThresholdOnly:rawCounterfactual(b,c2.harmonicModel),contrastExpanded:contrast(b,c3.contrast).label};for(const method of c.methods)rows[method].push({reference:ref,prediction:predictions[method],availableSeconds:end/48000});}
 for(const m of c.methods)all[m].push(...rows[m]);const metrics=Object.fromEntries(c.methods.map(m=>[m,allAcceptedPrecision(summarize(rows[m]))]));
 fs.writeFileSync(path.join(out,'record-'+records.length+'-private.json'),JSON.stringify(rows));records.push({id:r.id,performerId:r.performerId,performanceId:r.performanceId,pcmSha256:r.pcmSha256,metrics});
}
const macro={};for(const m of c.methods){macro[m]={};for(const stratum of ['stable','transition','annotation-gap']){macro[m][stratum]={};for(const key of ['supportedAccuracy','supportedCoverage','acceptedKnownTruthPrecision','oovFalseAcceptance','noChordFalseAcceptance']){const defined=records.map(r=>r.metrics[m][stratum]?.[key]).filter(v=>v!==undefined&&v!==null);macro[m][stratum][key]={mean:defined.length?defined.reduce((a,b)=>a+b,0)/defined.length:null,definedRecordings:defined.length};}}}
const report={protocol:c.protocol,split,frozenSha256:hash(bytes),configSha256:hash(cfgBytes),engineRevision:lock.revision,frameWeightSeconds:c.hopSamples/48000,recordings:records,macro,pooled:Object.fromEntries(c.methods.map(m=>[m,allAcceptedPrecision(summarize(all[m]))])),limits:['Human reviewed interval labels; no claim of perfect acoustic truth','Stable/transition/gaps retained separately; no tuning in runner','No new model or post-hoc threshold selection; any future holdout access must be tracked externally','No browser/device latency or noise-robustness result; independent performers depend on verified provenance']};
fs.writeFileSync(path.join(out,'evaluation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({split,recordings:records.length,report:path.join(out,'evaluation.json')}));
