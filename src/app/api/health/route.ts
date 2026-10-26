// GET /api/health – kiểm tra nhanh sau khi deploy: đang dùng Redis hay bộ nhớ tạm, đã đặt HOST_PIN chưa
// Chỉ trả về TÊN biến môi trường để chẩn đoán, không bao giờ trả giá trị
import { NextResponse } from "next/server";
import { hostPin } from "@/lib/http";
import { findUpstashEnv, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  let redisOk: boolean | null = null;
  let redisError: string | null = null;
  if (store.kind === "redis") {
    try {
      await store.set("kyhop:health", String(Date.now()), 60);
      redisOk = true;
    } catch (e) {
      redisOk = false;
      redisError = e instanceof Error ? e.message.slice(0, 160) : "unknown";
    }
  }
  const cfg = findUpstashEnv();
  const relatedEnvNames = Object.keys(process.env)
    .filter((k) => /REDIS|KV_|UPSTASH/i.test(k))
    .sort();
  return NextResponse.json({
    storage: store.kind,
    redisOk,
    redisError,
    redisEnvVar: cfg?.urlVar ?? null,
    relatedEnvNames,
    hostPinConfigured: !!process.env.HOST_PIN,
    hostPinUsable: !!hostPin(),
    warning:
      store.kind === "memory" && process.env.VERCEL
        ? "Chưa gắn Upstash Redis: chưa thể tạo phòng. Vào Vercel → Storage để gắn Redis vào project rồi Redeploy."
        : null,
  });
}
