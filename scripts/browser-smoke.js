import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:8000';
const profile=mkdtempSync(join(tmpdir(),'guitar-browser-'));
const browser=spawn(process.env.CHROMIUM_PATH||'/usr/bin/chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${resolve('fixtures/melody.wav')}`,'about:blank'],{stdio:'ignore'});
let ws;const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let port;for(let i=0;i<100;i++){try{port=readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await delay(100);}}
 if(!port)throw Error('Chromium startup timeout');
 const pages=await(await fetch(`http://localhost:${port}/json`)).json();
 ws=new WebSocket(pages.find(x=>x.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let next=0;const pending=new Map();const errors=[];
 ws.onmessage=({data})=>{const d=JSON.parse(data);if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d.result);}};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Timeout: '+expression);};
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Browser.grantPermissions',{origin:base,permissions:['audioCapture']});
 await cdp('Page.navigate',{url:base});await wait("!!document.querySelector('#sample')");await delay(200);
 await evaluate("document.querySelector('#sample').click()");await wait("document.querySelector('#status').textContent.includes('本地分析完成')");
 const melody=JSON.parse(await evaluate("document.querySelector('#alignment').textContent"));assert.equal(melody.events.length,8);assert.equal(melody.cost,0);console.log('PASS browser generated PCM -> worker DSP -> 8 notes -> offline alignment');
 await evaluate("document.querySelector('#chordSample').click()");await wait("document.querySelector('#status').textContent.includes('本地分析完成')");assert.equal(await evaluate("document.querySelector('#chord').textContent"),'C');console.log('PASS browser C chord baseline');
 const doc=await cdp('DOM.getDocument');const q=await cdp('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#file'});await cdp('DOM.setFileInputFiles',{nodeId:q.nodeId,files:[resolve('fixtures/missing.wav')]});await wait("document.querySelector('#status').textContent.includes('本地分析完成')");const missing=JSON.parse(await evaluate("document.querySelector('#alignment').textContent"));assert.equal(missing.events.length,7);assert.equal(missing.path.filter(x=>x.kind==='unobserved').length,1);console.log('PASS browser local WAV decode -> PCM -> missing-note alignment');
 await evaluate("document.querySelector('#start').click()");await wait("document.querySelector('#status').textContent.startsWith('running')");await wait("document.querySelector('#alignment').textContent.includes('因果')");await evaluate("document.querySelector('#stop').click()");await wait("document.querySelector('#status').textContent==='stopped'");console.log('PASS browser fake microphone -> AudioWorklet -> live follower -> stop (not physical hardware)');
 await cdp('Browser.setPermission',{origin:base,permission:{name:'microphone'},setting:'denied'});await evaluate("document.querySelector('#start').click()");await wait("document.querySelector('#status').textContent.startsWith('denied')");console.log('PASS microphone permission denial');
 assert.deepEqual(errors,[]);console.log('PASS no page runtime exceptions');
}finally{ws?.close();browser.kill();await new Promise(r=>browser.once('exit',r));rmSync(profile,{recursive:true,force:true});}
