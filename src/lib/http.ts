// Tiện ích cho Route Handlers: trả lỗi thống nhất, kiểm tra mã PIN người dẫn
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { AppError } from "./room";

export function hostPin(): string | undefined {
  // Chạy máy cá nhân chưa đặt HOST_PIN thì dùng 1234; trên Vercel bắt buộc phải đặt
  return process.env.HOST_PIN || (process.env.NODE_ENV !== "production" ? "1234" : undefined);
}

export function requireHost(req: Request) {
  const pin = hostPin();
  if (!pin) throw new AppError(500, "Chưa cấu hình biến môi trường HOST_PIN trên Vercel.");
  const given = req.headers.get("x-host-pin") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(pin);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AppError(401, "Sai mã PIN người dẫn.");
}

export async function handle<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Lỗi máy chủ, vui lòng thử lại." }, { status: 500 });
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    throw new AppError(400, "Dữ liệu gửi lên không hợp lệ.");
  }
}

export type Ctx = { params: Promise<{ code: string }> };
