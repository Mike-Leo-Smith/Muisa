import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {tone,wav,noise} from '../../src/fixtures.js';import {mixAtSnr} from '../../src/metrics.js';
const dir='reports/basic-pitch',rate=22050;mkdirSync(dir,{recursive:true});const cases=[];
const ym=JSON.parse(readFileSync('reports/yin/manifest.json'));for(const id of ['clean','noise-10','noise-only','silence']){const c=ym.cases.find(x=>x.id===id);copyFileSync('reports/yin/'+c.file,dir+'/'+c.file);cases.push({id:'mono-'+id,file:c.file,notes:c.notes,sha256:c.sha256,noiseGain:c.noiseGain,snrDb:c.snrDb});}
const notes=[...[48,52,55].map(midi=>({midi,onsetMs:200,durationMs:700})),...[55,59,62].map(midi=>({midi,onsetMs:1300,durationMs:700}))];
const clean=new Float32Array(rate*3),active=new Uint8Array(clean.length);
for(const n of notes){const start=Math.round(n.onsetMs*rate/1000),x=tone([n.midi],n.durationMs/1000,rate,true);for(let i=0;i<x.length;i++){clean[start+i]+=x[i]/3*Math.min(1,i/(rate*.005))*Math.min(1,(x.length-i)/(rate*.02));active[start+i]=1;}}
for(const snr of [null,10]){const mixed=snr===null?{samples:clean,noiseGain:0}:mixAtSnr(clean,noise(clean.length),active,snr),id=snr===null?'triads-clean':'triads-noise10',bytes=new Uint8Array(wav(mixed.samples,rate));writeFileSync(`${dir}/${id}.wav`,bytes);cases.push({id,file:id+'.wav',notes,sha256:createHash('sha256').update(bytes).digest('hex'),snrDb:snr,noiseGain:mixed.noiseGain});}
writeFileSync(`${dir}/manifest.json`,JSON.stringify({sampleRateHz:rate,cases,seed:123,license:'self-generated mathematical audio'},null,2));console.log('Generated 6 mono/poly/noise transcription cases');
