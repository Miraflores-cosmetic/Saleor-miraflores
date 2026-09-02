import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { newSessionToken } from './onec-auth';

export type OnecSession = {
  token: string;
  createdAt: number;
  /** Order ids returned in last sale/query — marked on mode=success */
  pendingOrderIds: string[];
};

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class OnecSessionStore {
  private readonly sessions = new Map<string, OnecSession>();

  create(): OnecSession {
    this.gc();
    const session: OnecSession = {
      token: newSessionToken(),
      createdAt: Date.now(),
      pendingOrderIds: [],
    };
    this.sessions.set(session.token, session);
    return session;
  }

  /** Стабильная сессия для клиентов без cookie (только Basic на каждый запрос). */
  getOrCreateBasicSession(login: string, password: string): OnecSession {
    this.gc();
    const token =
      'basic_' +
      createHash('sha256')
        .update(`${login}\0${password}`)
        .digest('hex')
        .slice(0, 32);
    const existing = this.sessions.get(token);
    if (existing) {
      existing.createdAt = Date.now();
      return existing;
    }
    const session: OnecSession = {
      token,
      createdAt: Date.now(),
      pendingOrderIds: [],
    };
    this.sessions.set(token, session);
    return session;
  }

  get(token: string | null | undefined): OnecSession | null {
    if (!token) return null;
    const s = this.sessions.get(token);
    if (!s) return null;
    if (Date.now() - s.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(token);
      return null;
    }
    return s;
  }

  setPendingOrders(token: string, orderIds: string[]) {
    const s = this.get(token);
    if (!s) return;
    s.pendingOrderIds = orderIds;
  }

  takePendingOrders(token: string): string[] {
    const s = this.get(token);
    if (!s) return [];
    const ids = s.pendingOrderIds;
    s.pendingOrderIds = [];
    return ids;
  }

  private gc() {
    const now = Date.now();
    for (const [k, v] of this.sessions) {
      if (now - v.createdAt > SESSION_TTL_MS) this.sessions.delete(k);
    }
  }
}
