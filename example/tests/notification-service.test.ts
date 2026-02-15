import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db.ts';
import {
  sendNotification,
  subscribe,
  getNotificationLog,
  getSubscriptionCount,
  resetNotifications,
} from '../src/services/notification-service.ts';

beforeEach(() => {
  db.reset();
  resetNotifications();
});

describe('sendNotification', () => {
  it('returns a notification with all fields populated', () => {
    const notif = sendNotification(
      'alerts',
      'alice',
      'Server down',
      'The API server is not responding',
    );

    expect(notif.id).toMatch(/^notif-/);
    expect(notif.channel).toBe('alerts');
    expect(notif.recipient).toBe('alice');
    expect(notif.subject).toBe('Server down');
    expect(notif.body).toBe('The API server is not responding');
    expect(notif.sentAt).toBeTruthy();
    expect(notif.metadata).toBeDefined();
  });

  it('generates unique ids for each notification', () => {
    const a = sendNotification('ch', 'user', 'A', 'body');
    const b = sendNotification('ch', 'user', 'B', 'body');
    const c = sendNotification('ch', 'user', 'C', 'body');

    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });

  it('includes metadata headers', () => {
    const notif = sendNotification('updates', 'bob', 'Hi', 'Hello there');

    expect(notif.metadata['X-Notification-Channel']).toBe('updates');
    expect(notif.metadata['X-Notification-Recipient']).toBe('bob');
    expect(notif.metadata['X-Notification-Size']).toBeDefined();
  });

  it('calculates correct byte size in metadata', () => {
    const body = 'Hello!';
    const notif = sendNotification('ch', 'user', 'Sub', body);
    const expectedSize = new TextEncoder().encode(body).byteLength;

    expect(notif.metadata['X-Notification-Size']).toBe(String(expectedSize));
  });

  it('appends to the notification log', () => {
    expect(getNotificationLog()).toHaveLength(0);

    sendNotification('ch', 'user', 'First', 'body');
    expect(getNotificationLog()).toHaveLength(1);

    sendNotification('ch', 'user', 'Second', 'body');
    expect(getNotificationLog()).toHaveLength(2);
  });
});

describe('subscribe', () => {
  it('delivers notifications to subscribers', () => {
    const received: string[] = [];
    subscribe('alerts', (n) => received.push(n.subject));

    sendNotification('alerts', 'user', 'Hello', 'body');

    expect(received).toEqual(['Hello']);
  });

  it('does not deliver to subscribers on other channels', () => {
    const received: string[] = [];
    subscribe('alerts', (n) => received.push(n.subject));

    sendNotification('updates', 'user', 'Missed', 'body');

    expect(received).toHaveLength(0);
  });

  it('delivers to multiple subscribers on the same channel', () => {
    const first: string[] = [];
    const second: string[] = [];

    subscribe('ch', (n) => first.push(n.id));
    subscribe('ch', (n) => second.push(n.id));

    sendNotification('ch', 'user', 'Test', 'body');

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).toBe(second[0]);
  });

  it('increments subscription count', () => {
    expect(getSubscriptionCount()).toBe(0);

    subscribe('a', () => {});
    subscribe('b', () => {});

    expect(getSubscriptionCount()).toBe(2);
  });
});

describe('getNotificationLog', () => {
  it('returns a copy of the log, not a reference', () => {
    sendNotification('ch', 'user', 'Original', 'body');

    const log1 = getNotificationLog();
    log1[0]!.subject = 'Mutated';

    const log2 = getNotificationLog();
    expect(log2[0]!.subject).toBe('Original');
  });

  it('preserves chronological order', () => {
    sendNotification('ch', 'user', 'First', 'body');
    sendNotification('ch', 'user', 'Second', 'body');
    sendNotification('ch', 'user', 'Third', 'body');

    const log = getNotificationLog();
    expect(log.map((n) => n.subject)).toEqual(['First', 'Second', 'Third']);
  });
});

describe('resetNotifications', () => {
  it('clears the log and subscriptions', () => {
    subscribe('ch', () => {});
    sendNotification('ch', 'user', 'Test', 'body');

    resetNotifications();

    expect(getNotificationLog()).toHaveLength(0);
    expect(getSubscriptionCount()).toBe(0);
  });
});
