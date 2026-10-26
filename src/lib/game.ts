// Tầng domain: kiểu dữ liệu + logic thuần (không phụ thuộc lưu trữ) → dễ kiểm thử
import { SCORING, STEPS, type Step } from "./content";

export type Phase = "lobby" | "question" | "reveal" | "ended";

export type Room = {
  code: string;
  createdAt: number;
  phase: Phase;
  stepIndex: number; // -1 khi đang ở sảnh chờ
  openedAt: number;
  deadline: number;
  notice?: string; // thông báo đặc biệt sau khi công bố (vd: cả lớp được tái cử)
  revived?: string[]; // id người được tái cử ở phiên chất vấn
};

export type HistoryItem = { a: unknown; ok: boolean; pts: number };

export type Player = {
  id: string;
  token: string;
  name: string;
  mssv: string;
  joinedAt: number;
  score: number;
  alive: boolean;
  correct: number;
  totalMs: number; // tổng thời gian trả lời đúng (dùng để phân hạng khi bằng điểm)
  revived: boolean;
  history: Record<string, HistoryItem>;
};

export type Answer = { a: unknown; at: number };

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function speedBonus(max: number, at: number, openedAt: number, deadline: number): number {
  const span = Math.max(1, deadline - openedAt);
  const left = Math.min(1, Math.max(0, (deadline - at) / span));
  return Math.round(max * left);
}

export function isAnswerValid(step: Step, a: unknown): boolean {
  if (step.kind === "vote") return a === true || a === false;
  if (step.kind === "text") return typeof a === "string" && a.trim().length > 0 && a.length <= 60;
  if (!Array.isArray(a)) return false;
  const set = new Set(a);
  return set.size === a.length && a.length === step.correct.length && a.every((x) => Number.isInteger(x) && x >= 0 && x < step.options.length);
}

// Ai được bỏ phiếu ở bước này
export function canAnswer(step: Step, p: Player): boolean {
  return step.kind === "text" ? !p.alive : p.alive;
}

export type RevealResult = { players: Record<string, Player>; notice?: string; revived?: string[] };

// Tính kết quả của một bước – hàm thuần, trả về bản sao người chơi đã cập nhật
export function computeReveal(
  step: Step,
  players: Record<string, Player>,
  answers: Record<string, Answer>,
  openedAt: number,
  deadline: number,
): RevealResult {
  const out: Record<string, Player> = {};
  for (const [id, p] of Object.entries(players)) out[id] = { ...p, history: { ...p.history } };
  const lateLimit = deadline + SCORING.graceMs;

  if (step.kind === "vote") {
    const aliveBefore = Object.values(out).filter((p) => p.alive);
    for (const p of aliveBefore) {
      const ans = answers[p.id];
      const ok = !!ans && ans.at <= lateLimit && ans.a === step.correct;
      if (ok) {
        const pts = SCORING.voteBase + speedBonus(SCORING.voteSpeed, ans!.at, openedAt, deadline);
        p.score += pts;
        p.correct += 1;
        p.totalMs += Math.max(0, ans!.at - openedAt);
        p.history[step.id] = { a: ans!.a, ok: true, pts };
      } else {
        p.alive = false;
        p.history[step.id] = { a: ans ? ans.a : null, ok: false, pts: 0 };
      }
    }
    // Luật đặc biệt: nếu MỌI đại biểu còn đương nhiệm ở vòng này đều sai thì chỉ những người đó được giữ ghế
    // (người đã bị bãi nhiệm từ các vòng trước vẫn bị bãi nhiệm – trước đây hồi sinh cả lớp là sai luật)
    if (aliveBefore.length > 0 && aliveBefore.every((p) => !p.alive)) {
      for (const p of aliveBefore) p.alive = true;
      return { players: out, notice: "all_wrong_kept" };
    }
    return { players: out };
  }

  if (step.kind === "text") {
    const accept = new Set(step.accept.map(normalizeText));
    const correct = Object.values(out)
      .filter((p) => !p.alive && answers[p.id] && answers[p.id].at <= lateLimit)
      .filter((p) => accept.has(normalizeText(String(answers[p.id].a))))
      .sort((x, y) => answers[x.id].at - answers[y.id].at);
    const winners = correct.slice(0, step.revive);
    const winnerIds = new Set(winners.map((p) => p.id));
    for (const p of Object.values(out)) {
      const ans = answers[p.id];
      if (!ans) continue;
      if (winnerIds.has(p.id)) {
        p.alive = true;
        p.revived = true;
        p.score += SCORING.reviveBonus;
        p.history[step.id] = { a: ans.a, ok: true, pts: SCORING.reviveBonus };
      } else {
        const right = correct.some((c) => c.id === p.id);
        p.history[step.id] = { a: ans.a, ok: right, pts: 0 };
      }
    }
    return { players: out, revived: winners.map((p) => p.id) };
  }

  // multi – phiên bỏ phiếu kín (không loại người chơi)
  const want = [...step.correct].sort().join(",");
  for (const p of Object.values(out).filter((x) => x.alive)) {
    const ans = answers[p.id];
    const ok = !!ans && ans.at <= lateLimit && Array.isArray(ans.a) && [...(ans.a as number[])].sort().join(",") === want;
    if (ok) {
      const pts = SCORING.multiBase + speedBonus(SCORING.multiSpeed, ans!.at, openedAt, deadline);
      p.score += pts;
      p.correct += 1;
      p.totalMs += Math.max(0, ans!.at - openedAt);
      p.history[step.id] = { a: ans!.a, ok: true, pts };
    } else {
      p.history[step.id] = { a: ans ? ans.a : null, ok: false, pts: 0 };
    }
  }
  return { players: out };
}

// Xếp hạng: điểm ↓, còn đương nhiệm trước, tổng thời gian trả lời ↑, vào phòng sớm hơn
export function rank(players: Player[]): Player[] {
  return [...players].sort(
    (a, b) => b.score - a.score || Number(b.alive) - Number(a.alive) || a.totalMs - b.totalMs || a.joinedAt - b.joinedAt,
  );
}

export function maskMssv(mssv: string): string {
  if (mssv.length < 6) return mssv;
  return mssv.slice(0, 4) + "**" + mssv.slice(-2);
}

export function stepAt(i: number): Step | undefined {
  return STEPS[i];
}

export const TOTAL_STEPS = STEPS.length;
