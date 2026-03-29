#!/bin/bash
# 后端启动包装脚本 (被 pm2 调用，以规避路径空格问题)
# prod.sh 会 ln -s 本脚本到 /tmp；此处必须解析符号链接，否则 SCRIPT_DIR 会变成 /tmp
SCRIPT_SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SCRIPT_SOURCE" ]; do
  _link_dir="$(cd "$(dirname "$SCRIPT_SOURCE")" && pwd)"
  _target="$(readlink "$SCRIPT_SOURCE")"
  if [[ "$_target" != /* ]]; then
    SCRIPT_SOURCE="$_link_dir/$_target"
  else
    SCRIPT_SOURCE="$_target"
  fi
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SOURCE")" && pwd)"
cd "$SCRIPT_DIR"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
WORKERS="${UVICORN_WORKERS:-1}"

if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

exec "$SCRIPT_DIR/venv/bin/uvicorn" app:app --host "$HOST" --port "$PORT" --workers "$WORKERS"
