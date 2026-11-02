import {SystemInput} from './input.js';
import {noiseEstimate,backgroundRms} from './preprocess.js';
import {melody,tone,wav} from './fixtures.js';
const $=id=>document.getElementById(id),status=s=>$('status').textContent=s;
let worker,busy=false,dropped=0,token=0,url=null,noiseRms=null,calibration=null;
const input=new SystemInput(frame=>{
 if(calibration){calibration.push(backgroundRms(frame.channels[0]));if(calibration.length>=48){noiseRms=noiseEstimate(calibration);calibration=null;$('noiseInfo').textContent='噪声 RMS '+noiseRms.toFixed(4)+'（只对本次输入有效）';resetWorker();}}
 draw(frame.channels[0]);if(busy){dropped++;return;}busy=true;worker.postMessage({type:'frame',frame});
},status);
function draw(x){const c=$('wave'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.beginPath();g.strokeStyle='#69dbc2';for(let i=0;i<c.width;i++){const y=65-x[Math.floor(i*x.length/c.width)]*60;i?g.lineTo(i,y):g.moveTo(i,y);}g.stroke();}
function resetWorker(){worker?.terminate();worker=new Worker('./src/worker.js',{type:'module'});busy=false;dropped=0;$('alignment').textContent='等待起音事件';
 worker.onerror=e=>{busy=false;status('分析工作线程出错：'+e.message);};
 worker.onmessage=({data:d})=>{busy=false;if(d.type==='error'){status('分析失败：'+d.message);return;}
 const r=d.result;if(r){$('level').textContent=r.level.db.toFixed(1)+' dBFS'+(r.level.clipped?' · 削波':'');
 $('pitch').textContent=r.pitch.midi===null?'无声 / 不确定':r.pitch.frequency.toFixed(1)+' Hz · MIDI '+r.pitch.midi.toFixed(2);
 $('chord').textContent=r.chord?.label??'不确定';
 $('detail').textContent=JSON.stringify({pitchConfidence:r.pitch.confidence,chordEvidence:r.chord?.candidates?.slice(0,3),cpuMs:Math.round(d.cpuMs),droppedWindows:dropped},null,2);}
 if(d.alignment)$('alignment').textContent=JSON.stringify(d.type==='offline'?{mode:'offline（全序列）',...d.alignment,events:d.events}:{mode:'live（因果，结果不回改）',...d.alignment},null,2);
 if(d.type==='offline')status('本地分析完成 · '+d.count+' 个 PCM 窗口 · '+Math.round(d.cpuMs)+' ms CPU 墙钟耗时；音频仍未播放');
 };
 worker.postMessage({type:'config',config:{enabled:$('preprocess').checked,noiseRms}});
}
$('preprocess').onchange=()=>{if(worker)resetWorker();};
$('calibrateNoise').onclick=()=>{if(!input.stream){status('请先开始系统输入，再保持约一秒背景安静');return;}calibration=[];$('noiseInfo').textContent='采集背景电平中：请勿弹琴/说话';};
function clearNoise(){noiseRms=null;calibration=null;$('noiseInfo').textContent='未估计背景噪声';}
async function refresh(){try{const prior=$('device').value;const devices=await input.devices();$('device').replaceChildren(new Option('系统默认',''),...devices.map((d,i)=>new Option(d.label||'输入 '+(i+1),d.deviceId)));$('device').value=prior;}catch(e){status('设备列表不可用：'+e.message);}}
$('refresh').onclick=refresh;
$('start').onclick=async()=>{++token;clearNoise();$('player').pause();resetWorker();$('start').disabled=true;try{await input.start($('device').value);await refresh();}catch{}finally{$('start').disabled=false;}};
$('stop').onclick=async()=>{++token;worker?.terminate();busy=false;await input.stop();$('player').pause();$('start').disabled=false;};
function setPlayer(blob){if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);$('player').src=url;}
async function analyze(channels,rate,id){if(id!==token)return;resetWorker();draw(channels[0]);status('本地离线分析中…');worker.postMessage({type:'file',channels,rate});}
async function example(chord=false){clearNoise();const id=++token;await input.stop();$('player').pause();const rate=48000,x=chord?tone([48,52,55],2):melody();setPlayer(new Blob([wav(x,rate)],{type:'audio/wav'}));await analyze([x],rate,id);}
$('sample').onclick=()=>example();$('chordSample').onclick=()=>example(true);
$('file').onchange=async()=>{
 const file=$('file').files[0];if(!file)return;clearNoise();const id=++token;worker?.terminate();await input.stop();$('player').pause();
 let context;try{if(file.size>20*1024*1024)throw new Error('文件超过 20 MB');status('本地解码中…');context=new AudioContext();const decoded=await context.decodeAudioData(await file.arrayBuffer());if(decoded.duration>60)throw new Error('音频超过 60 秒');if(id!==token)return;setPlayer(file);await analyze([decoded.getChannelData(0).slice()],decoded.sampleRate,id);}catch(e){if(id===token)status('文件分析失败：'+e.message);}finally{await context?.close();}
};
$('player').onplay=()=>{++token;input.stop();};
navigator.mediaDevices?.addEventListener('devicechange',refresh);
window.addEventListener('pagehide',()=>{input.stop();worker?.terminate();if(url)URL.revokeObjectURL(url);});
