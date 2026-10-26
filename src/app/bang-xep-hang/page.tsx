"use client";
// Bảng xếp hạng công khai của một phòng (MSSV đã che bớt) – dùng khi phát thưởng
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePoll } from "@/lib/client";
import { LeaderTable, Orn, Podium, type Board } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<div className="wrap">Đang tải…</div>}>
      <LeaderboardView />
    </Suspense>
  );
}

function LeaderboardView() {
  const sp = useSearchParams();
  const [code, setCode] = useState(sp.get("room") ?? "");
  const [input, setInput] = useState(code);
  const valid = /^\d{4}$/.test(code);
  const { data, error } = usePoll<Board>(valid ? `/api/rooms/${code}/leaderboard` : null, 3000);

  return (
    <main className="wrap" style={{ maxWidth: 820 }}>
      <div className="crumb">Kỳ họp đặc biệt · Bảng xếp hạng{valid ? ` · Phòng ${code}` : ""}</div>
      <h1 className="title-xl" style={{ marginTop: 8 }}>
        ĐẠI BIỂU XUẤT SẮC
      </h1>
      <Orn />
      {!valid && (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            setCode(input);
          }}
        >
          <div className="field">
            <label htmlFor="room">Mã phòng</label>
            <input id="room" inputMode="numeric" maxLength={4} value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))} />
          </div>
          <button className="btn">Xem</button>
        </form>
      )}
      {valid && error && <div className="error">{error.message}</div>}
      {valid && data && (
        <>
          <div className="row" style={{ justifyContent: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/art/seal.png" alt="Con dấu Đại biểu xuất sắc" style={{ width: 150 }} />
          </div>
          <Podium rows={data.players.slice(0, 3)} />
          <p className="center muted">{data.room.phase === "ended" ? "Kỳ họp đã bế mạc – kết quả chính thức." : "Kỳ họp đang diễn ra – bảng tự cập nhật."}</p>
          <LeaderTable rows={data.players} />
        </>
      )}
    </main>
  );
}
