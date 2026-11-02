class Capture extends AudioWorkletProcessor {
 constructor(){super();this.buffer=new Float32Array(4096);this.filled=0;this.since=0;}
 process(inputs,outputs){
  // Outputs remain zero: no microphone monitoring / feedback path.
  const x=inputs[0]?.[0];if(!x)return true;
  for(let i=0;i<x.length;i++){
   if(this.filled<4096)this.buffer[this.filled++]=x[i];
   else {this.buffer.copyWithin(0,1024);this.filled=3072;this.buffer[this.filled++]=x[i];}
   if(this.filled===4096){const copy=this.buffer.slice();this.port.postMessage({startSample:currentFrame+i+1-4096,sampleRateHz:sampleRate,channels:[copy],hopSize:1024},[copy.buffer]);}
  }
  return true;
 }
}
registerProcessor('pcm-capture',Capture);
