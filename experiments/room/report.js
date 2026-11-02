import {readFileSync,writeFileSync} from 'node:fs';
import {pitch} from '../../src/dsp.js';
import {pitchMetrics} from '../../src/metrics.js';
const root='reports/room',m=JSON.parse(readFileSync(root+'/mono/manifest.json')),y=JSON.parse(readFileSync(root+'/mono/python.json')),c=JSON.parse(readFileSync(root+'/crepe/tiny.json')),b=JSON.parse(readFileSync(root+'/basic-pitch.json'));
const rows=[];
for(const item of m.cases){
 const bytes=readFileSync(root+'/'+item.file);let data;
 for(let i=12;i+8<=bytes.length;){const size=bytes.readUInt32LE(i+4);if(bytes.toString('ascii',i,i+4)==='data')data=bytes.subarray(i+8,i+8+size);i+=8+size+(size%2);}
 if(!data)throw Error('Missing WAV PCM');
 const samples=Float32Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768),prediction=[];const start=performance.now();
 for(let i=0;i+4096<=samples.length;i+=512){const p=pitch(samples.subarray(i,i+4096),22050);prediction.push(p.confidence>=.8?p.midi:null);}
 const variants=[{method:'muisa-js',variant:'native',prediction,wholeClipComputeMs:[performance.now()-start]},...y.results.filter(r=>r.id===item.id)];
 for(const v of variants){const {prediction,...meta}=v;rows.push({...meta,id:item.id,metrics:pitchMetrics(item.reference,prediction),stableMetrics:pitchMetrics(item.reference.filter((_,i)=>item.stable[i]),prediction.filter((_,i)=>item.stable[i]))});}
}
for(const row of c.rows){const {prediction,reference,stable,...meta}=row;rows.push({...meta,method:'crepe-tiny',metrics:pitchMetrics(reference,prediction),stableMetrics:pitchMetrics(reference.filter((_,i)=>stable[i]),prediction.filter((_,i)=>stable[i]))});}
const report={experiment:'M1 MIDI-rendered guitar plus bounded ISM; development fixtures only',limitations:'MIDI gate labels shifted by known propagation/FIR delays, not manually measured acoustic attacks/offsets. Sustained release after note-off may count as false voicing. Polyphonic cases only evaluated by Basic Pitch. Different frame grids; do not pool rows. CPU timings exploratory Linux only, final model runs sequential.',pitchRows:rows,basicPitch:b};
writeFileSync('experiments/room/results.json',JSON.stringify(report,null,2)+'\n');
console.table(rows.filter(r=>r.variant!=='rms-gate'&&r.threshold!==.8).map(r=>({case:r.id,method:r.method,RPA50:r.metrics.rpa[50],coverage:r.metrics.voicedCoverage,falseAlarm:r.metrics.voicingFalseAlarm})));
console.table(b.rows.map(r=>({case:r.id,ref:r.referenceCount,pred:r.predictedCount,f1:r.metrics.onsetPitch?.f1})));
