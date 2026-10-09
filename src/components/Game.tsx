"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconArrowUpRight } from "@/components/icons";
import { drawChart, drawRoad, fitCanvas, type Surface } from "@/lib/draw";
import { advance, CFG, createRun, KMH, summarize, type RunState } from "@/lib/physics";
import { getPlayerName } from "@/lib/player";

type Submit = { rank: number; total: number; best: number; isBest: boolean };

export default function Game() {
  const [finished, setFinished] = useState<RunState | null>(null);
  const [submit, setSubmit] = useState<Submit | null>(null);
  const [saving, setSaving] = useState(false);
  const [bestBefore, setBestBefore] = useState<number | null>(null);
  const [round, setRound] = useState(0);

  const stateRef = useRef<RunState | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const holdRef = useRef(false);
  const offsetRef = useRef(0);
  const roadRef = useRef<Surface | null>(null);

  const speedRef = useRef<HTMLSpanElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const forceRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const pedalRef = useRef<HTMLButtonElement>(null);
  const pedalLabelRef = useRef<HTMLSpanElement>(null);
  const pedalSubRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const roadCanvasRef = useRef<HTMLCanvasElement>(null);

  /* ---------- 每帧绘制 ---------- */
  const paint = useCallback((s: RunState, dt: number) => {
    const kmh = s.v * KMH;
    const force = s.phase === "ready" ? 0 : s.F;

    if (speedRef.current) speedRef.current.textContent = String(Math.round(kmh));
    if (forceRef.current) forceRef.current.textContent = `${Math.round(force)} N`;

    const fill = fillRef.current;
    if (fill) {
      fill.style.width = `${Math.min(Math.max(force / CFG.LIMIT, 0), 1) * 100}%`;
      fill.classList.toggle("warn", force >= CFG.WARN && force < CFG.DANGER);
      fill.classList.toggle("danger", force >= CFG.DANGER);
    }

    const pedal = pedalRef.current;
    if (pedal) {
      pedal.classList.toggle("locked", s.phase === "ready");
      pedal.classList.toggle("on", s.phase === "run" && holdRef.current);
    }
    if (pedalLabelRef.current) {
      pedalLabelRef.current.textContent =
        s.phase === "ready" ? "准备中" : holdRef.current ? "制动中" : "按住刹车";
    }
    if (pedalSubRef.current) {
      pedalSubRef.current.textContent = s.phase === "ready" ? "STANDBY" : "HOLD / SPACE";
    }

    const canvas = roadCanvasRef.current;
    if (canvas) {
      if (!roadRef.current) roadRef.current = fitCanvas(canvas, 74);
      offsetRef.current = (offsetRef.current + s.v * dt * 14) % 68;
      drawRoad(roadRef.current, {
        speedKmh: kmh,
        forceN: force,
        offset: offsetRef.current,
        danger: force >= CFG.DANGER,
      });
    }
  }, []);

  /* ---------- 结算：落库 ---------- */
  const finish = useCallback(async (s: RunState) => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    lastRef.current = 0;
    holdRef.current = false;

    const sum = summarize(s);
    setFinished({ ...s, samples: [...s.samples] });
    setSaving(true);

    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: getPlayerName(),
          time: sum.total,
          reaction: sum.reaction,
          entry: s.entryKmh,
          peak: s.peak,
          distance: s.dist,
        }),
      });
      if (res.ok) setSubmit((await res.json()) as Submit);
    } catch {
      /* 离线也允许继续看成绩 */
    } finally {
      setSaving(false);
    }
  }, []);

  /* ---------- 主循环 ---------- */
  const frame = useCallback(
    (ts: number) => {
      const s = stateRef.current;
      if (!s) return;
      if (!lastRef.current) {
        lastRef.current = ts;
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      const dt = (ts - lastRef.current) / 1000;
      lastRef.current = ts;

      const before = s.phase;
      const res = advance(s, dt, holdRef.current);
      paint(s, dt);

      if (before === "ready" && s.phase === "run") {
        if (statusRef.current) {
          statusRef.current.textContent = "BRAKE NOW";
          statusRef.current.className = "status live";
        }
        if (capRef.current) capRef.current.textContent = "达到 100 km/h · 立即制动";
        if (hintRef.current) hintRef.current.textContent = "踏板有惯性，提前松开留余量";
      }

      if (res !== "running") {
        void finish(s);
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    },
    [paint, finish],
  );

  /* ---------- 开局 ---------- */
  const start = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const run = createRun();
    stateRef.current = run;
    holdRef.current = false;
    lastRef.current = 0;
    offsetRef.current = 0;
    roadRef.current = null;

    if (statusRef.current) {
      statusRef.current.textContent = "ACCELERATING";
      statusRef.current.className = "status";
    }
    if (capRef.current) capRef.current.textContent = "加速中";
    if (hintRef.current) hintRef.current.textContent = "绿灯亮起后开始制动计时";

    paint(run, 0);
    rafRef.current = requestAnimationFrame(frame);
  }, [frame, paint]);

  const restart = useCallback(() => {
    setFinished(null);
    setSubmit(null);
    setSaving(false);
    setRound((r) => r + 1);
  }, []);

  // 每次开局都重建一轮（effect 在 DOM 提交后运行，canvas 一定就位）
  useEffect(() => {
    start();
    return () => cancelAnimationFrame(rafRef.current);
  }, [round, start]);

  // 开局前先取个人最好成绩，用来判断是否新纪录
  useEffect(() => {
    let alive = true;
    fetch(`/api/scores?limit=1&name=${encodeURIComponent(getPlayerName())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { me?: { best: number | null } } | null) => {
        if (alive) setBestBefore(d?.me?.best ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [round]);

  // 键盘 / 指针输入
  useEffect(() => {
    const release = () => {
      holdRef.current = false;
    };
    const kd = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowDown") {
        e.preventDefault();
        holdRef.current = true;
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowDown") {
        e.preventDefault();
        holdRef.current = false;
      }
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  if (finished) {
    return <Result run={finished} submit={submit} saving={saving} bestBefore={bestBefore} onRetry={restart} />;
  }

  return (
    <div className="card">
      <div className="game-top">
        <div className="status" ref={statusRef}>
          ACCELERATING
        </div>
        <Link className="pill-top" href="/leaderboard">
          TOP 50
          <br />
          排行榜
        </Link>
      </div>

      <div className="speedo">
        <div className="val num">
          <span ref={speedRef}>0</span>
          <span className="unit">km/h</span>
        </div>
        <div className="cap" ref={capRef}>
          加速中
        </div>
      </div>

      <canvas className="road" ref={roadCanvasRef} />

      <div className="gauge">
        <div className="gauge-head">
          <span className="lbl">踏板力度</span>
          <span className="val" ref={forceRef}>
            0 N
          </span>
        </div>
        <div className="gauge-track">
          <div className="gauge-fill" ref={fillRef} />
          <div
            className="gauge-zone safe"
            style={{
              left: `${(CFG.SAFE_LO / CFG.LIMIT) * 100}%`,
              width: `${((CFG.SAFE_HI - CFG.SAFE_LO) / CFG.LIMIT) * 100}%`,
            }}
          />
          <div
            className="gauge-zone over"
            style={{
              left: `${(CFG.SAFE_HI / CFG.LIMIT) * 100}%`,
              width: `${((CFG.LIMIT - CFG.SAFE_HI) / CFG.LIMIT) * 100}%`,
            }}
          />
          <div className="gauge-limit" />
        </div>
        <div className="gauge-scale">
          <span>0</span>
          <span>虚线区 = 该松手了</span>
          <span>1600 N 断裂线</span>
        </div>
      </div>

      <button
        type="button"
        className="pedal locked"
        ref={pedalRef}
        onPointerDown={(e) => {
          e.preventDefault();
          holdRef.current = true;
        }}
      >
        <span className="pl" ref={pedalLabelRef}>
          准备中
        </span>
        <span className="ps" ref={pedalSubRef}>
          STANDBY
        </span>
      </button>
      <p className="hint" ref={hintRef}>
        绿灯亮起后开始制动计时
      </p>
    </div>
  );
}

/* ================= 结算 ================= */

export function Result({
  run,
  submit,
  saving,
  bestBefore,
  onRetry,
}: {
  run: RunState;
  submit: Submit | null;
  saving: boolean;
  bestBefore: number | null;
  onRetry: () => void;
}) {
  const sum = summarize(run);
  const ok = run.outcome === "stopped";
  const isBest = ok && (bestBefore === null || sum.total < bestBefore);
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;
    const draw = () => drawChart(canvas, run.samples, run.goT, ok);
    const id = requestAnimationFrame(draw);
    window.addEventListener("resize", draw);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", draw);
    };
  }, [run, ok]);

  const eyebrow = ok ? (isBest ? "NEW PERSONAL BEST" : "RUN COMPLETE") : "TEST FAILED";
  const eyebrowCls = ok ? "eyebrow mint" : "eyebrow warn";
  const title = ok ? (isBest ? "新纪录！" : "挑战完成") : run.outcome === "fracture" ? "踏板断裂" : "未制动";

  const sub = ok
    ? `制动 ${sum.braking?.toFixed(2)} 秒 · 距离 ${sum.dist.toFixed(1)} 米 · ${isBest ? "个人最快！" : "继续压低用时"}`
    : run.outcome === "fracture"
      ? "提前松开按压区，给踏板惯性留出余量。"
      : "车速达到 100 km/h 后，需要立即踩下刹车踏板。";

  return (
    <div className="card">
      <p className={eyebrowCls}>{eyebrow}</p>
      <h1 className="title">{title}</h1>
      <p className="sub">{sub}</p>

      {ok ? (
        <>
          <div className="big">
            {sum.total.toFixed(3)}
            <span className="u">s</span>
          </div>
          <p className="big-cap">最终成绩 · 从首次达到 100 到停稳，越短越好</p>
        </>
      ) : run.outcome === "fracture" ? (
        <>
          <div className="big danger">
            {Math.round(run.peak)}
            <span className="u">N</span>
          </div>
          <p className="big-cap">峰值力度 · 踏板承受极限 {CFG.LIMIT} N</p>
        </>
      ) : (
        <>
          <div className="big danger">
            {run.entryKmh.toFixed(1)}
            <span className="u">km/h</span>
          </div>
          <p className="big-cap">入刹速度 · 全程未踩下刹车</p>
        </>
      )}

      <dl className="stats">
        <div className="stat">
          <dt>反应时间</dt>
          <dd>{sum.reaction === null ? "--" : <>{sum.reaction.toFixed(3)}<small>s</small></>}</dd>
        </div>
        <div className="stat">
          <dt>入刹速度</dt>
          <dd>
            {run.entryKmh.toFixed(1)}
            <small>km/h</small>
          </dd>
        </div>
        <div className="stat">
          <dt>峰值力度</dt>
          <dd>
            {Math.round(run.peak)}
            <small>N</small>
          </dd>
        </div>
      </dl>

      <div className="formula">
        {ok
          ? `反应 ${sum.reaction?.toFixed(3)} s + 制动 ${sum.braking?.toFixed(3)} s = 总用时 ${sum.total.toFixed(3)} s`
          : `挑战目标：100 km/h 后，用最短时间安全停稳`}
      </div>

      <div className="chart-wrap">
        <div className="chart-legend">
          <span className="t">本局曲线 · 竖直虚线为计时起点</span>
          <span className="a">车速 km/h</span>
          <span className="b">力度 N</span>
        </div>
        <canvas className="chart-canvas" ref={chartCanvasRef} />
        <div className="chart-foot">
          启动后 {run.elapsed.toFixed(2)} s · {(run.v * KMH).toFixed(1)} km/h · {Math.round(run.F)} N
        </div>
      </div>

      {ok &&
        (saving ? (
          <p className="rank-badge plain">正在写入排行榜…</p>
        ) : submit ? (
          <p className="rank-badge">
            已录入排行榜 · 第 {submit.rank} 名 · 个人最好 {submit.best.toFixed(3)} s
          </p>
        ) : (
          <p className="rank-badge plain">成绩未写入排行榜（离线）</p>
        ))}

      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          再次挑战
          <IconArrowUpRight />
        </button>
        <Link className="btn btn-ghost" href="/leaderboard">
          排行榜
        </Link>
      </div>
      <div className="btn-row">
        <Link className="btn btn-ghost" href="/">
          返回首页
        </Link>
      </div>
    </div>
  );
}
