(() => {
    const codeEl = document.querySelector('[data-reservation-code]');
    const totalEl = document.querySelector('[data-reservation-total]');
    const paymentEl = document.querySelector('[data-reservation-payment]');
    if (!codeEl) {
        return;
    }
    const data = sessionStorage.getItem('reservationSuccess');
    if (!data) {
        codeEl.textContent = '--';
        if (totalEl) {
            totalEl.textContent = '--';
        }
        if (paymentEl) {
            paymentEl.textContent = '未決済';
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
            paymentEl.textContent = record.paymentStatus === 'paid' ? '支払い済み' : '未決済';
        }
    } catch (error) {
        codeEl.textContent = '--';
        if (totalEl) {
            totalEl.textContent = '--';
        }
        if (paymentEl) {
            paymentEl.textContent = '未決済';
        }
    }
})();
