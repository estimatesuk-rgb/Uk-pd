import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)throw new Error('The existing GitHub Cloudflare credentials are not connected.');
console.log('Deploying the independent Mitchell Proctor Worker with SQLite-backed Durable Object storage; no D1 management permission is needed.');
const out=execFileSync('npx',['--no-install','wrangler','deploy','--config','wrangler.jsonc'],{cwd:root,env:{...process.env,CI:'true'},stdio:['ignore','pipe','inherit'],encoding:'utf8',maxBuffer:8*1024*1024});
console.log(out);
