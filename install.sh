#!/bin/bash
# 财析入微 (Fintech Agentic Platform) 自动安装脚本
# ===============================================

echo "===================================="
echo "    正在执行全栈「一键部署」程序"
echo "===================================="
echo ""

# 检查 Node.js 环境
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未检测到 Node.js (npm). 请先安装 Node.js 后重试。"
    exit 1
fi

# 检查 Python 环境
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未检测到 Python3. 请先安装 Python3 面向后端依赖。"
    exit 1
fi

echo "🟢 1. 正在进入 Frontend 目录，安装前端 NPM 依赖..."
cd frontend || exit 1
npm install
cd ..
echo "✅ 前端依赖安装成功！"
echo ""

echo "🟢 2. 正在进入 Backend 目录，配置 Python 虚拟环境..."
cd backend || exit 1

# 检查并创建虚拟环境
if [ ! -d "venv" ]; then
    echo "   - 正在创建 venv 虚拟环境..."
    python3 -m venv venv
else
    echo "   - 检测到已存在 venv，直接使用..."
fi

# 激活环境并安装依赖
echo "   - 正在激活环境变量并执行 pip install..."
source venv/bin/activate
pip install --upgrade pip

if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
else
    echo "❌ 错误: 未找到 requirements.txt 文件！"
    exit 1
fi
cd ..

echo ""
echo "🎉 安装完成！所有环境均已准备就绪。"
echo "===================================="
echo "👉 后续启动方法："
echo "   您可以直接运行: ./dev.sh"
echo "   (前台会自动在 localhost:3000 上打开，后台将在 8000 端口服务)"
echo "===================================="
