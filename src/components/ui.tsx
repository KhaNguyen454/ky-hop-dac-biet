"use client";
// Thành phần giao diện dùng chung (phong cách giấy cổ – đỏ – vàng của bộ slide)
import type { getHostState, getLeaderboard, getState } from "@/lib/room";

export type GameState = Awaited<ReturnType<typeof getState>>;
export type HostState = Awaited<ReturnType<typeof getHostState>>;
export type Board = Awaited<ReturnType<typeof getLeaderboard>>;

export function Orn() {
  return (
    <div className="orn" aria-hidden>
      <span />
    </div>
  );
}

export function TimerBar({ remaining, total }: { remaining: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  return (
    <>
      <div className="timer" role="progressbar" aria-valuenow={Math.ceil(remaining / 1000)} aria-valuemin={0} aria-valuemax={Math.round(total / 1000)}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="timer-text">
        <span>{remaining > 0 ? "Thời gian biểu quyết" : "Hết giờ – chờ công bố"}</span>
        <span>{Math.ceil(remaining / 1000)} giây</span>
      </div>
    </>
  );
}

export function Stamp({ kind }: { kind: "yes" | "no" | "back" }) {
  const alt = kind === "yes" ? "Con dấu TÁN THÀNH – Đúng" : kind === "no" ? "Con dấu KHÔNG TÁN THÀNH – Sai" : "Con dấu TÁI CỬ";
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="stamp" src={`/art/stamp-${kind}.png`} alt={alt} />;
}

type Row = { rank: number; name: string; mssv?: string; score: number; alive: boolean; revived?: boolean; correct?: number };

export function Podium({ rows }: { rows: Row[] }) {
  const top = [rows[1], rows[0], rows[2]];
  const heights = [110, 150, 85];
  return (
    <div className="podium">
      {top.map((r, i) => (
        <div className="col" key={i}>
          {r ? (
            <>
              <div className="name">{r.name}</div>
              <div className="pts">{r.score} điểm</div>
              <div className="block" style={{ height: heights[i] }}>
                {r.rank}
              </div>
            </>
          ) : (
            <div className="block" style={{ height: heights[i], opacity: 0.25 }} />
          )}
        </div>
      ))}
    </div>
  );
}

export function LeaderTable({ rows, meName, showMssv = true, compact = false }: { rows: Row[]; meName?: string; showMssv?: boolean; compact?: boolean }) {
  if (rows.length === 0) return <p className="muted">Chưa có đại biểu nào.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="lb">
        <thead>
          <tr>
            <th>#</th>
            <th>Đại biểu</th>
            {showMssv && <th>MSSV</th>}
            {!compact && <th>Trạng thái</th>}
            <th className="num">Điểm</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rank + r.name} className={meName && r.name === meName ? "me" : undefined}>
              <td>{r.rank}</td>
              <td style={{ fontWeight: 800, color: compact && !r.alive ? "var(--muted)" : undefined }}>
                {r.name}
                {compact && !r.alive && <span className="muted" style={{ fontWeight: 700 }}> · bãi nhiệm</span>}
              </td>
              {showMssv && <td>{r.mssv}</td>}
              {!compact && (
                <td>
                  <span className={`pill ${r.alive ? "alive" : "out"}`}>{r.alive ? (r.revived ? "Tái cử" : "Đương nhiệm") : "Bãi nhiệm"}</span>
                </td>
              )}
              <td className="num" style={{ fontWeight: 900 }}>
                {r.score}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
