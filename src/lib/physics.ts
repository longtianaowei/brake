/**
 * 刹车练习模拟器的简化物理模型。
 *
 * 核心是踏板的“惯性”：踩下时力度加速上升，松开后力度不会立刻归零，
 * 而是先减速、再反向衰减。所以必须在安全区就松手，否则松手后仍会冲过
 * 断裂线。所有常量集中在这里，方便调平衡。
 */

export const CFG = {
  LIMIT: 1600, // 踏板承受极限 N（超过即断裂）
  SAFE_LO: 1230, // 松开区下沿
  SAFE_HI: 1470, // 松开区上沿（含惯性余量）
  WARN: 1470, // 黄色预警
  DANGER: 1560, // 红色危险
  A_UP: 8000, // 踩下时力度加速度 N/s²
  A_DOWN: 9000, // 松开后力度减速度 N/s²
  VF_MAX: 1500, // 力度变化速率上限 N/s
  GAIN: 0.007, // 每 N 产生的减速度 m/s²
  STOP_V: 0.5, // 判定停稳 (m/s)
  READY_MS: 2600, // 加速阶段时长
  TIMEOUT_MS: 6000, // 迟迟不刹车的超时
  MAX_SAMPLES: 2000,
} as const;

export const KMH = 3.6;

export type Phase = "ready" | "run" | "stopped";
export type Outcome = "none" | "stopped" | "fracture" | "timeout";
export type StepResult = "running" | "stopped" | "fracture" | "timeout";

export type Sample = { t: number; v: number; f: number };

export type RunState = {
  phase: Phase;
  elapsed: number;
  goT: number;
  entryKmh: number;
  v: number;
  F: number;
  vF: number;
  dist: number;
  peak: number;
  firstPress: number | null;
  samples: Sample[];
  outcome: Outcome;
};

export type RunSummary = {
  total: number;
  reaction: number | null;
  braking: number | null;
  entryKmh: number;
  peak: number;
  dist: number;
};

const easeOut = (p: number) => 1 - Math.pow(1 - p, 2.2);

export function createRun(rand: () => number = Math.random): RunState {
  return {
    phase: "ready",
    elapsed: 0,
    goT: CFG.READY_MS / 1000,
    entryKmh: 100 + rand() * 3, // 100.0 ~ 103.0 km/h
    v: 0,
    F: 0,
    vF: 0,
    dist: 0,
    peak: 0,
    firstPress: null,
    samples: [],
    outcome: "none",
  };
}

function push(s: RunState) {
  if (s.samples.length >= CFG.MAX_SAMPLES) return;
  s.samples.push({ t: s.elapsed, v: s.v * KMH, f: s.F });
}

/** 推进一帧。pressing 表示这一帧玩家是否按住踏板。 */
export function advance(s: RunState, dtRaw: number, pressing: boolean): StepResult {
  if (s.phase === "stopped") return "stopped";

  const dt = Math.min(Math.max(dtRaw, 0), 0.05);
  s.elapsed += dt;

  if (s.phase === "ready") {
    const p = Math.min(1, Math.max(0, s.elapsed / (CFG.READY_MS / 1000)));
    s.v = (s.entryKmh / KMH) * easeOut(p);
    if (p >= 1) {
      s.phase = "run";
      s.v = s.entryKmh / KMH;
    }
    push(s);
    return "running";
  }

  // 力度惯性
  if (pressing) {
    if (s.firstPress === null) s.firstPress = s.elapsed;
    s.vF = Math.min(s.vF + CFG.A_UP * dt, CFG.VF_MAX);
  } else {
    s.vF = Math.max(s.vF - CFG.A_DOWN * dt, -CFG.VF_MAX);
  }
  s.F += s.vF * dt;
  if (s.F <= 0) {
    s.F = 0;
    if (s.vF < 0) s.vF = 0;
  }
  if (s.F > s.peak) s.peak = s.F;

  if (s.F > CFG.LIMIT) {
    s.phase = "stopped";
    s.outcome = "fracture";
    push(s);
    return "fracture";
  }

  s.v = Math.max(0, s.v - s.F * CFG.GAIN * dt);
  s.dist += s.v * dt;
  push(s);

  if (s.v <= CFG.STOP_V) {
    s.phase = "stopped";
    s.outcome = "stopped";
    return "stopped";
  }
  if (s.firstPress === null && s.elapsed - s.goT > CFG.TIMEOUT_MS / 1000) {
    s.phase = "stopped";
    s.outcome = "timeout";
    return "timeout";
  }
  return "running";
}

export function summarize(s: RunState): RunSummary {
  const total = Math.max(0, s.elapsed - s.goT);
  const reaction = s.firstPress === null ? null : Math.max(0, s.firstPress - s.goT);
  const braking = reaction === null ? null : Math.max(0, total - reaction);
  return {
    total,
    reaction,
    braking,
    entryKmh: s.entryKmh,
    peak: s.peak,
    dist: s.dist,
  };
}
