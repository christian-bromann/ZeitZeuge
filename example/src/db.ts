import { EventEmitter } from 'node:events';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'done';
  priority: number;
  tags: string[];
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  taskId: string;
  payload: unknown;
}

export class Database {
  tasks: Map<string, Task> = new Map();
  audit: AuditEntry[] = [];
  events = new EventEmitter();
  private counter = 0;

  constructor() {
    this.seed();
  }

  nextId(): string {
    this.counter++;
    return `task-${this.counter}`;
  }

  reset(): void {
    this.tasks.clear();
    this.audit = [];
    this.events.removeAllListeners();
    this.counter = 0;
  }

  private seed(): void {
    const now = new Date().toISOString();
    const seeds: Array<Omit<Task, 'id'>> = [
      {
        title: 'Set up CI/CD pipeline',
        description: 'Configure GitHub Actions for automated testing and deployment',
        status: 'in-progress',
        priority: 1,
        tags: ['devops', 'infrastructure'],
        assignee: 'alice',
        createdAt: now,
        updatedAt: now,
      },
      {
        title: 'Design landing page',
        description: 'Create mockups for the new product landing page with responsive layouts',
        status: 'pending',
        priority: 2,
        tags: ['design', 'frontend'],
        assignee: 'bob',
        createdAt: now,
        updatedAt: now,
      },
      {
        title: 'Implement user authentication',
        description: 'Add OAuth2 login with Google and GitHub providers for SSO',
        status: 'pending',
        priority: 1,
        tags: ['backend', 'security', 'auth'],
        assignee: 'charlie',
        createdAt: now,
        updatedAt: now,
      },
      {
        title: 'Write API documentation',
        description: 'Document all REST endpoints using OpenAPI 3.0 specification',
        status: 'done',
        priority: 3,
        tags: ['docs', 'backend'],
        assignee: 'alice',
        createdAt: now,
        updatedAt: now,
      },
      {
        title: 'Performance audit',
        description: 'Run Lighthouse and CPU profiling on the main dashboard view',
        status: 'pending',
        priority: 2,
        tags: ['performance', 'frontend'],
        assignee: null,
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const task of seeds) {
      const id = this.nextId();
      this.tasks.set(id, { ...task, id });
    }
  }
}

/** Singleton database instance */
export const db = new Database();
