// assets/js/admin/admin-guard.js
//
// 【超出上一轮骨架规划范围的补充文件】上一轮只规划了 admin-auth.js(登录页用)
// 和 admin-dashboard.js(预约管理页用)两个 JS 占位。本轮任务卡要求"三个页面
// 都要做未登录/session过期自动跳回login的保护",如果这段逻辑在三个页面各写
// 一份,后续任何一处改动(比如判断条件、跳转路径)都要同步改三次,容易漏改
// 出安全缺口,所以抽成这一个共享模块,已在变更记录里说明这处增补。
//
// 用途:统一的管理后台会话/权限校验。
//
// 【重要安全边界说明】这里做的所有检查都只是"体验层"——真正决定谁能读写
// reservations/contact_messages 数据的是数据库 RLS 策略(见
// supabase/migrations/0002_rls_policies.sql 里 "authenticated 且在
// admin_profiles 里有记录" 这条判断)。就算这个文件被跳过、被浏览器控制台
// 篡改、或者被完全绕开直接调 supabase-js,RLS 依然会在数据库层挡住非管理员
// 的读写。这个文件的作用只是"体验更好"(没权限的人别看到一个报错满天飞的
// 空页面,而是干净地跳回登录页),不是安全边界本身。

window.AdminGuard = (() => {
    const supabase = window.supabaseClient;

    // 查询当前登录用户是不是管理员:先看有没有有效 session,再查
    // admin_profiles 里有没有对应记录(RLS 只允许本人查自己那一条,
    // 查不到就说明这个账号没有被开通管理员权限)。
    const getCurrentAdmin = async () => {
        if (!supabase) {
            return null;
        }
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData || !sessionData.session) {
            return null;
        }
        const user = sessionData.session.user;
        const { data: profile, error: profileError } = await supabase
            .from('admin_profiles')
            .select('user_id, display_name, role')
            .eq('user_id', user.id)
            .maybeSingle();
        if (profileError || !profile) {
            return null;
        }
        return { user, profile };
    };

    // dashboard.html / contact-messages.html 加载时调用:没有管理员身份就
    // 跳回登录页,并顺手把可能存在的、不属于管理员的 session 清掉。
    // 调用方应该在拿到非 null 返回值之后才继续渲染页面内容。
    const requireAdmin = async () => {
        const admin = await getCurrentAdmin();
        if (!admin) {
            if (supabase) {
                try {
                    await supabase.auth.signOut();
                } catch (error) {
                    // 忽略登出本身的报错,反正接下来就要跳转了
                }
            }
            window.location.href = 'login.html';
            return null;
        }

        // 持续监听:如果 token 过期、或者管理员在别的标签页登出,
        // 当前页面也要跟着跳回登录页,而不是继续停留在一个"看起来还登录着"
        // 但实际上后续所有请求都会被 RLS 拒绝的死页面。
        supabase.auth.onAuthStateChange((_event, session) => {
            if (!session) {
                window.location.href = 'login.html';
            }
        });

        return admin;
    };

    // login.html 加载时调用:已经是管理员身份的话,不需要再看登录表单,
    // 直接跳去 dashboard。
    const redirectIfLoggedIn = async (target) => {
        const admin = await getCurrentAdmin();
        if (admin) {
            window.location.href = target || 'dashboard.html';
        }
    };

    const signOut = async () => {
        if (!supabase) {
            window.location.href = 'login.html';
            return;
        }
        await supabase.auth.signOut();
        window.location.href = 'login.html';
    };

    return { getCurrentAdmin, requireAdmin, redirectIfLoggedIn, signOut };
})();
