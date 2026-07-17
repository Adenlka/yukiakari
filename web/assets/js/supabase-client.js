// 占位文件:统一初始化 Supabase client(supabase-client.js)
//
// 用途:全站(前台 reserve/ 流程 + 后台 admin/)共用同一个 Supabase client
// 初始化入口,避免每个页面重复写初始化代码。
//
// 数据来源:读取 config.js 中由构建脚本注入的 SUPABASE_URL / SUPABASE_ANON_KEY
// (见 docs/yukiakari_设计方案_v1.md 第六节 —— 方案A:Vercel 构建时生成 config.js)。
//
// 安全说明:这里用到的 anon key 设计上就是公开给浏览器使用的,真正的数据保护
// 由数据库 RLS 策略负责,不是靠隐藏这个 key。绝不能出现在此文件或任何前端代码里
// 的是 service_role key(它会绕过所有 RLS,只能配置在 Supabase Edge Functions 里)。
//
// 实现阶段(角色3下一步)再补:
// - 引入 supabase-js SDK(CDN 或打包)
// - const supabaseClient = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
// - 导出/挂载给其他脚本使用

// TODO(角色3下一阶段): 初始化 Supabase client
