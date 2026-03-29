#!/bin/bash

# --- 配置 ---
# 获取脚本所在的目录作为项目根目录
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_DIR="$PROJECT_ROOT/backend"

HOST="${HOST:-0.0.0.0}"
BACKEND_PORT="${PORT:-8000}"
FRONTEND_PORT="${VITE_DEV_PORT:-3000}"
API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:$BACKEND_PORT/api}"

echo "🚀 Starting development environment for fintech260225..."

# 检查环境 (简单示例)
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed."
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed."
    exit 1
fi

# 检查虚拟环境路径是否正确 (针对移动文件夹后的问题)
if [ -d "$BACKEND_DIR/venv" ]; then
    VENV_ACTIVATE="$BACKEND_DIR/venv/bin/activate"
    if [ -f "$VENV_ACTIVATE" ]; then
        # 检查 activate 脚本中的 VIRTUAL_ENV 是否与当前路径匹配
        VENV_PATH_IN_SCRIPT=$(grep "VIRTUAL_ENV=" "$VENV_ACTIVATE" | head -n 1 | cut -d"'" -f2)
        ACTUAL_VENV_PATH="$BACKEND_DIR/venv"
        
        if [ "$VENV_PATH_IN_SCRIPT" != "$ACTUAL_VENV_PATH" ]; then
            echo "⚠️  Detected that the project folder has been moved."
            echo "   Old path: $VENV_PATH_IN_SCRIPT"
            echo "   New path: $ACTUAL_VENV_PATH"
            echo "♻️  Recreating virtual environment to fix path issues..."
            rm -rf "$BACKEND_DIR/venv"
            python3 -m venv "$BACKEND_DIR/venv"
            "$BACKEND_DIR/venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
        fi
    fi
fi

# 杀死旧进程 (如有)
echo "🧹 Cleaning up old services..."
pkill -f "vite" || true
pkill -f "uvicorn.*app:app" || pkill -f "app.py" || true

# 启动后端
echo "🐍 Starting backend (FastAPI)..."
cd "$BACKEND_DIR"
if [ -d "venv" ]; then
    echo "💡 Using virtual environment..."
    HOST="$HOST" PORT="$BACKEND_PORT" ./venv/bin/python3 app.py &
else
    echo "⚠️  Virtual environment not found. Using system python..."
    HOST="$HOST" PORT="$BACKEND_PORT" python3 app.py &
fi
BACKEND_PID=$!

# 启动前端
echo "⚛️ Starting frontend (Vite)..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules/vite" ]; then
    echo "📦 node_modules/vite not found. Installing dependencies (this may take a few minutes)..."
    npm install
fi
VITE_DEV_PORT="$FRONTEND_PORT" \
VITE_DEV_API_TARGET="http://localhost:$BACKEND_PORT" \
VITE_API_BASE_URL="$API_BASE_URL" \
npm run dev &
FRONTEND_PID=$!

echo "✨ Services are running!"
echo "   - Frontend: http://localhost:$FRONTEND_PORT"
echo "   - Backend API: http://localhost:$BACKEND_PORT"
echo "   - API Base URL (frontend): $API_BASE_URL"
echo "Press Ctrl+C to stop all services."

# 捕获退出信号
trap "kill $BACKEND_PID $FRONTEND_PID; echo '🛑 Services stopped.'; exit" SIGINT SIGTERM

wait
