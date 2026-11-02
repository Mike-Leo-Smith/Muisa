import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';import {pitch} from '../../src/dsp.js';import {latencySummary} from '../../src/metrics.js';
const work=process.argv[2];if(!work)throw Error('Usage: node experiments/real/run_js.js WORK');
const read=p=>JSON.parse(readFileSync(resolve(work,p))),m=read('prepared.json'),c=m.config;const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(readFileSync(new URL('./config.json',import.meta.url))),m.configSha256);mkdirSync(resolve(work,'js'),{recursive:true});
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),m.codeRevision);
for(const r of m.recordings){
 const bytes=readFileSync(resolve(work,r.pcmFile));assert.equal(hash(bytes),r.pcmSha256);const binding={configSha256:m.configSha256,codeRevision:m.codeRevision,model:'js',inputSha256:r.pcmSha256,modelId:'muisa-native-pitch'};const path=resolve(work,'js',r.id+'.json');
 if(existsSync(path)){assert.deepEqual(JSON.parse(readFileSync(path)).binding,binding);console.log('Cached JS',r.id);continue;}
 const x=Float32Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(i*4)),prediction=[],compute=[];const start=performance.now();
 for(let i=0;i+c.pitchWindow<=x.length;i+=c.pitchHop){const t=performance.now(),p=pitch(x.subarray(i,i+c.pitchWindow),c.sampleRateHz);compute.push(performance.now()-t);prediction.push(p.confidence>=c.jsConfidence?p.midi:null);}
 const result={id:r.id,binding,variants:[{method:'js-native',prediction}],firstCenterMs:c.pitchWindow/2/c.sampleRateHz*1000,hopMs:c.pitchHop/c.sampleRateHz*1000,windowMs:c.pitchWindow/c.sampleRateHz*1000,wallMs:performance.now()-start,compute:latencySummary(compute,c.pitchHop/c.sampleRateHz*1000),processRssBytes:process.memoryUsage().rss,causality:'Window pitch baseline; no browser/IO timing'};
 writeFileSync(path+'.tmp',JSON.stringify(result,null,2)+'\n');renameSync(path+'.tmp',path);console.log('Completed JS',r.id);
}
