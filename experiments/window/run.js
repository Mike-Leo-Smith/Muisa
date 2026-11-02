import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {analyzeWindows} from './analyze.js';import {latencySummary} from '../../src/metrics.js';
const work=process.argv[2];if(!work)throw Error('Usage: node experiments/window/run.js WORK');
const hash=b=>createHash('sha256').update(b).digest('hex'),m=JSON.parse(readFileSync(resolve(work,'prepared.json'))),c=m.config;
assert.equal(hash(readFileSync(new URL('./config.json',import.meta.url))),m.configSha256);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),m.codeRevision);mkdirSync(resolve(work,'predictions'),{recursive:true});
for(const r of m.recordings){
 const bytes=readFileSync(resolve(work,r.pcmFile));assert.equal(hash(bytes),r.pcmSha256);
 const binding={codeRevision:m.codeRevision,configSha256:m.configSha256,inputManifestSha256:m.inputManifestSha256,pcmSha256:r.pcmSha256,split:m.split};const path=resolve(work,'predictions',r.id+'.json');
 if(existsSync(path)){assert.deepEqual(JSON.parse(readFileSync(path)).binding,binding);continue;}
 const x=Float32Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(i*4));const start=performance.now();
 const variants=analyzeWindows(x,c).map(({compute,...v})=>({...v,windowMs:v.windowSamples/c.sampleRateHz*1000,availabilityAfterCenterMs:v.windowSamples/2/c.sampleRateHz*1000,compute:latencySummary(compute,c.hopSamples/c.sampleRateHz*1000)}));
 const result={id:r.id,binding,variants,firstCenterMs:c.firstCenterSample/c.sampleRateHz*1000,hopMs:c.hopSamples/c.sampleRateHz*1000,wallMs:performance.now()-start,observedRssBytes:process.memoryUsage().rss};writeFileSync(path+'.tmp',JSON.stringify(result)+'\n');renameSync(path+'.tmp',path);console.log('Completed',r.id);
}
