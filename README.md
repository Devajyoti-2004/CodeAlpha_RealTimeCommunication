# MeetSpace — CodeAlpha Task 4

A polished real-time communication and collaboration app for CodeAlpha Task 4.

## Features
- Multi-user WebRTC video and audio rooms
- Shared invite links with guest access
- Camera and microphone controls
- Screen sharing
- Real-time chat
- Collaborative whiteboard
- File sharing
- PostgreSQL-backed account registration/login
- Responsive MeetSpace UI
- WebRTC DTLS-SRTP encrypted media in transit
- Socket.IO signaling

## Railway
Build: `npm run build`  
Start: `npm start`

Required variables: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`.

## Multi-user rooms
Create a room and use **Share link**. Anyone with the link can join as a guest and use their own camera/microphone. Registered users can also join the same room. For camera testing, use two devices or browser profiles because one physical camera may not be available to two tabs simultaneously.

## Architecture
React + Vite frontend, Express + Socket.IO backend, PostgreSQL authentication, and WebRTC mesh for small rooms.


## Shared-link guest access
- Open a room link and choose **Join as guest** to enter without creating an account.
- Enter a display name, allow camera/microphone access, then press **Enter room**.
- Keep rooms small for the best WebRTC mesh experience; each participant connects directly to the others.
