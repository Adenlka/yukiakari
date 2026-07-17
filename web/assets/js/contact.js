(() => {
    const form = document.querySelector('[data-contact-form]');
    if (!form) {
        return;
    }

    const draftKey = 'contactDraft';
    const consent = form.querySelector('[data-consent]');
    const submitButton = form.querySelector('[data-submit]');

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

    const saveDraft = () => {
        const draft = {
            name: fields.name ? fields.name.value : '',
            kana: fields.kana ? fields.kana.value : '',
            email: fields.email ? fields.email.value : '',
            tel: fields.tel ? fields.tel.value : '',
            message: fields.message ? fields.message.value : '',
            consent: consent ? consent.checked : false
        };
        localStorage.setItem(draftKey, JSON.stringify(draft));
    };

    const restoreDraft = () => {
        const raw = localStorage.getItem(draftKey);
        if (!raw) {
            return;
        }
        try {
            const draft = JSON.parse(raw);
            if (fields.name && draft.name !== undefined) {
                fields.name.value = draft.name;
            }
            if (fields.kana && draft.kana !== undefined) {
                fields.kana.value = draft.kana;
            }
            if (fields.email && draft.email !== undefined) {
                fields.email.value = draft.email;
            }
            if (fields.tel && draft.tel !== undefined) {
                fields.tel.value = draft.tel;
            }
            if (fields.message && draft.message !== undefined) {
                fields.message.value = draft.message;
            }
            if (consent && draft.consent !== undefined) {
                consent.checked = Boolean(draft.consent);
            }
        } catch (error) {
            return;
        }
    };

    Object.values(fields).forEach((field) => {
        if (!field) {
            return;
        }
        field.addEventListener('blur', () => validateField(field));
        field.addEventListener('input', () => {
            validateField(field, { silent: true });
            updateSubmitState();
            saveDraft();
        });
    });

    if (consent) {
        consent.addEventListener('change', () => {
            updateSubmitState();
            saveDraft();
        });
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const valid = [fields.name, fields.kana, fields.email, fields.message].every((field) => validateField(field));
        const consentOk = consent ? consent.checked : true;
        if (!valid || !consentOk) {
            updateSubmitState();
            const firstInvalid = form.querySelector('.is-invalid');
            firstInvalid?.focus();
            return;
        }
        localStorage.removeItem(draftKey);
        form.reset();
        updateSubmitState();
        alert('お問い合わせを受け付けました。');
    });

    restoreDraft();
    updateSubmitState();
})();
