"use client";
// Màn hình người dẫn (chiếu lên máy chiếu): tạo phòng, mã QR, điều khiển từng dự thảo, bảng xếp hạng, xuất CSV
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, usePoll, useRemaining } from "@/lib/client";
import { LeaderTable, Orn, Podium, Stamp, TimerBar, type HostState } from "@/components/ui";

const PIN_KEY = "kyhop:host-pin";
const ROOM_KEY = "kyhop:host-room";

function read(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function write(key: string, v: string) {
  try {
    if (v) localStorage.setItem(key, v);
    else localStorage.removeItem(key);
  } catch {
    /* bỏ qua */
  }
}

export default function HostPage() {
  const [pin, setPin] = useState("");
  const [room, setRoom] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setPin(read(PIN_KEY));
    setRoom(read(ROOM_KEY));
    setReady(true);
  }, []);
  if (!ready) return null;
  if (!pin) return <PinGate onOk={(p) => (write(PIN_KEY, p), setPin(p))} />;
  if (!room) return <RoomPicker pin={pin} onRoom={(c) => (write(ROOM_KEY, c), setRoom(c))} onLogout={() => (write(PIN_KEY, ""), setPin(""))} />;
  return <Console pin={pin} code={room} onClose={() => (write(ROOM_KEY, ""), setRoom(""))} />;
}

function PinGate({ onOk }: { onOk: (pin: string) => void }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      // PIN đúng → API báo "không tìm thấy phòng 0000"; PIN sai → 401
      await api(`/api/rooms/0000/host`, { pin: v });
      onOk(v);
    } catch (e) {
      const s = (e as { status?: number }).status;
      if (s === 404) onOk(v);
      else setErr((e as Error).message);
    }
  };
  return (
    <main className="wrap">
      <div className="crumb">Màn hình người dẫn</div>
      <h1 className="title-xl" style={{ marginTop: 8 }}>KỲ HỌP ĐẶC BIỆT</h1>
      <Orn />
      <form className="panel" onSubmit={check}>
        <div className="field">
          <label htmlFor="pin">Mã PIN người dẫn</label>
          <input id="pin" type="password" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
          <span className="hint">PIN được đặt ở biến môi trường HOST_PIN trên Vercel.</span>
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn block">Vào điều khiển</button>
      </form>
    </main>
  );
}

function RoomPicker({ pin, onRoom, onLogout }: { pin: string; onRoom: (c: string) => void; onLogout: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ code: string }>(`/api/rooms`, { method: "POST", pin });
      onRoom(r.code);
    } catch (e) {
      setErr((e as Error).message);
      if ((e as { status?: number }).status === 401) onLogout();
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="wrap">
      <div className="crumb">Màn hình người dẫn</div>
      <h1 className="title-xl" style={{ marginTop: 8 }}>KỲ HỌP ĐẶC BIỆT</h1>
      <Orn />
      <div className="panel">
        <button className="btn block" onClick={create} disabled={busy}>
          {busy ? "Đang tạo…" : "Tạo phòng mới"}
        </button>
        <div className="orn">
          <span />
        </div>
        <div className="field">
          <label htmlFor="code">Hoặc mở lại phòng cũ</label>
          <input id="code" inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="Mã 4 số" />
        </div>
        <button className="btn ghost block" disabled={code.length !== 4} onClick={() => onRoom(code)}>
          Mở phòng
        </button>
        {err && <div className="error">{err}</div>}
        <p className="mt">
          <button className="btn small ghost" onClick={onLogout}>
            Đổi PIN
          </button>
        </p>
      </div>
    </main>
  );
}

function Console({ pin, code, onClose }: { pin: string; code: string; onClose: () => void }) {
  const { data, error, offset, refresh } = usePoll<HostState>(`/api/rooms/${code}/host`, 1000, pin);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [auto, setAuto] = useState(true);
  const [qr, setQr] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const remaining = useRemaining(data?.room.deadline, offset);
  const autoFired = useRef<string>("");

  useEffect(() => {
    const url = `${window.location.origin}/?room=${code}`;
    setJoinUrl(url);
    QRCode.toDataURL(url, { margin: 1, width: 440, color: { dark: "#5A1A14", light: "#FFFBF0" } }).then(setQr);
  }, [code]);

  const act = useCallback(
    async (action: string) => {
      setBusy(true);
      setErr("");
      try {
        await api(`/api/rooms/${code}/control`, { method: "POST", pin, body: JSON.stringify({ action }) });
        refresh();
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [code, pin, refresh],
  );

  // Tự công bố khi hết giờ (chờ thêm 1,6 giây cho phiếu đến trễ) hoặc khi mọi người đủ điều kiện đã bỏ phiếu
  useEffect(() => {
    if (!auto || !data || data.room.phase !== "question" || !data.step) return;
    const key = `${data.room.stepIndex}:${data.room.openedAt}`;
    if (autoFired.current === key) return;
    // Không còn ai đủ điều kiện (vd: tất cả đã bị bãi nhiệm) thì công bố ngay để bỏ qua vòng này
    const everyone = data.eligible === 0 || data.counts.answered >= data.eligible;
    const overdue = Date.now() + offset > data.room.deadline + 1600;
    if (everyone || overdue) {
      autoFired.current = key;
      act("reveal");
    }
  }, [auto, data, remaining, offset, act]);

  const downloadCsv = async () => {
    const res = await fetch(`/api/rooms/${code}/leaderboard?format=csv`, { headers: { "x-host-pin": pin } });
    if (!res.ok) return setErr("Không tải được CSV.");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bang-xep-hang-phong-${code}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!data)
    return (
      <main className="wrap">
        {error ? <div className="error">{error.message}</div> : <p>Đang tải phòng {code}…</p>}
        <button className="btn ghost" onClick={onClose}>
          Chọn phòng khác
        </button>
      </main>
    );

  const { room, step, reveal, counts, tally, players } = data;
  const r = reveal as { correct?: boolean | number[]; answer?: string; why: string; revivedNames: string[] } | null;
  const total = (step?.seconds ?? 0) * 1000;

  return (
    <main className="wrap-wide">
      <div className="row">
        <div className="grow">
          <div className="crumb">Hoạt động kết thúc · Kỳ họp đặc biệt · Phòng {code}</div>
          <h1 className="title-xl" style={{ marginTop: 6, fontSize: 40 }}>
            {room.phase === "lobby" ? "Ai sẽ bị “bãi nhiệm”?" : room.phase === "ended" ? "Đại biểu xuất sắc của kỳ họp" : step?.title}
          </h1>
        </div>
        <div className="row">
          {data.storage === "memory" && <span className="pill out">Đang dùng bộ nhớ tạm (chưa có Redis)</span>}
          <span className="pill">{counts.players} đại biểu</span>
          <span className="pill alive">{counts.alive} đương nhiệm</span>
        </div>
      </div>
      <Orn />
      {(err || error) && <div className="error">{err || "Mất kết nối, đang thử lại…"}</div>}

      <div className="host-grid">
        <section>
          {room.phase === "lobby" && (
            <div className="panel">
              <div className="row" style={{ alignItems: "flex-start", gap: 28 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {qr && <img className="qr" src={qr} alt="Mã QR vào phòng" />}
                <div className="grow">
                  <div className="crumb">Quét mã hoặc vào trang và nhập mã phòng</div>
                  <div className="big-code" style={{ margin: "8px 0" }}>
                    {code}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, wordBreak: "break-all" }}>{joinUrl}</div>
                </div>
              </div>
              <div className="mt-l">
                <div className="crumb" style={{ marginBottom: 10 }}>
                  Đại biểu đã vào ({counts.players})
                </div>
                <div className="chips">
                  {players.map((p) => (
                    <span className="chip" key={p.name + p.mssv}>
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
              <button className="btn mt-l" style={{ fontSize: 22, padding: "18px 28px" }} disabled={busy || counts.players === 0} onClick={() => act("start")}>
                Khai mạc kỳ họp
              </button>
            </div>
          )}

          {room.phase === "question" && step && (
            <div className="panel">
              <div className="crumb">
                {room.stepIndex + 1}/{room.totalSteps} · {step.kind === "vote" ? "Xin ý kiến đại biểu" : step.kind === "text" ? "Chỉ dành cho đại biểu đã bị bãi nhiệm" : "Chỉ dành cho đại biểu còn đương nhiệm"}
              </div>
              <p className="host-statement">{step.text}</p>
              {step.kind === "multi" && (
                <div className="tally" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  {(step.options ?? []).map((o) => (
                    <div className="t" key={o} style={{ fontSize: 22, fontWeight: 800 }}>
                      {o}
                    </div>
                  ))}
                </div>
              )}
              <TimerBar remaining={remaining} total={total} />
              <div className="row mt">
                <div className="ring">{Math.ceil(remaining / 1000)}</div>
                <div className="grow" style={{ fontSize: 22, fontWeight: 800 }}>
                  {data.eligible === 0 ? "Không còn đại biểu đủ điều kiện – bỏ qua vòng này" : `Đã bỏ phiếu: ${counts.answered}/${data.eligible}`}
                </div>
                <button className="btn" disabled={busy} onClick={() => act("reveal")}>
                  Công bố kết quả
                </button>
              </div>
            </div>
          )}

          {room.phase === "reveal" && step && r && (
            <div className="panel">
              <div className="crumb">
                Kết quả · {room.stepIndex + 1}/{room.totalSteps}
              </div>
              <p className="host-statement" style={{ fontSize: 30 }}>
                {step.text}
              </p>
              {step.kind === "vote" && (
                <>
                  <Stamp kind={r.correct ? "yes" : "no"} />
                  <div className="tally mt">
                    <div className={`t ${r.correct ? "win" : ""}`}>
                      Tán thành <b>{tally.yes ?? 0}</b>
                    </div>
                    <div className={`t ${!r.correct ? "win" : ""}`}>
                      Không tán thành <b>{tally.no ?? 0}</b>
                    </div>
                  </div>
                </>
              )}
              {step.kind === "text" && (
                <>
                  <p style={{ fontSize: 34, fontWeight: 900 }}>
                    Đáp án: <span className="red">{r.answer?.toUpperCase()}</span>
                  </p>
                  <Stamp kind="back" />
                  <p style={{ fontSize: 22, fontWeight: 800 }}>{r.revivedNames.length ? `Được tái cử: ${r.revivedNames.join(", ")}` : "Không có đại biểu nào được tái cử."}</p>
                </>
              )}
              {step.kind === "multi" && Array.isArray(r.correct) && (
                <div className="tally" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  {(step.options ?? []).map((o, i) => (
                    <div className={`t ${(r.correct as number[]).includes(i) ? "win" : ""}`} key={o}>
                      <span style={{ fontWeight: 800 }}>{o}</span> <b>{tally[String(i)] ?? 0}</b>
                    </div>
                  ))}
                </div>
              )}
              <div className="card mt" style={{ fontSize: 20 }}>
                <b>Vì sao? </b>
                {r.why}
              </div>
              {room.notice === "none_left" && (
                <div className="error">
                  Tất cả đại biểu đều đã bị bãi nhiệm.{room.stepIndex < room.cvAt ? " Các dự thảo tiếp theo sẽ được bỏ qua tới Phiên chất vấn." : ""}
                </div>
              )}
              <button className="btn mt" style={{ fontSize: 22 }} disabled={busy} onClick={() => act("next")}>
                {room.stepIndex + 1 >= room.totalSteps ? "Bế mạc & vinh danh" : "Tiếp theo"}
              </button>
            </div>
          )}

          {room.phase === "ended" && (
            <div className="panel">
              <Podium rows={players.slice(0, 3)} />
              <div className="row mt">
                <button className="btn" onClick={downloadCsv}>
                  Tải bảng điểm (CSV)
                </button>
                <a className="btn ghost" href={`/bang-xep-hang?room=${code}`} target="_blank" rel="noreferrer">
                  Mở trang xếp hạng
                </a>
              </div>
              <div className="mt-l">
                <LeaderTable rows={players} />
              </div>
            </div>
          )}
        </section>

        <aside>
          <div className="panel pink">
            <div className="crumb" style={{ marginBottom: 10 }}>
              Bảng xếp hạng trực tiếp
            </div>
            <LeaderTable rows={players.slice(0, 10)} showMssv={false} compact />
          </div>
          <div className="card mt">
            <label className="row" style={{ fontWeight: 800 }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Tự công bố khi hết giờ
            </label>
            <div className="row mt">
              {room.phase !== "ended" && room.phase !== "lobby" && (
                <button className="btn small ghost" disabled={busy} onClick={() => confirm("Kết thúc kỳ họp ngay?") && act("end")}>
                  Kết thúc sớm
                </button>
              )}
              <button className="btn small ghost" onClick={downloadCsv}>
                CSV
              </button>
              <button className="btn small ghost" onClick={onClose}>
                Đổi phòng
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
