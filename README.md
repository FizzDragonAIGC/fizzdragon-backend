# AI番劇工作台 Agent Server

基於 Claude SDK 的多 Agent 後端服務。

## 快速開始

### 1. 安裝依賴
```bash
cd server
npm install
```

### 2. 設置 API Key
```bash
# 方式一：環境變量
export ANTHROPIC_API_KEY=sk-ant-xxxxx

# 方式二：.env 文件
echo "ANTHROPIC_API_KEY=sk-ant-xxxxx" > .env
```

### 3. 啟動服務
```bash
# 開發模式（自動重載）
npm run dev

# 生產模式
npm start

# 或使用啟動腳本
chmod +x start.sh && ./start.sh
```

### 4. 啟動前端
```bash
cd ..  # 回到 v3 目錄
python3 -m http.server 8080
# 訪問 http://localhost:8080
```

## API 端點

| 端點 | Agent | 功能 |
|------|-------|------|
| POST /api/interview | 採訪Agent | 深度閱讀小說，生成針對性問題 |
| POST /api/concept | 高概念Agent | 生成Logline和故事定位 |
| POST /api/chapters | 章節Agent | 分析章節結構和鉤子設計 |
| POST /api/characters | 角色Agent | 基於Lajos Egri理論設計人物 |
| POST /api/design | 美術Agent | 設計場景、服裝、道具 |
| POST /api/script | 編劇Agent | 小說改編為劇本格式 |
| POST /api/storyboard | 分鏡Agent | 生成分鏡表和AI繪圖Prompt |
| GET /api/health | 健康檢查 | 檢查服務狀態和API Key |

## 請求示例

### 採訪Agent
```bash
curl -X POST http://localhost:3001/api/interview \
  -H "Content-Type: application/json" \
  -d '{"novel": "小說內容...", "title": "作品名"}'
```

### 高概念Agent
```bash
curl -X POST http://localhost:3001/api/concept \
  -H "Content-Type: application/json" \
  -d '{"analysis": {...}, "interview": {...}}'
```

## 模型配置

默認使用 `claude-sonnet-4-20250514`

可在 `server.js` 中修改 `MODEL` 常量切換模型：
- `claude-sonnet-4-20250514` (推薦，平衡)
- `claude-3-5-sonnet-20241022` (快速)
- `claude-3-opus-20240229` (最強)

## 架構

```
Frontend (index.html)
       │
       ▼
Agent Server (Node.js + Express)
       │
       ▼
Anthropic Claude API
```

## 開發

```bash
# 監聽文件變化自動重載
npm run dev

# 查看日誌
tail -f server.log
```
