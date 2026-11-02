import {createHash} from 'node:crypto';
import {readdirSync,mkdirSync,cpSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const folder of ['src','scripts','test','benchmark'])for(const name of readdirSync(folder))if(name.endsWith('.js'))execFileSync(process.execPath,['--check',`${folder}/${name}`],{stdio:'inherit'});
rmSync('dist',{recursive:true,force:true});mkdirSync('dist');cpSync('index.html','dist/index.html');cpSync('src','dist/src',{recursive:true});console.log('Syntax checked; static application built into dist/');

let commit=process.env.GITHUB_SHA||null;
if(!commit){try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}}
const assets={};for(const file of ['index.html',...readdirSync('dist/src').map(x=>'src/'+x)])assets[file]=createHash('sha256').update(readFileSync('dist/'+file)).digest('hex');
writeFileSync('dist/version.json',JSON.stringify({commit,assets},null,2)+'\n');
