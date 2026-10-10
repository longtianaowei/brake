#!/bin/sh
set -e

# 绑定挂载进来的目录通常属于宿主机用户，而应用要以非 root 运行。
# 这里在 root 下把数据目录的所有权修正好，再切到 node 用户启动，
# 免得 SQLite 报 "unable to open database file"。
DATA_DIR="$(dirname "${BRAKE_DB_PATH:-/data/brake.db}")"
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
  exec /sbin/su-exec node "$@"
fi

exec "$@"
