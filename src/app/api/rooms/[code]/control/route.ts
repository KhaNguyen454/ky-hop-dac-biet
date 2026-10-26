// POST /api/rooms/:code/control { action } – người dẫn điều khiển: start | reveal | next | end
import { body, handle, requireHost, type Ctx } from "@/lib/http";
import { control, type ControlAction } from "@/lib/room";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;
  return handle(async () => {
    requireHost(req);
    const b = await body(req);
    const room = await control(code, String(b.action) as ControlAction);
    return { phase: room.phase, stepIndex: room.stepIndex };
  });
}
