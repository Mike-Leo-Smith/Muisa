// C3: deterministic chroma contrast; no new audio frontend or learned parameters.
import {CANDIDATES} from '../../src/dsp.js';
const NAMES=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const QUALITIES={maj:[0,4,7],min:[0,3,7],'7':[0,4,7,10],maj7:[0,4,7,11],min7:[0,3,7,10],sus2:[0,2,7],sus4:[0,5,7],dim:[0,3,6],aug:[0,4,8]};
export const CONTRAST_DEFAULT={exponent:.5,relativeFloor:.002,minSimilarity:.85,minMargin:.02,minToneFraction:.06,includeExtended:true};
export function contrast(baseline,config={}){
 const c={...CONTRAST_DEFAULT,...config};
 if(!Number.isFinite(c.exponent)||c.exponent<=0||c.exponent>1||typeInvalid(c))throw RangeError('Invalid contrast configuration');
 if(!baseline.chroma)return {label:null,reason:baseline.reason??'no-features',candidates:[]};
 const raw=baseline.chroma;if(raw.length!==12||raw.some(v=>!Number.isFinite(v)||v<0))throw RangeError('Require finite nonnegative chroma');
 const peak=Math.max(...raw);if(peak===0)return {label:null,reason:'empty-chroma',candidates:[]};
 const x=raw.map(v=>v/peak<c.relativeFloor?0:(v/peak)**c.exponent),norm=Math.hypot(...x),total=x.reduce((s,v)=>s+v,0);const candidates=[];
 // Different labels can have the SAME pitch-class set (e.g. C:sus2/G:sus4).
 // Keep both labels: without bass/context their tied hypotheses remain unknown.
 for(let root=0;root<12;root++)for(const [quality,intervals] of Object.entries(QUALITIES)){
  if(!c.includeExtended&&!['maj','min'].includes(quality))continue;
  const pcs=intervals.map(i=>(i+root)%12),label=quality==='maj'?NAMES[root]:quality==='min'?NAMES[root]+'m':NAMES[root]+':'+quality;
  candidates.push({label,quality,similarity:pcs.reduce((s,i)=>s+x[i],0)/(Math.sqrt(pcs.length)*norm),weakest:Math.min(...pcs.map(i=>x[i]/total))});
 }
 candidates.sort((a,b)=>b.similarity-a.similarity);const top=candidates[0],margin=top.similarity-candidates[1].similarity;
 const checks={similarity:top.similarity>=c.minSimilarity,margin:margin>=c.minMargin,allTones:top.weakest>=c.minToneFraction};
 const accepted=Object.values(checks).every(Boolean),supported=Object.hasOwn(CANDIDATES,top.label);
 return {label:accepted&&supported?top.label:null,reason:!accepted?'uncertain':!supported?'out-of-teaching-vocabulary':'candidate-match',topLabel:top.label,margin,checks,candidates,compressedChroma:x};
}

function typeInvalid(c){return typeBool(c.includeExtended)||[c.relativeFloor,c.minSimilarity,c.minMargin,c.minToneFraction].some(x=>!Number.isFinite(x)||x<0||x>=1);}
function typeBool(x){return typeof x!=='boolean';}
