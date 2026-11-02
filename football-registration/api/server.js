import express from 'express';
import pg from 'pg';
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'node:crypto';
const app=express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin:process.env.FRONTEND_ORIGIN||'https://football-registration-team-sheet.onrender.com',methods:['GET','POST']}));
app.use(express.json({limit:'16kb'}));
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},max:3,connectionTimeoutMillis:8000}):null;
app.get('/health',async(_req,res)=>{
 if(!pool)return res.status(503).json({status:'setup_required',database:'not_configured',message:'Set DATABASE_URL as a Render secret environment variable'});
 try {const r=await pool.query("select count(*)::int as tables from information_schema.tables where table_schema='football'");
 res.json({status:'ok',database:'connected',tables:r.rows[0].tables,mode:'authenticated-club-api'});}
 catch(e){console.error('Database health check failed:',e.code||e.message);res.status(503).json({status:'unavailable'});}
});
app.get('/api/v1/clubs',async(_req,res)=>{
 if(!pool)return res.status(503).json({error:'Database not configured'});
 try{
 const q=await pool.query("select c.id,c.name,c.division,c.badge_url,c.home_ground,c.ground_address,c.source_url from football.clubs c join football.leagues l on l.id=c.league_id where l.name=$1 order by c.division nulls last,c.name",['Chesterfield and District Sunday Football League 2026/27']);
 res.json({season:'2026/27',verified:false,clubs:q.rows,count:q.rowCount,note:'Provisional public club directory; no private contact details or player registrations exposed'});
 }catch(e){console.error('Club directory query failed:',e.code||e.message);res.status(503).json({error:'Unavailable'});}
});
const tokenDigest=token=>crypto.createHash('sha256').update(token).digest('hex');
async function requireClub(req,res,next){
 const header=req.get('authorization')||'';
 const match=/^Bearer ([a-f0-9]{64})$/i.exec(header);
 if(!match)return res.status(401).json({error:'Club sign-in required'});
 if(!pool)return res.status(503).json({error:'Database unavailable'});
 try{const result=await pool.query('select a.club_id,c.name,c.division from football.club_auth_sessions s join football.club_auth_accounts a on a.club_id=s.club_id join football.clubs c on c.id=a.club_id where s.token_hash=$1 and s.expires_at>now() and a.disabled_at is null',[tokenDigest(match[1])]);if(!result.rowCount)return res.status(401).json({error:'Session expired or invalid'});req.club=result.rows[0];req.sessionHash=tokenDigest(match[1]);next();}catch(e){console.error('Session lookup failed:',e.code||e.message);res.status(503).json({error:'Authentication unavailable'});}
}
const loginAttempts=new Map();
function loginThrottle(req,res,next){
 const ip=req.ip||req.socket.remoteAddress||'unknown',now=Date.now();
 if(loginAttempts.size>5000){for(const [key,value] of loginAttempts){if(now-value.start>900000)loginAttempts.delete(key);}}
 const entry=loginAttempts.get(ip);
 if(entry&&now-entry.start<900000&&entry.count>=8){res.set('Retry-After',String(Math.max(1,Math.ceil((entry.start+900000-now)/1000))));return res.status(429).json({error:'Too many sign-in attempts. Try again later.'});}
 if(!entry||now-entry.start>=900000)loginAttempts.set(ip,{start:now,count:1});
 else entry.count++;
 next();
}
app.post('/api/v1/auth/login',loginThrottle,async(req,res)=>{
 if(!pool)return res.status(503).json({error:'Database unavailable'});
 const email=String(req.body?.email||'').trim().toLowerCase(),password=req.body?.password;
 if(email.length>254||!email.includes('@')||typeof password!=='string'||password.length>256||!password)return res.status(400).json({error:'Valid email and password required'});
 try{const result=await pool.query('select club_id,password_salt,password_hash from football.club_auth_accounts where lower(email)=$1 and disabled_at is null',[email]);const account=result.rows[0];if(!account)return res.status(401).json({error:'Invalid credentials'});
 const salt=Buffer.from(account.password_salt,'hex'),expected=Buffer.from(account.password_hash,'hex');
 const computed=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,expected.length,(err,key)=>err?reject(err):resolve(key)));
 if(computed.length!==expected.length||!crypto.timingSafeEqual(computed,expected))return res.status(401).json({error:'Invalid credentials'});
 const token=crypto.randomBytes(32).toString('hex');await pool.query("insert into football.club_auth_sessions(token_hash,club_id,expires_at) values ($1,$2,now()+interval '12 hours')",[tokenDigest(token),account.club_id]);await pool.query('update football.club_auth_accounts set last_login_at=now() where club_id=$1',[account.club_id]);
 res.set('Cache-Control','no-store').json({token,expires_in:43200});
 }catch(e){console.error('Club login failed:',e.code||e.message);res.status(503).json({error:'Sign-in unavailable'});}
});
app.get('/api/v1/auth/me',requireClub,(req,res)=>res.set('Cache-Control','no-store').json({club:req.club}));
app.get('/api/v1/my/next-match',requireClub,async(req,res)=>{
 try{
  const result=await pool.query("select f.id,f.kickoff,f.ground,h.name as home_team,a.name as away_team,ts.id as team_sheet_id from football.fixtures f join football.clubs h on h.id=f.home_club_id join football.clubs a on a.id=f.away_club_id left join football.team_sheets ts on ts.fixture_id=f.id and ts.club_id=$1 where (f.home_club_id=$1 or f.away_club_id=$1) and f.kickoff>=now() order by f.kickoff asc limit 1",[req.club.club_id]);
  res.set('Cache-Control','no-store').json({fixture:result.rows[0]||null});
 }catch(e){console.error('Next match lookup failed:',e.code||e.message);res.status(503).json({error:'Next match unavailable'});}
});
app.get('/api/v1/my/dashboard',requireClub,async(req,res)=>{
 try{
  const [players,fixtures,sheets]=await Promise.all([
   pool.query('select count(*)::int as total,count(*) filter (where registered=true and suspended=false)::int as selectable from football.players where club_id=$1',[req.club.club_id]),
   pool.query('select count(*)::int as total,count(*) filter (where kickoff>=now())::int as upcoming from football.fixtures where home_club_id=$1 or away_club_id=$1',[req.club.club_id]),
   pool.query('select count(*)::int as submitted from football.team_sheets where club_id=$1',[req.club.club_id])
  ]);
  res.set('Cache-Control','no-store').json({club:req.club,players:players.rows[0],fixtures:fixtures.rows[0],team_sheets:sheets.rows[0],verification:'League registration checks remain required'});
 }catch(e){console.error('Club dashboard failed:',e.code||e.message);res.status(503).json({error:'Dashboard unavailable'});}
});
app.post('/api/v1/auth/logout',requireClub,async(req,res)=>{try{await pool.query('delete from football.club_auth_sessions where token_hash=$1',[req.sessionHash]);res.json({ok:true});}catch{res.status(503).json({error:'Logout unavailable'});}});
app.get('/api/v1/my/eligibility-summary',requireClub,async(req,res)=>{try{const q=await pool.query('select count(*)::int as total,count(*) filter (where registered=true and suspended=false)::int as selectable,count(*) filter (where suspended=true)::int as suspended,count(*) filter (where registered=false)::int as unregistered from football.players where club_id=$1',[req.club.club_id]);res.set('Cache-Control','no-store').json({summary:q.rows[0],note:'League verification is required'});}catch(e){res.status(503).json({error:'Eligibility summary unavailable'});}});
app.get('/api/v1/my/players',requireClub,async(req,res)=>{try{const q=await pool.query('select id,name,squad_number,registered,suspended from football.players where club_id=$1 order by name',[req.club.club_id]);res.set('Cache-Control','no-store').json({players:q.rows,verified:false,note:'Registration status requires league administrator verification'});}catch{res.status(503).json({error:'Players unavailable'});}});
app.get('/api/v1/my/fixtures',requireClub,async(req,res)=>{try{const q=await pool.query("select f.id,f.kickoff,f.ground,f.max_named_subs,h.name as home_team,a.name as away_team,(select s.id from football.team_sheets s where s.fixture_id=f.id and s.club_id=$1 limit 1) as my_team_sheet_id from football.fixtures f join football.clubs h on h.id=f.home_club_id join football.clubs a on a.id=f.away_club_id where f.home_club_id=$1 or f.away_club_id=$1 order by f.kickoff desc limit 100",[req.club.club_id]);res.set('Cache-Control','no-store').json({fixtures:q.rows});}catch(e){console.error('Fixture lookup failed:',e.code||e.message);res.status(503).json({error:'Fixtures unavailable'});}});
app.get('/api/v1/my/team-sheets',requireClub,async(req,res)=>{try{const q=await pool.query("select s.id,s.fixture_id,s.submitted_at,s.submitted_by,count(p.player_id)::int as players from football.team_sheets s left join football.team_sheet_players p on p.sheet_id=s.id where s.club_id=$1 group by s.id order by s.submitted_at desc limit 100",[req.club.club_id]);res.set('Cache-Control','no-store').json({team_sheets:q.rows});}catch(e){console.error('Team sheets lookup failed:',e.code||e.message);res.status(503).json({error:'Team sheets unavailable'});}});
app.get('/api/v1/my/team-sheets/:id',requireClub,async(req,res)=>{
 const id=req.params.id;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'Invalid team sheet ID'});
 try{
  const sheet=await pool.query('select id,fixture_id,submitted_at,submitted_by from football.team_sheets where id=$1 and club_id=$2',[id,req.club.club_id]);
  if(!sheet.rowCount)return res.status(404).json({error:'Team sheet not found'});
  const players=await pool.query('select p.id,p.name,p.squad_number,t.selection from football.team_sheet_players t join football.players p on p.id=t.player_id where t.sheet_id=$1 and p.club_id=$2 order by case when t.selection=\'starter\' then 0 else 1 end,p.name',[id,req.club.club_id]);
  res.set('Cache-Control','no-store').json({team_sheet:sheet.rows[0],players:players.rows,note:'Official league eligibility verification remains required'});
 }catch(e){console.error('Team sheet detail lookup failed:',e.code||e.message);res.status(503).json({error:'Team sheet unavailable'});}
});
app.post('/api/v1/my/team-sheets',requireClub,async(req,res)=>{
 const fixtureId=req.body?.fixture_id,starters=req.body?.starters,subs=req.body?.substitutes;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(typeof fixtureId!=='string'||!uuid.test(fixtureId)||!Array.isArray(starters)||!Array.isArray(subs)||starters.length!==11||subs.length>9||![...starters,...subs].every(x=>typeof x==='string'&&uuid.test(x)))return res.status(400).json({error:'Select exactly 11 starters and up to 9 substitutes'});
 const ids=[...starters,...subs];if(new Set(ids).size!==ids.length)return res.status(400).json({error:'Duplicate player selection'});
 let client;try{client=await pool.connect();await client.query('BEGIN');
 const f=await client.query('select id,max_named_subs from football.fixtures where id=$1 and (home_club_id=$2 or away_club_id=$2) for update',[fixtureId,req.club.club_id]);
 if(!f.rowCount){await client.query('ROLLBACK');return res.status(403).json({error:'Fixture is not assigned to your club'});}
 if(subs.length>f.rows[0].max_named_subs){await client.query('ROLLBACK');return res.status(400).json({error:'Too many substitutes for this fixture'});}
 const p=await client.query('select id from football.players where club_id=$1 and registered=true and suspended=false and id=any($2::uuid[])',[req.club.club_id,ids]);
 if(p.rowCount!==ids.length){await client.query('ROLLBACK');return res.status(400).json({error:'All selected players must be recorded as registered and not suspended; official eligibility must still be checked'});}
 const existing=await client.query('select id from football.team_sheets where fixture_id=$1 and club_id=$2',[fixtureId,req.club.club_id]);
 if(existing.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'A team sheet has already been submitted for this fixture'});}
 const sheet=await client.query('insert into football.team_sheets(fixture_id,club_id,submitted_by,submitted_at) values($1,$2,$3,now()) returning id,submitted_at',[fixtureId,req.club.club_id,'club-account']);
 for(const [index,id] of ids.entries())await client.query('insert into football.team_sheet_players(sheet_id,player_id,selection) values($1,$2,$3)',[sheet.rows[0].id,id,index<11?'starter':'substitute']);
 await client.query('COMMIT');res.status(201).set('Cache-Control','no-store').json({team_sheet_id:sheet.rows[0].id,submitted_at:sheet.rows[0].submitted_at,players:ids.length,note:'Submission recorded; league eligibility verification remains required'});
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('Team sheet submission failed:',e.code||e.message);res.status(503).json({error:'Submission unavailable'});}finally{if(client)client.release();}
});
app.get('/api/v1/my/referee-appointments',requireClub,async(req,res)=>{
 try{
  const q=await pool.query("select f.id as fixture_id,f.kickoff,h.name as home_team,a.name as away_team,null::text as referee_name,'pending_setup'::text as status,null::timestamptz as updated_at from football.fixtures f join football.clubs h on h.id=f.home_club_id join football.clubs a on a.id=f.away_club_id where f.home_club_id=$1 or f.away_club_id=$1 order by f.kickoff desc limit 100",[req.club.club_id]);
  res.set('Cache-Control','no-store').json({appointments:q.rows,note:'Referee contact information is not exposed to clubs'});
 }catch(e){console.error('Referee appointments unavailable:',e.code||e.message);res.status(503).json({error:'Referee appointments unavailable or not configured'});}
});
app.get('/api/v1/my/fixtures/:id/readiness',requireClub,async(req,res)=>{
 const id=req.params.id;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'Invalid fixture ID'});
 try{
  const fixture=await pool.query('select id,kickoff,max_named_subs from football.fixtures where id=$1 and (home_club_id=$2 or away_club_id=$2)',[id,req.club.club_id]);
  if(!fixture.rowCount)return res.status(404).json({error:'Fixture not found'});
  const [eligible,sheet]=await Promise.all([
   pool.query('select count(*)::int as count from football.players where club_id=$1 and registered=true and suspended=false',[req.club.club_id]),
   pool.query('select id,submitted_at from football.team_sheets where club_id=$1 and fixture_id=$2',[req.club.club_id,id])
  ]);
  const count=eligible.rows[0].count;
  res.set('Cache-Control','no-store').json({fixture:fixture.rows[0],eligible_players:count,has_starting_xi:count>=11,submitted:!!sheet.rowCount,team_sheet:sheet.rows[0]||null,warning:'Official league registration and match eligibility must be verified'});
 }catch(e){console.error('Readiness lookup failed:',e.code||e.message);res.status(503).json({error:'Readiness unavailable'});}
});
const refereeAttempts=new Map();
function refereeThrottle(req,res,next){
 const ip=req.ip||req.socket.remoteAddress||'unknown',now=Date.now();
 for(const [key,value] of refereeAttempts){if(now-value.start>900000)refereeAttempts.delete(key);}
 const attempt=refereeAttempts.get(ip);
 if(attempt&&attempt.count>=20){res.set('Retry-After',String(Math.ceil((attempt.start+900000-now)/1000)));return res.status(429).json({error:'Too many appointment requests. Try later.'});}
 if(!attempt)refereeAttempts.set(ip,{start:now,count:1});else attempt.count++;
 next();
}
app.use('/api/v1/referee',refereeThrottle);
app.get('/api/v1/referee/appointment',async(req,res)=>{
 const token=req.query.token;
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))return res.status(400).json({error:'Invalid appointment link'});
 if(!pool)return res.status(503).json({error:'Database unavailable'});
 try{
  const q=await pool.query("select f.kickoff,f.ground,h.name as home_team,a.name as away_team,ra.referee_name from football.referee_appointments ra join football.fixtures f on f.id=ra.fixture_id join football.clubs h on h.id=f.home_club_id join football.clubs a on a.id=f.away_club_id where ra.response_token_hash=$1 and ra.response_token_expires_at>now() and ra.status='pending'",[tokenDigest(token)]);
  if(!q.rowCount)return res.status(410).json({error:'Appointment link expired or already used'});
  res.set('Cache-Control','no-store').json({appointment:q.rows[0]});
 }catch(e){console.error('Referee appointment lookup failed:',e.code||e.message);res.status(503).json({error:'Appointment unavailable'});}
});
app.post('/api/v1/referee/respond',async(req,res)=>{
 const token=req.body?.token,decision=req.body?.decision;
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token)||!['accepted','declined'].includes(decision))return res.status(400).json({error:'Invalid response'});
 if(!pool)return res.status(503).json({error:'Database unavailable'});
 try{
  const q=await pool.query("update football.referee_appointments set status=$2,updated_at=now(),response_token_hash=null,response_token_expires_at=null where response_token_hash=$1 and response_token_expires_at>now() and status='pending' returning fixture_id,status",[tokenDigest(token),decision]);
  if(!q.rowCount)return res.status(410).json({error:'Link expired or already used'});
  res.set('Cache-Control','no-store').json({ok:true,status:q.rows[0].status});
 }catch(e){console.error('Referee response unavailable:',e.code||e.message);res.status(503).json({error:'Referee response unavailable'});}
});
app.post('/api/v1/my/fixtures/:id/referee-rating',requireClub,async(req,res)=>{
 const id=req.params.id,rating=req.body?.rating,comments=req.body?.comments;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(id)||!Number.isInteger(rating)||rating<1||rating>5||typeof comments!=='undefined'&&(typeof comments!=='string'||comments.length>1000))return res.status(400).json({error:'Provide a rating from 1 to 5 and optional comments up to 1000 characters'});
 try{
  const fixture=await pool.query("select id from football.fixtures where id=$1 and (home_club_id=$2 or away_club_id=$2) and kickoff<now()-interval '90 minutes'",[id,req.club.club_id]);
  if(!fixture.rowCount)return res.status(403).json({error:'Ratings are only available to participating clubs after the match'});
  const result=await pool.query('insert into football.referee_ratings(fixture_id,club_id,rating,comments) values($1,$2,$3,$4) on conflict(fixture_id,club_id) do nothing returning id,submitted_at',[id,req.club.club_id,rating,(comments||'').trim()]);
  if(!result.rowCount)return res.status(409).json({error:'Your club has already rated this referee for this fixture'});
  res.status(201).set('Cache-Control','no-store').json({ok:true,submitted_at:result.rows[0].submitted_at,note:'Feedback is for league administrators; not public'});
 }catch(e){console.error('Referee rating failed:',e.code||e.message);res.status(503).json({error:'Referee rating unavailable'});}
});
app.get('/api/v1/status',(_req,res)=>res.json({mode:pool?'club-auth-ready':'database-setup-required',message:'Club account activation and official player verification remain pending.',publicDemo:'https://football-registration-team-sheet.onrender.com'}));
app.use((_req,res)=>res.status(404).json({error:'Not found'}));
const port=Number(process.env.PORT||10000);
app.listen(port,'0.0.0.0',()=>console.log('Football API listening on '+port));
process.on('SIGTERM',()=>pool?pool.end().finally(()=>process.exit(0)):process.exit(0));
