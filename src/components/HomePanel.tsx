"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowUpRight } from "@/components/icons";
import { getPlayerName, setPlayerName } from "@/lib/player";

type Me = { name: string; best: number | null; rank: number | null } | null;

export default function HomePanel() {
  const [name, setName] = useState("你");
  const [me, setMe] = useState<Me>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(getPlayerName());
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/scores?limit=1&name=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { me?: Me } | null) => {
        if (alive) setMe(d?.me ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [name]);

  return (
    <div className="card">
      <p className="eyebrow">Brake Practice Simulator</p>
      <h1 className="title">刹车练习模拟器</h1>
      <p className="sub">从 100 km/h 踩到停稳。踏板承受极限 1600 N，超过即断裂。</p>

      <dl className="spec-strip">
        <div className="spec">
          <dt>目标</dt>
          <dd className="mint">100 → 0</dd>
        </div>
        <div className="spec">
          <dt>踏板极限</dt>
          <dd>1600 N</dd>
        </div>
        <div className="spec">
          <dt>你的最快</dt>
          <dd className="orange num">{me?.best != null ? `${me.best.toFixed(3)}s` : "--"}</dd>
        </div>
      </dl>

      <div className="name-row">
        <label htmlFor="player">车手名</label>
        <input
          id="player"
          value={name}
          maxLength={16}
          placeholder="你"
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          onBlur={() => {
            const next = name.trim() || "你";
            setName(next);
            setPlayerName(next);
            setSaved(true);
            window.setTimeout(() => setSaved(false), 1600);
          }}
        />
        <span className={`saved${saved ? " on" : ""}`}>已保存</span>
      </div>

      <div className="btn-row">
        <Link className="btn btn-primary" href="/play">
          开始测试
          <IconArrowUpRight />
        </Link>
        <Link className="btn btn-ghost" href="/leaderboard">
          排行榜
        </Link>
      </div>

      <p className="note">
        娱乐向简化物理模型，不代表任何真实车型数据
        {me?.rank != null && me.best != null ? ` · 当前榜上第 ${me.rank} 名` : ""}
      </p>
    </div>
  );
}
