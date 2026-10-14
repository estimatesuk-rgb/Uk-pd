import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dbName='mitchell-proctor-fees';
if(!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID){
  throw new Error('Cloudflare deployment credentials not connected in this GitHub repository.');
}
function wrangler(args){return execFileSync('npx',['--no-install','wrangler',...args],{cwd:root,env:{...process.env,CI:'true'},encoding:'utf8',stdio:['ignore','pipe','inherit'],maxBuffer:8*1024*1024})}
const uuid=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
let list=wrangler(['d1','list','--json']);let all;
try{all=JSON.parse(list)}catch{const pos=list.indexOf('[');if(pos<0)throw Error('Could not parse D1 list');all=JSON.parse(list.slice(pos))}
const dbs=Array.isArray(all)?all:all.result||all.databases||[];
let id=(dbs.find(x=>x.name===dbName)||{});
id=id.uuid||id.id||id.database_id;
if(!id){console.log('Creating independent Mitchell Proctor D1 database…');
 const output=wrangler(['d1','create',dbName,'--location','weur']);
 id=output.match(/database_id\s*=\s*["']([^"']+)["']/i)?.[1]||output.match(uuid)?.[0];
 if(!id)throw Error('D1 created, but database UUID could not be read: inspect Cloudflare dashboard before retrying.');
}
if(!uuid.test(String(id)))throw Error('Invalid D1 database identifier');
const cfgPath=resolve(root,'wrangler.jsonc');const old=readFileSync(cfgPath,'utf8');
writeFileSync(cfgPath,old.replace(/"database_id"\s*:\s*"[^"]*"/,'"database_id":"'+id+'"'));
console.log('Applying database migrations…');
console.log(wrangler(['d1','migrations','apply',dbName,'--remote','--yes']));
console.log('Publishing separate Mitchell Proctor Worker…');
console.log(wrangler(['deploy','--config','wrangler.jsonc']));
console.log('Production Worker deployment completed; verify the actual workers.dev URL before sharing it.');
