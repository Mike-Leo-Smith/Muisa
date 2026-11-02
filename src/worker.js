import {Analyzer,frames} from './dsp.js';
import {LiveAligner,alignOffline,score} from './score.js';
let analyzer=new Analyzer(),live=new LiveAligner(score.notes);
self.onmessage=({data})=>{
 try{
 if(data.type==='config'){analyzer=new Analyzer(data.config);live=new LiveAligner(score.notes);return;}
 if(data.type==='frame'){
  const started=performance.now(),result=analyzer.process(data.frame);
  self.postMessage({type:'live',result,alignment:result.event?live.push(result.event):null,cpuMs:performance.now()-started});
 }else if(data.type==='file'){
  const started=performance.now();let result,count=0;
  for(const frame of frames(data.channels,data.rate)){result=analyzer.process(frame);count++;}
  self.postMessage({type:'offline',result,events:analyzer.events,alignment:alignOffline(score.notes,analyzer.events),cpuMs:performance.now()-started,count});
 }
 }catch(e){self.postMessage({type:'error',message:e.message});}
};
