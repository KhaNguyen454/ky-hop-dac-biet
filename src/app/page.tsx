"use client";
// Trang người chơi (mở trên điện thoại): vào phòng → biểu quyết → xem kết quả → xếp hạng
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, loadSession, saveSession, usePoll, useRemaining, type Session } from "@/lib/client";
import { LeaderTable, Orn, Stamp, TimerBar, type GameState } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<div className="wrap">Đang tải…</div>}>
      <Player />
    </Suspense>
  );
}

function Player() {
  const sp = useSearchParams();
  const router = useRouter();
  const [code, setCode] = useState(sp.get("room") ?? "");
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setSession(/^\d{4}$/.test(code) ? loadSession(code) : null);
    setChecked(true);
  }, [code]);

  if (!checked) return <div className="wrap">Đang tải…</div>;
  if (!session)
    return (
      <JoinForm
        initialCode={code}
        onJoined={(c, s) => {
          saveSession(c, s);
          setCode(c);
          setSession(s);
          router.replace(`/?room=${c}`);
        }}
      />
    );
  return (
    <Play
      code={code}
      session={session}
      onLeave={() => {
        saveSession(code, null);
        setSession(null);
      }}
    />
  );
}

function Header({ code }: { code?: string }) {
  return (
    <header>
      <div className="crumb">Hoạt động kết thúc · Phần III{code ? ` · Phòng ${code}` : ""}</div>
      <h1 className="title-xl" style={{ marginTop: 8 }}>
        KỲ HỌP ĐẶC BIỆT
      </h1>
      <div className="title-l">Ai sẽ bị “bãi nhiệm”?</div>
      <Orn />
    </header>
  );
}

function JoinForm({ initialCode, onJoined }: { initialCode: string; onJoined: (code: string, s: Session) => void }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [mssv, setMssv] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const c = code.trim();
      if (!/^\d{4}$/.test(c)) throw new Error("Mã phòng gồm 4 chữ số (xem trên màn chiếu).");
      const s = await api<Session>(`/api/rooms/${c}/join`, { method: "POST", body: JSON.stringify({ name, mssv }) });
      onJoined(c, s);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="wrap">
      <Header />
      <form className="panel" onSubmit={submit}>
        <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Vào phòng họp</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Bạn là đại biểu Quốc hội. Biểu quyết đúng để giữ ghế và ghi điểm.
        </p>
        <div className="field">
          <label htmlFor="code">Mã phòng</label>
          <input id="code" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="VD: 4821" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="field">
          <label htmlFor="name">Họ và tên</label>
          <input id="name" autoComplete="name" maxLength={40} placeholder="Nguyễn Văn A" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="mssv">MSSV</label>
          <input id="mssv" autoComplete="off" maxLength={8} placeholder="SE183062" value={mssv} onChange={(e) => setMssv(e.target.value.toUpperCase())} />
          <span className="hint">Dùng để phát thưởng. Bảng xếp hạng công khai chỉ hiện một phần MSSV.</span>
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn block" disabled={busy}>
          {busy ? "Đang vào…" : "Vào phòng"}
        </button>
      </form>
    </main>
  );
}

function Play({ code, session, onLeave }: { code: string; session: Session; onLeave: () => void }) {
  const { data, error, offset, refresh } = usePoll<GameState>(`/api/rooms/${code}/state?player=${session.id}`, 1200);
  const [sent, setSent] = useState<Record<string, unknown>>({});
  const [err, setErr] = useState("");
  const remaining = useRemaining(data?.room.deadline, offset);

  useEffect(() => {
    if (data && !data.me) onLeave(); // người chơi không còn trong phòng (phòng mới) → vào lại
  }, [data, onLeave]);

  if (!data) {
    return (
      <main className="wrap">
        <Header code={code} />
        {error ? (
          <div className="panel">
            <div className="error">{error.message}</div>
            <button className="btn ghost" onClick={onLeave}>
              Nhập mã phòng khác
            </button>
          </div>
        ) : (
          <p>Đang kết nối…</p>
        )}
      </main>
    );
  }

  const { room, step, me, reveal } = data;
  if (!me) return null;
  const my = step ? (sent[step.id] ?? me.myAnswer) : null;
  const total = (step?.seconds ?? 0) * 1000;
  const timeUp = remaining <= 0;

  const send = async (answer: unknown) => {
    if (!step) return;
    setErr("");
    setSent((s) => ({ ...s, [step.id]: answer }));
    try {
      await api(`/api/rooms/${code}/answer`, { method: "POST", body: JSON.stringify({ player: session.id, token: session.token, answer }) });
      refresh();
    } catch (e) {
      setSent((s) => {
        const c = { ...s };
        delete c[step.id];
        return c;
      });
      setErr((e as Error).message);
    }
  };

  return (
    <main className="wrap">
      <Header code={code} />
      <div className="status-bar">
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{me.name}</div>
          <span className={`pill ${me.alive ? "alive" : "out"}`}>{me.alive ? (me.revived ? "Đã tái cử" : "Đương nhiệm") : "Bị bãi nhiệm"}</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="score">{me.score} điểm</div>
          <div className="muted" style={{ fontSize: 14 }}>
            Hạng {me.rank}/{data.counts.players}
          </div>
        </div>
      </div>
      {error && <div className="error">Mạng chập chờn, đang thử lại…</div>}

      {room.phase === "lobby" && (
        <div className="panel">
          <h2 style={{ fontSize: 22, fontWeight: 900 }}>Chào đại biểu {me.name}!</h2>
          <p>
            Đã có <b>{data.counts.players}</b> đại biểu vào phòng. Chờ người dẫn khai mạc kỳ họp nhé.
          </p>
          <ul style={{ paddingLeft: 20, lineHeight: 1.6 }}>
            <li>Mỗi dự thảo là một nhận định: bấm <b className="red">TÁN THÀNH</b> nếu đúng, <b>KHÔNG TÁN THÀNH</b> nếu sai.</li>
            <li>Đúng: +100 điểm, trả lời càng nhanh càng được thưởng thêm (tối đa +50).</li>
            <li>Sai hoặc không bỏ phiếu: bị <b>bãi nhiệm</b>, không được biểu quyết tiếp.</li>
            <li>Phiên chất vấn: 3 người bị bãi nhiệm trả lời đúng nhanh nhất được tái cử.</li>
            <li>Phiên bỏ phiếu kín cuối: chọn đúng 3 quyền, +200 điểm (+ tối đa 100 thưởng tốc độ).</li>
          </ul>
        </div>
      )}

      {room.phase === "question" && step && (
        <div className="panel">
          <div className="crumb">
            {step.title} · {room.stepIndex + 1}/{room.totalSteps}
          </div>
          <p className="statement">{step.text}</p>
          <TimerBar remaining={remaining} total={total} />

          {step.kind === "vote" &&
            (me.alive ? (
              my === null || my === undefined ? (
                <div className="vote">
                  <button className="btn" disabled={timeUp} onClick={() => send(true)}>
                    Tán thành <small>Nhận định ĐÚNG</small>
                  </button>
                  <button className="btn dark" disabled={timeUp} onClick={() => send(false)}>
                    Không tán thành <small>Nhận định SAI</small>
                  </button>
                </div>
              ) : (
                <p className="mt center" style={{ fontWeight: 800 }}>
                  Đã ghi nhận phiếu <span className="red">{my === true ? "TÁN THÀNH" : "KHÔNG TÁN THÀNH"}</span>. Chờ công bố kết quả…
                </p>
              )
            ) : (
              <p className="mt" style={{ fontWeight: 800 }}>
                Bạn đã bị bãi nhiệm nên chỉ theo dõi.
                {room.stepIndex < room.cvAt ? " Hãy chờ Phiên chất vấn để giành ghế trở lại!" : ""}
              </p>
            ))}

          {step.kind === "text" && (!me.alive ? <TextAnswer disabled={timeUp} sent={my} onSend={send} /> : <p className="mt" style={{ fontWeight: 800 }}>Phiên chất vấn chỉ dành cho đại biểu đã bị bãi nhiệm. Bạn đang đương nhiệm, hãy chờ.</p>)}

          {step.kind === "multi" &&
            (me.alive ? (
              <MultiAnswer options={step.options ?? []} pick={step.pick ?? 3} disabled={timeUp} sent={my} onSend={send} />
            ) : (
              <p className="mt" style={{ fontWeight: 800 }}>Phiên bỏ phiếu kín chỉ dành cho đại biểu còn đương nhiệm. Bạn hãy theo dõi kết quả nhé.</p>
            ))}
          {err && <div className="error">{err}</div>}
        </div>
      )}

      {room.phase === "reveal" && step && reveal && <RevealView data={data} />}

      {room.phase === "ended" && (
        <div className="panel red center">
          <div className="crumb" style={{ color: "var(--gold)", justifyContent: "center" }}>
            Kỳ họp bế mạc
          </div>
          <div style={{ fontSize: 56, fontWeight: 900, color: "var(--gold)", marginTop: 6 }}>#{me.rank}</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            {me.score} điểm · {me.correct} câu đúng
          </div>
          <p style={{ marginBottom: 4 }}>Từ khóa của phần III: <b>NHÂN DÂN</b></p>
          <p style={{ marginTop: 0, fontStyle: "italic" }}>“Nói tóm lại quyền lực và lực lượng đều ở dân” – Hồ Chí Minh</p>
          <a className="btn gold" href={`/bang-xep-hang?room=${code}`}>
            Xem bảng xếp hạng
          </a>
        </div>
      )}

      {room.phase !== "lobby" && room.phase !== "ended" && data.top.length > 0 && (
        <div className="mt-l">
          <div className="crumb" style={{ marginBottom: 8 }}>
            Top 5 hiện tại
          </div>
          <LeaderTable rows={data.top} meName={me.name} showMssv={false} compact />
        </div>
      )}
    </main>
  );
}

function RevealView({ data }: { data: GameState }) {
  const { step, reveal, me, room } = data;
  if (!step || !reveal || !me) return null;
  const r = reveal as { correct?: boolean | number[]; answer?: string; why: string; revivedNames: string[] };
  const res = me.result;
  return (
    <div className="panel">
      <div className="crumb">
        Kết quả · {step.title} · {room.stepIndex + 1}/{room.totalSteps}
      </div>
      <p className="statement" style={{ fontSize: 20 }}>
        {step.text}
      </p>
      {step.kind === "vote" && <Stamp kind={r.correct ? "yes" : "no"} />}
      {step.kind === "text" && (
        <>
          <p className="center" style={{ fontSize: 24, fontWeight: 900 }}>
            Đáp án: <span className="red">{r.answer?.toUpperCase()}</span>
          </p>
          <Stamp kind="back" />
          <p className="center" style={{ fontWeight: 800 }}>
            {r.revivedNames.length > 0 ? `Được tái cử: ${r.revivedNames.join(", ")}` : "Không có đại biểu nào được tái cử."}
          </p>
        </>
      )}
      {step.kind === "multi" && Array.isArray(r.correct) && (
        <p className="center" style={{ fontSize: 24, fontWeight: 900 }}>
          Đáp án:{" "}
          <span className="red">{(r.correct as number[]).map((i) => (step.options ?? [])[i]).join(" · ")}</span>
        </p>
      )}
      <div className="card mt">
        <b>Vì sao? </b>
        {r.why}
      </div>
      {room.notice === "all_wrong_kept" && <div className="error">Tất cả đại biểu còn đương nhiệm đều biểu quyết sai, nên những đại biểu này được giữ ghế để kỳ họp tiếp tục. Ai đã bị bãi nhiệm từ trước vẫn bị bãi nhiệm.</div>}
      {res && (
        <p className="center mt" style={{ fontSize: 20, fontWeight: 900 }}>
          {res.ok ? (
            <span style={{ color: "#24643a" }}>Chính xác! +{res.pts} điểm</span>
          ) : step.kind === "vote" ? (
            me.alive ? <span className="red">Sai rồi – nhưng bạn được giữ ghế (+0 điểm)</span> : <span className="red">Sai rồi – bạn bị bãi nhiệm</span>
          ) : (
            <span className="red">Chưa chính xác</span>
          )}
        </p>
      )}
    </div>
  );
}

function TextAnswer({ disabled, sent, onSend }: { disabled: boolean; sent: unknown; onSend: (a: unknown) => void }) {
  const [v, setV] = useState("");
  if (sent !== null && sent !== undefined)
    return (
      <p className="mt" style={{ fontWeight: 800 }}>
        Đã gửi: “{String(sent)}”. Chờ công bố…
      </p>
    );
  return (
    <form
      className="mt"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSend(v.trim());
      }}
    >
      <div className="field">
        <label htmlFor="cv">Câu trả lời của bạn</label>
        <input id="cv" autoComplete="off" maxLength={60} value={v} onChange={(e) => setV(e.target.value)} placeholder="Gõ phần còn thiếu" />
      </div>
      <button className="btn block" disabled={disabled || !v.trim()}>
        Gửi chất vấn
      </button>
    </form>
  );
}

function MultiAnswer({ options, pick, disabled, sent, onSend }: { options: string[]; pick: number; disabled: boolean; sent: unknown; onSend: (a: unknown) => void }) {
  const [sel, setSel] = useState<number[]>([]);
  if (Array.isArray(sent))
    return (
      <p className="mt" style={{ fontWeight: 800 }}>
        Đã bỏ phiếu: {(sent as number[]).map((i) => options[i]).join(", ")}. Chờ công bố…
      </p>
    );
  const toggle = (i: number) => setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : s.length < pick ? [...s, i] : s));
  return (
    <>
      <p className="hint">Chọn đúng {pick} phương án ({sel.length}/{pick}).</p>
      <div className="opts">
        {options.map((o, i) => (
          <button key={o} type="button" className={`opt ${sel.includes(i) ? "on" : ""}`} onClick={() => toggle(i)} disabled={disabled}>
            <span className="box">{sel.includes(i) ? "✓" : ""}</span>
            {o}
          </button>
        ))}
      </div>
      <button className="btn block mt" disabled={disabled || sel.length !== pick} onClick={() => onSend(sel)}>
        Bỏ phiếu kín
      </button>
    </>
  );
}
