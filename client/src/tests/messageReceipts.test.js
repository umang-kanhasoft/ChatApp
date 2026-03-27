import { describe, expect, it } from 'vitest';
import { applyReceiptProgress, getReceiptSummary } from '../utils/messageReceipts.js';

describe('messageReceipts', () => {
  it('builds a monotonic receipt summary', () => {
    const seeded = {
      deliveredTo: [{ user: 'alice', at: '2026-01-01T00:00:00.000Z' }],
      readBy: [{ user: 'alice', at: '2026-01-01T00:00:00.000Z' }],
      receiptSummary: {
        participantCount: 2,
        deliveredCount: 1,
        readCount: 1,
      },
    };

    const delivered = applyReceiptProgress(seeded, 'bob', '2026-01-01T00:01:00.000Z', {
      markDelivered: true,
      markRead: false,
      participantCount: 2,
    });
    const read = applyReceiptProgress(delivered, 'bob', '2026-01-01T00:02:00.000Z', {
      markDelivered: true,
      markRead: true,
      participantCount: 2,
    });

    expect(getReceiptSummary(delivered, 2).deliveredToAllPeers).toBe(true);
    expect(getReceiptSummary(read, 2).readByAllPeers).toBe(true);
    expect(read.receiptSummary.deliveredCount).toBeGreaterThanOrEqual(
      delivered.receiptSummary.deliveredCount,
    );
    expect(read.receiptSummary.readCount).toBeGreaterThanOrEqual(
      delivered.receiptSummary.readCount,
    );
  });
});
