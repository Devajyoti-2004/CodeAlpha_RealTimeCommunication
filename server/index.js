const crypto=require('crypto'); const path=require('path'); const http=require('http'); const express=require('express'); const cors=require('cors'); const bcrypt=require('bcryptjs'); const jwt=require('jsonwebtoken'); const {Server}=require('socket.io'); const {Pool}=require('pg'); require('dotenv').config();
const app=express(); const server=http.createServer(app); const io=new Server(server,{cors:{origin:true,credentials:true},maxHttpBufferSize:10*1024*1024});
app.use(cors()); app.use(express.json({limit:'2mb'}));
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)?{rejectUnauthorized:false}:false});
async function initDb(){if(!process.env.DATABASE_URL){console.warn('DATABASE_URL missing; auth persistence unavailable.');return} await pool.query(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,name TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW())`)}
const sign=(u)=>jwt.sign({id:u.id,email:u.email,name:u.name},process.env.JWT_SECRET||'dev-secret-change-me',{expiresIn:'7d'});
app.get('/api/health',(req,res)=>res.json({ok:true,service:'meetspace'}));
app.post('/api/auth/register',async(req,res)=>{try{const {name,email,password}=req.body;if(!name||!email||!password||password.length<8)return res.status(400).json({error:'Name, email and an 8+ character password are required.'});const hash=await bcrypt.hash(password,12);const r=await pool.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email',[name.trim(),email.trim().toLowerCase(),hash]);const u=r.rows[0];res.json({token:sign(u),user:u})}catch(e){res.status(e.code==='23505'?409:500).json({error:e.code==='23505'?'Email already registered':'Registration failed'})}});
app.post('/api/auth/login',async(req,res)=>{try{const {email,password}=req.body;const r=await pool.query('SELECT * FROM users WHERE email=$1',[email?.trim().toLowerCase()]);if(!r.rowCount||!(await bcrypt.compare(password,r.rows[0].password_hash)))return res.status(401).json({error:'Invalid email or password'});const u=r.rows[0];res.json({token:sign(u),user:{id:u.id,name:u.name,email:u.email}})}catch(e){res.status(500).json({error:'Login failed'})}});
app.use(express.static(path.join(__dirname,'..','dist')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'..','dist','index.html')));
const rooms=new Map();
function userFromToken(token){try{return jwt.verify(token,process.env.JWT_SECRET||'dev-secret-change-me')}catch{return null}}
io.use((socket,next)=>{const u=userFromToken(socket.handshake.auth?.token);if(u){socket.user=u;return next()}const name=String(socket.handshake.auth?.guestName||'Guest').trim().slice(0,40)||'Guest';socket.user={id:'guest-'+crypto.randomUUID(),name,email:null,guest:true};next()});
io.on('connection',socket=>{
 socket.on('room:join',roomId=>{roomId=String(roomId||'').trim().slice(0,80);if(!roomId)return; socket.join(roomId); const set=rooms.get(roomId)||new Set(); set.add(socket.id);rooms.set(roomId,set); const peers=[...set].filter(id=>id!==socket.id).map(id=>({id,user:io.sockets.sockets.get(id)?.user})).filter(p=>p.user);socket.emit('room:peers',peers);socket.to(roomId).emit('room:user-joined',{id:socket.id,user:socket.user});});
 socket.on('signal',({to,data})=>{if(to)io.to(to).emit('signal',{from:socket.id,data,user:socket.user})});
 socket.on('whiteboard:draw',({roomId,stroke})=>{socket.to(roomId).emit('whiteboard:draw',stroke)});
 socket.on('whiteboard:clear',roomId=>socket.to(roomId).emit('whiteboard:clear'));
 socket.on('chat:message',({roomId,text})=>{if(typeof text==='string'&&text.trim())io.to(roomId).emit('chat:message',{id:crypto.randomUUID(),text:text.trim().slice(0,2000),user:socket.user.name,at:Date.now()})});
 socket.on('file:share',({roomId,file})=>{if(file?.data?.length>12*1024*1024)return;io.to(roomId).emit('file:share',{...file,from:socket.user.name,at:Date.now()})});
 socket.on('disconnect',()=>{for(const [room,set] of rooms){if(set.delete(socket.id)){socket.to(room).emit('room:user-left',socket.id);if(!set.size)rooms.delete(room)}}});
});
initDb().then(()=>server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('MeetSpace running'))).catch(e=>{console.error(e);process.exit(1)});
