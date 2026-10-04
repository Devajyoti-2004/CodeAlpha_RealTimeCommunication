# RealMeet — CodeAlpha Task 4

A real-time communication and collaboration app built with Node.js, Express, Socket.IO, WebRTC and PostgreSQL.

## Features
- User registration/login with bcrypt password hashing and HttpOnly JWT cookie sessions
- Multi-user WebRTC video/audio rooms (small-room mesh)
- Screen sharing
- Real-time chat
- Collaborative whiteboard
- Peer-to-peer file sharing through WebRTC data channels
- Responsive dark UI
- Security headers and rate limiting
- STUN/TURN configuration support
- HTTPS/WSS-ready on Render

## Local setup
1. Install Node.js 20+ and PostgreSQL.
2. Create a database named realmeet.
3. Copy .env.example to .env and set DATABASE_URL and a strong JWT_SECRET.
4. Run npm install.
5. Run npm start.
6. Open http://localhost:3000.
7. Register two accounts in two browser profiles/devices and join the same room using ?room=my-room.

## Render
Create a Render PostgreSQL database and a Node web service. Build: npm install. Start: npm start.

Environment variables:
NODE_ENV=production
JWT_SECRET=<strong random secret>
DATABASE_URL=<Render internal database URL>
CLIENT_ORIGIN=<your Render app URL>
STUN_URL=stun:stun.l.google.com:19302
MAX_ROOM_USERS=6
Optional TURN_URL, TURN_USERNAME, TURN_CREDENTIAL

## Security
WebRTC media/data channels use browser DTLS/SRTP/WebRTC encryption in transit. Passwords are bcrypt-hashed and authentication uses an HttpOnly JWT cookie. HTTPS/WSS is provided by Render in production. Server-side chat/whiteboard events are not presented as end-to-end encrypted storage.

## Architecture
The project uses WebRTC mesh for small rooms to keep the server lightweight. For large production conferences, use an SFU such as LiveKit or mediasoup.