import {alignOffline} from './score.js';
export const FIRST_LESSON={id:'high-e-three-notes-v1',bpm:60,beatsPerNote:2,concept:'品是指板上的金属分隔。一根弦每升一品，音高升一个半音。标准调弦下，最细的 1 弦空弦是 E4，1 品是 F4，3 品是 G4。',notes:[{midi:64,label:'E4 · 空弦'},{midi:65,label:'F4 · 1品'},{midi:67,label:'G4 · 3品'},{midi:64,label:'E4 · 空弦'}].map((n,i)=>({...n,beat:i*2}))};
export class FirstLesson{
 constructor(){this.mode='follow';this.active=false;this.cursor=0;this.events=[];this.message='先看提示练习；音高反馈不等于节奏或手型判定';}
 start(mode,now,minOnsetMs=0){this.minOnsetMs=minOnsetMs;this.mode=mode;this.started=now;this.cursor=0;this.events=[];this.active=true;this.result=null;this.message=mode==='blind'?'8 秒挑战开始，结束后统一反馈':'按顺序拨弦；不确定时等待，不强行判错';}
 accept(event){if(!this.active||!event||event.onsetMs<this.minOnsetMs)return;this.events.push({...event});if(this.mode==='blind')return;
  if(!Number.isFinite(event.midi)||event.confidence<.8){this.message='没听清，请再拨一次';return;}
  if(Math.abs(event.midi-FIRST_LESSON.notes[this.cursor].midi)<.5){this.cursor++;this.message=this.cursor===4?'本轮音高顺序完成，可切换填空或无提示模式':'收到，继续下一音';if(this.cursor===4)this.active=false;}
  else this.message='听到了不同音高，请再试；无法从声音确定弦品或手型';
 }
 tick(now){if(this.active&&this.mode==='blind'&&now-this.started>=8000){this.active=false;this.result=alignOffline(FIRST_LESSON.notes,this.events);this.message='挑战结束：匹配 '+this.result.path.filter(x=>x.kind==='match').length+'/4；未观测到不等于漏弹。未做硬件延迟或节奏准错校准';return true;}return false;}
 labels(){if(this.mode==='blind'&&this.active)return ['无提示挑战进行中'];return FIRST_LESSON.notes.map((n,i)=>this.mode==='fill'&&i%2?'□':n.label);}
 stop(){this.active=false;this.message='输入或设置变化，练习已停止，请重新开始';}
}
