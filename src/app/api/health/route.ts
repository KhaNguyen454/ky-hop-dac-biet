// GET /api/health – kiểm tra nhanh sau khi deploy: đang dùng Redis hay bộ nhớ tạm, đã đặt HOST_PIN chưa
import { NextResponse } from "next/server";
import { hostPin } from "@/lib/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  let redisOk: boolean | null = null;
  if (store.kind === "redis") {
    try {
      await store.set("kyhop:health", String(Date.now()), 60);
      redisOk = true;
    } catch {
      redisOk = false;
    }
  }
  return NextResponse.json({
    storage: store.kind,
    redisOk,
    hostPinConfigured: !!process.env.HOST_PIN,
    hostPinUsable: !!hostPin(),
    warning:
      store.kind === "memory" && process.env.VERCEL
        ? "Chưa gắn Upstash Redis: điểm sẽ không được lưu ổn định. Vào Storage của Vercel để gắn Redis rồi Redeploy."
        : null,
  });
}
