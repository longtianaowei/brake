"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowUpRight } from "@/components/icons";
import { FALLBACK_PLAYER, getPlayerName, setPlayerName } from "@/lib/player";

type Me = { name: string; best: number | null; rank: number | null } | null;

export default function HomePanel() {
  const [name, setName] = useState("");
  const [me, setMe] = useState<Me>(null);
  const [saved, setSaved] = useState(false);
  const lookupName = name.trim() || FALLBACK_PLAYER;

  useEffect(() => {
    setName(getPlayerName());
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/scores?limit=1&name=${encodeURIComponent(lookupName)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { me?: Me } | null) => {
        if (alive) setMe(d?.me ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lookupName]);

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
          placeholder="填写车手名"
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          onBlur={() => {
            const next = name.trim();
            setName(next);
            setPlayerName(next);
            setSaved(true);
            window.setTimeout(() => setSaved(false), 1600);
          }}
        />
        {name.trim() ? (
          <span className={`saved${saved ? " on" : ""}`}>已保存</span>
        ) : (
          <span className="name-hint">留空记为{FALLBACK_PLAYER}</span>
        )}
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

      <p className="disclaimer">
        本模拟器为娱乐向简化物理模型，与任何车企、任何真实车型及任何真实事件均无关联，请勿对号入座或无端联想。
        所有数值均为虚构设定，不代表真实车辆的性能、质量或安全性。
      </p>

      {name.trim() && me?.rank != null && me.best != null && (
        <p className="note">当前榜上第 {me.rank} 名</p>
      )}
    </div>
  );
}
