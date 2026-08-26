#!/bin/bash
# ============================================================
# 日语学习 - 启动脚本
# 同时启动:
#   1. HTTP 静态服务器 (端口 8769)
#   2. Edge TTS 代理服务器 (端口 3000)
# ============================================================

cd "$(dirname "$0")"

echo "=============================================="
echo "  日语学习 - 启动中..."
echo "=============================================="

# 检查 edge-tts 是否已安装
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到 python3，请先安装 Python 3"
    exit 1
fi

if ! python3 -c "import edge_tts" 2>/dev/null; then
    echo "⚠️  edge-tts 未安装，正在安装..."
    pip3 install edge-tts
fi

# 启动 Edge TTS 代理服务器
echo "📢 启动 Edge TTS 代理服务器 (端口 3000)..."
node server.js &
TTS_PID=$!

# 等待 TTS 代理启动
sleep 2

# 启动 HTTP 静态服务器
echo "🌐 启动 HTTP 服务器 (端口 8769)..."
python3 -m http.server 8769 &
HTTP_PID=$!

echo ""
echo "=============================================="
echo "  ✅ 服务已启动！"
echo ""
echo "  📚 课程学习: http://localhost:8769/lesson.html?id=day-001"
echo "  あ 假名训练: http://localhost:8769/kana.html"
echo "  🎨 Edge TTS: http://localhost:3000/health"
echo ""
echo "  按 Ctrl+C 停止所有服务"
echo "=============================================="

# 等待用户中断
trap "echo -e '\n🛑 正在停止服务...'; kill $TTS_PID $HTTP_PID 2>/dev/null; exit" SIGINT SIGTERM

wait
