(() => {
    const form = document.querySelector('[data-contact-form]');
    if (!form) {
        return;
    }

    const supabase = window.supabaseClient;

    const consent = form.querySelector('[data-consent]');
    const submitButton = form.querySelector('[data-submit]');
    const feedbackEl = form.querySelector('[data-contact-feedback]');

    const fields = {
        name: form.querySelector('#name'),
        kana: form.querySelector('#kana'),
        email: form.querySelector('#email'),
        tel: form.querySelector('#tel'),
        message: form.querySelector('#message')
    };

    const normalizePhone = (value) => (value || '').replace(/\D/g, '');

    const showError = (field, message) => {
        if (!field) {
            return;
        }
        field.classList.add('is-invalid');
        field.setAttribute('aria-invalid', 'true');
        const wrapper = field.closest('.contact-form__field');
        if (!wrapper) {
            return;
        }
        let error = wrapper.querySelector('.contact-form__error');
        if (!error) {
            error = document.createElement('p');
            error.className = 'contact-form__error';
            error.setAttribute('role', 'alert');
            wrapper.appendChild(error);
        }
        error.textContent = message;
    };

    const clearError = (field) => {
        if (!field) {
            return;
        }
        field.classList.remove('is-invalid');
        field.removeAttribute('aria-invalid');
        const wrapper = field.closest('.contact-form__field');
        if (!wrapper) {
            return;
        }
        const error = wrapper.querySelector('.contact-form__error');
        if (error) {
            error.remove();
        }
    };

    // 前端校验只是体验优化,不是安全边界。真正写入 contact_messages 的路径是
    // submit-contact-message Edge Function → submit_contact_message() SECURITY
    // DEFINER 函数(见 supabase/migrations/0002_rls_policies.sql);anon 对该表
    // 已经没有直接 INSERT 权限,Edge Function 内部还会重复一遍限流+输入校验,
    // 不信任前端传来的任何字段。这里的前端校验不到位也不会产生安全问题,顶多是
    // 用户体验差一点(比如提交后才被 Edge Function 拒绝)。
    const validateField = (field, { silent = false } = {}) => {
        if (!field) {
            return true;
        }
        const value = field.value.trim();
        const isRequired = field.hasAttribute('required');

        if (isRequired && !value) {
            if (!silent) {
                showError(field, '必須項目です。');
            }
            return false;
        }

        if (field.type === 'email' && value && !field.validity.valid) {
            if (!silent) {
                showError(field, 'メールアドレスをご確認ください。');
            }
            return false;
        }

        if (field.type === 'tel' && value && normalizePhone(value).length < 9) {
            if (!silent) {
                showError(field, '電話番号をご確認ください。');
            }
            return false;
        }

        clearError(field);
        return true;
    };

    const updateSubmitState = () => {
        if (!submitButton) {
            return;
        }
        const requiredValid = [fields.name, fields.kana, fields.email, fields.message].every((field) => validateField(field, { silent: true }));
        const consentOk = consent ? consent.checked : true;
        const enabled = requiredValid && consentOk;
        submitButton.disabled = !enabled;
        submitButton.classList.toggle('is-enabled', enabled);
    };

    const showFeedback = (message, tone) => {
        if (!feedbackEl) {
            return;
        }
        feedbackEl.textContent = message;
        feedbackEl.classList.remove('is-success', 'is-error');
        feedbackEl.classList.add(tone === 'error' ? 'is-error' : 'is-success');
        // contact.css 里没有为这两个状态类定义样式,这里直接给内联颜色兜底,
        // 保证不管有没有补 CSS,用户都能一眼看出是成功还是失败。
        feedbackEl.style.color = tone === 'error' ? '#b3261e' : '#2e7d32';
        feedbackEl.style.fontWeight = '600';
        feedbackEl.style.marginTop = '8px';
    };

    const clearFeedback = () => {
        if (!feedbackEl) {
            return;
        }
        feedbackEl.textContent = '';
        feedbackEl.classList.remove('is-success', 'is-error');
    };

    // 【隐私】不再把姓名/邮箱/电话/留言这些个人信息自动存进 localStorage 做
    // "草稿恢复"——这些字段本身就是需要最小化收集的个人数据(需求文档第五节
    // GDPR 提醒),没必要为了防止刷新丢草稿这种小体验,把它们明文留在浏览器
    // 本地存储里。原来的 contactDraft 机制已整体移除,不只是去掉某几个字段。

    Object.values(fields).forEach((field) => {
        if (!field) {
            return;
        }
        field.addEventListener('blur', () => validateField(field));
        field.addEventListener('input', () => {
            validateField(field, { silent: true });
            updateSubmitState();
        });
    });

    if (consent) {
        consent.addEventListener('change', updateSubmitState);
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFeedback();

        const valid = [fields.name, fields.kana, fields.email, fields.message].every((field) => validateField(field));
        const consentOk = consent ? consent.checked : true;
        if (!valid || !consentOk) {
            updateSubmitState();
            const firstInvalid = form.querySelector('.is-invalid');
            firstInvalid?.focus();
            return;
        }

        if (!supabase) {
            console.error('[contact] window.supabaseClient 未初期化');
            showFeedback('送信に失敗しました。しばらくしてから再度お試しください。', 'error');
            return;
        }

        submitButton.disabled = true;
        const originalLabel = submitButton.textContent;
        submitButton.textContent = '送信中…';

        // 【安全修复 · 安全审查报告中危问题④】原来这里是前端直接
        // `supabase.from('contact_messages').insert(...)`——contact_messages
        // 的 RLS 对 anon 是无条件允许 INSERT(见 0002_rls_policies.sql),
        // 任何人拿公开的 anon key 都能绕开这个页面直接批量灌库,完全没有
        // 频率限制。现在改成调用 submit-contact-message Edge Function,
        // 由它在真正写库前先做 IP 限流(见该函数注释),前端这里拿不到、也
        // 不需要拿到刚插入的那一行数据,只要 error 为空就代表提交成功。
        const { error } = await supabase.functions.invoke('submit-contact-message', {
            body: {
                guest_name: fields.name.value.trim(),
                guest_kana: fields.kana.value.trim(),
                guest_email: fields.email.value.trim(),
                guest_phone: fields.tel && fields.tel.value ? fields.tel.value.trim() : null,
                message: fields.message.value.trim(),
                privacy_agreed: consentOk
            }
        });

        if (error) {
            console.error('[contact] submit-contact-message invoke error', error);
            let message = '送信に失敗しました。しばらくしてから再度お試しいただくか、お電話にてお問い合わせください。';
            try {
                if (error.context && typeof error.context.json === 'function') {
                    const body = await error.context.json();
                    if (body && body.error) {
                        message = body.error;
                    }
                }
            } catch (parseError) {
                // 解析失败就用兜底提示,不把解析异常细节展示给用户
            }
            showFeedback(message, 'error');
            submitButton.disabled = false;
            submitButton.textContent = originalLabel;
            return;
        }

        form.reset();
        updateSubmitState();
        submitButton.textContent = originalLabel;
        showFeedback('お問い合わせを受け付けました。ご連絡ありがとうございます。', 'success');
    });

    updateSubmitState();
})();
