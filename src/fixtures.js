import {hz} from './dsp.js';
export function tone(midis,seconds=.5,rate=48000,harmonics=false){
 const out=new Float32Array(Math.floor(seconds*rate));
 for(let i=0;i<out.length;i++)for(const m of midis){const phase=2*Math.PI*hz(m)*i/rate;out[i]+=.3/midis.length*(Math.sin(phase)+(harmonics?.25*Math.sin(2*phase)+.1*Math.sin(3*phase):0));}
 return out;
}
export function melody(midis=[64,65,67,65,64,67,65,64],rate=48000,spacing=1){
 const out=new Float32Array(Math.ceil((midis.length*spacing+.5)*rate));
 midis.forEach((m,i)=>{if(m===null)return;const x=tone([m],spacing*.55,rate,true);const start=Math.round((.2+i*spacing)*rate);
 for(let j=0;j<x.length;j++)out[start+j]=x[j]*Math.min(1,j/(rate*.005))*Math.min(1,(x.length-j)/(rate*.02));});return out;
}
export function noise(n){let seed=123;return Float32Array.from({length:n},()=>{seed=(1664525*seed+1013904223)>>>0;return(seed/2**32-.5)*.5;});}
export function wav(samples,rate){
 const out=new ArrayBuffer(44+samples.length*2),v=new DataView(out);const str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
 str(0,'RIFF');v.setUint32(4,36+samples.length*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples.length*2,true);
 samples.forEach((x,i)=>v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,x))*32767),true));return out;
}
