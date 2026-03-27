# ChatApp Scaling Notes

## Current Production Shape
- `client` is served as static assets behind Nginx or an ingress edge.
- `server` is a stateless API + Socket.IO fleet behind a layer-7 load balancer.
- `worker` runs BullMQ consumers and the scheduled-message leader loop separately from API pods.
- Redis is required in production for:
  - Socket.IO cross-instance room fanout
  - Presence state
  - Rate limiting
  - BullMQ queues
  - Conversation room/list caches
- MongoDB remains the system of record for users, conversations, messages, calls, and scheduled jobs.

## Bottlenecks Addressed In This Pass

### Presence Fanout
- Problem:
  - `io.emit('presence:update')` broadcast every transition to every connected socket.
  - Mongo was updated on connect and disconnect just to track online state.
- Fix:
  - Presence remains authoritative in Redis.
  - Online/offline events now fan out only to conversation rooms and the user room.
  - Mongo persists `lastSeen` only on offline transition.
- Why it matters:
  - This removes global fanout and cuts write load on the Mongo primary.

### Read/Delivered Receipts
- Problem:
  - Reads and deliveries previously appended entries to `Message.readBy` and `Message.deliveredTo`.
  - Reads could loop through every unread message and bulk-write each one.
- Fix:
  - Receipt state is now tracked as conversation membership cursors:
    - `participants.lastDeliveredMessage`
    - `participants.lastDeliveredAt`
    - `participants.lastReadMessage`
    - `participants.lastReadAt`
  - Socket events now emit compact cursor updates instead of full-message rewrites for delivery.
  - Read updates emit a cursor boundary instead of enumerating every updated message.
- Why it matters:
  - The hot path becomes `O(1)` conversation updates instead of `O(unread_messages)` message rewrites.

### Reconnect Storms
- Problem:
  - `conversation:join-all` had to page through Mongo on each reconnect.
- Fix:
  - Conversation room membership is cached in Redis and joined in controlled batches.
- Why it matters:
  - High-chat-count users no longer force repeated room-list scans during reconnect bursts.

### Socket Abuse / Backpressure
- Problem:
  - HTTP had rate limits but hot socket events did not.
- Fix:
  - Redis-backed socket event rate limiting now protects:
    - `conversation:join-all`
    - `message:send`
    - `message:delivered`
    - `message:read`
    - typing events
    - call and group-call signaling
- Why it matters:
  - Prevents noisy clients from amplifying DB work and room fanout.

### Hot Read Paths
- Problem:
  - Conversation and message list reads hydrated full Mongoose documents repeatedly.
  - Search used regex over message bodies instead of the text index.
- Fix:
  - Hot list/search queries now use `.lean()`.
  - Message search uses Mongo text search.
  - Conversation list responses rehydrate live Redis presence at read time so cache TTL does not stale presence.
- Why it matters:
  - Lower CPU and heap churn per request, better cache behavior, and indexed search.

### Rollouts And Draining
- Problem:
  - A terminating pod could still report ready while shutting down.
- Fix:
  - Readiness now fails while draining.
  - The app returns `503 SERVER_DRAINING` for new work during shutdown.
  - Socket upgrades are rejected during drain.
  - Kubernetes manifests include `preStop`, rolling-update controls, and topology spread.
- Why it matters:
  - Rolling deploys stop sending new traffic to terminating realtime pods.

### API / Worker Coupling
- Problem:
  - Queue workers and the scheduler competed with API/socket traffic in the same process.
- Fix:
  - Added `server/src/worker.js` and `dist/worker.js`.
  - Added separate worker deployment manifests.
- Why it matters:
  - Push bursts or scheduler activity no longer need to steal event-loop time from realtime pods.

## Runtime Files To Review
- `server/src/socket/index.js`
- `server/src/socket/handlers/registerChatHandlers.js`
- `server/src/services/messageService.js`
- `server/src/services/conversationService.js`
- `server/src/services/conversationCacheService.js`
- `server/src/services/messageReceiptService.js`
- `server/src/worker.js`

## Deployment Files To Review
- `infrastructure/nginx/nginx.conf`
- `infrastructure/kubernetes/server.yaml`
- `infrastructure/kubernetes/client.yaml`
- `infrastructure/kubernetes/worker.yaml`
- `infrastructure/kubernetes/ingress.yaml`
- `infrastructure/kubernetes/monitoring.yaml`

## Still Not WhatsApp-Level Yet
- MongoDB is still the primary write path for messages.
- Message send still updates conversation summary and unread counters without a transaction/outbox.
- Membership authorization for many socket events still hits Mongo and should move behind Redis or versioned local caching.
- Very large groups still need workload-specific design for receipts, media fanout, and history partitioning.
- Global multi-region active/active delivery is not implemented.

## Next Production Steps
1. Run API pods and worker pods separately.
2. Put the client behind CDN or edge cache.
3. Make Redis and Mongo managed, authenticated, TLS-enabled, and replicated.
4. Scale API with HPA plus Prometheus-based custom metrics for socket count, queue backlog, and p95 latency.
5. Move message writes toward an outbox/stream pipeline before chasing true WhatsApp or Telegram traffic envelopes.
