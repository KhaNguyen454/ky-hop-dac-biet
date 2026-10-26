// Tầng ứng dụng: các use case của trò chơi (tạo phòng, vào phòng, bỏ phiếu, điều khiển, xếp hạng)
import { randomBytes, randomInt } from "node:crypto";
import { publicStep, revealOf, SCORING, STEPS } from "./content";
import { canAnswer, computeReveal, isAnswerValid, maskMssv, rank, TOTAL_STEPS, type Answer, type Player, type Room } from "./game";
import { getStore } from "./store";

const TTL = 60 * 60 * 48; // dữ liệu phòng giữ 48 giờ
const K = {
  room: (c: string) => `kyhop:room:${c}`,
  players: (c: string) => `kyhop:pl:${c}`,
  mssv: (c: string) => `kyhop:mssv:${c}`,
  answers: (c: string, s: string) => `kyhop:ans:${c}:${s}`,
};

export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const CODE_RE = /^\d{4}$/;
export function checkCode(code: string) {
  if (!CODE_RE.test(code)) throw new AppError(400, "Mã phòng gồm 4 chữ số.");
}

async function loadRoom(code: string): Promise<Room> {
  checkCode(code);
  const raw = await getStore().get(K.room(code));
  if (!raw) throw new AppError(404, "Không tìm thấy phòng. Kiểm tra lại mã phòng.");
  return JSON.parse(raw) as Room;
}
async function saveRoom(room: Room) {
  await getStore().set(K.room(room.code), JSON.stringify(room), TTL);
}
async function loadPlayers(code: string): Promise<Record<string, Player>> {
  const all = await getStore().hgetall(K.players(code));
  const out: Record<string, Player> = {};
  for (const [id, v] of Object.entries(all)) out[id] = JSON.parse(v) as Player;
  return out;
}
async function loadAnswers(code: string, stepId: string): Promise<Record<string, Answer>> {
  const all = await getStore().hgetall(K.answers(code, stepId));
  const out: Record<string, Answer> = {};
  for (const [id, v] of Object.entries(all)) out[id] = JSON.parse(v) as Answer;
  return out;
}

export async function createRoom(): Promise<Room> {
  const store = getStore();
  for (let i = 0; i < 20; i++) {
    const code = String(randomInt(1000, 10000));
    const room: Room = { code, createdAt: Date.now(), phase: "lobby", stepIndex: -1, openedAt: 0, deadline: 0 };
    if (await store.setNx(K.room(code), JSON.stringify(room), TTL)) return room;
  }
  throw new AppError(503, "Không tạo được mã phòng, thử lại.");
}

const NAME_MAX = 40;
const MSSV_RE = /^[A-Z]{2}\d{6}$/;

export async function joinRoom(code: string, nameRaw: unknown, mssvRaw: unknown) {
  const room = await loadRoom(code);
  if (room.phase === "ended") throw new AppError(409, "Kỳ họp đã kết thúc.");
  const name = String(nameRaw ?? "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim();
  const mssv = String(mssvRaw ?? "").trim().toUpperCase();
  if (name.length < 2 || name.length > NAME_MAX) throw new AppError(400, "Họ tên từ 2 đến 40 ký tự.");
  if (!MSSV_RE.test(mssv)) throw new AppError(400, "MSSV gồm 2 chữ cái và 6 chữ số, ví dụ SE183062.");

  const store = getStore();
  const existingId = await store.hget(K.mssv(code), mssv);
  if (existingId) {
    const raw = await store.hget(K.players(code), existingId);
    if (raw) {
      const p = JSON.parse(raw) as Player;
      // Vào lại (đổi máy, tải lại trang): cho phép nếu trùng cả họ tên
      if (p.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi")) return { id: p.id, token: p.token, name: p.name };
    }
    throw new AppError(409, "MSSV này đã có người dùng trong phòng.");
  }
  const id = randomBytes(6).toString("hex");
  const token = randomBytes(16).toString("hex");
  if (!(await store.hsetNx(K.mssv(code), mssv, id, TTL))) throw new AppError(409, "MSSV này vừa được dùng, thử lại.");
  const p: Player = { id, token, name, mssv, joinedAt: Date.now(), score: 0, alive: true, correct: 0, totalMs: 0, revived: false, history: {} };
  await store.hset(K.players(code), { [id]: JSON.stringify(p) }, TTL);
  return { id, token, name };
}

export async function submitAnswer(code: string, playerId: string, token: string, a: unknown) {
  const room = await loadRoom(code);
  if (room.phase !== "question") throw new AppError(409, "Hiện chưa mở biểu quyết.");
  const now = Date.now();
  if (now > room.deadline + SCORING.graceMs) throw new AppError(409, "Đã hết thời gian biểu quyết.");
  const step = STEPS[room.stepIndex];
  const store = getStore();
  const raw = await store.hget(K.players(code), String(playerId));
  if (!raw) throw new AppError(404, "Không tìm thấy người chơi, hãy vào phòng lại.");
  const p = JSON.parse(raw) as Player;
  if (p.token !== token) throw new AppError(403, "Phiên chơi không hợp lệ.");
  if (!canAnswer(step, p)) throw new AppError(409, step.kind === "text" ? "Phiên chất vấn chỉ dành cho đại biểu đã bị bãi nhiệm." : "Bạn đã bị bãi nhiệm nên không được biểu quyết.");
  if (!isAnswerValid(step, a)) throw new AppError(400, "Phiếu không hợp lệ.");
  const ok = await store.hsetNx(K.answers(code, step.id), p.id, JSON.stringify({ a, at: now } satisfies Answer), TTL);
  if (!ok) throw new AppError(409, "Bạn đã bỏ phiếu rồi.");
  return { ok: true, at: now };
}

export type ControlAction = "start" | "reveal" | "next" | "end";

export async function control(code: string, action: ControlAction) {
  const room = await loadRoom(code);
  const now = Date.now();
  const open = (i: number) => {
    room.stepIndex = i;
    room.phase = "question";
    room.openedAt = now;
    room.deadline = now + STEPS[i].seconds * 1000;
    room.notice = undefined;
    room.revived = undefined;
  };
  if (action === "start") {
    if (room.phase !== "lobby") throw new AppError(409, "Kỳ họp đã bắt đầu.");
    open(0);
  } else if (action === "reveal") {
    if (room.phase !== "question") throw new AppError(409, "Chỉ công bố được khi đang biểu quyết.");
    const step = STEPS[room.stepIndex];
    // Khóa phòng trước (chuyển sang "reveal") để không nhận thêm phiếu trong lúc tính điểm
    room.phase = "reveal";
    await saveRoom(room);
    const [players, answers] = await Promise.all([loadPlayers(code), loadAnswers(code, step.id)]);
    const res = computeReveal(step, players, answers, room.openedAt, room.deadline);
    const changed: Record<string, string> = {};
    for (const [id, p] of Object.entries(res.players)) changed[id] = JSON.stringify(p);
    await getStore().hset(K.players(code), changed, TTL);
    room.phase = "reveal";
    room.notice = res.notice;
    room.revived = res.revived;
  } else if (action === "next") {
    if (room.phase !== "reveal") throw new AppError(409, "Hãy công bố kết quả trước.");
    if (room.stepIndex + 1 >= TOTAL_STEPS) room.phase = "ended";
    else open(room.stepIndex + 1);
  } else if (action === "end") {
    room.phase = "ended";
  } else throw new AppError(400, "Thao tác không hợp lệ.");
  await saveRoom(room);
  return room;
}

function roomView(room: Room) {
  return {
    code: room.code,
    phase: room.phase,
    stepIndex: room.stepIndex,
    totalSteps: TOTAL_STEPS,
    openedAt: room.openedAt,
    deadline: room.deadline,
    notice: room.notice ?? null,
    cvAt: STEPS.findIndex((s) => s.kind === "text"),
  };
}

export async function getState(code: string, playerId?: string | null) {
  const room = await loadRoom(code);
  const step = room.stepIndex >= 0 ? STEPS[room.stepIndex] : null;
  const store = getStore();
  const [players, answered] = await Promise.all([loadPlayers(code), step && room.phase !== "lobby" ? store.hlen(K.answers(code, step.id)) : Promise.resolve(0)]);
  const list = rank(Object.values(players));
  const showReveal = step && (room.phase === "reveal" || room.phase === "ended");
  let me = null;
  if (playerId && players[playerId]) {
    const p = players[playerId];
    const myAns = step && room.phase === "question" ? await store.hget(K.answers(code, step.id), p.id) : null;
    me = {
      id: p.id,
      name: p.name,
      mssv: maskMssv(p.mssv),
      alive: p.alive,
      revived: p.revived,
      score: p.score,
      correct: p.correct,
      rank: list.findIndex((x) => x.id === p.id) + 1,
      myAnswer: myAns ? (JSON.parse(myAns) as Answer).a : step ? (p.history[step.id]?.a ?? null) : null,
      result: step && showReveal ? (p.history[step.id] ?? null) : null,
    };
  }
  return {
    serverNow: Date.now(),
    storage: store.kind,
    room: roomView(room),
    step: step ? publicStep(step) : null,
    reveal: showReveal && step ? { ...revealOf(step), revivedNames: (room.revived ?? []).map((id) => players[id]?.name).filter(Boolean) } : null,
    counts: { players: list.length, alive: list.filter((p) => p.alive).length, answered },
    top: list.slice(0, 5).map((p, i) => ({ rank: i + 1, name: p.name, score: p.score, alive: p.alive })),
    me,
  };
}

export async function getHostState(code: string) {
  const base = await getState(code, null);
  const room = await loadRoom(code);
  const step = room.stepIndex >= 0 ? STEPS[room.stepIndex] : null;
  const players = rank(Object.values(await loadPlayers(code)));
  let tally: Record<string, number> = {};
  if (step && room.phase !== "lobby") {
    const answers = await loadAnswers(code, step.id);
    if (step.kind === "vote") {
      tally = { yes: 0, no: 0 };
      for (const a of Object.values(answers)) tally[a.a === true ? "yes" : "no"]++;
    } else if (step.kind === "multi") {
      step.options.forEach((_, i) => (tally[String(i)] = 0));
      for (const a of Object.values(answers)) for (const i of a.a as number[]) tally[String(i)]++;
    } else tally = { submitted: Object.keys(answers).length };
  }
  return {
    ...base,
    tally,
    eligible: step ? players.filter((p) => (step.kind === "text" ? !p.alive : p.alive)).length : players.length,
    players: players.map((p, i) => ({ rank: i + 1, name: p.name, mssv: p.mssv, score: p.score, alive: p.alive, revived: p.revived, correct: p.correct })),
  };
}

export async function getLeaderboard(code: string) {
  const room = await loadRoom(code);
  const players = rank(Object.values(await loadPlayers(code)));
  return {
    room: roomView(room),
    players: players.map((p, i) => ({ rank: i + 1, name: p.name, mssv: maskMssv(p.mssv), score: p.score, alive: p.alive, revived: p.revived, correct: p.correct })),
  };
}

export async function getLeaderboardCsv(code: string) {
  await loadRoom(code);
  const players = rank(Object.values(await loadPlayers(code)));
  const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const head = ["Hạng", "Họ tên", "MSSV", "Điểm", "Số câu đúng", "Trạng thái", "Được tái cử", "Tổng thời gian trả lời (giây)"];
  const rows = players.map((p, i) => [i + 1, p.name, p.mssv, p.score, p.correct, p.alive ? "Đương nhiệm" : "Bị bãi nhiệm", p.revived ? "Có" : "", (p.totalMs / 1000).toFixed(1)]);
  return "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}
