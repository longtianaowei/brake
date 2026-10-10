const KEY = "brake-sim.player";

/** 留空入榜时用的兜底名。 */
export const FALLBACK_PLAYER = "匿名老司机";

export function getPlayerName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setPlayerName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = name.trim();
    if (next) window.localStorage.setItem(KEY, next);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* 隐私模式等场景下忽略 */
  }
}

/** 真正写进排行榜的名字。 */
export function resolvePlayerName(): string {
  return getPlayerName() || FALLBACK_PLAYER;
}
