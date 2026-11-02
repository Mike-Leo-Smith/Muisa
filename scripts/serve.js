import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.env.SERVE_ROOT||'.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json'};
createServer(async(req,res)=>{
 try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),relative=path==='/'?'index.html':path.slice(1);
 if(relative!=='index.html'&&!relative.startsWith('src/')){res.writeHead(404);res.end();return;}
 const file=resolve(root,relative);if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404);res.end();}
}).listen(Number(process.env.PORT||8000),'127.0.0.1',()=>console.log('Muisa: http://localhost:'+(process.env.PORT||8000)));
