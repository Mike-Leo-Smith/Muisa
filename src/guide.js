export const OPEN_STRINGS=[{name:'6弦 · E2',midi:40},{name:'5弦 · A2',midi:45},{name:'4弦 · D3',midi:50},{name:'3弦 · G3',midi:55},{name:'2弦 · B3',midi:59},{name:'1弦 · E4',midi:64}];
const median=x=>{const a=[...x].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;};
export function tuningReading(pitch,target){
 if(!Number.isFinite(pitch?.midi)||!Number.isFinite(pitch.confidence)||pitch.confidence<.9)return {kind:'unknown',text:'没听清，请单独拨一根弦'};
 const cents=(pitch.midi-target)*100;
 if(Math.abs(Math.abs(cents)-1200)<50||Math.abs(Math.abs(cents)-2400)<50)return {kind:'octave',cents,text:'可能是倍频或另一音区；不自动折算，请重拨'};
 if(Math.abs(cents)>100)return {kind:'different',cents,text:'检测到另一音高；不能据此判断实际弦号'};
 return {kind:Math.abs(cents)<=25?'in-tune':'off',cents,text:Math.abs(cents)<=25?'接近目标':cents>0?'偏高，先小幅调整再重拨':'偏低，先小幅调整再重拨'};
}
export function assessNoise(samples){
 if(samples.length<8)return {ok:false,message:'样本不足，请重试'};
 const rms=samples.map(x=>x.centeredRms),floor=median(rms),sorted=[...rms].sort((a,b)=>a-b),p90=sorted[Math.floor(sorted.length*.9)];
 if(samples.some(x=>x.level.clipped))return {ok:false,message:'采集时发生削波，请降低设备增益再试'};
 if(floor<1e-7)return {ok:false,message:'持续数字静音，无法确认输入是否有效；可重试或手动跳过'};
 if(floor>.03||p90>Math.max(.01,floor*4)||samples.filter(x=>x.pitch.confidence>=.85&&x.pitch.midi!==null).length>=3)return {ok:false,message:'安静段可能混入拨弦、说话或明显干扰，请停止发声再试'};
 return {ok:true,noiseRms:floor,p90,message:'背景已估计；这不是语音降噪，也无法保证所有干扰都被发现'};
}
export function assessQuality(samples,noiseRms){
 if(!samples.length)return {status:'unknown',message:'没有足够输入'};
 const rms=Math.max(...samples.map(x=>x.centeredRms)),peak=Math.max(...samples.map(x=>x.level.peak)),pitches=samples.filter(x=>x.pitch.confidence>=.9&&Number.isFinite(x.pitch.midi)).map(x=>x.pitch.midi),mid=median(pitches);
 const spread=mid===null?null:median(pitches.map(p=>Math.abs(p-mid)))*100;
 const snrDb=noiseRms>0?20*Math.log10(Math.max(rms,1e-9)/noiseRms):null;
 return {status:peak>=.999?'clipped':rms<.008?'weak':snrDb!==null&&snrDb<10?'noisy':pitches.length<3?'unknown':'observed',rms,peak,snrDb,pitchSpreadCents:spread,message:peak>=.999?'有削波，请自行降低设备增益':rms<.008?'信号偏弱，当前识别器可能漏听':snrDb!==null&&snrDb<10?'与底噪差距较小，请减少背景干扰':pitches.length<3?'没有稳定单音证据，请重试或手动继续':'已记录电平与音高稳定性；不诊断手型、琴或线材故障'};
}
export function guideAnalysisConfig(enabled,noiseRms,guide){return guide?.stage==='noise'&&guide.samples!==null?{enabled:true,noiseRms:null}:{enabled,noiseRms};}
export class PracticeGuide{
 constructor(){this.sourceKey=null;this.demo=false;this.invalidate('选择输入后开始，也可使用合成演示');}
 invalidate(reason){this.demo=false;this.stage='input';this.noiseRms=null;this.noiseStatus='unset';this.strings=OPEN_STRINGS.map(()=>({status:'pending'}));this.stringIndex=0;this.quality=[];this.qualityIndex=0;this.samples=null;this.tuning=[];this.message=reason;this.history=[];}
 connect(key,demo=false){if(key===this.sourceKey)return false;this.invalidate('输入已变化，校准已清空');this.sourceKey=key;this.demo=demo;this.stage='noise';return true;}
 resetAttempt(){this.samples=null;this.tuning=[];if(this.stage==='noise'){this.noiseRms=null;this.noiseStatus='unset';}if(this.stage==='strings')this.strings[this.stringIndex]={status:'pending'};if(this.stage==='quality')this.quality[this.qualityIndex]=null;}
 start(){this.resetAttempt();if(this.stage==='noise')this.noiseStatus='measuring';this.samples=[];this.started=null;this.tuning=[];this.message=this.stage==='noise'?'请保持安静约 2 秒，不要拨弦或说话':'请按当前提示拨弦';}
 next(){this.samples=null;this.tuning=[];
  if(this.stage==='input'){this.history.push({step:'input',status:'manual-skip'});this.stage='noise';}
  else if(this.stage==='noise'){if(this.noiseStatus!=='measured'){this.noiseStatus='manual-skip';this.noiseRms=null;}this.history.push({step:'noise',status:this.noiseStatus,demo:this.demo});this.stage='strings';}
  else if(this.stage==='strings'){if(this.strings[this.stringIndex].status!=='measured')this.strings[this.stringIndex]={status:'manual-skip',demo:this.demo};if(++this.stringIndex>=6)this.stage='quality';}
  else if(this.stage==='quality'){if(!this.quality[this.qualityIndex])this.quality[this.qualityIndex]={status:'manual-skip',demo:this.demo};if(++this.qualityIndex>=3)this.stage='lesson';}
  this.message='可重试，也可手动继续；跳过不等于识别通过';
 }
 observe(result){
  if(!this.samples)return null;
  this.started??=result.timeMs;this.samples.push(result);if(this.samples.length>512)this.samples.shift();
  if(this.stage==='noise'&&result.timeMs-this.started>=2000){const outcome=assessNoise(this.samples);this.samples=null;this.message=outcome.message;if(outcome.ok){this.noiseRms=outcome.noiseRms;this.noiseStatus='measured';}else{this.noiseRms=null;this.noiseStatus='rejected';}return {noise:outcome};}
  if(this.stage==='strings'){
   if(result.level.clipped){this.tuning=[];this.message='输入削波，请降低设备增益再重试';return null;}
   const reading=tuningReading(result.pitch,OPEN_STRINGS[this.stringIndex].midi);this.message=reading.text+(Number.isFinite(reading.cents)?' · '+reading.cents.toFixed(1)+' cents':'');
   if(reading.kind!=='in-tune'||result.centeredRms<Math.max(.008,(this.noiseRms||0)*2)){this.tuning=[];return null;}
   this.tuning.push({time:result.timeMs,cents:reading.cents});this.tuning=this.tuning.filter(x=>result.timeMs-x.time<=650);
   if(this.tuning.length>=5&&result.timeMs-this.tuning[0].time>=350){this.strings[this.stringIndex]={status:'measured',cents:median(this.tuning.map(x=>x.cents)),demo:this.demo};this.samples=null;this.message='连续单音证据接近目标，请手动进入下一弦（未确认实际弦号）';}
  }
  if(this.stage==='quality'&&result.timeMs-this.started>=1800){const outcome=assessQuality(this.samples,this.noiseRms);this.quality[this.qualityIndex]={...outcome,demo:this.demo};this.samples=null;this.message=outcome.message;}
  return null;
 }
}
