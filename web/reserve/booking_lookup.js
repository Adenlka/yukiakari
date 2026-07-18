
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

    // 【i18n】记住最近一次查询成功的结果,语言切换时用它重新渲染一遍
    // showResult(),不然已经显示出来的查询结果不会跟着切换语言变化。
    let lastRecord = null;

    // 【i18n】现地決済/銀行振込 复用 booking_info.html 已有的
    // reserve.info.payment.onsite / reserve.info.payment.bankTransfer。
    const getPaymentMethodLabel = (method) => (
        method === 'bank_transfer'
            ? window.ykT('reserve.info.payment.bankTransfer', '銀行振込')
            : window.ykT('reserve.info.payment.onsite', '現地決済')
    );

    // 【i18n】新增 reserve.lookup.status.* 三个 key(booking_lookup.html本身
    // 没有对应的静态文案,是查询结果里才会出现的状态标签)。
    const getStatusLabel = (status) => window.ykT(`reserve.lookup.status.${status}`, null) || status || '--';

    // 【i18n】人数/客室数标签复用 reserve.search.guests.N / reserve.info.roomCount.N
    // (和 reserve.js/booking_info.js 用的是同一组翻译)。
    const formatGuestsLabel = (n) => window.ykT(`reserve.search.guests.${n}`, null) || window.ykT('reserve.dynamic.guestsUnit', '{n}名').replace('{n}', n);
    const formatRoomsLabel = (n) => window.ykT(`reserve.info.roomCount.${n}`, null) || window.ykT('reserve.dynamic.roomsUnit', '{n}室').replace('{n}', n);

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
            return window.ykT('reserve.dynamic.dateRangeDaytrip', '日帰り {date}').replace('{date}', checkin);
        }
        return window.ykT('reserve.dynamic.dateRangeStay', '{checkin} ～ {checkout}').replace('{checkin}', checkin).replace('{checkout}', checkout);
    };

    const formatItemsDetail = (items) => {
        if (!Array.isArray(items) || !items.length) {
            return '--';
        }
        return items
            .map((item, index) => {
                const dates = formatDateRange(item.checkin_date, item.checkout_date);
                const planName = item.plan_name || window.ykT('reserve.lookup.result.plan', 'プラン');
                return window.ykT('reserve.lookup.dynamic.itemLine', '客室{n}: {plan} / {dates} / {guests} {rooms} / {price}')
                    .replace('{n}', String(index + 1))
                    .replace('{plan}', planName)
                    .replace('{dates}', dates)
                    .replace('{guests}', formatGuestsLabel(item.guests))
                    .replace('{rooms}', formatRoomsLabel(item.room_count))
                    .replace('{price}', formatCurrency(item.line_total));
            })
            .join('\n');
    };

    const showResult = (record) => {
        if (!record) {
            return;
        }
        const items = Array.isArray(record.items) ? record.items : [];

        if (statusEl) {
            statusEl.textContent = getStatusLabel(record.status);
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
            guestsEl.textContent = totalGuests ? formatGuestsLabel(totalGuests) : '--';
        }
        if (roomsEl) {
            const totalRooms = items.reduce((sum, item) => sum + (Number(item.room_count) || 0), 0);
            roomsEl.textContent = totalRooms ? formatRoomsLabel(totalRooms) : '--';
        }
        if (roomDetailEl) {
            roomDetailEl.textContent = formatItemsDetail(items);
        }
        if (priceEl) {
            priceEl.textContent = formatCurrency(record.total_price);
        }
        if (paymentEl) {
            paymentEl.textContent = getPaymentMethodLabel(record.payment_method) || '--';
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

        lastRecord = data.data;
        showResult(data.data);
    });

    // 【i18n】语言切换时如果页面上正显示着查询结果,重新渲染一遍(状态/支付
    // 方式/人数客室数这些标签需要跟着切换)。
    window.addEventListener('yk:languagechange', () => {
        if (lastRecord) {
            showResult(lastRecord);
        }
    });
})();
