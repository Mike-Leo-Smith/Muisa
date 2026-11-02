import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync('reports/calibrated/'+p)),pitch=read('pitch-results.json'),note=read('note-results.json'),crepe=read('crepe/tiny.json'),basic=read('basic-pitch.json');
const summary=[];
for(const levelMode of ['physical','equal-rms'])for(const side of ['source','microphone']){
 for(const method of ['JS-native','CREPE-tiny-0.5','CREPE-tiny-0.8']){
  const rows=pitch.rows.filter(x=>x.levelMode===levelMode&&x.side===side&&x.method===method);
  summary.push({levelMode,side,method,caseCount:rows.length,caseMeanRPA50:rows.reduce((s,x)=>s+x.metrics.rpa[50],0)/rows.length,caseMeanVoicingFalseAlarm:rows.reduce((s,x)=>s+x.metrics.voicingFalseAlarm,0)/rows.length,caseMeanCoverage:rows.reduce((s,x)=>s+x.metrics.voicedCoverage,0)/rows.length});
 }
 const rows=note.rows.filter(x=>x.levelMode===levelMode&&x.side===side);
 summary.push({levelMode,side,method:'BasicPitch-ONNX',caseCount:rows.length,caseMeanNoteF1:rows.reduce((s,x)=>s+x.metrics.onsetPitch.f1,0)/rows.length,caseMeanNoteOffsetF1:rows.reduce((s,x)=>s+x.metrics.onsetPitchOffset.f1,0)/rows.length});
}
const result={limitations:'Development sample bank only; paired physical/equal-RMS results kept separate. Automatic threshold labels and common exclusion masks, not human annotations. Pitch and transcription denominators differ. Windows/native timestamps differ; common-grid nearest-center mapping is offline evaluation, not an online latency claim. Case means are descriptive; correlated bank/room variants are not independent samples.',models:{crepe:{sourceCommit:crepe.sourceCommit,weightsSha256:crepe.weightsSha256,loadMs:crepe.loadMs,warmupMs:crepe.warmupMs,windowMs:crepe.windowMs,stepMs:crepe.stepMs},basicPitch:{version:basic.basicPitch,weightsSha256:basic.modelSha256,loadMs:basic.loadMs,warmupMs:basic.warmupMs,windowMs:basic.audioWindowSamples/basic.sampleRateHz*1000}},summary,pitch,note};
writeFileSync('experiments/calibrated/results.json',JSON.stringify(result,null,2)+'\n');console.table(summary);
