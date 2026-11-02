import {spawn} from 'node:child_process';
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',env:process.env});child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(command+' failed: '+(signal||code))));});}
try{
 if(process.env.DATABASE_URL){console.log('Database configured; initializing official league tables and club records');await run(process.execPath,['bootstrap-render.js']);}
 else console.warn('DATABASE_URL not configured; API will serve handbook directory only until database is connected');
 await run(process.execPath,['server.js']);
}catch(e){console.error('Football API startup failed:',e.message);process.exitCode=1;}
