import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type ScoreInput = {
  name: string;
  time: number;
  reaction: number | null;
  entry: number | null;
  peak: number | null;
  distance: number | null;
};

export type LeaderRow = {
  rank: number;
  name: string;
  time: number;
  runs: number;
};

export type SubmitResult = {
  id: number;
  rank: number;
  total: number;
  best: number;
  isBest: boolean;
};

/** 初始榜单：首次建库时写入，之后由玩家成绩覆盖。 */
const SEED: Array<[string, number]> = [
  ["美国老司机", 3.1],
  ["台湾老司机", 3.1],
  ["上海老司机", 3.1],
  ["广东老司机", 3.104],
  ["浙江老司机", 3.118],
  ["香港老司机", 3.142],
  ["香港老司机", 3.166],
  ["美国老司机", 3.19],
  ["德国老司机", 3.214],
  ["浙江老司机", 3.238],
  ["新加坡老司机", 3.262],
  ["浙江老司机", 3.286],
  ["日本老司机", 3.31],
  ["韩国老司机", 3.334],
  ["北京老司机", 3.358],
  ["广州老司机", 3.382],
  ["重庆老司机", 3.406],
  ["成都老司机", 3.43],
];

/**
 * 数据库位置。部署时用 BRAKE_DB_PATH 指向持久卷，例如 /data/brake.db。
 * 默认是项目下的 data/brake.db，本地开发零配置。
 */
const DB_FILE = process.env.BRAKE_DB_PATH?.trim() || path.join(process.cwd(), "data", "brake.db");
const DATA_DIR = path.dirname(DB_FILE);

const cache = globalThis as unknown as { __brakeDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (cache.__brakeDb) return cache.__brakeDb;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_FILE);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      time       REAL    NOT NULL,
      reaction   REAL,
      entry      REAL,
      peak       REAL,
      distance   REAL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scores_time ON scores(time);
    CREATE INDEX IF NOT EXISTS idx_scores_name ON scores(name);
  `);

  const { n } = db.prepare("SELECT COUNT(*) AS n FROM scores").get() as { n: number };
  if (n === 0) {
    const ins = db.prepare("INSERT INTO scores (name, time) VALUES (?, ?)");
    db.exec("BEGIN");
    try {
      for (const [name, time] of SEED) ins.run(name, time);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  cache.__brakeDb = db;
  return db;
}

/** 排行榜：每人只取最好成绩。 */
export function listLeaderboard(limit = 50): LeaderRow[] {
  const rows = getDb()
    .prepare(
      `SELECT name, MIN(time) AS time, COUNT(*) AS runs
         FROM scores
        GROUP BY name
        ORDER BY time ASC, name ASC
        LIMIT ?`,
    )
    .all(limit) as Array<{ name: string; time: number; runs: number }>;

  return rows.map((r, i) => ({ rank: i + 1, name: r.name, time: r.time, runs: r.runs }));
}

export function bestFor(name: string): number | null {
  const row = getDb()
    .prepare("SELECT MIN(time) AS time FROM scores WHERE name = ?")
    .get(name) as { time: number | null } | undefined;
  return row?.time ?? null;
}

export function rankOf(name: string): number | null {
  const best = bestFor(name);
  if (best === null) return null;
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS ahead FROM (
         SELECT name, MIN(time) AS t FROM scores GROUP BY name
       ) WHERE t < ?`,
    )
    .get(best) as { ahead: number };
  return row.ahead + 1;
}

export function submitScore(input: ScoreInput): SubmitResult {
  const db = getDb();
  const before = bestFor(input.name);

  const info = db
    .prepare(
      `INSERT INTO scores (name, time, reaction, entry, peak, distance)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.name, input.time, input.reaction, input.entry, input.peak, input.distance);

  const best = bestFor(input.name) ?? input.time;
  return {
    id: Number(info.lastInsertRowid),
    rank: rankOf(input.name) ?? 1,
    total: input.time,
    best,
    isBest: before === null || input.time < before,
  };
}
