export class SystemInput {
 constructor(onFrame,onStatus){this.onFrame=onFrame;this.onStatus=onStatus;this.generation=0;}
 async devices(){return (await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==='audioinput');}
 async start(deviceId){
  await this.stop();const generation=this.generation;this.onStatus('requesting');let stream,context;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('需要 HTTPS/localhost 和支持音频采集的浏览器');
   stream=await navigator.mediaDevices.getUserMedia({audio:{...(deviceId?{deviceId:{exact:deviceId}}:{}),echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;context=new AudioContext();this.context=context;
   await context.audioWorklet.addModule('./src/capture-worklet.js');await context.resume();
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());if(context.state!=='closed')await context.close();return;}
   this.source=context.createMediaStreamSource(stream);this.node=new AudioWorkletNode(context,'pcm-capture');
   let first=null,sequence=0;this.node.port.onmessage=({data})=>{if(generation!==this.generation)return;first??=data.startSample;this.onFrame({...data,startSample:data.startSample-first,streamId:'system-'+generation,sequence:sequence++});};
   this.source.connect(this.node);this.node.connect(context.destination);
   for(const track of stream.getTracks()){
    track.onended=()=>{if(generation===this.generation){this.stop();this.onStatus('interrupted：设备断开，请重新开始');}};
    track.onmute=()=>this.onStatus('interrupted：输入暂时不可用');track.onunmute=()=>this.onStatus('running：输入恢复，时间/校准需重新确认');
   }
   context.onstatechange=()=>{if(generation===this.generation&&context.state==='suspended')this.onStatus('interrupted：音频上下文挂起，请停止后重启');};
   this.onStatus('running '+JSON.stringify({sampleRateHz:context.sampleRate,channelUsed:0,settings:stream.getAudioTracks()[0].getSettings(),supportedConstraints:navigator.mediaDevices.getSupportedConstraints(),inputLatencyMs:null,hardwareGainControl:'unsupported',stringFretIdentity:'unsupported'}));
  }catch(e){if(generation===this.generation){await this.stop();this.onStatus(e.name==='NotAllowedError'?'denied：未授权输入；可使用本地文件':'error：'+e.message);throw e;}else{stream?.getTracks().forEach(t=>t.stop());if(context&&context.state!=='closed')await context.close();}}
 }
 async stop(){this.generation++;this.node?.disconnect();this.source?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());const c=this.context;this.node=this.source=this.stream=this.context=null;if(c&&c.state!=='closed')await c.close();this.onStatus('stopped');}
}
