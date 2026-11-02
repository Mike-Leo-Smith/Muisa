import assert from 'node:assert/strict';import {readFileSync,realpathSync,statSync} from 'node:fs';import {resolve,relative,isAbsolute} from 'node:path';import {createHash} from 'node:crypto';
import {floatWav,verifyPairs} from './audio.js';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function targetNotes(doc,durationSeconds,expectedCount=12){
 assert.equal(doc.resampleAdditionalDelaySeconds,0);assert.equal(doc.negativeConditionsHaveTargetNotes,false);assert.deepEqual(doc.negativeReference,[]);assert.equal(doc.notes.length,expectedCount);
 const ids=new Set();return doc.notes.map(n=>{
  assert.equal(typeof n.noteId,'string');assert.ok(!ids.has(n.noteId));ids.add(n.noteId);
  for(const k of ['midi','performedOnsetSeconds','performedGateEndSeconds','physicalDelaySeconds','fractionalDelaySeconds','targetOnsetSeconds','targetGateEndSeconds'])assert.ok(Number.isFinite(n[k]),k);
  assert.ok(n.midi>=0&&n.midi<=127&&n.physicalDelaySeconds>=0&&n.fractionalDelaySeconds>=0);
  const delay=n.physicalDelaySeconds+n.fractionalDelaySeconds;
  assert.ok(Math.abs(n.targetOnsetSeconds-n.performedOnsetSeconds-delay)<1e-9);assert.ok(Math.abs(n.targetGateEndSeconds-n.performedGateEndSeconds-delay)<1e-9);
  assert.equal(n.onsetSample48000,Math.round(n.targetOnsetSeconds*48000));assert.equal(n.gateEndSample48000,Math.round(n.targetGateEndSeconds*48000));
  assert.ok(n.targetOnsetSeconds>=0&&n.targetGateEndSeconds>n.targetOnsetSeconds&&n.targetGateEndSeconds<=durationSeconds);
  return {noteId:n.noteId,midi:n.midi,onsetMs:n.targetOnsetSeconds*1000,durationMs:(n.targetGateEndSeconds-n.targetOnsetSeconds)*1000};
 });
}
export function lockedFiles(lock){
 const entries=new Map();function add(path,hash){assert.equal(typeof path,'string');assert.match(hash,/^[a-f0-9]{64}$/);if(entries.has(path))assert.equal(entries.get(path),hash,'Conflicting payload hash');entries.set(path,hash);}
 function walk(x){if(!x||typeof x!=='object')return;
  const path=x.path??x.relativePath??x.file;if(typeof path==='string'&&typeof x.sha256==='string')add(path,x.sha256);
  for(const [key,v] of Object.entries(x)){if(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&key.includes('.'))add(key,v);else if(v&&typeof v==='object'){if(typeof v.sha256==='string'&&key.includes('.')&&!Array.isArray(x))add(key,v.sha256);walk(v);}}
 }walk(lock);assert.ok(entries.size,'No explicit path/hash entries in input lock');return entries;
}
export function loadBundle(root,frozen,config){
 root=realpathSync(root);const read=path=>{assert.ok(!isAbsolute(path));const p=realpathSync(resolve(root,path)),rel=relative(root,p);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel)&&statSync(p).isFile(),'Escaping bundle path');return readFileSync(p);};
 const manifest=read('manifest.json'),lockBytes=read('input-lock.json');assert.equal(sha(manifest),frozen.inputManifestSha256);assert.equal(sha(lockBytes),frozen.inputLockSha256);
 const lock=JSON.parse(lockBytes),entries=lockedFiles(lock);for(const [path,hash] of entries)assert.equal(sha(read(path)),hash,path);
 const labelPath='labels/performed-and-delayed.json';assert.ok(entries.has(labelPath),'Labels must be hash-bound by payload lock');
 const inputs={};for(const name of config.conditions){const path=`conditions/${name}.wav`,bytes=read(path);assert.equal(sha(bytes),frozen.conditions[name]);assert.equal(entries.get(path),frozen.conditions[name]);inputs[name]=floatWav(bytes);assert.equal(inputs[name].pcm.length,frozen.samples);assert.equal(inputs[name].sampleRateHz,frozen.sampleRateHz);}
 const pairErrors=verifyPairs(inputs,frozen.pairTolerance);const labels=JSON.parse(read(labelPath));const notes=targetNotes(labels,frozen.samples/frozen.sampleRateHz);
 return {inputs,notes,inspection:{pairId:frozen.pairId,lockedPayloadCount:entries.size,samples:frozen.samples,sampleRateHz:frozen.sampleRateHz,conditions:config.conditions,noteCount:notes.length,labelsSha256:entries.get(labelPath),pairMaxAbsoluteErrors:pairErrors,labels:'targetOnsetSeconds/targetGateEndSeconds already delayed; no additional delay'}};
}
