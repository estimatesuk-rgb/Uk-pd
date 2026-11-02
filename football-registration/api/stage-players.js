/**
 * Stage approved 2026/27 league player names as UNVERIFIED club drafts.
 * Usage: node stage-players.js /path/to/approved-players.json --dry-run
 *        DATABASE_URL=... node stage-players.js /path/to/approved-players.json --apply
 * No web scraping, no FA registration claims, no credentials in files.
 * Input: [{"club":"Exact handbook club name","name":"Player Name",
 *          "source_url":"https://fulltime.thefa.com/...","season":"2026/27","season_reviewed":true}]
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import pg from 'pg';
const input=process.argv[2];
const apply=process.argv.includes('--apply');
if(!input||(!process.argv.includes('--dry-run')&&!apply)||process.argv.includes('--dry-run')&&apply){
 console.error('Usage: node stage-players.js approved-players.json --dry-run|--apply');process.exit(2);
}
const handbook=JSON.parse(readFileSync(new URL('../data/handbook-2026-27-clubs.json',import.meta.url),'utf8'));
const records=JSON.parse(readFileSync(resolve(input),'utf8'));
if(!Array.isArray(records))throw Error('Expected JSON array');
const known=new Set(handbook.clubs.map(c=>c.name));
const seen=new Set();
const cleaned=[];
const sourceHosts=new Set();
for(const [index,p] of records.entries()){
 if(!p||typeof p!=='object'||!known.has(p.club)||typeof p.name!=='string'||p.name.trim().length<2||p.name.length>120)throw Error('Invalid club/player at row '+(index+1));
 if(p.season!=='2026/27'||p.season_reviewed!==true)throw Error('A human must confirm the source actually shows the 2026/27 season at row '+(index+1));
 let source;
 try{source=new URL(p.source_url)}catch{throw Error('Missing valid source URL at row '+(index+1))}
 if(source.protocol!=='https:'||source.hostname!=='fulltime.thefa.com')throw Error('Only FA Full-Time HTTPS sources accepted at row '+(index+1));
 const name=p.name.trim().replace(/\s+/g,' ');
 const key=p.club.toLowerCase()+'|'+name.toLowerCase();
 if(seen.has(key))throw Error('Duplicate club/player at row '+(index+1));
 seen.add(key);sourceHosts.add(source.hostname);cleaned.push({club:p.club,name,source_url:source.href});
}
const summary={records:cleaned.length,clubs:new Set(cleaned.map(x=>x.club)).size,season:'2026/27',registration_verified:false,mode:apply?'apply':'dry-run'};
if(!apply){console.log(JSON.stringify(summary));process.exit(0);}
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing: cannot apply to Render database');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true}});
await client.connect();
try{
 await client.query('BEGIN');
 const clubs=await client.query("select c.id,c.name from football.clubs c join football.leagues l on l.id=c.league_id where l.name=$1",['Chesterfield and District Sunday Football League 2026/27']);
 const ids=new Map(clubs.rows.map(c=>[c.name,c.id]));
 let inserted=0,skipped=0;
 for(const player of cleaned){
  const clubId=ids.get(player.club);if(!clubId)throw Error('Club not imported: '+player.club);
  const exists=await client.query('select 1 from football.players where club_id=$1 and lower(name)=lower($2) limit 1',[clubId,player.name]);
  if(exists.rowCount){skipped++;continue;}
  await client.query("insert into football.players(club_id,name,squad_number,registered,suspended,registration_source) values($1,$2,null,false,false,$3)",[clubId,player.name,'fulltime_public_unverified_2026_27']);
  inserted++;
 }
 await client.query('COMMIT');
 console.log(JSON.stringify({...summary,inserted,skipped,note:'Names staged as unverified only. Club/league must confirm official registration and eligibility.'}));
}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{await client.end();}
