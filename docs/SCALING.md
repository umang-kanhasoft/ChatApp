# ChatApp Scaling Notes

## Implemented Runtime Changes
- Socket.IO fanout is Redis-backed through `@socket.io/redis-adapter`, so user and conversation rooms work across multiple API pods.
- Presence is no longer process-local. Each socket updates Redis-backed presence state with heartbeat expiry, which avoids stale online states after process crashes.
- Push delivery is queued through BullMQ instead of running inline on API and socket handlers.
- Missed-call ring timeouts use delayed queue jobs instead of in-memory timers.
- Scheduled-message polling runs behind a Redis leader lease so horizontal scaling does not multiply Mongo polling load.
- Conversation list reads use short-lived Redis caching with per-user version bumps for deterministic invalidation after message and membership changes.
- `/metrics` exposes Prometheus-compatible metrics for HTTP latency, socket traffic, queue depth, and process/runtime stats.

## Deployment Shape
- Run the API as stateless pods behind a layer-7 load balancer or ingress.
- Use managed MongoDB and Redis for production. Redis is required for cross-instance realtime consistency.
- Keep WebSocket stickiness optional, not mandatory. The Redis adapter removes the single-node room dependency.
- Terminate TLS at the ingress/load balancer and forward `X-Forwarded-*` headers to the app.

## Recommended Production Topology
1. Client served from CDN / edge cache.
2. API pods on Kubernetes behind an ingress or L7 load balancer.
3. Managed Redis for Socket.IO adapter, rate limiting, BullMQ, presence, and cache state.
4. Managed MongoDB replica set for primary writes plus read replicas for analytics/history offload.
5. Prometheus + Grafana scraping `/metrics`.

## Remaining Scale Limits
- Message persistence still uses MongoDB as the primary write path. For WhatsApp/Telegram-level sustained write volume, conversation/message storage will eventually need workload-specific partitioning or sharding.
- Read receipts still write per-message metadata. The current batching limits make this safer, but a future high-scale design should move toward cursor-based receipt state per conversation.
- Group call state still lives in MongoDB documents. Very large or frequent live sessions would benefit from a dedicated call-signaling/state service.

## Operational Defaults To Set
- `REDIS_REQUIRED=true`
- `MONGODB_FALLBACK_TO_MEMORY=false`
- unique `INSTANCE_ID` per pod or process
- Prometheus scraping `/metrics`
- HPA on CPU and memory plus queue-depth alerting

## Files To Review
- `server/src/socket/index.js`
- `server/src/socket/handlers/registerChatHandlers.js`
- `server/src/queues/runtime.js`
- `server/src/services/presenceService.js`
- `server/src/services/conversationCacheService.js`
- `server/src/jobs/scheduledMessageScheduler.js`
- `infrastructure/kubernetes/server.yaml`
