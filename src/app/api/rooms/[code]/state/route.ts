// GET /api/rooms/:code/state?player=ID – trạng thái phòng cho người chơi (thăm dò mỗi ~1,2 giây)
import { handle, type Ctx } from "@/lib/http";
import { getState } from "@/lib/room";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: Ctx) {
  const { code } = await params;
  const player = new URL(req.url).searchParams.get("player");
  return handle(() => getState(code, player));
}
