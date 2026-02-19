#!/bin/bash
# AI番剧工作台后端启动脚本
# 使用OpenClaw API模式

cd "$(dirname "$0")"

# 停止旧服务
screen -S ai-drama-server -X quit 2>/dev/null
sleep 1

# 启动新服务
screen -dmS ai-drama-server bash -c 'node server-openclaw.js 2>&1 | tee server-output.log'

echo "✅ AI番剧工作台后端已启动"
echo "📡 API地址: http://localhost:3001/api"
echo "📋 日志: tail -f server-output.log"
echo "🔧 管理: screen -r ai-drama-server"

# 等待启动并验证
sleep 3
curl -s http://localhost:3001/api/health
