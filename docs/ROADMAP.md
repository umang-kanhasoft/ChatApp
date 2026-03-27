# Product Roadmap (Free-Tier First)

## Implemented in this starter
- Project scaffolding with monorepo structure
- Auth (register, login, refresh, logout, me)
- MongoDB models: User, Conversation, Message
- REST APIs for 1:1 conversations and message pagination
- Socket.IO real-time events (message, typing, presence)
- React chat UI with protected routes and optimistic message send
- Message actions: reply, edit, delete, reactions
- Conversation message search
- Media upload endpoint + media message rendering
- Group conversations with role controls (owner/admin/member)
- Read receipts and delivery status updates
- Web Push subscription registration flow
- Status feed with story-like entries and reactions
- Moderation APIs for blocking users and reporting abuse
- Docker Compose local environment
- CI for lint/test/build

## Phase 2 (next)
- Media upload pipeline (image/video/audio/document)
- Cloudinary local+cloud adapter
- Message actions (edit/delete/reply/forward/reactions/star/pin)
- Global and per-chat search

## Phase 3
- Group conversations, roles, moderation controls
- Read receipts and delivery ticks
- Push notifications (FCM + web push)
- Offline queue + IndexedDB sync

## Phase 4
- Calls (WebRTC + free STUN/TURN)
- Stories/status module with TTL expiry
- Security hardening (2FA, sessions dashboard, block/report)

## Phase 5
- AI features (smart reply, translation, summaries)
- Productivity features (scheduled messages, reminders, polls/tasks)
- Developer features (markdown, snippets, slash commands, webhooks)

## Phase 6
- Unique differentiators (whiteboard, watch party, audio rooms, channels)
- Advanced privacy (private vault, invisible mode)
- Full observability and scale tuning
