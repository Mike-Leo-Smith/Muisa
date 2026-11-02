import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:8000';
const profile=mkdtempSync(join(tmpdir(),'guitar-browser-'));
const browser=spawn(process.env.CHROMIUM_PATH||'/usr/bin/chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${resolve('fixtures/melody.wav')}`,'about:blank'],{stdio:'ignore'});
let ws,cdp;const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let port;for(let i=0;i<100;i++){try{port=readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await delay(100);}}
 if(!port)throw Error('Chromium startup timeout');
 const pages=await(await fetch(`http://localhost:${port}/json`)).json();
 ws=new WebSocket(pages.find(x=>x.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let next=0;const pending=new Map();const errors=[];
 ws.onmessage=({data})=>{const d=JSON.parse(data);if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d.result);}};
 cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Timeout: '+expression);};
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Browser.grantPermissions',{origin:new URL(base).origin,permissions:['audioCapture']});
 await cdp('Page.navigate',{url:base});await wait("!!document.querySelector('#sample')");await delay(200);
 assert.equal(await evaluate('window.isSecureContext'),true);
 assert.equal(await evaluate("document.querySelector('#status').textContent"),'尚未访问输入设备');
 console.log('PASS secure context and no automatic microphone permission request');
 await evaluate("document.querySelector('#sample').click()");await wait("document.querySelector('#status').textContent.includes('本地分析完成')");
 const melody=JSON.parse(await evaluate("document.querySelector('#alignment').textContent"));assert.equal(melody.events.length,8);assert.equal(melody.cost,0);console.log('PASS browser generated PCM -> worker DSP -> 8 notes -> offline alignment');
 await evaluate("document.querySelector('#chordSample').click()");await wait("document.querySelector('#status').textContent.includes('本地分析完成')");assert.equal(await evaluate("document.querySelector('#chord').textContent"),'C');console.log('PASS browser C chord baseline');
 const doc=await cdp('DOM.getDocument');const q=await cdp('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#file'});await cdp('DOM.setFileInputFiles',{nodeId:q.nodeId,files:[resolve('fixtures/missing.wav')]});await wait("document.querySelector('#status').textContent.includes('本地分析完成')");const missing=JSON.parse(await evaluate("document.querySelector('#alignment').textContent"));assert.equal(missing.events.length,7);assert.equal(missing.path.filter(x=>x.kind==='unobserved').length,1);console.log('PASS browser local WAV decode -> PCM -> missing-note alignment');
 await evaluate("document.querySelector('#start').click()");await wait("document.querySelector('#status').textContent.startsWith('running')");await wait("(()=>{try{return JSON.parse(document.querySelector('#alignment').textContent).kind==='match';}catch{return false;}})()");
 const live=JSON.parse(await evaluate("document.querySelector('#alignment').textContent"));assert.ok(Math.abs(live.event.midi-[64,65,67,65,64,67,65,64][live.index])<.5);assert.ok(live.event.confidence>=.8);assert.ok(live.event.onsetMs>=0);await evaluate("document.querySelector('#stop').click()");await wait("document.querySelector('#status').textContent==='stopped'");console.log('PASS browser fake microphone -> AudioWorklet -> live follower -> stop (not physical hardware)');
 const lifecycle=await evaluate(`(async()=>{const {SystemInput}=await import('./src/input.js');const samples=[];const source=new SystemInput(f=>samples.push(f.startSample),()=>{});const wait=()=>new Promise((resolve,reject)=>{let count=0;const timer=setInterval(()=>{if(samples.length>=3){clearInterval(timer);resolve();}else if(++count>100){clearInterval(timer);reject(Error('capture timeout'));}},30);});await source.start();await wait();const clock=samples.slice(),tracks=source.stream.getTracks(),context=source.context;await source.stop();const closed=context.state==='closed'&&tracks.every(t=>t.readyState==='ended');samples.length=0;await source.start();await wait();const restart=samples.slice();await source.stop();return {clock,closed,restart};})()`);
 assert.ok(lifecycle.closed);assert.ok(lifecycle.clock.slice(1).every((v,i)=>v>lifecycle.clock[i]));assert.equal(lifecycle.clock[0],0);assert.equal(lifecycle.restart[0],0);console.log('PASS input sample clock, stop cleanup and restart isolation');
 // Exercise the new guide with actual generated PCM through the live worker.
 await evaluate("document.querySelector('#guideDemo').click()");await wait("document.querySelector('#guideTitle').textContent.includes('安静段')");
 await evaluate("document.querySelector('#guideAction').click()");await wait("JSON.parse(document.querySelector('#guideResults').textContent).noise==='measured'");
 assert.equal(await evaluate("JSON.parse(document.querySelector('#guideResults').textContent).source"),'synthetic-demo');
 await evaluate("document.querySelector('#guideNext').click();document.querySelector('#guideAction').click()");await wait("JSON.parse(document.querySelector('#guideResults').textContent).strings[0].status==='measured'");
 await evaluate("for(let i=0;i<6;i++)document.querySelector('#guideNext').click()");
 assert.equal(await evaluate("JSON.parse(document.querySelector('#guideResults').textContent).strings[1].status"),'manual-skip');
 await evaluate("document.querySelector('#guideAction').click()");await wait("JSON.parse(document.querySelector('#guideResults').textContent).quality.length===1");
 await evaluate("for(let i=0;i<3;i++)document.querySelector('#guideNext').click();document.querySelector('#guideAction').click()");
 await wait("document.querySelector('#lessonProgress').textContent.startsWith('4/4')");console.log('PASS guide PCM noise calibration, stable open-string evidence, explicit skips, quality and first lesson');
 await evaluate("document.querySelector('#lessonMode').value='fill';document.querySelector('#lessonMode').dispatchEvent(new Event('change'))");assert.ok(await evaluate("document.querySelector('#lessonNotes').textContent.includes('□')"));
 await evaluate("document.querySelector('#lessonMode').value='blind';document.querySelector('#lessonMode').dispatchEvent(new Event('change'));document.querySelector('#guideAction').click()");
 assert.equal(await evaluate("document.querySelector('#lessonNotes').textContent"),'无提示挑战进行中');await delay(1000);assert.ok(await evaluate("document.querySelector('#guideMessage').textContent.includes('8 秒挑战开始')"));
 await wait("document.querySelector('#guideMessage').textContent.includes('挑战结束')");console.log('PASS fill hides prompts and blind challenge delays feedback until its end');
 await evaluate("document.querySelector('#preprocess').click()");assert.ok(await evaluate("document.querySelector('#guideTitle').textContent.includes('选择输入')"));assert.equal(await evaluate("JSON.parse(document.querySelector('#guideResults').textContent).noise"),'unset');
 await evaluate("document.querySelector('#start').click()");await wait("document.querySelector('#status').textContent.startsWith('running')");await wait("document.querySelector('#guideTitle').textContent.includes('安静段')");
 assert.equal(await evaluate("JSON.parse(document.querySelector('#guideResults').textContent).source"),'system-or-unselected');
 await evaluate("document.querySelector('#guideAction').click()");await wait("document.querySelector('#guideMessage').textContent.includes('可能混入')");assert.equal(await evaluate("JSON.parse(document.querySelector('#guideResults').textContent).noise"),'unset');
 await evaluate("document.querySelector('#stop').click()");await wait("document.querySelector('#status').textContent==='stopped'");console.log('PASS settings/source invalidate calibration; musical fake input rejected as quiet calibration');
 await cdp('Browser.setPermission',{origin:new URL(base).origin,permission:{name:'microphone'},setting:'denied'});await evaluate("document.querySelector('#start').click()");await wait("document.querySelector('#status').textContent.startsWith('denied')");console.log('PASS microphone permission denial');
 assert.deepEqual(errors,[]);console.log('PASS no page runtime exceptions');
}finally{
 // Ask the actual browser to close, not just the launcher process. Chrome wrappers
 // can exit while child processes still write into the temporary profile.
 const exited=browser.exitCode!==null||browser.signalCode!==null?Promise.resolve():new Promise(r=>browser.once('exit',r));
 if(cdp&&ws?.readyState===WebSocket.OPEN){try{await Promise.race([cdp('Browser.close'),delay(5000)]);}catch{}}
 await Promise.race([exited,delay(5000)]);
 if(browser.exitCode===null&&browser.signalCode===null){browser.kill();await Promise.race([exited,delay(5000)]);}
 ws?.close();rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
