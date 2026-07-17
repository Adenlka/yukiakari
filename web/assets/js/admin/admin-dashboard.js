// 占位文件:管理后台预约列表/管理逻辑(admin-dashboard.js)
//
// 用途:登录会话校验 + 拉取预约列表(reservations/reservation_items,受 RLS
// 限制,仅 authenticated 且在 admin_profiles 中的账号可读)+ 确认/取消操作。
//
// 依赖:supabase-client.js 先初始化好的 client 实例。
//
// 实现阶段(角色3下一步)再补:
// - 未登录会话时跳回 login.html
// - 预约列表拉取与渲染(表格/状态标签)
// - 确认/取消预约(UPDATE status,仅管理员权限)
// - 搜索/筛选交互

// TODO(角色3下一阶段): 实现预约管理逻辑
