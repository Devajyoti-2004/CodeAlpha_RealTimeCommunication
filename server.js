const path=require('path');
const http=require('http');
const express=require('express');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const cookieParser=require('cookie-parser');
const {Server}=require('socket.io');
const {Pool}=require('pg');

const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:true,credentials:true}});
const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||'dev-only-change-me';
const MAX_USERS=Math.max(2,Math.min(12,Number(process.env.MAX_ROOM_USERS||6)));
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false}):null;
const memoryUsers=new Map(); let nextUserId=1;

app.set('trust proxy',1);
app.use(helmet({crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:'64kb'}));
app.use(cookieParser());
app.use(rateLimit({windowMs:15*60*1000,max:300,standardHeaders:true,legacyHeaders:false}));
app.use(express.static(path.join(__dirname,'public')));

async function initDb(){if(!pool)return;await pool.query('CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, username VARCHAR(32) UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())')}
function sign(user){return jwt.sign({id:user.id,username:user.username},JWT_SECRET,{expiresIn:'7d'})}
function setAuth(res,user){res.cookie('rm_token',sign(user),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:7*24*60*60*1000})}
function auth(req,res,next){try{const t=req.cookies.rm_token;if(!t)throw 0;req.user=jwt.verify(t,JWT_SECRET);next()}catch{res.status(401).json({error:'Authentication required'})}}

app.get('/api/health',(req,res)=>res.json({ok:true,app:'RealMeet',time:new Date().toISOString()}));
app.get('/api/config',(req,res)=>res.json({stun:process.env.STUN_URL||'stun:stun.l.google.com:19302',turn:process.env.TURN_URL||'',turnUsername:process.env.TURN_USERNAME||'',turnCredential:process.env.TURN_CREDENTIAL||'',maxRoomUsers:MAX_USERS}));

app.post('/api/auth/register',async(req,res)=>{try{const username=String(req.body.username||'').trim().toLowerCase(),password=String(req.body.password||'');if(!/^[a-z0-9_]{3,32}$/.test(username))return res.status(400).json({error:'Username must be 3-32 letters, numbers or underscores.'});if(password.length<8)return res.status(400).json({error:'Password must be at least 8 characters.'});const existing=await findUser(username);if(existing)return res.status(409).json({error:'Username already exists.'});const hash=await bcrypt.hash(password,12);const user={id:pool?null:nextUserId++,username,password_hash:hash};if(pool){const q=await pool.query('INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING id,username',[username,hash]);setAuth(res,q.rows[0]);res.json({user:q.rows[0]})}else{memoryUsers.set(username,user);setAuth(res,{id:user.id,username});res.json({user:{id:user.id,username}})}}catch(e){if(e.code==='23505')return res.status(409).json({error:'Username already exists.'});console.error(e);res.status(500).json({error:'Registration failed.'})}});

app.post('/api/auth/login',async(req,res)=>{try{const username=String(req.body.username||'').trim().toLowerCase(),password=String(req.body.password||'');const found=await findUser(username);if(!found||!(await bcrypt.compare(password,found.password_hash)))return res.status(401).json({error:'Invalid username or password.'});const user={id:found.id,username:found.username};setAuth(res,user);res.json({user})}catch(e){console.error(e);res.status(500).json({error:'Login failed.'})}});

app.post('/api/auth/logout',(req,res)=>{res.clearCookie('rm_token');res.json({ok:true})});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:{id:req.user.id,username:req.user.username}}));

const rooms=new Map();
function roomUsers(room){return [...(room||new Map()).values()]}
io.use((socket,next)=>{try{const token=socket.handshake.headers.cookie?.match(/(?:^|; )rm_token=([^;]+)/)?.[1];socket.user=jwt.verify(token,JWT_SECRET);next()}catch{next(new Error('Unauthorized'))}});

io.on('connection',socket=>{
 socket.on('join-room',({roomId})=>{roomId=String(roomId||'').trim().slice(0,64);if(!roomId)return socket.emit('app-error','Invalid room.');let room=rooms.get(roomId);if(!room){room=new Map();rooms.set(roomId)}if(room.size>=MAX_USERS&&!room.has(socket.id))return socket.emit('room-full',MAX_USERS);room.set(socket.id,{id:socket.id,username:socket.user.username});socket.join(roomId);socket.roomId=roomId;socket.emit('room-users',roomUsers(room).filter(x=>x.id!==socket.id));socket.to(roomId).emit('peer-joined',{id:socket.id,username:socket.user.username});io.to(roomId).emit('presence',roomUsers(room));});
 socket.on('signal',({to,data})=>{if(socket.roomId&&rooms.get(socket.roomId)?.has(to))io.to(to).emit('signal',{from:socket.id,data,username:socket.user.username})});
 socket.on('chat',({text})=>{if(!socket.roomId)return;const clean=String(text||'').trim().slice(0,1000);if(clean)io.to(socket.roomId).emit('chat',{username:socket.user.username,text:clean,time:Date.now()})});
 socket.on('whiteboard',payload=>{if(socket.roomId)socket.to(socket.roomId).emit('whiteboard',payload)});
 socket.on('whiteboard-clear',()=>{if(socket.roomId)socket.to(socket.roomId).emit('whiteboard-clear')});
 socket.on('disconnect',()=>{if(socket.roomId){const room=rooms.get(socket.roomId);room?.delete(socket.id);socket.to(socket.roomId).emit('peer-left',socket.id);io.to(socket.roomId).emit('presence',roomUsers(room));if(room?.size===0)rooms.delete(socket.roomId)}});
});

app.get(/.*/,(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
initDb().then(()=>server.listen(PORT,()=>console.log('RealMeet running on '+PORT))).catch(e=>{console.error('DB init failed',e);process.exit(1)});