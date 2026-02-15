import {
  getAllTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
} from './services/task-service.ts';
import { getAnalytics } from './services/analytics-service.ts';
import { cache } from './services/cache-service.ts';
import { sendNotification, getNotificationLog } from './services/notification-service.ts';
import { tracker } from './middleware/request-tracker.ts';
import { hashPassword, generateToken } from './utils/crypto.ts';
import { validateTaskTitle, validateTags } from './utils/validators.ts';

interface TaskBody {
  title: string;
  description?: string;
  priority?: number;
  tags?: string[];
  assignee?: string | null;
}

interface AuthBody {
  password: string;
  iterations?: number;
}

interface CacheBody {
  key: string;
  value: unknown;
}

interface NotificationBody {
  channel: string;
  recipient: string;
  subject: string;
  body: string;
}

const PORT = Number(process.env.PORT) || 3456;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export const server = Bun.serve({
  port: PORT,
  routes: {
    // Health -----------------------------------------------------------
    '/api/health': {
      GET: () => json({ status: 'ok', uptime: process.uptime() }),
    },

    // Tasks (collection) -----------------------------------------------
    '/api/tasks': {
      GET: (req: Request) => {
        const finish = tracker.track('GET', '/api/tasks', null);
        const url = new URL(req.url);
        const search = url.searchParams.get('search') ?? undefined;
        const status = url.searchParams.get('status') ?? undefined;
        const tag = url.searchParams.get('tag') ?? undefined;
        const tasks = getAllTasks(search, status, tag);
        finish();
        return json(tasks);
      },

      POST: async (req: Request) => {
        const body = (await req.json()) as TaskBody;
        const finish = tracker.track('POST', '/api/tasks', body);

        const titleCheck = validateTaskTitle(body.title ?? '');
        if (!titleCheck.valid) {
          finish();
          return error(titleCheck.errors.join(', '));
        }

        if (body.tags) {
          const tagCheck = validateTags(body.tags);
          if (!tagCheck.valid) {
            finish();
            return error(tagCheck.errors.join(', '));
          }
        }

        const task = createTask(body);
        finish();
        return json(task, 201);
      },
    },

    // Tasks (single) ---------------------------------------------------
    '/api/tasks/:id': {
      GET: (req: Request & { params: { id: string } }) => {
        const finish = tracker.track('GET', `/api/tasks/${req.params.id}`, null);
        const task = getTask(req.params.id);
        finish();
        if (!task) return error('Task not found', 404);
        return json(task);
      },

      PUT: async (req: Request & { params: { id: string } }) => {
        const body = (await req.json()) as TaskBody;
        const finish = tracker.track('PUT', `/api/tasks/${req.params.id}`, body);
        const task = updateTask(req.params.id, body);
        finish();
        if (!task) return error('Task not found', 404);
        return json(task);
      },

      DELETE: (req: Request & { params: { id: string } }) => {
        const finish = tracker.track('DELETE', `/api/tasks/${req.params.id}`, null);
        const deleted = deleteTask(req.params.id);
        finish();
        if (!deleted) return error('Task not found', 404);
        return json({ deleted: true });
      },
    },

    // Analytics --------------------------------------------------------
    '/api/analytics': {
      GET: () => {
        const finish = tracker.track('GET', '/api/analytics', null);
        const analytics = getAnalytics();
        finish();
        return json(analytics);
      },
    },

    // Auth / crypto ----------------------------------------------------
    '/api/auth/hash': {
      POST: async (req: Request) => {
        const body = (await req.json()) as AuthBody;
        const finish = tracker.track('POST', '/api/auth/hash', {
          ...body,
          password: '[REDACTED]',
        });
        const hashed = hashPassword(body.password ?? '', body.iterations);
        const token = generateToken();
        finish();
        return json({ hash: hashed, token });
      },
    },

    // Cache (set) ------------------------------------------------------
    '/api/cache': {
      POST: async (req: Request) => {
        const body = (await req.json()) as CacheBody;
        const finish = tracker.track('POST', '/api/cache', body);
        cache.set(body.key, body.value, {
          requestId: crypto.randomUUID(),
          timestamp: Date.now(),
          userAgent: req.headers.get('user-agent') ?? 'unknown',
          fullBody: body,
        });
        finish();
        return json({ stored: true, key: body.key }, 201);
      },
    },

    // Cache (stats) ----------------------------------------------------
    '/api/cache/stats': {
      GET: () => {
        const finish = tracker.track('GET', '/api/cache/stats', null);
        const stats = cache.getStats();
        finish();
        return json(stats);
      },
    },

    // Cache (read by key) ----------------------------------------------
    '/api/cache/entry/:key': {
      GET: (req: Request & { params: { key: string } }) => {
        const finish = tracker.track('GET', `/api/cache/entry/${req.params.key}`, null);
        const value = cache.get(req.params.key, {
          requestId: crypto.randomUUID(),
          timestamp: Date.now(),
        });
        finish();
        if (value === undefined) return error('Cache miss', 404);
        return json({ key: req.params.key, value });
      },
    },

    // Notifications ----------------------------------------------------
    '/api/notifications': {
      GET: () => {
        const finish = tracker.track('GET', '/api/notifications', null);
        const log = getNotificationLog();
        finish();
        return json(log);
      },

      POST: async (req: Request) => {
        const body = (await req.json()) as NotificationBody;
        const finish = tracker.track('POST', '/api/notifications', body);
        const notification = sendNotification(
          body.channel ?? 'general',
          body.recipient ?? 'all',
          body.subject ?? 'No Subject',
          body.body ?? '',
        );
        finish();
        return json(notification, 201);
      },
    },

    // Request stats ----------------------------------------------------
    '/api/stats': {
      GET: () => json(tracker.getStats()),
    },
  },

  // Fallback for unmatched routes
  fetch() {
    return error('Not Found', 404);
  },
});

console.log(`Task Manager API running at http://localhost:${PORT}`);
