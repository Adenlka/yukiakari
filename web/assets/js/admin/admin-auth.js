// assets/js/admin/admin-auth.js
//
// 用途:登录页(admin/login.html)逻辑。调用 Supabase Auth(邮箱+密码)完成
// 管理员登录,登录成功后 supabase-js SDK 自动管理 session(JWT + refresh
// token),不需要自己写 token 存取逻辑。
//
// 安全要点:
// - 登录失败统一显示"メールアドレスまたはパスワードが正しくありません。"
//   这一句话,不区分"账号不存在"还是"密码错误",也不把 Supabase 返回的
//   原始错误信息(可能包含更具体的内部状态,比如是否触发了限流)直接展示
//   给用户,原始错误只打到 console 供开发者自己排查。
// - 真正的登录频率限制由 Supabase Auth(GoTrue)服务端承担,这里额外加的
//   "提交中禁用按钮 + 失败后短暂冷却"只是前端体验层的节流防抖,不是安全
//   边界,就算被绕过(比如直接用 fetch 绕开这个页面调 Auth API),服务端
//   限制依然生效。

(() => {
    const form = document.querySelector('[data-login-form]');
    if (!form) {
        return;
    }

    const supabase = window.supabaseClient;
    const emailInput = document.querySelector('#login-email');
    const passwordInput = document.querySelector('#login-password');
    const submitButton = document.querySelector('[data-login-submit]');
    const errorEl = document.querySelector('[data-login-error]');

    const GENERIC_ERROR = 'メールアドレスまたはパスワードが正しくありません。';
    const COOLDOWN_MS = 1500;

    const showError = (message) => {
        if (!errorEl) {
            return;
        }
        errorEl.textContent = message;
        errorEl.classList.add('is-visible');
    };

    const clearError = () => {
        if (!errorEl) {
            return;
        }
        errorEl.textContent = '';
        errorEl.classList.remove('is-visible');
    };

    const setSubmitting = (submitting) => {
        if (!submitButton) {
            return;
        }
        submitButton.disabled = submitting;
        submitButton.textContent = submitting ? 'ログイン中…' : 'ログイン';
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearError();

        if (!supabase) {
            showError('システムに接続できませんでした。しばらくしてから再度お試しください。');
            return;
        }

        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        if (!email || !password) {
            showError('メールアドレスとパスワードを入力してください。');
            return;
        }

        setSubmitting(true);

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error || !data || !data.session) {
            // 原始错误(比如 Supabase 返回的 "Invalid login credentials" /
            // 限流提示等)只打日志,不展示给用户,统一走同一句话。
            console.error('[admin-auth] signInWithPassword error', error);
            showError(GENERIC_ERROR);
            setSubmitting(false);
            // 失败后短暂冷却,减缓在同一个页面里反复点击提交的速度
            // (不是真正的限流,真正限流在 Supabase Auth 服务端)
            if (submitButton) {
                submitButton.disabled = true;
                setTimeout(() => {
                    submitButton.disabled = false;
                }, COOLDOWN_MS);
            }
            return;
        }

        window.location.href = 'dashboard.html';
    });

    // 已经登录的话,不需要再看登录表单,直接跳到后台首页。
    if (window.AdminGuard) {
        window.AdminGuard.redirectIfLoggedIn('dashboard.html');
    }
})();
