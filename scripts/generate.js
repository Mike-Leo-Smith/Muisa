import {mkdirSync,writeFileSync} from 'node:fs';
import {melody,tone,noise,wav} from '../src/fixtures.js';
mkdirSync('fixtures',{recursive:true});
for(const [name,x] of Object.entries({melody:melody(),c_major:tone([48,52,55],2),noise:noise(96000),missing:melody([64,65,null,65,64,67,65,64]),repeated:melody([64,64,65,67,65,64,67,65,64]),unsupported_chord:tone([48,52,55,58],2)}))writeFileSync(`fixtures/${name}.wav`,new Uint8Array(wav(x,48000)));
console.log('Generated six local PCM16 WAV fixtures in fixtures/');

writeFileSync('fixtures/manifest.json',JSON.stringify({version:1,cases:[{id:'synthetic-melody',audioPath:'melody.wav',groupId:'synthetic-melody',split:'regression',license:'self-generated synthetic tones',kind:'music',notes:[64,65,67,65,64,67,65,64].map((midi,i)=>({midi,onsetMs:200+i*1000,durationMs:550}))}]},null,2));
