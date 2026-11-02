// No high-pass cutoff or destructive noise gate. The raw PCM is never mutated.
export function preprocess(raw,{enabled=false,noiseRms=null}={}){
 if(!enabled)return {samples:raw,uncertain:false};
 const mean=raw.reduce((a,b)=>a+b,0)/raw.length;
 const samples=Float32Array.from(raw,x=>x-mean);
 return {samples,uncertain:noiseRms!==null&&Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length)<noiseRms*2};
}
export function noiseEstimate(rmsValues){const x=rmsValues.filter(Number.isFinite).sort((a,b)=>a-b);return x.length?x[Math.floor(x.length/2)]:null;}
