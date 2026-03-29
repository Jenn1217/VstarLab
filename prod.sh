#!/bin/bash
# 财析入微 - 生产部署脚本 (prod.sh)
# 使用方式: ./prod.sh
# 依赖: Node.js, Python3, pm2 (npm install -g pm2)
# ================================================

set -e  # 遇到错误立即终止

# --- 路径配置 ---
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_DIR="$PROJECT_ROOT/backend"
STATIC_DIR="$BACKEND_DIR/static"
LOG_FILE="$BACKEND_DIR/server.log"
PYTHON_BIN="$BACKEND_DIR/venv/bin/python3"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
UVICORN_WORKERS="${UVICORN_WORKERS:-1}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://localhost:$PORT}"

echo "======================================"
echo "  🚀 财析入微 - 生产部署启动中..."
echo "======================================"

# --- 检查依赖 ---
for cmd in node npm python3; do
  if ! command -v $cmd &>/dev/null; then
    echo "❌ 未找到命令: $cmd，请先安装。"
    exit 1
  fi
done

# --- 检查 pm2 ---
if ! command -v pm2 &>/dev/null; then
  echo "⚙️  pm2 未安装，正在全局安装..."
  npm install -g pm2
fi

# --- Step 1: 清理旧服务 ---
echo ""
echo "🧹 [1/4] 停止并清理旧服务..."
pm2 delete fintech-backend 2>/dev/null || true
# 强制清除所有占用目标端口的进程（包括旧的 dev.sh 或 uvicorn 残留）
echo "   - 清理 $PORT 端口残留进程..."
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
pkill -f "uvicorn.*app:app" 2>/dev/null || true
pkill -f "app.py" 2>/dev/null || true
sleep 2

# --- Step 2: 检查/重建虚拟环境 ---
echo ""
echo "🐍 [2/4] 检查 Python 虚拟环境..."
if [ ! -f "$PYTHON_BIN" ]; then
  echo "   - venv 不存在或已损坏，正在重新创建..."
  rm -rf "$BACKEND_DIR/venv"
  python3 -m venv "$BACKEND_DIR/venv"
  "$BACKEND_DIR/venv/bin/pip" install --upgrade pip -q
  "$BACKEND_DIR/venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt" -q
  echo "   ✅ Python 虚拟环境创建并安装完毕。"
else
  echo "   ✅ 虚拟环境正常，跳过安装。"
fi

# --- Step 3: 构建前端 ---
echo ""
echo "⚛️  [3/4] 构建前端..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
  echo "   - 安装前端依赖..."
  npm install --silent
fi
npm run build
echo "   ✅ 前端构建完成 → $STATIC_DIR"

# --- Step 4: 用 pm2 常驻启动后端 ---
echo ""
echo "🌐 [4/4] 使用 pm2 启动后端服务（端口 $PORT）..."
cd "$BACKEND_DIR"
rm -f "$LOG_FILE"

if [ -f "$BACKEND_DIR/.env" ]; then
  set -a
  source "$BACKEND_DIR/.env"
  set +a
fi

chmod +x "$BACKEND_DIR/start_backend.sh"

# pm2 无法正确处理路径中的空格，临时用无空格的软链接绕过此限制
ln -sf "$BACKEND_DIR/start_backend.sh" /tmp/fintech_start.sh

HOST="$HOST" PORT="$PORT" UVICORN_WORKERS="$UVICORN_WORKERS" \
pm2 start /tmp/fintech_start.sh \
  --name "fintech-backend" \
  --log "$LOG_FILE" \
  --restart-delay 3000 \
  --max-restarts 10 \
  --update-env

# 保存进程列表（服务器重启后 pm2 可恢复）
pm2 save
pm2 startup 2>/dev/null | tail -1

echo ""
echo "======================================"
echo "✅ 部署完成！"
echo "   - 后端 API：$PUBLIC_BASE_URL"
echo "   - 前端静态：$PUBLIC_BASE_URL"
echo ""
echo "📄 查看日志:   pm2 logs fintech-backend"
echo "🔄 重启服务:   pm2 restart fintech-backend"
echo "🛑 停止服务:   pm2 stop fintech-backend"
echo "======================================"
