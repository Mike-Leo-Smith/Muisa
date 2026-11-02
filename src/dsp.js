import {preprocess} from './preprocess.js';
export const hz = midi => 440 * 2 ** ((midi - 69) / 12);
export const midiOf = frequency => 69 + 12 * Math.log2(frequency / 440);
export function level(x) {
  let sum = 0, peak = 0;
  for (const v of x) { sum += v*v; peak = Math.max(peak, Math.abs(v)); }
  const rms = Math.sqrt(sum / Math.max(1,x.length));
  return { rms, db: 20 * Math.log10(Math.max(rms,1e-9)), peak, clipped: peak >= .999 };
}
// YIN-style cumulative mean normalized squared difference; integer decimation
// by averaging reduces CPU but is not a production anti-aliasing filter.
export function pitch(samples, rate) {
  if (level(samples).rms < .008) return { midi:null, confidence:0, reason:'quiet' };
  const step = Math.max(1,Math.floor(rate / 12000));
  const x = new Float32Array(Math.floor(samples.length/step));
  for(let i=0;i<x.length;i++) for(let j=0;j<step;j++) x[i]+=samples[i*step+j]/step;
  const sr=rate/step, min=Math.floor(sr/1000), max=Math.min(Math.ceil(sr/70),Math.floor(x.length/2));
  const diff = new Float64Array(max+1); let sum=0;
  for(let lag=1;lag<=max;lag++) {
    let d=0; for(let i=0;i<x.length-max;i++) d+=(x[i]-x[i+lag])**2;
    sum+=d; diff[lag]=sum ? d*lag/sum : 1;
  }
  let lag=min;
  while(lag<max && diff[lag]>.15) lag++;
  if(lag===max) return {midi:null,confidence:0,reason:'aperiodic'};
  while(lag+1<max && diff[lag+1]<diff[lag]) lag++;
  const a=diff[lag-1], b=diff[lag], c=diff[lag+1];
  const delta=(a-c)/(2*(a-2*b+c)) || 0;
  const frequency=sr/(lag+Math.max(-.5,Math.min(.5,delta)));
  return {midi:midiOf(frequency),frequency,confidence:Math.max(0,1-b),reason:'periodic'};
}
export const CANDIDATES={C:[0,4,7],Am:[9,0,4],G:[7,11,2],Em:[4,7,11],D:[2,6,9],Dm:[2,5,9],F:[5,9,0]};
export function chord(samples,rate) {
  if(level(samples).rms<.008) return {label:null,reason:'quiet',candidates:[]};
  const chroma=new Float64Array(12);
  for(let m=40;m<=83;m++) {
    const w=2*Math.PI*hz(m)/rate, coeff=2*Math.cos(w); let a=0,b=0;
    for(let i=0;i<samples.length;i++) {
      const s=samples[i]*(.5-.5*Math.cos(2*Math.PI*i/(samples.length-1)))+coeff*a-b;
      b=a;a=s;
    }
    chroma[m%12]+=Math.max(0,a*a+b*b-coeff*a*b);
  }
  const total=chroma.reduce((a,b)=>a+b,0)||1;
  const ranked=Object.entries(CANDIDATES).map(([label,pcs])=>({label,
    evidence:pcs.reduce((s,pc)=>s+chroma[pc],0)/total,
    weakest:Math.min(...pcs.map(pc=>chroma[pc]/total))})).sort((a,b)=>b.evidence-a.evidence);
  const [a,b]=ranked, margin=a.evidence-b.evidence;
  const accepted=a.evidence>.85 && a.weakest>.07 && margin>.10;
  return {label:accepted?a.label:null,reason:accepted?'candidate-match':'uncertain',margin,candidates:ranked,chroma:Array.from(chroma)};
}
export class Analyzer {
  constructor(config={}){this.config=config;this.previousRms=0;this.lastOnset=-Infinity;this.pending=null;this.events=[];this.frames=0;this.lastChord=null;this.expected=null;this.lastStart=null;this.rate=null;this.streamId=null;this.chordBuffer=new Float32Array(16384);this.chordFilled=0;}
  process(frame){
    const {channels,sampleRateHz:rate,startSample,hopSize=1024}=frame;
    if(!Number.isFinite(rate)||rate<=0||!Number.isInteger(startSample)||startSample<0||
       !Number.isInteger(hopSize)||hopSize<=0||!(channels?.[0] instanceof Float32Array)||
       channels[0].length!==4096||hopSize>4096||channels[0].some(x=>!Number.isFinite(x)))
      throw new RangeError('Invalid PCM frame: require finite 4096-sample channel, positive rate/hop and nonnegative sample index');
    if(this.lastStart!==null && startSample<=this.lastStart)throw new RangeError('PCM timestamps must increase; reset analyzer for a new stream');
    if(this.rate!==null && (rate!==this.rate||frame.streamId!==this.streamId))throw new RangeError('Source changed: reset analyzer before switching stream or sample rate');
    this.lastStart=startSample;this.rate=rate;this.streamId=frame.streamId;
    const discontinuity=this.expected!==null && startSample!==this.expected;
    // Explicitly use channel 0: stereo averaging can cancel antiphase signals.
    const raw=channels[0], processed=preprocess(raw,this.config), x=processed.samples, time=startSample/rate*1000, metrics=level(raw);
    if(discontinuity){this.previousRms=0;this.pending=null;this.chordFilled=0;this.lastChord=null;}
    this.expected=startSample+hopSize;
    const tail=level(x.subarray(x.length-hopSize)).rms;
    const onset=time+(x.length-hopSize)/rate*1000;
    if(!discontinuity && tail>.012 && tail>Math.max(.012,this.previousRms*1.8) && onset-this.lastOnset>160){this.pending=onset;this.lastOnset=onset;}
    this.previousRms=tail;
    const detected=processed.uncertain?{midi:null,confidence:0,reason:'near-noise-floor'}:pitch(x,rate);
    let event=null;
    if(this.pending!==null && time>=this.pending){
      event={onsetMs:this.pending,midi:metrics.clipped?null:detected.midi,confidence:metrics.clipped?0:detected.confidence};
      this.events.push(event);this.pending=null;
    }
    const chunk=this.chordFilled===0?x:x.subarray(x.length-hopSize);
    this.chordBuffer.copyWithin(0,chunk.length);this.chordBuffer.set(chunk,this.chordBuffer.length-chunk.length);
    this.chordFilled=Math.min(this.chordBuffer.length,this.chordFilled+chunk.length);
    if(this.frames++%4===0 && this.chordFilled===this.chordBuffer.length) this.lastChord=metrics.clipped||processed.uncertain?{label:null,reason:'clipped-or-noisy',candidates:[]}:chord(this.chordBuffer,rate);
    return {timeMs:time,discontinuity,level:metrics,pitch:detected,chord:this.lastChord,event};
  }
}
export function* frames(channels, sampleRateHz, windowSize=4096, hopSize=1024){
  for(let startSample=0;startSample+windowSize<=channels[0].length;startSample+=hopSize)
    yield {streamId:'file',sequence:startSample/hopSize,startSample,sampleRateHz,hopSize,channels:channels.map(x=>x.subarray(startSample,startSample+windowSize))};
}
