import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tone,noise,wav} from '../../src/fixtures.js';
import {pitch} from '../../src/dsp.js';
import {mixAtSnr,latencySummary} from '../../src/metrics.js';
const dir='reports/yin',rate=22050,window=4096,hop=512;
mkdirSync(dir,{recursive:true});
const notes=[52,64,67].map((midi,i)=>({midi,onsetMs:200+i*650,durationMs:400}));
const clean=new Float32Array(Math.round(rate*2.4)),mask=new Uint8Array(clean.length);
for(const n of notes){const start=Math.round(n.onsetMs*rate/1000),x=tone([n.midi],n.durationMs/1000,rate,true);for(let i=0;i<x.length;i++){clean[start+i]=x[i]*Math.min(1,i/(rate*.005))*Math.min(1,(x.length-i)/(rate*.02));mask[start+i]=1;}}
const n=noise(clean.length),cases=[{id:'clean',x:clean,notes,gain:0}];
for(const snr of [20,10,0]){const m=mixAtSnr(clean,n,mask,snr);cases.push({id:'noise-'+snr,x:m.samples,notes,gain:m.noiseGain,snrDb:snr});}
cases.push({id:'noise-only',x:n,notes:[],gain:1},{id:'silence',x:new Float32Array(clean.length),notes:[],gain:0},{id:'weak',x:Float32Array.from(clean,x=>x*.02),notes,gain:0});
const output=[];
for(const c of cases){
 const bytes=new Uint8Array(wav(c.x,rate));writeFileSync(`${dir}/${c.id}.wav`,bytes);
 const view=new DataView(bytes.buffer),x=Float32Array.from(c.x,(_,i)=>view.getInt16(44+i*2,true)/32768),reference=[],stable=[],prediction=[],compute=[];
 pitch(x.subarray(0,window),rate);
 for(let start=0;start+window<=x.length;start+=hop){const center=(start+window/2)/rate*1000,active=c.notes.find(n=>center>=n.onsetMs&&center<n.onsetMs+n.durationMs);reference.push(active?.midi??null);stable.push(active?start/rate*1000>=active.onsetMs&&(start+window)/rate*1000<=active.onsetMs+active.durationMs:!c.notes.some(n=>start/rate*1000<n.onsetMs+n.durationMs&&(start+window)/rate*1000>n.onsetMs));const t=performance.now(),r=pitch(x.subarray(start,start+window),rate);compute.push(performance.now()-t);prediction.push(r.confidence>=.8?r.midi:null);}
 output.push({id:c.id,file:c.id+'.wav',sha256:createHash('sha256').update(bytes).digest('hex'),license:'self-generated mathematical PCM',notes:c.notes,noiseSeed:123,noiseGain:c.gain,snrDb:c.snrDb??null,reference,stable,js:{prediction,compute:latencySummary(compute,hop/rate*1000),rssBytes:process.memoryUsage().rss}});
}
writeFileSync(`${dir}/manifest.json`,JSON.stringify({version:1,sampleRateHz:rate,windowSize:window,hopSize:hop,durationSeconds:2.4,cases:output},null,2));console.log('Generated 7 identical-input JS/Python cases and JS frame predictions');
