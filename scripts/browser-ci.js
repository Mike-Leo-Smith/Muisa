import {spawn} from 'node:child_process';
const port='8123',base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['scripts/serve.js'],{env:{...process.env,PORT:port,SERVE_ROOT:'dist'},stdio:'inherit'});
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 if(!ready)throw Error('Test server failed to start');
 const test=spawn(process.execPath,['scripts/browser-smoke.js'],{env:{...process.env,BASE_URL:base},stdio:'inherit'});
 const code=await new Promise((r,j)=>{test.on('error',j);test.on('exit',r);});if(code!==0)process.exitCode=code||1;
}finally{server.kill();}
