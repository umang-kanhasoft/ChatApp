# ChatApp (MERN + Socket.IO, Free-Tier First)

Production-oriented starter for a real-time chat app using:
- React + Vite (client)
- Node.js + Express + Socket.IO (server)
- MongoDB + Redis
- Free-tier friendly integrations and architecture

## Current Scope (Implemented)
- JWT auth (register, login, refresh, logout, me)
- User, Conversation, Message models with key indexes
- 1:1 conversations
- Group conversations with member roles (`owner`, `admin`, `member`)
- Real-time messaging via Socket.IO
- Presence + typing indicators
- Redis-backed Socket.IO adapter for horizontal realtime fanout
- Redis-backed distributed presence tracking with heartbeat expiry
- Cursor pagination for messages with "Load older messages" UI
- React chat UI shell with protected routes
- Message actions: reply, edit, delete (me/everyone), reactions
- Message actions: star/unstar and pin/unpin (up to 3 pinned per conversation)
- Message forwarding between conversations
- Scheduled text messages (send later) with cancel support and daily/weekly recurrence
- In-chat polls (single/multi choice, optional expiry, vote, live result updates, voter visibility)
- Slash commands: `/poll` and `/remind`
- Per-conversation message search
- Media uploads (image/video/audio/document) with local storage serving
- Read receipts + delivery updates
- Offline outgoing queue for text/poll messages, poll votes, and scheduled sends with reconnect retry
- Queue controls for manual retry/discard of failed items
- Browser push subscription flow (Web Push + Service Worker)
- Status/Stories module (text/image/video, view, react, delete)
- Moderation controls (block/unblock users, submit reports)
- 1:1 call foundation (voice/video signaling, call history, missed-call timeout)
- Docker Compose for local stack
- Prometheus metrics endpoint and Kubernetes deployment baseline

## Monorepo Structure
- `client/` React app
- `server/` Express + Socket.IO API
- `shared/` cross-package constants/types placeholder
- `infrastructure/` Docker and deployment helpers

## Quick Start
1. Install deps:
   - `npm install`
2. Configure env files:
   - copy `server/.env.example` -> `server/.env`
   - copy `client/.env.example` -> `client/.env`
   - if MongoDB is not installed locally, keep `MONGODB_FALLBACK_TO_MEMORY=true` for dev
3. Start local services (Mongo + Redis + apps):
   - `docker compose -f infrastructure/docker/docker-compose.yml up --build`
   - or run apps without Docker after starting Mongo/Redis locally: `npm run dev`

## Useful Commands
- `npm run dev` run client and server in parallel
- `npm run lint` run lint checks for both apps
- `npm run test` run server + client tests
- `npm run build` production build validation
- `npm --workspace server run bundle` create the production server bundle in `server/dist`

## Health & Ops
- `GET /api/health` returns application and dependency status
- `GET /api/health/live` returns liveness status
- `GET /api/health/ready` returns readiness status and dependency state
- `GET /metrics` exposes Prometheus metrics for HTTP, sockets, queues, and runtime health
- Request and error responses include a request ID for traceability
- Auth and OTP endpoints are rate-limited by default
- Email OTP delivery fails closed when SMTP is not configured

## Scale Readiness
- Socket.IO uses the Redis adapter for cross-instance room fanout
- Push notifications are queued through BullMQ instead of blocking request/socket handlers
- Scheduled-message polling uses a Redis leader lease so only one instance scans Mongo at a time
- Conversation list responses use Redis-backed cache versioning for short-lived hot-path caching
- Call missed-ring handling uses a distributed delayed queue instead of per-process timers
- Reference Kubernetes manifests live in `infrastructure/kubernetes/`

## Push Notification Setup (Optional)
1. Generate VAPID keys:
   - `npx web-push generate-vapid-keys`
2. Put keys in `server/.env`:
   - `VAPID_PUBLIC_KEY=...`
   - `VAPID_PRIVATE_KEY=...`
   - `VAPID_SUBJECT=mailto:you@example.com`
3. Put public key in `client/.env`:
   - `VITE_VAPID_PUBLIC_KEY=...`

## WebRTC Call Setup (Optional)
- Configure server ICE servers in `server/.env`:
  - `WEBRTC_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]`
  - Add TURN entries for better NAT traversal, for example:
    - `WEBRTC_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:a.relay.metered.ca:443","username":"...","credential":"..."}]`
- Set missed call auto-timeout:
  - `CALL_RING_TIMEOUT_SECONDS=45`

## Planning Docs
- `docs/ROADMAP.md`
- `docs/FREE_TIER_STACK.md`
- `docs/SCALING.md`

## Notes
- This is a strong Phase-1 foundation designed for iterative expansion to full WhatsApp/Telegram-level feature depth.
- Core Phase-2 chat enhancements are implemented; AI/calls/stories and advanced modules are still planned.
