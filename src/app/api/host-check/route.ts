// GET /api/host-check – kiểm tra mã PIN người dẫn (200 = đúng, 401 = sai)
import { handle, requireHost } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    requireHost(req);
    return { ok: true };
  });
}
