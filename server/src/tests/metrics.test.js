import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

describe('Metrics endpoint', () => {
  it('exposes Prometheus metrics', async () => {
    const app = createApp();

    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('chatapp_http_requests_total');
  });
});
