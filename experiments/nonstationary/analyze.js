import assert from 'node:assert/strict';
import {Analyzer,frames} from '../../src/dsp.js';
import {pitchMetrics,eventMetrics,latencySummary} from '../../src/metrics.js';
export function analyze(pcm,notes,config){
 const a=new Analyzer(config.preprocess),results=[],compute=[];
 for(const f of frames([pcm],config.analysisSampleRateHz,config.windowSamples,config.hopSamples)){const t=performance.now();results.push(a.process(f));compute.push(performance.now()-t);}
 assert.ok(results.length);const durationMs=pcm.length/config.analysisSampleRateHz*1000,lastEndMs=results.at(-1).endTimeMs;
 const reference=[],prediction=[],frameCounts={mono:0,unvoiced:0,polyphonic:0,'boundary-guard':0};
 for(let t=config.gridStartMs;t<Math.floor(durationMs-config.gridEndMarginMs);t+=config.gridMs){
  const index=Math.floor((t-config.windowSamples/2/config.analysisSampleRateHz*1000)/(config.hopSamples/config.analysisSampleRateHz*1000)+.5);assert.ok(index>=0&&index<results.length);
  const active=notes.filter(n=>n.onsetMs<=t&&t<n.onsetMs+n.durationMs),boundary=notes.some(n=>Math.min(Math.abs(t-n.onsetMs),Math.abs(t-n.onsetMs-n.durationMs))<config.boundaryGuardMs);
  const kind=boundary?'boundary-guard':active.length>1?'polyphonic':active.length?'mono':'unvoiced';frameCounts[kind]++;
  if(kind==='mono'||kind==='unvoiced'){reference.push(kind==='mono'?active[0].midi:null);const p=results[index].pitch;prediction.push(p.confidence>=config.pitchConfidence?p.midi:null);}
 }
 const accepted=results.filter(r=>Number.isFinite(r.pitch.midi)&&r.pitch.confidence>=config.pitchConfidence).length;
 return {frameCounts,pitch:pitchMetrics(reference,prediction),events:eventMetrics(notes,a.events,{durationMs:lastEndMs,onsetToleranceMs:config.noteOnsetToleranceMs,pitchToleranceCents:config.notePitchToleranceCents,noiseOnly:notes.length===0}),voicedAnalysisFrameFraction:accepted/results.length,analysisFrames:results.length,analyzedDurationMs:lastEndMs,unprocessedTailMs:durationMs-lastEndMs,compute:latencySummary(compute,config.hopSamples/config.analysisSampleRateHz*1000),observedRssBytes:process.memoryUsage().rss,privateCache:{events:a.events,frames:results.map(r=>({timeMs:r.timeMs,endTimeMs:r.endTimeMs,pitch:r.pitch,event:r.event}))}};
}
