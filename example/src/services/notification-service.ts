import { db } from '../db.ts';

interface Notification {
  id: string;
  channel: string;
  recipient: string;
  subject: string;
  body: string;
  sentAt: string;
  metadata: Record<string, string>;
}

/**
 * PERF ISSUE [Event Listener Leak]: Subscriptions are accumulated
 * without an unsubscribe mechanism.
 */
const subscriptions: Array<{
  channel: string;
  callback: (n: Notification) => void;
}> = [];

/** PERF ISSUE [Closure Leak]: Notification log grows without bound. */
const notificationLog: Notification[] = [];

let notificationCounter = 0;

/**
 * Subscribe to a notification channel.
 *
 * PERF ISSUE [Event Listener Leak]: Adds a new EventEmitter listener
 * on every call with no way to remove it. Repeated subscribes to the
 * same channel stack up listeners.
 */
export function subscribe(channel: string, callback: (n: Notification) => void): void {
  subscriptions.push({ channel, callback });
  db.events.on(`notification:${channel}`, callback);
}

/**
 * Send a notification to a channel.
 *
 * PERF ISSUE [Excessive Instantiation]: Every call creates new
 * Intl.DateTimeFormat, TextEncoder, and Map instances that could be
 * reused across calls as module-level singletons.
 */
export function sendNotification(
  channel: string,
  recipient: string,
  subject: string,
  body: string,
): Notification {
  // PERF ISSUE [Excessive Instantiation]: Heavy Intl object per call.
  const formatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
  });

  // PERF ISSUE [Excessive Instantiation]: TextEncoder is stateless
  // and reusable, yet recreated per notification.
  const encoder = new TextEncoder();

  // PERF ISSUE [Excessive Instantiation]: Map rebuilt from scratch.
  const headers = new Map<string, string>();
  headers.set('X-Notification-Channel', channel);
  headers.set('X-Notification-Recipient', recipient);
  headers.set('X-Notification-Priority', 'normal');
  headers.set('X-Notification-Version', '1.0');
  headers.set('X-Notification-Encoding', 'utf-8');

  // Encode the body just to measure byte length — could use
  // Buffer.byteLength or a simple heuristic instead.
  const encoded = encoder.encode(body);
  headers.set('X-Notification-Size', String(encoded.byteLength));

  const sentAt = formatter.format(new Date());

  // Build metadata from the headers map.
  const metadata: Record<string, string> = {};
  for (const [key, value] of headers) {
    metadata[key] = value;
  }

  notificationCounter++;
  const notification: Notification = {
    id: `notif-${notificationCounter}`,
    channel,
    recipient,
    subject,
    body,
    sentAt,
    metadata,
  };

  db.events.emit(`notification:${channel}`, notification);

  // PERF ISSUE [Closure Leak]: Stored forever, never trimmed.
  notificationLog.push(notification);

  return notification;
}

/** Returns a deep-cloned copy of the full notification log. */
export function getNotificationLog(): Notification[] {
  // PERF ISSUE [Slow Code Path]: Deep clone of potentially huge array.
  return JSON.parse(JSON.stringify(notificationLog)) as Notification[];
}

export function getSubscriptionCount(): number {
  return subscriptions.length;
}

export function resetNotifications(): void {
  notificationLog.length = 0;
  subscriptions.length = 0;
  notificationCounter = 0;
}
