// Tầng hạ tầng: lưu trữ. Trên Vercel dùng Upstash Redis; chạy máy cá nhân không có Redis thì dùng bộ nhớ tạm.
import { Redis } from "@upstash/redis";

export interface Store {
  readonly kind: "redis" | "memory";
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, values: Record<string, string>, ttlSec: number): Promise<void>;
  hsetNx(key: string, field: string, value: string, ttlSec: number): Promise<boolean>;
  hlen(key: string): Promise<number>;
}

class RedisStore implements Store {
  readonly kind = "redis" as const;
  constructor(private r: Redis) {}
  async get(key: string) {
    return (await this.r.get<string>(key)) ?? null;
  }
  async set(key: string, value: string, ttlSec: number) {
    await this.r.set(key, value, { ex: ttlSec });
  }
  async setNx(key: string, value: string, ttlSec: number) {
    return (await this.r.set(key, value, { ex: ttlSec, nx: true })) === "OK";
  }
  async hget(key: string, field: string) {
    return (await this.r.hget<string>(key, field)) ?? null;
  }
  async hgetall(key: string) {
    // Khi tắt automaticDeserialization, Upstash trả HGETALL dạng mảng phẳng [field, value, field, value, ...]
    const raw = (await this.r.hgetall(key)) as unknown;
    if (!raw) return {};
    if (Array.isArray(raw)) {
      const out: Record<string, string> = {};
      for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
      return out;
    }
    return raw as Record<string, string>;
  }
  async hset(key: string, values: Record<string, string>, ttlSec: number) {
    if (Object.keys(values).length === 0) return;
    const p = this.r.pipeline();
    p.hset(key, values);
    p.expire(key, ttlSec);
    await p.exec();
  }
  async hsetNx(key: string, field: string, value: string, ttlSec: number) {
    const ok = (await this.r.hsetnx(key, field, value)) === 1;
    if (ok) await this.r.expire(key, ttlSec);
    return ok;
  }
  async hlen(key: string) {
    return await this.r.hlen(key);
  }
}

type Entry = { v: unknown; exp: number };
class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private m = new Map<string, Entry>();
  private live(key: string): Entry | undefined {
    const e = this.m.get(key);
    if (e && e.exp < Date.now()) {
      this.m.delete(key);
      return undefined;
    }
    return e;
  }
  async get(key: string) {
    const e = this.live(key);
    return typeof e?.v === "string" ? e.v : null;
  }
  async set(key: string, value: string, ttlSec: number) {
    this.m.set(key, { v: value, exp: Date.now() + ttlSec * 1000 });
  }
  async setNx(key: string, value: string, ttlSec: number) {
    if (this.live(key)) return false;
    await this.set(key, value, ttlSec);
    return true;
  }
  private hash(key: string, ttlSec?: number): Map<string, string> {
    let e = this.live(key);
    if (!e) {
      e = { v: new Map<string, string>(), exp: Date.now() + (ttlSec ?? 3600) * 1000 };
      this.m.set(key, e);
    } else if (ttlSec) e.exp = Date.now() + ttlSec * 1000;
    return e.v as Map<string, string>;
  }
  async hget(key: string, field: string) {
    const e = this.live(key);
    return e ? ((e.v as Map<string, string>).get(field) ?? null) : null;
  }
  async hgetall(key: string) {
    const e = this.live(key);
    return e ? Object.fromEntries(e.v as Map<string, string>) : {};
  }
  async hset(key: string, values: Record<string, string>, ttlSec: number) {
    const h = this.hash(key, ttlSec);
    for (const [k, v] of Object.entries(values)) h.set(k, v);
  }
  async hsetNx(key: string, field: string, value: string, ttlSec: number) {
    const h = this.hash(key, ttlSec);
    if (h.has(field)) return false;
    h.set(field, value);
    return true;
  }
  async hlen(key: string) {
    const e = this.live(key);
    return e ? (e.v as Map<string, string>).size : 0;
  }
}

const g = globalThis as unknown as { __kyhopStore?: Store };

// Tìm cặp biến URL/TOKEN của Upstash, kể cả khi Vercel thêm tiền tố tùy chỉnh (vd: STORAGE_KV_REST_API_URL)
export function findUpstashEnv(env: Record<string, string | undefined> = process.env): { url: string; token: string; urlVar: string } | null {
  const pairs: [string, string][] = [
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ];
  for (const [u, t] of pairs) if (env[u] && env[t]) return { url: env[u]!, token: env[t]!, urlVar: u };
  for (const key of Object.keys(env).sort()) {
    for (const [u, t] of pairs) {
      if (key.endsWith(u)) {
        const tokenKey = key.slice(0, key.length - u.length) + t;
        if (env[key] && env[tokenKey]) return { url: env[key]!, token: env[tokenKey]!, urlVar: key };
      }
    }
  }
  return null;
}

export function getStore(): Store {
  if (g.__kyhopStore) return g.__kyhopStore;
  const cfg = findUpstashEnv();
  g.__kyhopStore = cfg ? new RedisStore(new Redis({ url: cfg.url, token: cfg.token, automaticDeserialization: false })) : new MemoryStore();
  return g.__kyhopStore;
}
