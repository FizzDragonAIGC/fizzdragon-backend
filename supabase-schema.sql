-- FizzDragon Supabase Schema
-- 在 Supabase SQL Editor 中運行此腳本

-- 用戶項目表
CREATE TABLE IF NOT EXISTS user_projects (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 確保每個用戶的項目ID唯一
    UNIQUE(user_id, project_id)
);

-- 索引優化查詢
CREATE INDEX IF NOT EXISTS idx_user_projects_user_id ON user_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_updated ON user_projects(updated_at DESC);

-- 用戶表（可選，如果需要用戶認證）
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 啟用 Row Level Security (可選，更安全)
-- ALTER TABLE user_projects ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can only access own projects" ON user_projects
--     FOR ALL USING (user_id = current_user);

-- 測試插入
-- INSERT INTO user_projects (user_id, project_id, data) 
-- VALUES ('test', 'test_project', '{"name": "Test"}');
