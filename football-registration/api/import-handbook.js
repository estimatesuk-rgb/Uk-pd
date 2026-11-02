import pg from 'pg';
import {readFileSync} from 'node:fs';
const url=process.env.DATABASE_URL;
if(!url)throw Error('DATABASE_URL is required');
const handbook=JSON.parse(readFileSync(new URL('../data/handbook-2026-27-clubs.json',import.meta.url),'utf8'));
const db=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:true}});
await db.connect();
try{
 await db.query('BEGIN');
 const league=await db.query('select id from football.leagues where name=$1',['Chesterfield and District Sunday Football League 2026/27']);
 if(league.rowCount!==1)throw Error('Expected one 2026/27 league record');
 let created=0,updated=0;
 for(const c of handbook.clubs){
  const existing=await db.query('select id from football.clubs where league_id=$1 and lower(name)=lower($2)',[league.rows[0].id,c.name]);
  if(existing.rowCount>1)throw Error('Duplicate club '+c.name);
  if(existing.rowCount){
   await db.query('update football.clubs set division=$1,home_ground=$2,ground_address=$3 where id=$4',[c.division,c.home_ground,c.home_ground,existing.rows[0].id]);updated++;
  }else{
   await db.query('insert into football.clubs(league_id,name,division,home_ground,ground_address) values($1,$2,$3,$4,$5)',[league.rows[0].id,c.name,c.division,c.home_ground,c.home_ground]);created++;
  }
 }
 await db.query('COMMIT');
 console.log(JSON.stringify({season:handbook.season,clubs:handbook.clubs.length,created,updated}));
}catch(e){await db.query('ROLLBACK');console.error(e);process.exitCode=1;}finally{await db.end();}
