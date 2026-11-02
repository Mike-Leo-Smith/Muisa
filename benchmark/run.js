import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {Analyzer,frames} from '../src/dsp.js';
import {eventMetrics,pitchMetrics,latencySummary} from '../src/metrics.js';
const manifestPath=process.argv[2];if(!manifestPath)throw Error('Usage: node benchmark/run.js path/to/local-manifest.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
function decodeWav(path){const b=readFileSync(path);if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')throw Error('Expected WAV');let format,data;
 for(let i=12;i+8<=b.length;){const name=b.toString('ascii',i,i+4),size=b.readUInt32LE(i+4),start=i+8;if(start+size>b.length)throw Error('Truncated WAV');if(name==='fmt ')format={encoding:b.readUInt16LE(start),channels:b.readUInt16LE(start+2),rate:b.readUInt32LE(start+4),bits:b.readUInt16LE(start+14)};if(name==='data')data=b.subarray(start,start+size);i=start+size+(size%2);}
 if(!format||!data||format.encoding!==1||format.bits!==16||format.channels<1)throw Error('Runner supports PCM16 WAV only; convert locally first');
 const x=Float32Array.from({length:Math.floor(data.length/(2*format.channels))},(_,i)=>data.readInt16LE(i*2*format.channels)/32768);return {x,rate:format.rate};}
const splitByGroup=new Map(),results=[];
for(const item of manifest.cases){
 if(!item.groupId||!item.split||!item.license)throw Error('Each case needs groupId, split and license provenance');
 if(splitByGroup.has(item.groupId)&&splitByGroup.get(item.groupId)!==item.split)throw Error('Original recording leaked across splits');splitByGroup.set(item.groupId,item.split);
 const sorted=[...item.notes].sort((a,b)=>a.onsetMs-b.onsetMs);if(sorted.some((n,i)=>i&&n.onsetMs<sorted[i-1].onsetMs+sorted[i-1].durationMs))throw Error('Monophonic runner rejects overlapping note labels');
 const {x,rate}=decodeWav(resolve(dirname(manifestPath),item.audioPath));
 for(const enabled of [false,true]){
  const a=new Analyzer({enabled}),reference=[],predicted=[],compute=[];
  for(const frame of frames([x],rate)){
   const t=performance.now(),r=a.process(frame);compute.push(performance.now()-t);
   const center=(frame.startSample+2048)/rate*1000,active=item.notes.filter(n=>center>=n.onsetMs&&center<n.onsetMs+n.durationMs);
   reference.push(active.length===1?active[0].midi:null);predicted.push(r.pitch.confidence>=.8?r.pitch.midi:null);
  }
  results.push({id:item.id,groupId:item.groupId,split:item.split,preprocess:enabled,noiseCalibration:'none; DC-only paired comparison',sampleRateHz:rate,event:eventMetrics(item.notes,a.events,{durationMs:x.length/rate*1000,noiseOnly:item.kind==='noise'}),pitch:pitchMetrics(reference,predicted),compute:latencySummary(compute,1024/rate*1000),algorithmWindowMs:4096/rate*1000,chordWindowMs:16384/rate*1000,offsetEvaluated:false,chordEvaluated:false});
 }
}
mkdirSync('reports',{recursive:true});writeFileSync('reports/benchmark.json',JSON.stringify({manifestVersion:manifest.version,notes:'Local PCM16 mono-note benchmark; no real accuracy claim without documented dataset. Polyphonic references unsupported. Per-recording results; adjacent frames are not independent trials.',results},null,2)+'\n');console.log('Wrote reports/benchmark.json with',results.length,'paired results');
