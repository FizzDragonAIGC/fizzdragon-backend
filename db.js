/**
 * FizzDragon - Supabase 數據庫集成
 * 
 * 環境變量:
 * - SUPABASE_URL: 項目URL
 * - SUPABASE_ANON_KEY: 匿名公鑰
 */

import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客戶端
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;

export function initSupabase() {
    if (!supabaseUrl || !supabaseKey) {
        console.log('⚠️ Supabase 未配置，使用本地存儲');
        return false;
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase 已連接:', supabaseUrl);
    return true;
}

export function isSupabaseEnabled() {
    return supabase !== null;
}

// ========== 用戶項目 CRUD ==========

/**
 * 獲取用戶所有項目
 */
export async function getUserProjects(userId) {
    if (!supabase) return null;
    
    const { data, error } = await supabase
        .from('user_projects')
        .select('*')
        .eq('user_id', userId);
    
    if (error) {
        console.error('[DB] 獲取項目失敗:', error.message);
        return null;
    }
    
    // 轉換為 {projectId: projectData} 格式
    const projects = {};
    for (const row of data || []) {
        projects[row.project_id] = row.data;
    }
    return projects;
}

/**
 * 保存/更新單個項目
 */
export async function saveUserProject(userId, projectId, projectData) {
    if (!supabase) return false;
    
    const { error } = await supabase
        .from('user_projects')
        .upsert({
            user_id: userId,
            project_id: projectId,
            data: projectData,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'user_id,project_id'
        });
    
    if (error) {
        console.error('[DB] 保存項目失敗:', error.message);
        return false;
    }
    
    console.log(`[DB] ✅ 保存項目 ${userId}/${projectId}`);
    return true;
}

/**
 * 刪除項目
 */
export async function deleteUserProject(userId, projectId) {
    if (!supabase) return false;
    
    const { error } = await supabase
        .from('user_projects')
        .delete()
        .eq('user_id', userId)
        .eq('project_id', projectId);
    
    if (error) {
        console.error('[DB] 刪除項目失敗:', error.message);
        return false;
    }
    
    return true;
}

/**
 * 批量保存用戶所有項目
 */
export async function saveAllUserProjects(userId, projects) {
    if (!supabase) return false;
    
    const rows = Object.entries(projects).map(([projectId, data]) => ({
        user_id: userId,
        project_id: projectId,
        data: data,
        updated_at: new Date().toISOString()
    }));
    
    const { error } = await supabase
        .from('user_projects')
        .upsert(rows, { onConflict: 'user_id,project_id' });
    
    if (error) {
        console.error('[DB] 批量保存失敗:', error.message);
        return false;
    }
    
    console.log(`[DB] ✅ 批量保存 ${rows.length} 個項目`);
    return true;
}

// ========== 用戶認證（可選）==========

export async function getUser(username) {
    if (!supabase) return null;
    
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();
    
    if (error) return null;
    return data;
}

export async function createUser(userData) {
    if (!supabase) return null;
    
    const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();
    
    if (error) {
        console.error('[DB] 創建用戶失敗:', error.message);
        return null;
    }
    return data;
}
