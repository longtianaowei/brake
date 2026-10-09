"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getPlayerName } from "@/lib/player";

type Row = { rank: number; name: string; time: number; runs: number };
type Me = { name: string; best: number | null; rank: number | null } | null;

export default function Leaderboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [me, setMe] = useState<Me>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/scores?limit=50&name=${encodeURIComponent(getPlayerName())}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: { rows: Row[]; me: Me }) => {
        if (!alive) return;
        setRows(d.rows);
        setMe(d.me);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="card">
      <div className="lb-head">
        <div>
          <div className="k">100 → 0</div>
          <h2>最速老司机</h2>
        </div>
        <Link className="pill-top" href="/">
          返回首页
        </Link>
      </div>

      <div className="lb-cols">
        <span>排名</span>
        <span>老司机</span>
        <span>成绩</span>
      </div>

      <div>
        {error ? (
          <p className="lb-empty">排行榜读取失败，稍后再试。</p>
        ) : rows === null ? (
          <p className="lb-empty">加载中…</p>
        ) : rows.length === 0 ? (
          <p className="lb-empty">还没有成绩，先跑一把。</p>
        ) : (
          rows.map((r) => {
            const isMe = me != null && r.name === me.name;
            return (
              <div
                key={`${r.name}-${r.rank}`}
                className={`lb-row${r.rank <= 3 ? " top3" : ""}${isMe ? " me" : ""}`}
              >
                <span className="rk">{String(r.rank).padStart(2, "0")}</span>
                <span className="nm">{r.name}</span>
                <span className="sc">
                  {r.time.toFixed(3)}
                  <small>s</small>
                </span>
              </div>
            );
          })
        )}
      </div>

      {me?.best != null && me.rank != null && (
        <span className="lb-tip">
          {me.name} · 第 {me.rank} 名 · {me.best.toFixed(3)}s 最好成绩
        </span>
      )}

      <div className="btn-row">
        <Link className="btn btn-primary" href="/play">
          开始测试
        </Link>
        <Link className="btn btn-ghost" href="/">
          返回首页
        </Link>
      </div>
    </div>
  );
}
