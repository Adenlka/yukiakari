(() => {
    const codeEl = document.querySelector('[data-reservation-code]');
    const totalEl = document.querySelector('[data-reservation-total]');
    const paymentEl = document.querySelector('[data-reservation-payment]');
    const itemsEl = document.querySelector('[data-reservation-items]');
    if (!codeEl) {
        return;
    }

    const PAYMENT_METHOD_LABELS = {
        onsite: '現地決済',
        bank_transfer: '銀行振込'
    };

    // 这里展示的是 booking_info.js 提交 submit-reservation Edge Function 后
    // 拿到的真实返回结果(预约码 + 服务端重新算出来的总价),不是前端自己拼出来
    // 的数据。sessionStorage 只是页面跳转之间的临时传值,读一次就清掉,
    // 不含任何需要长期保存的敏感信息。
    const data = sessionStorage.getItem('reservationSuccess');
    if (!data) {
        codeEl.textContent = '--';
        if (totalEl) {
            totalEl.textContent = '--';
        }
        if (paymentEl) {
            paymentEl.textContent = '--';
        }
        return;
    }

    try {
        const record = JSON.parse(data);
        codeEl.textContent = record.code || '--';
        if (totalEl) {
            const total = Number(record.totalPrice);
            totalEl.textContent = Number.isFinite(total) ? `¥${total.toLocaleString('ja-JP')}` : '--';
        }
        if (paymentEl) {
            paymentEl.textContent = PAYMENT_METHOD_LABELS[record.paymentMethod] || '--';
        }
        if (itemsEl && record.planTitles) {
            itemsEl.textContent = record.planTitles;
        }
    } catch (error) {
        codeEl.textContent = '--';
        if (totalEl) {
            totalEl.textContent = '--';
        }
        if (paymentEl) {
            paymentEl.textContent = '--';
        }
    } finally {
        // 读完即清,避免刷新/重复访问这个页面时反复展示同一条(已经提交过的)结果
        sessionStorage.removeItem('reservationSuccess');
    }
})();
