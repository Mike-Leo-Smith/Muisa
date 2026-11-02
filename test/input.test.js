import test from 'node:test';
import assert from 'node:assert/strict';
import {SystemInput} from '../src/input.js';
test('cancel pending permission releases late stream without starting context',async()=>{
 let resolve,stopped=0;const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}}});
 try{const states=[],input=new SystemInput(()=>assert.fail('unexpected frame'),s=>states.push(s));const pending=input.start();await new Promise(r=>setImmediate(r));await input.stop();resolve({getTracks:()=>[{stop:()=>stopped++}]});await pending;assert.equal(stopped,1);assert.equal(input.context,null);assert.equal(states.at(-1),'stopped');}finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});
