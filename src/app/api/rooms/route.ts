// POST /api/rooms – người dẫn tạo phòng mới
import { handle, requireHost } from "@/lib/http";
import { createRoom } from "@/lib/room";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    requireHost(req);
    const room = await createRoom();
    return { code: room.code };
  });
}
