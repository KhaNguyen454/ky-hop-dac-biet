// GET /api/rooms/:code/leaderboard – bảng xếp hạng công khai (MSSV đã che bớt)
// GET /api/rooms/:code/leaderboard?format=csv – file CSV đầy đủ MSSV để phát thưởng (cần PIN)
import { NextResponse } from "next/server";
import { handle, requireHost, type Ctx } from "@/lib/http";
import { AppError, getLeaderboard, getLeaderboardCsv } from "@/lib/room";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: Ctx) {
  const { code } = await params;
  if (new URL(req.url).searchParams.get("format") === "csv") {
    try {
      requireHost(req);
      const csv = await getLeaderboardCsv(code);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="bang-xep-hang-phong-${code}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      const status = e instanceof AppError ? e.status : 500;
      return NextResponse.json({ error: e instanceof Error ? e.message : "Lỗi" }, { status });
    }
  }
  return handle(() => getLeaderboard(code));
}
