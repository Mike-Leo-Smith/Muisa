import {pitch} from '../../src/dsp.js';
export function analyzeWindows(x,c){
 const maxWindow=Math.max(...c.windows.map(w=>w.samples)),lastCenter=x.length-maxWindow/2;
 return c.windows.map(w=>{
  const prediction=[],compute=[];
  for(let center=c.firstCenterSample;center<=lastCenter;center+=c.hopSamples){
   const start=center-w.samples/2;
   if(!Number.isInteger(start)||start<0)throw Error('Invalid shared window center');
   const t=performance.now(),p=pitch(x.subarray(start,start+w.samples),c.sampleRateHz);compute.push(performance.now()-t);prediction.push(p.confidence>=c.confidence?p.midi:null);
  }
  return {method:w.id,windowSamples:w.samples,prediction,compute};
 });
}
