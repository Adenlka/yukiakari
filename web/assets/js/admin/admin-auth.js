// 占位文件:管理后台登录逻辑(admin-auth.js)
//
// 用途:调用 Supabase Auth(邮箱+密码)完成管理员登录,登录成功后签发的
// session 由 supabase-js SDK 自动管理(JWT + refresh token)。
//
// 依赖:supabase-client.js 先初始化好的 client 实例。
//
// 实现阶段(角色3下一步)再补:
// - 登录表单提交处理 + 前端基础校验
// - 登录失败的错误提示(不暴露堆栈/后端细节,符合安全底线)
// - 登录成功后跳转 dashboard.html
// - 频率限制主要由 Supabase Auth 自带机制承担,前端可加简单节流防抖

// TODO(角色3下一阶段): 实现登录逻辑
