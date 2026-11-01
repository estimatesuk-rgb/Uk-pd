import express from 'express';
import pg from 'pg';
import helmet from 'helmet';
import cors from 'cors';
const app=express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin:process.env.FRONTEND_ORIGIN||'https://football-registration-team-sheet.onrender.com',methods:['GET']}));
app.use(express.json({limit:'16kb'}));
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},max:3,connectionTimeoutMillis:8000}):null;
app.get('/health',async(_req,res)=>{
 if(!pool)return res.status(503).json({status:'setup_required',database:'not_configured',message:'Set DATABASE_URL as a Render secret environment variable'});
 try {const r=await pool.query("select count(*)::int as tables from information_schema.tables where table_schema='football'");
 res.json({status:'ok',database:'connected',tables:r.rows[0].tables,mode:'read-only-no-accounts'});}
 catch(e){console.error('Database health check failed:',e.code||e.message);res.status(503).json({status:'unavailable'});}
});
app.get('/api/v1/status',(_req,res)=>res.json({mode:'setup',message:'Authentication is not configured. Private league data and writes are disabled.',publicDemo:'https://football-registration-team-sheet.onrender.com'}));
app.use((_req,res)=>res.status(404).json({error:'Not found'}));
const port=Number(process.env.PORT||10000);
app.listen(port,'0.0.0.0',()=>console.log('Football API listening on '+port));
process.on('SIGTERM',()=>pool?pool.end().finally(()=>process.exit(0)):process.exit(0));
