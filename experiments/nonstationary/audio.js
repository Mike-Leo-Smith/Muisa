import assert from 'node:assert/strict';
export function floatWav(bytes){
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'Truncated/trailing RIFF');
 let format,data;
 for(let i=12;i+8<=bytes.length;){const tag=bytes.toString('ascii',i,i+4),size=bytes.readUInt32LE(i+4),start=i+8;assert.ok(start+size<=bytes.length);
  if(tag==='fmt '){assert.ok(!format&&size>=16);format=bytes.subarray(start,start+size);}if(tag==='data'){assert.ok(!data);data=bytes.subarray(start,start+size);}i=start+size+(size%2);
 }
 assert.ok(format&&data);let kind=format.readUInt16LE(0);
 if(kind===65534){assert.ok(format.length>=40);assert.equal(format.readUInt16LE(18),32);assert.equal(format.subarray(24,40).toString('hex'),'0300000000001000800000aa00389b71');kind=3;}
 assert.equal(kind,3,'Require IEEE_FLOAT');assert.equal(format.readUInt16LE(2),1);assert.equal(format.readUInt16LE(14),32);assert.equal(format.readUInt16LE(12),4);assert.equal(format.readUInt32LE(8),format.readUInt32LE(4)*4);assert.equal(data.length%4,0);
 const pcm=Float32Array.from({length:data.length/4},(_,i)=>data.readFloatLE(i*4));assert.ok(pcm.length&&pcm.every(Number.isFinite),'Nonfinite/empty PCM');return {sampleRateHz:format.readUInt32LE(4),pcm};
}
export function verifyPairs(inputs,tolerance=1e-7){
 const get=n=>inputs[n].pcm,room=get('room-only'),speech=get('speech-only'),transients=get('transients-only');const n=room.length;
 for(const x of Object.values(inputs)){assert.equal(x.pcm.length,n);assert.equal(x.sampleRateHz,48000);assert.ok(x.pcm.every(v=>Math.abs(v)<1));}
 const deltas={};
 for(const [name,parts] of [['room-speech',[room,speech]],['room-speech-transients',[room,speech,transients]],['speech-transients-only',[speech,transients]]]){
  const x=get(name);let max=0;for(let i=0;i<n;i++)max=Math.max(max,Math.abs(x[i]-parts.reduce((s,p)=>s+p[i],0)));assert.ok(max<=tolerance,`Unpaired gain/stem: ${name} delta ${max}`);deltas[name]=max;
 }
 return deltas;
}
