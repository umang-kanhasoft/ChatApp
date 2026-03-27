import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { env } from '../config/env.js';

const register = new Registry();

collectDefaultMetrics({
  register,
  prefix: 'chatapp_',
});

const httpRequestDurationMs = new Histogram({
  name: 'chatapp_http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 200, 500, 1000, 3000, 5000, 10000],
  registers: [register],
});

const httpRequestsTotal = new Counter({
  name: 'chatapp_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const socketConnections = new Gauge({
  name: 'chatapp_socket_connections',
  help: 'Open Socket.IO connections on the current instance',
  registers: [register],
});

const socketEventsTotal = new Counter({
  name: 'chatapp_socket_events_total',
  help: 'Socket.IO events processed by the current instance',
  labelNames: ['direction', 'event'],
  registers: [register],
});

const socketRateLimitedTotal = new Counter({
  name: 'chatapp_socket_rate_limited_total',
  help: 'Socket.IO events rejected by the rate limiter',
  labelNames: ['event'],
  registers: [register],
});

const queueDepth = new Gauge({
  name: 'chatapp_queue_depth',
  help: 'Current queue backlog by queue name',
  labelNames: ['queue'],
  registers: [register],
});

const queueProcessedTotal = new Counter({
  name: 'chatapp_queue_processed_total',
  help: 'Queue jobs processed by result',
  labelNames: ['queue', 'result'],
  registers: [register],
});

const normalizeRouteLabel = (req) => {
  if (req.route?.path) {
    return `${req.baseUrl || ''}${req.route.path}`;
  }

  if (req.baseUrl) {
    return req.baseUrl;
  }

  return req.path || req.originalUrl || 'unknown';
};

export const metricsMiddleware = (req, res, next) => {
  if (!env.METRICS_ENABLED) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const labels = {
      method: req.method,
      route: normalizeRouteLabel(req),
      status_code: String(res.statusCode),
    };

    httpRequestDurationMs.observe(labels, durationMs);
    httpRequestsTotal.inc(labels);
  });

  next();
};

export const metricsHandler = async (_req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
};

export const trackSocketConnected = () => {
  if (!env.METRICS_ENABLED) return;
  socketConnections.inc();
};

export const trackSocketDisconnected = () => {
  if (!env.METRICS_ENABLED) return;
  socketConnections.dec();
};

export const trackSocketEvent = (direction, event) => {
  if (!env.METRICS_ENABLED) return;
  socketEventsTotal.inc({
    direction,
    event,
  });
};

export const trackSocketRateLimited = (event) => {
  if (!env.METRICS_ENABLED) return;
  socketRateLimitedTotal.inc({ event });
};

export const setQueueDepth = (queue, count) => {
  if (!env.METRICS_ENABLED) return;
  queueDepth.set({ queue }, Math.max(0, Number(count) || 0));
};

export const trackQueueProcessed = (queue, result) => {
  if (!env.METRICS_ENABLED) return;
  queueProcessedTotal.inc({
    queue,
    result,
  });
};

export const getMetricsRegistry = () => register;
