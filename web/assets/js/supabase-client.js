// 统一初始化 Supabase client(supabase-client.js)
//
// 用途:全站(前台 reserve/ 流程、contact.html + 未来的 admin/)共用同一个
// Supabase client 初始化入口,避免每个页面重复写初始化代码。
//
// 引入方式:纯静态站不引入打包工具,直接在 HTML 里用 <script> 标签从 CDN
// 引入 supabase-js 的 UMD 版本(暴露全局 window.supabase),本文件再用
// window.supabase.createClient() 包一层,挂到 window.supabaseClient 上供
// 其他脚本使用。用到 Supabase 的页面必须按下面顺序引入 <script>:
//   1. config.js                    (定义 window.SUPABASE_URL / SUPABASE_ANON_KEY)
//   2. supabase-js CDN(UMD 版本)     (定义 window.supabase.createClient)
//   3. supabase-client.js(本文件)    (创建 window.supabaseClient)
//   4. 页面自己的脚本(reserve.js/contact.js 等) (使用 window.supabaseClient)
//
// 安全说明:这里用到的 anon key 设计上就是公开给浏览器使用的,真正的数据保护
// 由数据库 RLS 策略负责,不是靠隐藏这个 key。绝不能出现在此文件或任何前端
// 代码里的是 service_role key(它会绕过所有 RLS,只能配置在 Supabase Edge
// Functions 的环境变量里,详见 supabase/functions/*/index.ts 顶部注释)。

(() => {
    if (typeof window === 'undefined') {
        return;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        console.error(
            '[supabase-client] 未检测到 supabase-js。请确认 HTML 里在引入本文件之前,' +
            '先用 <script> 标签引入了 supabase-js 的 CDN(UMD 版本)。'
        );
        return;
    }
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
        console.error(
            '[supabase-client] 未找到 SUPABASE_URL / SUPABASE_ANON_KEY。' +
            '请确认 config.js 已经在本文件之前引入,且已配置为真实值' +
            '(本地开发时可以直接改 config.js 里的占位值做测试,正式环境由 Vercel 构建脚本注入,见 config.js 内注释)。'
        );
        return;
    }
    window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
})();
