"use client";
// Tiện ích phía trình duyệt: gọi API, thăm dò trạng thái, đồng hồ đồng bộ với máy chủ
import { useEffect, useState } from "react";

export async function api<T = unknown>(path: string, init?: RequestInit & { pin?: string }): Promise<T> {
  const { pin, ...rest } = init ?? {};
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (pin) headers["x-host-pin"] = pin;
  const res = await fetch(path, { ...rest, headers: { ...headers, ...(rest.headers as Record<string, string>) }, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error || `Lỗi ${res.status}`), { status: res.status });
  return data as T;
}

// Thăm dò định kỳ; giữ dữ liệu cũ khi mạng chập chờn
export function usePoll<T>(url: string | null, ms: number, pin?: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      const t0 = Date.now();
      try {
        const d = await api<T & { serverNow?: number }>(url, { pin });
        if (!alive) return;
        const t1 = Date.now();
        if (d && typeof d.serverNow === "number") setOffset(d.serverNow - (t0 + t1) / 2);
        setData(d);
        setError(null);
      } catch (e) {
        if (!alive) return;
        const err = e as Error & { status?: number };
        setError({ message: err.message, status: err.status });
      }
      if (alive) timer = setTimeout(run, document.hidden ? ms * 3 : ms);
    };
    run();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [url, ms, pin, tick]);
  const refresh = () => setTick((x) => x + 1);
  return { data, error, offset, refresh, setData };
}

// Số mili-giây còn lại tới hạn chót, đã bù lệch giờ máy chủ
export function useRemaining(deadline: number | undefined, offset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return 0;
  return Math.max(0, deadline - (now + offset));
}

export type Session = { id: string; token: string; name: string };
const KEY = (code: string) => `kyhop:session:${code}`;
export function loadSession(code: string): Session | null {
  try {
    const raw = localStorage.getItem(KEY(code));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function saveSession(code: string, s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY(code), JSON.stringify(s));
    else localStorage.removeItem(KEY(code));
  } catch {
    /* trình duyệt chặn lưu trữ: vẫn chơi được trong phiên hiện tại */
  }
}
