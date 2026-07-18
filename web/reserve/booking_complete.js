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
    // 的数据。sessionStorage 只是页面跳转之间的临时传值,读一次就清掉,
    // 不含任何需要长期保存的敏感信息。
    //
    // 【i18n】sessionStorage 读一次就清空(下面 finally 块),但语言切换时
    // 还需要重新渲染一遍支付方式标签,所以把解析出来的 record 缓存在模块
    // 变量里,不再重新读 sessionStorage(此时已经清空,读不到了)。
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
        } finally {
            // 读完即清,避免刷新/重复访问这个页面时反复展示同一条(已经提交过的)结果
            sessionStorage.removeItem('reservationSuccess');
        }
    }

    // 【i18n】语言切换时用缓存的 record 重新渲染一遍支付方式标签。
    window.addEventListener('yk:languagechange', () => {
        if (cachedRecord) {
            renderRecord(cachedRecord);
        }
    });
})();
