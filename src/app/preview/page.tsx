"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Result } from "@/components/Game";
import { advance, createRun, type RunState } from "@/lib/physics";

function sim(mode: string): RunState {
  const s = createRun(() => 0.42);
  let held = false;
  for (let i = 0; i < 12000; i++) {
    if (mode === "fracture") held = true;
    else if (mode === "timeout") held = false;
    else if (!held && s.F < 1360) held = true;
    else if (held && s.F > 1450) held = false;
    const r = advance(s, 1 / 60, held);
    if (r !== "running") break;
  }
  return s;
}

function Body() {
  const v = useSearchParams().get("v") ?? "best";
  const run = sim(v === "fracture" ? "fracture" : v === "timeout" ? "timeout" : "win");
  const bestBefore = v === "best" ? null : v === "done" ? 3.2 : null;
  return (
    <main className="app">
      <Result
        run={run}
        submit={run.outcome === "stopped" ? { rank: 13, total: run.elapsed, best: 3.3, isBest: v === "best" } : null}
        saving={false}
        bestBefore={bestBefore}
        onRetry={() => {}}
      />
    </main>
  );
}

export default function PreviewPage() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  );
}
