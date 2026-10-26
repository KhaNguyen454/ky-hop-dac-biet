// POST /api/rooms/:code/join { name, mssv } – vào phòng, trả về id + token lưu ở trình duyệt
import { body, handle, type Ctx } from "@/lib/http";
import { joinRoom } from "@/lib/room";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;
  return handle(async () => {
    const b = await body(req);
    return joinRoom(code, b.name, b.mssv);
  });
}
