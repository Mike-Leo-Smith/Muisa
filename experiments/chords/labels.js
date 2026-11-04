const PCS={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const NAMES=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
export function parseLabel(raw,candidates){
 if(raw==='N')return {kind:'no-chord',raw,label:null};
 if(raw==='X')return {kind:'unknown',raw,label:null};
 if(typeof raw!=='string')throw Error('Chord label must be text');
 const m=/^([A-G])([b#]?)(?::([^/]+))?(?:\/(.+))?$/.exec(raw);
 if(!m||(m[4]&&!/^[b#]?(?:[1-9]|1[0-3])$/.test(m[4])))return {kind:'unknown',raw,label:null,reason:'unparsed-label'};
 const root=(PCS[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0)+12)%12;
 const quality=m[3]??'maj';const label=NAMES[root]+(quality==='min'?'m':'');
 if(!['maj','min'].includes(quality))return {kind:'out-of-vocabulary',raw,label:null,root,quality,bass:m[4]??null};
 return {kind:candidates.includes(label)?'supported':'out-of-vocabulary',raw,label,root,quality,bass:m[4]??null};
}
export function referenceAt(segments,start,end,guard,candidates){
 // End is latest available sample boundary. No future signal is used by DSP.
 const s=segments.find(s=>s.start<=end&&end<s.end);
 if(!s)return {kind:'unknown',raw:null,label:null,stratum:'annotation-gap'};
 const stratum=start>=s.start+guard&&end<=s.end-guard?'stable':'transition';
 return {...parseLabel(s.label,candidates),stratum};
}
export function summarize(rows){
 const buckets={};
 for(const r of rows){
  const key=r.reference.stratum,b=buckets[key]??={frames:0,supported:0,correct:0,acceptedSupported:0,oov:0,oovAccepted:0,noChord:0,noChordAccepted:0,unknown:0,unknownAccepted:0,confusion:{}};
  b.frames++;const t=r.reference;
  const truth=t.kind==='supported'?t.label:t.kind==='out-of-vocabulary'?'OOV:'+t.raw:t.kind;
  const pair=truth+' -> '+(r.prediction??'unknown');b.confusion[pair]=(b.confusion[pair]??0)+1;
  if(t.kind==='supported'){b.supported++;if(r.prediction!==null)b.acceptedSupported++;if(r.prediction===t.label)b.correct++;}
  else if(t.kind==='out-of-vocabulary'){b.oov++;if(r.prediction!==null)b.oovAccepted++;}
  else if(t.kind==='no-chord'){b.noChord++;if(r.prediction!==null)b.noChordAccepted++;}
  else {b.unknown++;if(r.prediction!==null)b.unknownAccepted++;}
 }
 const ratio=(n,d)=>d?n/d:null;
 for(const b of Object.values(buckets)){b.perChordRecall={};for(const pair of Object.keys(b.confusion)){const [truth]=pair.split(' -> ');if(['unknown','no-chord'].includes(truth)||truth.startsWith('OOV:'))continue;const denominator=Object.entries(b.confusion).filter(([k])=>k.startsWith(truth+' -> ')).reduce((n,[,v])=>n+v,0);b.perChordRecall[truth]={frames:denominator,recall:(b.confusion[truth+' -> '+truth]??0)/denominator};}Object.assign(b,{supportedAccuracy:ratio(b.correct,b.supported),supportedCoverage:ratio(b.acceptedSupported,b.supported),acceptedSupportedPrecision:ratio(b.correct,b.acceptedSupported),oovFalseAcceptance:ratio(b.oovAccepted,b.oov),noChordFalseAcceptance:ratio(b.noChordAccepted,b.noChord),supportedFraction:ratio(b.supported,b.frames)});}
 return buckets;
}
