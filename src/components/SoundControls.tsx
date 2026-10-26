"use client";
// Nút bật/tắt nhạc nền và hiệu ứng (góc dưới phải). Lựa chọn được nhớ trên trình duyệt.
import { useEffect, useRef, useState } from "react";
import { getSound, type Mode, type Sfx } from "@/lib/music";
import type { GameState } from "./ui";

function readPref(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* bỏ qua */
  }
}

export function SoundControls({ scope, defaultMusic }: { scope: "host" | "player"; defaultMusic: boolean }) {
  const [music, setMusic] = useState(false);
  const [sfx, setSfx] = useState(true);
  const [ready, setReady] = useState(false);
  const mKey = `kyhop:${scope}:music`;
  const sKey = `kyhop:${scope}:sfx`;

  useEffect(() => {
    const s = getSound();
    const m = readPref(mKey, defaultMusic);
    const f = readPref(sKey, true);
    setMusic(m);
    setSfx(f);
    s.musicOn = m;
    s.sfxOn = f;
    // Trình duyệt chỉ cho phát âm thanh sau lần chạm/bấm đầu tiên
    const unlock = () => {
      s.unlock();
      setReady(s.ready);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const t = setInterval(() => setReady(s.ready), 1000);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      clearInterval(t);
    };
  }, [mKey, sKey, defaultMusic]);

  const toggleMusic = () => {
    const s = getSound();
    const v = !music;
    setMusic(v);
    writePref(mKey, v);
    s.unlock();
    s.setMusic(v);
  };
  const toggleSfx = () => {
    const s = getSound();
    const v = !sfx;
    setSfx(v);
    writePref(sKey, v);
    s.sfxOn = v;
    s.unlock();
    if (v) s.sfx("click");
  };

  return (
    <div className="sound-dock" role="group" aria-label="Âm thanh">
      {music && !ready && <span className="sound-hint">Chạm vào trang để bật nhạc</span>}
      <button type="button" className={`sound-btn ${music ? "on" : ""}`} onClick={toggleMusic} aria-pressed={music}>
        ♪ Nhạc nền: {music ? "Bật" : "Tắt"}
      </button>
      <button type="button" className={`sound-btn ${sfx ? "on" : ""}`} onClick={toggleSfx} aria-pressed={sfx}>
        Hiệu ứng: {sfx ? "Bật" : "Tắt"}
      </button>
    </div>
  );
}

// Gắn âm thanh vào diễn biến trò chơi: đổi không khí nhạc theo giai đoạn, tích tắc 5 giây cuối, con dấu khi công bố
export function useGameSounds(
  data: GameState | null,
  remaining: number,
  opts: { role: "host" | "player"; answered?: boolean; eligible?: boolean; players?: number },
) {
  const prev = useRef<{ phase?: string; key?: string; players?: number; tick?: number }>({});
  const phase = data?.room.phase;
  const key = data ? `${data.room.stepIndex}:${data.room.openedAt}` : "";
  const total = (data?.step?.seconds ?? 0) * 1000;

  useEffect(() => {
    if (!phase) return;
    const s = getSound();
    s.setMode(phase as Mode);
    const p = prev.current;
    const play = (n: Sfx, delay = 0) => (delay ? setTimeout(() => s.sfx(n), delay) : s.sfx(n));
    if (p.phase === "question" && phase === "reveal" && p.key === key) {
      const me = data?.me;
      if (opts.role === "player" && me?.result) {
        if (data?.step?.kind === "text" && me.result.ok && me.alive) play("revive");
        else play(me.result.ok ? "correct" : "wrong");
      } else {
        play("stamp");
        if (data?.step?.kind === "text" && (data.reveal as { revivedNames?: string[] } | null)?.revivedNames?.length) play("revive", 450);
      }
    }
    if (phase === "ended" && p.phase && p.phase !== "ended") play("fanfare");
    p.phase = phase;
    p.key = key;
  }, [phase, key, data, opts.role]);

  // Người dẫn: tiếng "pop" khi có người vào phòng
  useEffect(() => {
    if (opts.players === undefined) return;
    const p = prev.current;
    if (phase === "lobby" && p.players !== undefined && opts.players > p.players) getSound().sfx("join");
    p.players = opts.players;
  }, [opts.players, phase]);

  // Tăng độ căng của nhạc theo thời gian và tích tắc 5 giây cuối
  useEffect(() => {
    const s = getSound();
    if (phase !== "question" || total <= 0) {
      s.tension = 0;
      return;
    }
    s.tension = Math.min(1, Math.max(0, 1 - remaining / total));
    const sec = Math.ceil(remaining / 1000);
    const wantTick = opts.role === "host" || (opts.eligible && !opts.answered);
    if (wantTick && sec >= 1 && sec <= 5 && prev.current.tick !== sec) {
      prev.current.tick = sec;
      s.sfx(sec <= 3 ? "tickHigh" : "tick");
    }
    if (sec > 5) prev.current.tick = undefined;
  }, [remaining, phase, total, opts.role, opts.eligible, opts.answered]);
}
