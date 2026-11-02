import {PracticeGuide,OPEN_STRINGS} from './guide.js';
import {FirstLesson,FIRST_LESSON} from './lesson.js';
export function createGuideUI({onNoise,onDemo}){
 const $=id=>document.getElementById(id),guide=new PracticeGuide(),lesson=new FirstLesson();
 let latestEndMs=0;
 const names={input:'选择输入',noise:'安静段底噪',strings:'六根空弦音准',quality:'信号质量',lesson:'第一课 · 1弦三个音'};
 function render(){
  $('guideTitle').textContent=names[guide.stage]+(guide.demo?' · 合成演示':'');
  $('guideMessage').textContent=guide.stage==='lesson'?lesson.message:guide.message;
  $('guideTarget').textContent=guide.stage==='strings'?OPEN_STRINGS[guide.stringIndex].name+' · A4=440Hz，标准调弦':guide.stage==='quality'?['轻拨一次','普通力度拨一次','较强力度拨一次'][guide.qualityIndex]:guide.stage==='noise'?'先停止拨弦和说话，再点击开始测量':guide.stage==='input'?'在下方选择系统输入并授权，或点合成演示':'';
  $('guideAction').textContent=guide.stage==='lesson'?'开始这一轮':guide.samples?'重新测量':'开始测量';$('guideAction').disabled=guide.stage==='input';
  $('guideNext').hidden=guide.stage==='lesson';$('guideNext').textContent=guide.stage==='strings'?'下一根（未通过则记为跳过）':guide.stage==='quality'?'下一种力度（可跳过）':'继续（未完成则记为跳过）';
  $('lessonArea').hidden=guide.stage!=='lesson';$('lessonConcept').textContent=FIRST_LESSON.concept;
  $('lessonNotes').textContent=lesson.labels().join(' → ');$('lessonProgress').textContent=lesson.mode==='blind'&&lesson.active?'计时中，结束后反馈':`${lesson.cursor}/4 音高顺序；不是节奏成绩`;
  $('guideResults').textContent=JSON.stringify({source:guide.demo?'synthetic-demo':'system-or-unselected',noise:guide.noiseStatus,noiseRms:guide.noiseRms,strings:guide.strings.map((r,i)=>({string:OPEN_STRINGS[i].name,...r})),quality:guide.quality},null,2);
 }
 $('guideAction').onclick=()=>{if(guide.stage==='lesson'){lesson.start($('lessonMode').value,performance.now(),latestEndMs);}else if(!guide.sourceKey){guide.message='尚无输入：请授权开始、使用演示，或手动继续';}else guide.start();render();};
 $('guideNext').onclick=()=>{guide.next();render();};
 $('guideRetry').onclick=()=>{lesson.stop();if(guide.stage==='noise'){guide.noiseStatus='unset';guide.noiseRms=null;onNoise(null);}if(guide.stage==='strings')guide.strings[guide.stringIndex]={status:'pending'};if(guide.stage==='quality')guide.quality[guide.qualityIndex]=null;guide.samples=null;guide.message='已清除当前步骤结果，点击开始测量';render();};
 $('guideDemo').onclick=onDemo;
 $('lessonMode').onchange=()=>{lesson.stop();lesson.mode=$('lessonMode').value;render();};
 const timer=setInterval(()=>{if(lesson.tick(performance.now()))render();},100);window.addEventListener('pagehide',()=>clearInterval(timer));
 render();return {guide,lesson,render,connect(key,demo=false){if(guide.connect(key,demo)){latestEndMs=0;lesson.stop();render();}},invalidate(reason){latestEndMs=0;guide.sourceKey=null;guide.invalidate(reason);lesson.stop();render();},observe(result){latestEndMs=result.endTimeMs;const change=guide.observe(result);if(change?.noise?.ok)onNoise(change.noise.noiseRms);if(guide.stage==='lesson'&&result.event){lesson.accept(result.event);}render();}};
}
