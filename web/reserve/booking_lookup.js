
(() => {
    const supabase = window.supabaseClient;

    const form = document.querySelector('[data-lookup-form]');
    const resultBox = document.querySelector('[data-lookup-result]');
    const errorBox = document.querySelector('[data-lookup-error]');
    const manageBox = document.querySelector('[data-lookup-manage]');
    const noticeBox = document.querySelector('[data-lookup-notice]');
    const breakdownBox = document.querySelector('.booking-lookup__breakdown');

    const statusEl = document.querySelector('[data-result-status]');
    const planEl = document.querySelector('[data-result-plan]');
    const datesEl = document.querySelector('[data-result-dates]');
    const guestsEl = document.querySelector('[data-result-guests]');
    const roomsEl = document.querySelector('[data-result-rooms]');
    const roomDetailEl = document.querySelector('[data-result-roomdetail]');
    const priceEl = document.querySelector('[data-result-price]');
    const paymentEl = document.querySelector('[data-result-payment]');
    const arrivalEl = document.querySelector('[data-result-arrival]');

    const PAYMENT_METHOD_LABELS = {
        onsite: '現地決済',
        bank_transfer: '銀行振込'
    };

    const STATUS_LABELS = {
        confirmed: '予約確定',
        cancelled: 'キャンセル済み',
        completed: 'ご利用済み'
    };

    const normalizePhone = (value) => (value || '').replace(/\D/g, '');
    const normalizeCode = (value) => (value || '').replace(/\s/g, '').toUpperCase();

    const triggerAnimation = (el, className) => {
        if (!el) {
            return;
        }
        el.classList.remove(className);
        void el.offsetWidth;
        el.classList.add(className);
    };

    const scrollToBox = (el) => {
        if (!el) {
            return;
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const formatCurrency = (value) => (Number.isFinite(value) ? `¥${Number(value).toLocaleString('ja-JP')}` : '--');

    const formatDateRange = (checkin, checkout) => {
        if (!checkin) {
            return '--';
        }
        if (!checkout || checkout === checkin) {
            return `日帰り ${checkin}`;
        }
        return `${checkin} ～ ${checkout}`;
    };

    const formatItemsDetail = (items) => {
        if (!Array.isArray(items) || !items.length) {
            return '--';
        }
        return items
            .map((item, index) => {
                const dates = formatDateRange(item.checkin_date, item.checkout_date);
                return `客室${index + 1}: ${item.plan_name || 'プラン'} / ${dates} / ${item.guests}名 ${item.room_count}室 / ${formatCurrency(item.line_total)}`;
            })
            .join('\n');
    };

    const showResult = (record) => {
        if (!record) {
            return;
        }
        const items = Array.isArray(record.items) ? record.items : [];

        if (statusEl) {
            statusEl.textContent = STATUS_LABELS[record.status] || record.status || '--';
        }
        if (planEl) {
            planEl.textContent = items.map((item) => item.plan_name).filter(Boolean).join(' / ') || '--';
        }
        if (datesEl) {
            const first = items[0];
            datesEl.textContent = first ? formatDateRange(first.checkin_date, first.checkout_date) : '--';
        }
        if (guestsEl) {
            const totalGuests = items.reduce((sum, item) => sum + (Number(item.guests) || 0), 0);
            guestsEl.textContent = totalGuests ? `${totalGuests}名` : '--';
        }
        if (roomsEl) {
            const totalRooms = items.reduce((sum, item) => sum + (Number(item.room_count) || 0), 0);
            roomsEl.textContent = totalRooms ? `${totalRooms}室` : '--';
        }
        if (roomDetailEl) {
            roomDetailEl.textContent = formatItemsDetail(items);
        }
        if (priceEl) {
            priceEl.textContent = formatCurrency(record.total_price);
        }
        if (paymentEl) {
            paymentEl.textContent = PAYMENT_METHOD_LABELS[record.payment_method] || '--';
        }
        if (arrivalEl) {
            arrivalEl.textContent = record.arrival_time || '--';
        }
        if (breakdownBox) {
            // lookup_reservation() 只返回每行的 line_total 和整单 total_price,
            // 没有像旧版伪数据那样拆到 base/service/tax 的细粒度,这块明细区不再适用,直接隐藏。
            breakdownBox.classList.add('is-hidden');
        }

        if (resultBox) {
            resultBox.classList.toggle('is-canceled', record.status === 'cancelled');
            resultBox.classList.remove('is-hidden');
        }
        errorBox?.classList.add('is-hidden');
        triggerAnimation(resultBox, 'is-flash');
        scrollToBox(resultBox);

        if (manageBox) {
            manageBox.classList.remove('is-hidden');
        }
        if (noticeBox) {
            noticeBox.classList.add('is-hidden');
        }
    };

    const showError = () => {
        resultBox?.classList.add('is-hidden');
        manageBox?.classList.add('is-hidden');
        errorBox?.classList.remove('is-hidden');
        if (noticeBox) {
            noticeBox.classList.add('is-hidden');
        }
        triggerAnimation(errorBox, 'is-flash');
        triggerAnimation(form, 'is-shake');
        scrollToBox(errorBox);
    };

    if (!form) {
        return;
    }

    const submitButton = form.querySelector('.booking-lookup__submit');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!supabase) {
            console.error('[booking_lookup] window.supabaseClient 未初期化');
            showError();
            return;
        }

        const codeInput = document.querySelector('#lookup-code');
        const phoneInput = document.querySelector('#lookup-phone');
        const code = normalizeCode(codeInput ? codeInput.value : '');
        const phone = normalizePhone(phoneInput ? phoneInput.value : '');

        if (!code || !phone) {
            showError();
            return;
        }

        if (submitButton) {
            submitButton.disabled = true;
        }

        // lookup-reservation Edge Function 内部会用同一句"未找到"提示统一处理
        // "预约码错" / "手机号错" / "两个都错" 三种情况,不会告诉调用方到底
        // 是哪个字段不对,防止被用来逐位试探。这里前端也不做拆分,原样展示。
        const { data, error } = await supabase.functions.invoke('lookup-reservation', {
            body: { code, phone }
        });

        if (submitButton) {
            submitButton.disabled = false;
        }

        if (error || !data || !data.data) {
            showError();
            return;
        }

        showResult(data.data);
    });
})();
