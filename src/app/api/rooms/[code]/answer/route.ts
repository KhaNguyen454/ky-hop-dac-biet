// POST /api/rooms/:code/answer { player, token, answer } – bỏ phiếu (mỗi bước chỉ 1 lần)
import { body, handle, type Ctx } from "@/lib/http";
import { submitAnswer } from "@/lib/room";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;
  return handle(async () => {
    const b = await body(req);
    return submitAnswer(code, String(b.player ?? ""), String(b.token ?? ""), b.answer);
  });
}
