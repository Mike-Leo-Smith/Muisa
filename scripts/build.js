import {readdirSync,mkdirSync,cpSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const folder of ['src','scripts','test','benchmark'])for(const name of readdirSync(folder))if(name.endsWith('.js'))execFileSync(process.execPath,['--check',`${folder}/${name}`],{stdio:'inherit'});
rmSync('dist',{recursive:true,force:true});mkdirSync('dist');cpSync('index.html','dist/index.html');cpSync('src','dist/src',{recursive:true});console.log('Syntax checked; static application built into dist/');
