// Experimental causal-window harmonic NNLS. No target score or learned weights.
import {hz,level,CANDIDATES} from '../../src/dsp.js';
const NAMES=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
export const DEFAULT={minMidi:40,maxMidi:83,maxHz:4000,harmonics:6,decays:[.8,1.4,2],iterations:32,minRms:.008,evidence:.88,weakest:.035,margin:.08,maxResidual:.65};
export function magnitude(samples){
 const n=samples.length;if(n<1024||(n&(n-1)))throw RangeError('Power-of-two window >=1024 required');
 const real=new Float64Array(n),imag=new Float64Array(n);let mean=0;for(const x of samples){if(!Number.isFinite(x))throw RangeError('Finite PCM required');mean+=x/n;}
 for(let i=0;i<n;i++)real[i]=(samples[i]-mean)*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[real[i],real[j]]=[real[j],real[i]];}
 for(let len=2;len<=n;len*=2){const angle=-2*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle);for(let s=0;s<n;s+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){const a=s+j,b=a+len/2,tr=cr*real[b]-ci*imag[b],ti=cr*imag[b]+ci*real[b];real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;const next=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=next;}}}
 return Float64Array.from({length:n/2+1},(_,i)=>Math.hypot(real[i],imag[i]));
}
export class HarmonicChord {
 constructor(rate=48000,size=16384,config={}){
  this.rate=rate;this.size=size;this.config={...DEFAULT,...config};const c=this.config;
  if(!Number.isFinite(rate)||rate<=2*c.maxHz)throw RangeError('Unsupported sample rate');
  this.bins=Math.min(size/2+1,Math.ceil(c.maxHz*size/rate)+1);this.columns=[];
  for(let midi=c.minMidi;midi<=c.maxMidi;midi++)for(const decay of c.decays){
   const values=new Map();for(let h=1;h<=c.harmonics;h++){const center=hz(midi)*h*size/rate;if(center>=this.bins)break;
    // Approximate Hann lobe with bounded frequency tolerance; not a calibrated instrument model.
    const sigma=Math.max(.85,center*.006);
    for(let k=Math.max(1,Math.floor(center-3*sigma));k<=Math.min(this.bins-1,Math.ceil(center+3*sigma));k++)values.set(k,(values.get(k)??0)+Math.exp(-.5*((k-center)/sigma)**2)/h**decay);
   }
   const norm=Math.sqrt([...values.values()].reduce((s,x)=>s+x*x,0));this.columns.push({midi,indices:[...values.keys()],values:Float64Array.from(values.values(),x=>x/norm)});
  }
 }
 process(samples){
  if(samples.length!==this.size)throw RangeError('Window length changed');const c=this.config,metrics=level(samples);
  if(!samples.every(Number.isFinite))throw RangeError('Nonfinite PCM');
  if(metrics.rms<c.minRms||metrics.clipped)return {label:null,reason:metrics.clipped?'clipped':'quiet',candidates:[]};
  const spectrum=magnitude(samples),residual=spectrum.slice(0,this.bins);residual[0]=0;
  const energy=residual.reduce((s,x)=>s+x*x,0),weights=new Float64Array(this.columns.length);
  for(let iteration=0;iteration<c.iterations;iteration++)for(let j=0;j<this.columns.length;j++){
   const col=this.columns[j];let dot=0;for(let k=0;k<col.indices.length;k++)dot+=residual[col.indices[k]]*col.values[k];
   const next=Math.max(0,weights[j]+dot),change=next-weights[j];weights[j]=next;
   for(let k=0;k<col.indices.length;k++)residual[col.indices[k]]-=change*col.values[k];
  }
  const chroma=new Float64Array(12),notes=new Float64Array(c.maxMidi-c.minMidi+1);
  weights.forEach((x,j)=>{notes[this.columns[j].midi-c.minMidi]+=x;});
  notes.forEach((x,j)=>chroma[(j+c.minMidi)%12]+=x);
  const total=chroma.reduce((s,x)=>s+x,0)||1,ranked=[];
  for(let root=0;root<12;root++)for(const minor of [false,true]){const pcs=[root,(root+(minor?3:4))%12,(root+7)%12];ranked.push({label:NAMES[root]+(minor?'m':''),evidence:pcs.reduce((s,pc)=>s+chroma[pc],0)/total,weakest:Math.min(...pcs.map(pc=>chroma[pc]/total))});}
  ranked.sort((a,b)=>b.evidence-a.evidence);const a=ranked[0],margin=a.evidence-ranked[1].evidence,relativeResidual=Math.sqrt(residual.reduce((s,x)=>s+x*x,0)/Math.max(energy,1e-30));
  const checks={evidence:a.evidence>=c.evidence,weakest:a.weakest>=c.weakest,margin:margin>=c.margin,residual:relativeResidual<=c.maxResidual};
  const accepted=Object.values(checks).every(Boolean),supported=Object.hasOwn(CANDIDATES,a.label);
  return {label:accepted&&supported?a.label:null,bestAll24:a.label,reason:!accepted?'uncertain':!supported?'out-of-teaching-vocabulary':'candidate-match',checks,margin,relativeResidual,chroma:[...chroma],noteSalience:[...notes],candidates:ranked};
 }
}
