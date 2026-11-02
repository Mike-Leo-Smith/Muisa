import {createGuideUI} from './guide-ui.js';
import {OPEN_STRINGS} from './guide.js';
import {SystemInput} from './input.js';
import {melody,tone,wav} from './fixtures.js';
const $=id=>document.getElementById(id);
let guideUI,demoTimer;
function clearDemo(){clearInterval(demoTimer);demoTimer=null;}
function status(s){$('status').textContent=s;if(/^(stopped|interrupted|denied|error)/.test(s)){clearDemo();clearNoise();guideUI?.invalidate(s+' · 校准已失效，可重新授权、演示或手动继续');}}
let worker,busy=false,dropped=0,token=0,url=null,noiseRms=null;
const input=new SystemInput(frame=>{
 const settings=input.stream?.getAudioTracks()[0]?.getSettings()||{};
 const key=JSON.stringify([frame.streamId,frame.sampleRateHz,settings.deviceId,settings.echoCancellation,settings.noiseSuppression,settings.autoGainControl,$('preprocess').checked]);
 if(guideUI.guide.sourceKey!==key){clearNoise();guideUI.connect(key);resetWorker();}
 draw(frame.channels[0]);if(busy){dropped++;return;}busy=true;worker.postMessage({type:'frame',frame});
},status);
function draw(x){const c=$('wave'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.beginPath();g.strokeStyle='#69dbc2';for(let i=0;i<c.width;i++){const y=65-x[Math.floor(i*x.length/c.width)]*60;i?g.lineTo(i,y):g.moveTo(i,y);}g.stroke();}
function resetWorker(){worker?.terminate();worker=new Worker('./src/worker.js',{type:'module'});busy=false;dropped=0;$('alignment').textContent='等待起音事件';
 worker.onerror=e=>{busy=false;status('分析工作线程出错：'+e.message);};
 worker.onmessage=({data:d})=>{busy=false;if(d.type==='error'){status('分析失败：'+d.message);return;}
 const r=d.result;if(r&&d.type==='live')guideUI.observe(r);if(r){$('level').textContent=r.level.db.toFixed(1)+' dBFS'+(r.level.clipped?' · 削波':'');
 $('pitch').textContent=r.pitch.midi===null?'无声 / 不确定':r.pitch.frequency.toFixed(1)+' Hz · MIDI '+r.pitch.midi.toFixed(2);
 $('chord').textContent=r.chord?.label??'不确定';
 $('detail').textContent=JSON.stringify({pitchConfidence:r.pitch.confidence,chordEvidence:r.chord?.candidates?.slice(0,3),cpuMs:Math.round(d.cpuMs),droppedWindows:dropped},null,2);}
 if(d.alignment)$('alignment').textContent=JSON.stringify(d.type==='offline'?{mode:'offline（全序列）',...d.alignment,events:d.events}:{mode:'live（因果，结果不回改）',...d.alignment},null,2);
 if(d.type==='offline')status('本地分析完成 · '+d.count+' 个 PCM 窗口 · '+Math.round(d.cpuMs)+' ms CPU 墙钟耗时；音频仍未播放');
 };
 worker.postMessage({type:'config',config:{enabled:$('preprocess').checked,noiseRms}});
}
$('preprocess').onchange=()=>{clearDemo();clearNoise();guideUI.invalidate('处理设置变化，请重新校准');if(worker)resetWorker();};
$('calibrateNoise').onclick=()=>{guideUI.guide.stage='noise';guideUI.guide.noiseStatus='unset';if(!input.stream&&!demoTimer){status('请先开始系统输入或演示');return;}guideUI.guide.start();guideUI.render();};
function clearNoise(){noiseRms=null;$('noiseInfo').textContent='未估计背景噪声';}
async function refresh(){try{const prior=$('device').value;const devices=await input.devices();$('device').replaceChildren(new Option('系统默认',''),...devices.map((d,i)=>new Option(d.label||'输入 '+(i+1),d.deviceId)));$('device').value=prior;}catch(e){status('设备列表不可用：'+e.message);}}
$('refresh').onclick=refresh;
$('start').onclick=async()=>{clearDemo();++token;clearNoise();$('player').pause();resetWorker();$('start').disabled=true;try{await input.start($('device').value);await refresh();}catch{}finally{$('start').disabled=false;}};
$('stop').onclick=async()=>{clearDemo();++token;worker?.terminate();busy=false;await input.stop();$('player').pause();$('start').disabled=false;};
function setPlayer(blob){if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);$('player').src=url;}
async function analyze(channels,rate,id){if(id!==token)return;resetWorker();draw(channels[0]);status('本地离线分析中…');worker.postMessage({type:'file',channels,rate});}
async function example(chord=false){clearDemo();clearNoise();const id=++token;await input.stop();$('player').pause();const rate=48000,x=chord?tone([48,52,55],2):melody();setPlayer(new Blob([wav(x,rate)],{type:'audio/wav'}));await analyze([x],rate,id);}
$('sample').onclick=()=>example();$('chordSample').onclick=()=>example(true);
$('file').onchange=async()=>{
 const file=$('file').files[0];if(!file)return;clearDemo();clearNoise();const id=++token;worker?.terminate();await input.stop();$('player').pause();
 let context;try{if(file.size>20*1024*1024)throw new Error('文件超过 20 MB');status('本地解码中…');context=new AudioContext();const decoded=await context.decodeAudioData(await file.arrayBuffer());if(decoded.duration>60)throw new Error('音频超过 60 秒');if(id!==token)return;setPlayer(file);await analyze([decoded.getChannelData(0).slice()],decoded.sampleRate,id);}catch(e){if(id===token)status('文件分析失败：'+e.message);}finally{await context?.close();}
};
$('player').onplay=()=>{++token;input.stop();};
$('device').onchange=()=>{input.stop();};
navigator.mediaDevices?.addEventListener('devicechange',()=>{clearNoise();guideUI.invalidate('设备列表变化，请重新确认输入并校准');refresh();});
window.addEventListener('pagehide',()=>{input.stop();worker?.terminate();if(url)URL.revokeObjectURL(url);});

guideUI=createGuideUI({onNoise(value){noiseRms=value;$('noiseInfo').textContent=value===null?'未估计背景噪声':'实测背景 RMS '+value.toFixed(5)+'（去DC同域，本次输入有效）';resetWorker();},onDemo:startDemo});
async function startDemo(){
 clearDemo();const id=++token;await input.stop();if(id!==token)return;$('player').pause();clearNoise();guideUI.connect('demo-'+token,true);resetWorker();let sample=0;
 demoTimer=setInterval(()=>{
  const startSample=sample;sample+=1024;if(busy)return;const g=guideUI.guide,l=guideUI.lesson,rate=48000;
  let midi=null,amp=.12;
  if(g.stage==='strings')midi=OPEN_STRINGS[g.stringIndex].midi;
  if(g.stage==='quality'){midi=64;amp=[.02,.12,.4][g.qualityIndex];}
  const elapsed=(performance.now()-l.started)/1000;
  if(g.stage==='lesson'&&l.active)midi=[64,65,67,64][l.mode==='blind'?Math.min(3,Math.floor(elapsed/2)):Math.min(3,l.cursor)];
  const x=Float32Array.from({length:4096},(_,i)=>{const index=startSample+i;let hash=Math.imul(index^123,0x45d9f3b);hash=(hash^(hash>>>16))>>>0;const noise=(hash/4294967296-.5)*.002;
   const pulse=g.stage==='lesson'?((elapsed+i/rate)%(l.mode==='blind'?2:1.4)<.65?1:0):1;
   return noise+(midi===null?0:amp*Math.sin(2*Math.PI*440*2**((midi-69)/12)*index/rate)*pulse);
  });draw(x);busy=true;worker.postMessage({type:'frame',frame:{channels:[x],sampleRateHz:rate,startSample,hopSize:1024,streamId:'demo-'+token}});
 },22);
 status('合成 PCM 演示运行中；未验证真实设备，不播放声音');
}
