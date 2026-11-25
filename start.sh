#!/usr/bin/env bash
# 明路服务端 · 前台启动脚本（Linux / macOS）
# 用法：
#   DASHSCOPE_API_KEY=sk-xxx ./start.sh
#   PORT=8081 ./start.sh
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 找不到 node，请先安装 Node.js 22 或更高版本"
  exit 1
fi

MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$MAJOR" -lt 22 ]; then
  echo "[错误] 当前 Node 版本为 $(node -v)，需要 22 或更高"
  exit 1
fi

if [ -z "${DASHSCOPE_API_KEY:-}" ]; then
  echo "[提示] 未设置 DASHSCOPE_API_KEY：AI 会显示未接通，其余功能正常。"
  echo "       设置方式：DASHSCOPE_API_KEY=sk-xxx ./start.sh"
fi

export PORT="${PORT:-8081}"
export HOST="${HOST:-0.0.0.0}"
echo "[启动] http://${HOST}:${PORT}/"
exec node server.js
