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
 res.json({status:'ok',database:'connected',tables:r.rows[0].tables,mode:'read-only-no-accounts'});}
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
app.post('/api/v1/auth/login',async(req,res)=>{
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
app.post('/api/v1/auth/logout',requireClub,async(req,res)=>{try{await pool.query('delete from football.club_auth_sessions where token_hash=$1',[req.sessionHash]);res.json({ok:true});}catch{res.status(503).json({error:'Logout unavailable'});}});
app.get('/api/v1/my/players',requireClub,async(req,res)=>{try{const q=await pool.query('select id,name,squad_number,registered,suspended from football.players where club_id=$1 order by name',[req.club.club_id]);res.set('Cache-Control','no-store').json({players:q.rows,verified:false,note:'Registration status requires league administrator verification'});}catch{res.status(503).json({error:'Players unavailable'});}});
app.get('/api/v1/status',(_req,res)=>res.json({mode:'setup',message:'Authentication is not configured. Private league data and writes are disabled.',publicDemo:'https://football-registration-team-sheet.onrender.com'}));
app.use((_req,res)=>res.status(404).json({error:'Not found'}));
const port=Number(process.env.PORT||10000);
app.listen(port,'0.0.0.0',()=>console.log('Football API listening on '+port));
process.on('SIGTERM',()=>pool?pool.end().finally(()=>process.exit(0)):process.exit(0));
