// GET /api/rooms/:code/host – trạng thái đầy đủ cho màn hình người dẫn (cần PIN)
import { handle, requireHost, type Ctx } from "@/lib/http";
import { getHostState } from "@/lib/room";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: Ctx) {
  const { code } = await params;
  return handle(async () => {
    requireHost(req);
    return getHostState(code);
  });
}
