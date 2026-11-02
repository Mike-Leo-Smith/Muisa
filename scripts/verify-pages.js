import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL(process.env.SITE_URL),expected=process.env.EXPECTED_SHA;
assert.equal(base.protocol,'https:');assert.match(expected,/^[a-f0-9]{40}$/);
if(!base.pathname.endsWith('/'))base.pathname+='/';
async function get(path){const url=new URL(path,base);url.searchParams.set('version',expected);const r=await fetch(url,{cache:'no-store'});assert.equal(r.status,200,`${path}: HTTP ${r.status}`);assert.equal(new URL(r.url).protocol,'https:');return r;}
let version;
for(let attempt=0;attempt<12;attempt++){
 try{version=await(await get('version.json')).json();if(version.commit===expected)break;}catch(e){if(attempt===11)throw e;}
 await new Promise(r=>setTimeout(r,5000));
}
assert.equal(version.commit,expected,'Published commit must match tested build');
assert.ok(version.assets['index.html']);assert.ok(version.assets['src/worker.js']);assert.ok(version.assets['src/capture-worklet.js']);
for(const [path,hash] of Object.entries(version.assets)){
 assert.ok(!path.includes('..')&&!path.startsWith('/'));
 const bytes=new Uint8Array(await(await get(path)).arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,path);
}
console.log('Verified HTTPS Pages URL:',base.href,'commit:',expected,'assets:',Object.keys(version.assets).length);
