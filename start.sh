#!/bin/bash
# AI番劇工作台 啟動腳本

echo "🎬 AI番劇工作台 Agent Server"
echo "=============================="

# 檢查 API Key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  未設置 ANTHROPIC_API_KEY"
    echo ""
    echo "請先設置 API Key："
    echo "  export ANTHROPIC_API_KEY=sk-ant-xxxxx"
    echo ""
    echo "或創建 .env 文件："
    echo "  echo 'ANTHROPIC_API_KEY=sk-ant-xxxxx' > .env"
    echo ""
    
    # 嘗試讀取 .env
    if [ -f .env ]; then
        echo "📄 找到 .env 文件，載入中..."
        export $(cat .env | xargs)
    fi
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ 無法啟動：缺少 ANTHROPIC_API_KEY"
    exit 1
fi

echo "✅ API Key 已配置"
echo "🚀 啟動 Agent Server (port 3001)..."
echo ""

node server.js
