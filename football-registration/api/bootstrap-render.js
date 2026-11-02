import pg from 'pg';
import {readFileSync} from 'node:fs';
const url=process.env.DATABASE_URL;
if(!url)throw Error('DATABASE_URL is required');
const client=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:true}});
const schema=readFileSync(new URL('./render-bootstrap.sql',import.meta.url),'utf8');
const handbook=JSON.parse(readFileSync(new URL('../data/handbook-2026-27-clubs.json',import.meta.url),'utf8'));
await client.connect();
try{
 await client.query('BEGIN');
 await client.query(schema);
 const league=await client.query('SELECT id FROM football.leagues WHERE name=$1',['Chesterfield and District Sunday Football League 2026/27']);
 if(league.rowCount!==1)throw Error('League not initialized');
 let inserted=0,updated=0;
 for(const club of handbook.clubs){
  const result=await client.query('INSERT INTO football.clubs(league_id,name,division,home_ground,ground_address) VALUES($1,$2,$3,$4,$5) ON CONFLICT(league_id,name) DO UPDATE SET division=EXCLUDED.division,home_ground=EXCLUDED.home_ground,ground_address=EXCLUDED.ground_address RETURNING (xmax=0) AS inserted',[league.rows[0].id,club.name,club.division,club.home_ground,club.home_ground]);
  if(result.rows[0].inserted)inserted++;else updated++;
 }
 if(inserted+updated!==60)throw Error('Unexpected club count');
 await client.query('COMMIT');
 console.log(JSON.stringify({status:'initialized',official_clubs:60,inserted,updated,player_records:'not imported',accounts:'not activated'}));
}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{await client.end();}
