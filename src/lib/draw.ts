import { CFG, type Sample } from "./physics";

export type Surface = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
};

const MONO = 'var(--mono)';
let monoFamily = "monospace";

export function fitCanvas(canvas: HTMLCanvasElement, fallbackH: number): Surface {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 600;
  const h = canvas.clientHeight || fallbackH;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  monoFamily =
    getComputedStyle(document.body).getPropertyValue("--mono").trim() ||
    getComputedStyle(document.body).fontFamily ||
    "monospace";
  return { ctx, w, h };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 俯视公路：车道虚线随车速滚动，并带一点速度拉丝。 */
export function drawRoad(
  s: Surface,
  opts: { speedKmh: number; forceN: number; offset: number; danger: boolean },
) {
  const { ctx, w, h } = s;
  const { speedKmh, forceN, offset, danger } = opts;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#14191b";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 9);
  ctx.lineTo(w, 9);
  ctx.moveTo(0, h - 9);
  ctx.lineTo(w, h - 9);
  ctx.stroke();

  ctx.strokeStyle = danger ? "rgba(239,107,61,.75)" : "rgba(255,255,255,.20)";
  ctx.lineWidth = 3;
  ctx.setLineDash([30, 38]);
  ctx.lineDashOffset = -offset;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const n = Math.round(Math.min(Math.max(speedKmh * 1.4, 0), 30));
  ctx.strokeStyle = "rgba(111,227,198,.16)";
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const top = i % 2 === 0;
    const y = top ? 12 + ((i * 17) % 10) : h - 12 - ((i * 17) % 10);
    const len = 12 + (i % 5) * 10;
    const x = ((i * 151 + offset * -3.4) % (w + 90)) - 90;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }

  const cx = w * 0.5;
  const cy = h / 2;
  const cw = 44;
  const ch = 26;
  roundRect(ctx, cx - cw / 2, cy - ch / 2, cw, ch, 7);
  ctx.fillStyle = "#2b343a";
  ctx.fill();
  ctx.strokeStyle = speedKmh > 1 ? "rgba(111,227,198,.5)" : "rgba(255,255,255,.16)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = "rgba(111,227,198,.55)";
  ctx.fillRect(cx + cw / 2 - 9, cy - 9, 4, 6);
  ctx.fillRect(cx + cw / 2 - 9, cy + 3, 4, 6);
  ctx.fillStyle = forceN > 200 ? "rgba(239,107,61,.95)" : "rgba(120,80,70,.4)";
  ctx.fillRect(cx - cw / 2 + 3, cy - 10, 4, 7);
  ctx.fillRect(cx - cw / 2 + 3, cy + 3, 4, 7);
}

function niceStep(x: number) {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** 双轴曲线：车速 (km/h, mint) 与踏板力度 (N, orange)。 */
export function drawChart(canvas: HTMLCanvasElement, samples: Sample[], goT: number, ok: boolean) {
  const { ctx, w, h } = fitCanvas(canvas, 190);
  void MONO;
  ctx.clearRect(0, 0, w, h);
  if (samples.length < 2) return;

  const L = 40;
  const R = w - 46;
  const T = 14;
  const B = h - 26;

  const tMaxRaw = Math.max(...samples.map((s) => s.t), goT + 1);
  const step = niceStep(tMaxRaw / 4);
  const tMax = Math.ceil(tMaxRaw / step) * step;
  const SPD_MAX = 200;

  const X = (t: number) => L + (t / tMax) * (R - L);
  const Yv = (v: number) => B - (Math.min(Math.max(v, 0), SPD_MAX) / SPD_MAX) * (B - T);
  const Yf = (f: number) => B - (Math.min(Math.max(f, 0), CFG.LIMIT) / CFG.LIMIT) * (B - T);

  ctx.font = `10px ${monoFamily}`;
  ctx.lineWidth = 1;
  for (let t = 0; t <= tMax + 1e-6; t += step) {
    const x = X(t);
    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.beginPath();
    ctx.moveTo(x, T);
    ctx.lineTo(x, B);
    ctx.stroke();
    ctx.fillStyle = "#68737a";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${t.toFixed(0)}s`, x, B + 7);
  }
  for (const v of [0, 100, 200]) {
    const y = Yv(v);
    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.beginPath();
    ctx.moveTo(L, y);
    ctx.lineTo(R, y);
    ctx.stroke();
    ctx.fillStyle = "#68737a";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(String(v), L - 8, y);
  }
  for (const f of [0, 800, 1600]) {
    ctx.fillStyle = "#7a6a60";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(String(f), R + 8, Yf(f));
  }

  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(255,255,255,.42)";
  ctx.beginPath();
  ctx.moveTo(X(goT), T);
  ctx.lineTo(X(goT), B);
  ctx.stroke();
  ctx.setLineDash([]);

  const line = (fy: (s: Sample) => number, color: string, lw: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = X(s.t);
      const y = fy(s);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  line((s) => Yv(s.v), "#6fe3c6", 2);
  line((s) => Yf(s.f), "#f0855c", 1.7);

  if (!ok) {
    const last = samples[samples.length - 1];
    ctx.beginPath();
    ctx.arc(X(last.t), Yf(last.f), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ef6b3d";
    ctx.fill();
  }
}
