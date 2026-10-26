import { describe, expect, it } from "vitest";
import { STEPS, SCORING, type MultiStep, type TextStep, type VoteStep } from "./content";
import { computeReveal, isAnswerValid, maskMssv, normalizeText, rank, speedBonus, type Player } from "./game";

const vote = STEPS.find((s) => s.id === "dt1") as VoteStep; // đáp án: Đúng
const cv = STEPS.find((s) => s.kind === "text") as TextStep;
const bpk = STEPS.find((s) => s.kind === "multi") as MultiStep;

function player(id: string, extra: Partial<Player> = {}): Player {
  return { id, token: "t", name: id, mssv: "SE000000", joinedAt: 0, score: 0, alive: true, correct: 0, totalMs: 0, revived: false, history: {}, ...extra };
}
const OPEN = 1_000_000;
const DEADLINE = OPEN + 12_000;

describe("normalizeText", () => {
  it("bỏ dấu, chữ thường, gộp khoảng trắng", () => {
    expect(normalizeText("  Kiểm   TRA ")).toBe("kiem tra");
    expect(normalizeText("Đảng")).toBe("dang");
  });
});

describe("speedBonus", () => {
  it("trả lời ngay được tối đa, sát giờ được 0", () => {
    expect(speedBonus(50, OPEN, OPEN, DEADLINE)).toBe(50);
    expect(speedBonus(50, DEADLINE, OPEN, DEADLINE)).toBe(0);
    expect(speedBonus(50, DEADLINE + 999, OPEN, DEADLINE)).toBe(0);
  });
});

describe("isAnswerValid", () => {
  it("kiểm tra đúng kiểu phiếu", () => {
    expect(isAnswerValid(vote, true)).toBe(true);
    expect(isAnswerValid(vote, "yes")).toBe(false);
    expect(isAnswerValid(cv, "kiểm tra")).toBe(true);
    expect(isAnswerValid(cv, "")).toBe(false);
    expect(isAnswerValid(bpk, [0, 2, 4])).toBe(true);
    expect(isAnswerValid(bpk, [0, 0, 4])).toBe(false);
    expect(isAnswerValid(bpk, [0, 2])).toBe(false);
    expect(isAnswerValid(bpk, [0, 2, 99])).toBe(false);
  });
});

describe("computeReveal – dự thảo", () => {
  it("đúng được điểm, sai hoặc không bỏ phiếu bị bãi nhiệm", () => {
    const players = { a: player("a"), b: player("b"), c: player("c") };
    const res = computeReveal(vote, players, { a: { a: true, at: OPEN }, b: { a: false, at: OPEN + 1000 } }, OPEN, DEADLINE);
    expect(res.players.a.score).toBe(SCORING.voteBase + SCORING.voteSpeed);
    expect(res.players.a.alive).toBe(true);
    expect(res.players.b.alive).toBe(false);
    expect(res.players.c.alive).toBe(false);
    expect(players.a.score).toBe(0); // không sửa dữ liệu gốc
  });

  it("phiếu đến quá trễ không được tính", () => {
    const res = computeReveal(vote, { a: player("a"), b: player("b") }, { a: { a: true, at: DEADLINE + SCORING.graceMs + 1 }, b: { a: true, at: DEADLINE } }, OPEN, DEADLINE);
    expect(res.players.a.alive).toBe(false);
    expect(res.players.b.alive).toBe(true);
  });

  it("người đã bị bãi nhiệm không bị ảnh hưởng", () => {
    const res = computeReveal(vote, { a: player("a", { alive: false, score: 70 }), b: player("b") }, { b: { a: true, at: OPEN } }, OPEN, DEADLINE);
    expect(res.players.a.score).toBe(70);
    expect(res.players.a.history[vote.id]).toBeUndefined();
  });

  it("người còn lại cuối cùng biểu quyết sai cũng bị bãi nhiệm, không ai được hồi sinh", () => {
    // Tình huống chơi thử: dự thảo 1 B sai (đã bị bãi nhiệm), dự thảo 2 A – người cuối cùng – cũng sai
    const res = computeReveal(vote, { a: player("a", { score: 145 }), b: player("b", { alive: false }) }, { a: { a: false, at: OPEN } }, OPEN, DEADLINE);
    expect(res.players.a.alive).toBe(false);
    expect(res.players.b.alive).toBe(false);
    expect(res.players.a.score).toBe(145);
    expect(res.notice).toBe("none_left");
  });

  it("chỉ cần còn 1 người đúng thì người sai bị bãi nhiệm như bình thường", () => {
    const res = computeReveal(vote, { a: player("a"), b: player("b") }, { a: { a: true, at: OPEN }, b: { a: false, at: OPEN } }, OPEN, DEADLINE);
    expect(res.notice).toBeUndefined();
    expect(res.players.b.alive).toBe(false);
  });
});

describe("computeReveal – phiên chất vấn", () => {
  it("chỉ N người bị bãi nhiệm trả lời đúng nhanh nhất được tái cử", () => {
    const out = (id: string) => player(id, { alive: false });
    const players = { a: out("a"), b: out("b"), c: out("c"), d: out("d"), e: out("e"), f: player("f") };
    const answers = {
      a: { a: "kiểm tra", at: OPEN + 4000 },
      b: { a: "Kiem Tra", at: OPEN + 1000 },
      c: { a: "giám sát", at: OPEN + 500 },
      d: { a: "dân kiểm tra", at: OPEN + 2000 },
      e: { a: "KIỂM TRA", at: OPEN + 3000 },
    };
    const res = computeReveal(cv, players, answers, OPEN, OPEN + 20_000);
    expect(res.revived).toEqual(["b", "d", "e"]);
    expect(res.players.b.alive && res.players.d.alive && res.players.e.alive).toBe(true);
    expect(res.players.a.alive).toBe(false);
    expect(res.players.a.history[cv.id].ok).toBe(true); // đúng nhưng chậm
    expect(res.players.c.alive).toBe(false);
    expect(res.players.b.score).toBe(SCORING.reviveBonus);
  });
});

describe("computeReveal – phiên bỏ phiếu kín", () => {
  it("chọn đúng đủ 3 quyền mới được điểm, không loại ai", () => {
    const players = { a: player("a"), b: player("b") };
    const res = computeReveal(bpk, players, { a: { a: [4, 0, 2], at: OPEN }, b: { a: [0, 1, 2], at: OPEN } }, OPEN, OPEN + 25_000);
    expect(res.players.a.score).toBe(SCORING.multiBase + SCORING.multiSpeed);
    expect(res.players.b.score).toBe(0);
    expect(res.players.b.alive).toBe(true);
  });
});

describe("rank & maskMssv", () => {
  it("điểm cao trước, bằng điểm thì ai còn đương nhiệm và nhanh hơn đứng trước", () => {
    const list = rank([player("a", { score: 100, totalMs: 5000 }), player("b", { score: 100, totalMs: 3000 }), player("c", { score: 100, alive: false }), player("d", { score: 300 })]);
    expect(list.map((p) => p.id)).toEqual(["d", "b", "a", "c"]);
  });
  it("che MSSV", () => {
    expect(maskMssv("SE183062")).toBe("SE18**62");
  });
});

import { findUpstashEnv } from "./store";
describe("findUpstashEnv", () => {
  it("nhận cả tên chuẩn lẫn tên có tiền tố do Vercel thêm", () => {
    expect(findUpstashEnv({ KV_REST_API_URL: "u", KV_REST_API_TOKEN: "t" })?.urlVar).toBe("KV_REST_API_URL");
    expect(findUpstashEnv({ STORAGE_KV_REST_API_URL: "u", STORAGE_KV_REST_API_TOKEN: "t" })?.url).toBe("u");
    expect(findUpstashEnv({ UPSTASH_REDIS_REST_URL: "u", UPSTASH_REDIS_REST_TOKEN: "t" })?.token).toBe("t");
    expect(findUpstashEnv({ KV_REST_API_URL: "u" })).toBeNull();
  });
});
