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

    // 前端校验只是体验优化,不是安全边界。contact_messages 表的 RLS 只给 anon
    // INSERT 权限(见 supabase/migrations/0002_rls_policies.sql),真正的输入
    // 校验/转义交给数据库约束和后续管理端处理,这里校验不到位也不会产生安全问题,
    // 顶多是插入了一条格式不太规范的留言。
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

        // contact_messages 的 RLS 只允许 anon INSERT,不允许 SELECT(见
        // 0002_rls_policies.sql),所以这里插入后拿不到、也不需要拿到刚插入的
        // 那一行数据,只要 error 为空就代表写入成功。
        const { error } = await supabase.from('contact_messages').insert({
            guest_name: fields.name.value.trim(),
            guest_kana: fields.kana.value.trim(),
            guest_email: fields.email.value.trim(),
            guest_phone: fields.tel && fields.tel.value ? fields.tel.value.trim() : null,
            message: fields.message.value.trim(),
            privacy_agreed: consentOk
        });

        if (error) {
            console.error('[contact] contact_messages insert error', error);
            showFeedback('送信に失敗しました。しばらくしてから再度お試しいただくか、お電話にてお問い合わせください。', 'error');
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
