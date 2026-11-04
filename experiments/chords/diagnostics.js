import {CANDIDATES,level} from '../../src/dsp.js';
export function baselineChecks(result,samples){
 const a=result.candidates[0];return {quiet:level(samples).rms<.008,notTopReference:null,evidence:a?a.evidence>.85:false,weakest:a?a.weakest>.07:false,margin:a?result.margin>.10:false};
}
export function rejectionCounts(rows){
 const result={};for(const row of rows){const key=row.reference.stratum+'/'+row.reference.kind,b=result[key]??={frames:0,accepted:0,quiet:0,evidenceFailed:0,weakestFailed:0,marginFailed:0,topMismatch:0,jointFailures:{}};b.frames++;if(row.prediction!==null)b.accepted++;
  const c=row.baselineChecks;if(!c)continue;if(c.quiet){b.quiet++;continue;}
  const failed=['evidence','weakest','margin'].filter(k=>!c[k]);for(const k of failed)b[k+'Failed']++;
  const combination=failed.join('+')||'none';b.jointFailures[combination]=(b.jointFailures[combination]??0)+1;
  if(row.reference.kind==='supported'&&row.topLabel!==row.reference.label)b.topMismatch++;
 }return result;
}
export function allAcceptedPrecision(summary){
 for(const b of Object.values(summary)){const denominator=b.acceptedSupported+b.oovAccepted+b.noChordAccepted;b.acceptedKnownTruth=denominator;b.acceptedKnownTruthPrecision=denominator?b.correct/denominator:null;b.acceptedUnknownTruthExcluded=b.unknownAccepted;}return summary;
}
export function rawCounterfactual(result,c,all24=false){
 if(!result.chroma)return null;let ranked=result.candidates;
 if(all24){const names=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'],sum=result.chroma.reduce((s,x)=>s+x,0)||1;ranked=[];for(let root=0;root<12;root++)for(const minor of [false,true]){const pcs=[root,(root+(minor?3:4))%12,(root+7)%12];ranked.push({label:names[root]+(minor?'m':''),evidence:pcs.reduce((s,i)=>s+result.chroma[i],0)/sum,weakest:Math.min(...pcs.map(i=>result.chroma[i]/sum))});}ranked.sort((a,b)=>b.evidence-a.evidence);}
 const a=ranked[0];return a.evidence>=c.evidence&&a.weakest>=c.weakest&&a.evidence-ranked[1].evidence>=c.margin&&Object.hasOwn(CANDIDATES,a.label)?a.label:null;
}
