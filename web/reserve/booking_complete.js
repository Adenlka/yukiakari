(() => {
    const codeEl = document.querySelector('[data-reservation-code]');
    const totalEl = document.querySelector('[data-reservation-total]');
    const paymentEl = document.querySelector('[data-reservation-payment]');
    const itemsEl = document.querySelector('[data-reservation-items]');
    if (!codeEl) {
        return;
    }

    // 【i18n】现地決済/銀行振込 复用 booking_info.html 已有的
    // reserve.info.payment.onsite / reserve.info.payment.bankTransfer。
    const getPaymentMethodLabel = (method) => (
        method === 'bank_transfer'
            ? window.ykT('reserve.info.payment.bankTransfer', '銀行振込')
            : window.ykT('reserve.info.payment.onsite', '現地決済')
    );

    // 这里展示的是 booking_info.js 提交 submit-reservation Edge Function 后
    // 拿到的真实返回结果(预约码 + 服务端重新算出来的总价),不是前端自己拼出来
    // 的数据。sessionStorage 只是页面跳转之间的临时传值。
    //
    // 【体验修复 · 2026-07-19】这里原来读完 sessionStorage 后立即
    // removeItem,导致这个完成页一刷新就白屏(任务卡原话:"阻断级体验问题"
    // 之一)。分析下来这个"读完即清"其实是在解决一个不存在的问题:
    // sessionStorage 本来就只在当前标签页存活,关掉标签页/浏览器自然清空,
    // 不需要手动清理;而下一次真正提交新预约时,booking_info.js 会重新
    // setItem 覆盖掉这条旧数据,不会出现"刷新后误显示上一次预约"的情况。
    // 所以直接不删除即可——顾客刷新页面、或者不小心后退再前进,依然能看到
    // 自己的预约码,不会丢失信息。
    //
    // 【i18n】语言切换时还需要重新渲染一遍支付方式标签,所以把解析出来的
    // record 缓存在模块变量里,不用每次都重新读+解析 sessionStorage。
    let cachedRecord = null;

    const renderRecord = (record) => {
        if (!record) {
            codeEl.textContent = '--';
            if (totalEl) {
                totalEl.textContent = '--';
            }
            if (paymentEl) {
                paymentEl.textContent = '--';
            }
            return;
        }
        codeEl.textContent = record.code || '--';
        if (totalEl) {
            const total = Number(record.totalPrice);
            totalEl.textContent = Number.isFinite(total) ? `¥${total.toLocaleString('ja-JP')}` : '--';
        }
        if (paymentEl) {
            paymentEl.textContent = getPaymentMethodLabel(record.paymentMethod) || '--';
        }
        if (itemsEl && record.planTitles) {
            itemsEl.textContent = record.planTitles;
        }
    };

    const data = sessionStorage.getItem('reservationSuccess');
    if (!data) {
        renderRecord(null);
    } else {
        try {
            cachedRecord = JSON.parse(data);
            renderRecord(cachedRecord);
        } catch (error) {
            cachedRecord = null;
            renderRecord(null);
        }
    }

    // 【i18n】语言切换时用缓存的 record 重新渲染一遍支付方式标签。
    window.addEventListener('yk:languagechange', () => {
        if (cachedRecord) {
            renderRecord(cachedRecord);
        }
    });
})();
