const KEY = "brake-sim.player";
export const DEFAULT_PLAYER = "你";

export function getPlayerName(): string {
  if (typeof window === "undefined") return DEFAULT_PLAYER;
  try {
    return window.localStorage.getItem(KEY)?.trim() || DEFAULT_PLAYER;
  } catch {
    return DEFAULT_PLAYER;
  }
}

export function setPlayerName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, name.trim() || DEFAULT_PLAYER);
  } catch {
    /* 隐私模式等场景下忽略 */
  }
}
