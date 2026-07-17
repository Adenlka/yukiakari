
(() => {
    const form = document.querySelector('[data-lookup-form]');
    const resultBox = document.querySelector('[data-lookup-result]');
    const errorBox = document.querySelector('[data-lookup-error]');
    const manageBox = document.querySelector('[data-lookup-manage]');
    const noticeBox = document.querySelector('[data-lookup-notice]');
    const manageForm = document.querySelector('[data-manage-form]');
    const manageCheckin = document.querySelector('[data-manage-checkin]');
    const manageCheckout = document.querySelector('[data-manage-checkout]');
    const manageGuests = document.querySelector('[data-manage-guests]');
    const manageRooms = document.querySelector('[data-manage-rooms]');
    const managePaid = document.querySelector('[data-manage-paid]');
    const cancelButton = document.querySelector('[data-manage-cancel]');

    const statusEl = document.querySelector('[data-result-status]');
    const planEl = document.querySelector('[data-result-plan]');
    const datesEl = document.querySelector('[data-result-dates]');
    const guestsEl = document.querySelector('[data-result-guests]');
    const roomsEl = document.querySelector('[data-result-rooms]');
    const roomDetailEl = document.querySelector('[data-result-roomdetail]');
    const priceEl = document.querySelector('[data-result-price]');
    const paymentEl = document.querySelector('[data-result-payment]');

    const breakdownEls = {
        base: document.querySelector('[data-result-base]'),
        addons: document.querySelector('[data-result-addons]'),
        service: document.querySelector('[data-result-service]'),
        tax: document.querySelector('[data-result-tax]'),
        total: document.querySelector('[data-result-total]')
    };

    const extraOptions = {
        dinnerUpgrade: { label: '夕朝食アップグレード', price: 2000, per: 'guest', perNight: true },
        loungeAccess: { label: '雪見ラウンジ利用', price: 500, per: 'guest', perNight: false },
        privateBath: { label: '貸切風呂', price: 1600, per: 'room', perNight: true },
        lateCheckout: { label: 'レイトチェックアウト', price: 900, per: 'room', perNight: false },
        daytripAllAccess: { label: '館内オールアクセス', price: 500, per: 'guest', perNight: false },
        daytripMealUpgrade: { label: '季節の昼食追加', price: 1000, per: 'guest', perNight: false }
    };

    const roomTypeLabels = {
        none: '選択なし',
        villa: '離れ',
        viewbath: '展望風呂付',
        modern: '和洋室',
        standard: 'スタンダード和室'
    };

    const SERVICE_RATE = 0.1;
    const TAX_RATE = 0.1;

    let activeRecord = null;
    let activeCode = '';

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

    const parseDateValue = (value) => {
        if (!value) {
            return null;
        }
        const parts = value.split(/[\/-]/).map((part) => parseInt(part, 10));
        if (parts.length !== 3 || parts.some(Number.isNaN)) {
            return null;
        }
        const [year, month, day] = parts;
        return new Date(year, month - 1, day);
    };

    const toInputDate = (value) => {
        if (!value) {
            return '';
        }
        if (value.includes('-')) {
            return value;
        }
        const parts = value.split('/');
        if (parts.length !== 3) {
            return '';
        }
        return `${parts[0]}-${parts[1]}-${parts[2]}`;
    };

    const toRecordDate = (value) => {
        if (!value) {
            return '';
        }
        if (value.includes('/')) {
            return value;
        }
        const parts = value.split('-');
        if (parts.length !== 3) {
            return value;
        }
        return `${parts[0]}/${parts[1]}/${parts[2]}`;
    };

    const formatInputDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const formatCurrency = (value) => (Number.isFinite(value) ? `¥${value.toLocaleString('ja-JP')}` : '--');

    const allocateGuests = (totalGuests, roomCount) => {
        const base = Math.floor(totalGuests / roomCount);
        const remainder = totalGuests % roomCount;
        return Array.from({ length: roomCount }, (_, index) => base + (index < remainder ? 1 : 0));
    };

    const getNightsValue = (record) => {
        const stored = Number(record.nights);
        if (Number.isFinite(stored)) {
            return stored === 0 ? 1 : stored;
        }
        const checkinDate = parseDateValue(record.checkin);
        const checkoutDate = parseDateValue(record.checkout);
        if (!checkinDate || !checkoutDate) {
            return 1;
        }
        const diff = Math.round((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
        return diff <= 0 ? 1 : diff;
    };

    const computePlanTotals = (plan, options) => {
        const guests = Math.max(1, options.guests || 1);
        const roomCount = Math.max(1, options.roomCount || 1);
        const nights = Math.max(1, options.nights || 1);
        const selectedExtras = options.extras || {};
        const daytripOptionsValue = options.daytripOptions || {};

        let base = 0;
        if (plan.pricingModel === 'daytrip') {
            base = plan.price * guests;
        } else {
            const baseGuests = plan.baseGuests || 2;
            const extraRate = plan.extraGuestRate || 3500;
            const allocations = allocateGuests(guests, roomCount);
            base = allocations.reduce((sum, roomGuests) => {
                const extraGuests = Math.max(0, roomGuests - baseGuests);
                return sum + plan.price * nights + extraGuests * extraRate * nights;
            }, 0);
        }

        let addOns = 0;
        (plan.extras || []).forEach((extraId) => {
            if (!selectedExtras[extraId]) {
                return;
            }
            const rule = extraOptions[extraId];
            if (!rule) {
                return;
            }
            const baseQty = rule.per === 'room' ? roomCount : guests;
            const nightFactor = rule.perNight ? nights : 1;
            addOns += rule.price * baseQty * nightFactor;
        });

        if (plan.pricingModel === 'daytrip') {
            const planAddonMap = { relax: 0, sauna: 400, private: 900 };
            const mealAddonMap = { none: 0, light: 400, lunch: 900 };
            const planAddon = planAddonMap[daytripOptionsValue.plan] || 0;
            const mealAddon = mealAddonMap[daytripOptionsValue.meal] || 0;
            addOns += (planAddon + mealAddon) * guests;
        }

        return { base, addOns };
    };
    const formatRoomDetail = (rooms) => {
        if (!Array.isArray(rooms) || !rooms.length) {
            return '--';
        }
        return rooms
            .map((room, index) => {
                const label = room.planTitle || roomTypeLabels[room.roomType] || '客室';
                const guests = room.guests || 1;
                return `客室${index + 1}: ${label} ${guests}名`;
            })
            .join(' / ');
    };

    const computeBreakdown = (record) => {
        const nights = getNightsValue(record);
        let base = 0;
        let addOns = 0;

        if (Array.isArray(record.plans) && record.plans.length) {
            record.plans.forEach((plan, index) => {
                const rooms = Array.isArray(record.rooms)
                    ? record.rooms.filter((room) => room.cartIndex === index)
                    : [];
                const roomCount = rooms.length || plan.roomCount || 1;
                const guests = rooms.reduce((sum, room) => sum + (room.guests || 1), 0) || plan.guests || record.guests || 1;
                const totals = computePlanTotals(plan, {
                    guests,
                    roomCount,
                    nights,
                    extras: plan.selectedExtras || {},
                    daytripOptions: plan.daytripOptions || {}
                });
                base += totals.base;
                addOns += totals.addOns;
            });
        } else {
            const fallbackPlan = {
                price: Number(record.planPrice) || 0,
                baseGuests: 2,
                extraGuestRate: 3500,
                pricingModel: String(record.nights) === '0' ? 'daytrip' : 'stay',
                extras: [],
                selectedExtras: {},
                daytripOptions: {
                    plan: record.daytripPlan,
                    meal: record.daytripMeal
                }
            };
            const roomCount = record.roomCount ? Number(record.roomCount) : 1;
            const guests = record.guests ? Number(record.guests) : 1;
            const totals = computePlanTotals(fallbackPlan, {
                guests,
                roomCount,
                nights,
                extras: {},
                daytripOptions: fallbackPlan.daytripOptions
            });
            base += totals.base;
            addOns += totals.addOns;
        }

        const subtotal = base + addOns;
        const service = Math.round(subtotal * SERVICE_RATE);
        const tax = Math.round((subtotal + service) * TAX_RATE);
        const total = subtotal + service + tax;

        return { base, addOns, service, tax, total };
    };

    const showNotice = (message) => {
        if (!noticeBox) {
            return;
        }
        noticeBox.textContent = message;
        noticeBox.classList.remove('is-hidden');
        triggerAnimation(noticeBox, 'is-flash');
    };

    const showResult = (record) => {
        if (!record) {
            return;
        }
        activeRecord = record;
        const statusText = record.status === 'canceled' ? 'キャンセル済み' : '予約確定';

        if (statusEl) {
            statusEl.textContent = statusText;
        }
        if (planEl) {
            const fallbackPlans = Array.isArray(record.plans)
                ? record.plans.map((plan) => plan.title).filter(Boolean).join(' / ')
                : '';
            planEl.textContent = record.planTitle || fallbackPlans || '--';
        }
        if (datesEl) {
            const dates = record.checkin && record.checkout
                ? record.checkin === record.checkout
                    ? `日帰り ${record.checkin}`
                    : `${record.checkin} ～ ${record.checkout}`
                : record.checkin || '--';
            datesEl.textContent = dates;
        }
        if (guestsEl) {
            guestsEl.textContent = record.guests ? `${record.guests}名` : '--';
        }
        if (roomsEl) {
            roomsEl.textContent = record.roomCount ? `${record.roomCount}室` : '--';
        }
        if (roomDetailEl) {
            roomDetailEl.textContent = formatRoomDetail(record.rooms);
        }

        const breakdown = record.breakdown || computeBreakdown(record);
        record.breakdown = breakdown;
        record.totalPrice = breakdown.total;

        if (priceEl) {
            priceEl.textContent = formatCurrency(breakdown.total);
        }
        if (paymentEl) {
            paymentEl.textContent = record.paymentStatus === 'paid' ? '支払い済み' : '未決済';
        }
        if (breakdownEls.base) {
            breakdownEls.base.textContent = formatCurrency(breakdown.base);
        }
        if (breakdownEls.addons) {
            breakdownEls.addons.textContent = formatCurrency(breakdown.addOns);
        }
        if (breakdownEls.service) {
            breakdownEls.service.textContent = formatCurrency(breakdown.service);
        }
        if (breakdownEls.tax) {
            breakdownEls.tax.textContent = formatCurrency(breakdown.tax);
        }
        if (breakdownEls.total) {
            breakdownEls.total.textContent = formatCurrency(breakdown.total);
        }

        if (resultBox) {
            resultBox.classList.toggle('is-canceled', record.status === 'canceled');
            resultBox.classList.remove('is-hidden');
        }
        errorBox?.classList.add('is-hidden');
        triggerAnimation(resultBox, 'is-flash');
        scrollToBox(resultBox);

        if (manageBox) {
            manageBox.classList.remove('is-hidden');
            manageBox.classList.toggle('is-disabled', record.status === 'canceled');
        }
        if (noticeBox) {
            noticeBox.classList.add('is-hidden');
        }

        if (manageCheckin) {
            manageCheckin.value = toInputDate(record.checkin);
        }
        if (manageCheckout) {
            manageCheckout.value = toInputDate(record.checkout);
        }
        if (manageGuests) {
            manageGuests.value = record.guests ? String(record.guests) : '1';
        }
        if (manageRooms) {
            const roomCount = record.roomCount ? Number(record.roomCount) : 1;
            for (let i = manageRooms.options.length + 1; i <= roomCount; i += 1) {
                const option = document.createElement('option');
                option.value = String(i);
                option.textContent = `${i}室`;
                manageRooms.appendChild(option);
            }
            manageRooms.value = String(roomCount);
        }
        if (managePaid) {
            managePaid.checked = record.paymentStatus === 'paid';
        }
        updateManageBounds();
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

    const saveRecord = (record) => {
        const recordsRaw = localStorage.getItem('reservationRecords');
        let records = {};
        if (recordsRaw) {
            try {
                records = JSON.parse(recordsRaw) || {};
            } catch (error) {
                records = {};
            }
        }
        if (activeCode) {
            records[activeCode] = record;
            localStorage.setItem('reservationRecords', JSON.stringify(records));
        }
    };

    const buildRooms = (record, roomCount, totalGuests) => {
        const roomTemplates = [];
        if (Array.isArray(record.plans) && record.plans.length) {
            record.plans.forEach((plan, index) => {
                const count = plan.roomCount || 1;
                for (let i = 0; i < count; i += 1) {
                    roomTemplates.push({
                        cartIndex: index,
                        planTitle: plan.title || plan.planTitle,
                        roomType: plan.roomType || plan.planRoom,
                        guests: 1
                    });
                }
            });
        } else if (Array.isArray(record.rooms) && record.rooms.length) {
            record.rooms.forEach((room) => {
                roomTemplates.push({
                    cartIndex: room.cartIndex || 0,
                    planTitle: room.planTitle,
                    roomType: room.roomType || room.planRoom,
                    guests: 1
                });
            });
        } else {
            roomTemplates.push({
                cartIndex: 0,
                planTitle: record.planTitle,
                roomType: record.planRoom,
                guests: 1
            });
        }

        const rooms = [];
        for (let i = 0; i < roomCount; i += 1) {
            const template = roomTemplates[i % roomTemplates.length];
            rooms.push({
                ...template
            });
        }
        const allocations = allocateGuests(totalGuests, roomCount);
        rooms.forEach((room, index) => {
            room.guests = allocations[index] || 1;
        });
        return rooms;
    };

    const updatePlanRoomCounts = (record) => {
        if (!Array.isArray(record.plans)) {
            return;
        }
        const counts = {};
        if (Array.isArray(record.rooms)) {
            record.rooms.forEach((room) => {
                counts[room.cartIndex || 0] = (counts[room.cartIndex || 0] || 0) + 1;
            });
        }
        record.plans.forEach((plan, index) => {
            plan.roomCount = counts[index] || 1;
        });
    };

    const updateManageBounds = () => {
        if (!manageCheckin || !manageCheckout) {
            return;
        }
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const maxDate = new Date(now);
        maxDate.setMonth(maxDate.getMonth() + 9);
        manageCheckin.min = formatInputDate(now);
        manageCheckin.max = formatInputDate(maxDate);
        manageCheckout.max = formatInputDate(maxDate);
        const checkinDate = parseDateValue(manageCheckin.value) || now;
        const minCheckout = new Date(checkinDate);
        const isDaytripRecord = activeRecord && (String(activeRecord.nights) === '0' || activeRecord.checkin === activeRecord.checkout);
        if (!isDaytripRecord) {
            minCheckout.setDate(minCheckout.getDate() + 1);
        }
        manageCheckout.min = formatInputDate(minCheckout);
    };

    const enablePicker = (input) => {
        if (!input) {
            return;
        }
        const handler = () => input.showPicker?.();
        input.addEventListener('focus', handler);
        input.addEventListener('click', handler);
    };

    enablePicker(manageCheckin);
    enablePicker(manageCheckout);
    updateManageBounds();

    if (manageCheckin) {
        manageCheckin.addEventListener('change', updateManageBounds);
    }

    if (!form) {
        return;
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const codeInput = document.querySelector('#lookup-code');
        const phoneInput = document.querySelector('#lookup-phone');
        const code = normalizeCode(codeInput ? codeInput.value : '');
        const phone = normalizePhone(phoneInput ? phoneInput.value : '');

        const recordsRaw = localStorage.getItem('reservationRecords');
        if (!recordsRaw) {
            showError();
            return;
        }
        let records = {};
        try {
            records = JSON.parse(recordsRaw) || {};
        } catch (error) {
            showError();
            return;
        }

        const record = records[code];
        if (!record || normalizePhone(record.phone) !== phone) {
            showError();
            return;
        }

        activeCode = code;
        showResult(record);
    });

    if (manageForm) {
        manageForm.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!activeRecord || activeRecord.status === 'canceled') {
                return;
            }
            const checkinValue = manageCheckin ? manageCheckin.value : '';
            const checkoutValue = manageCheckout ? manageCheckout.value : '';
            const guestsValue = manageGuests ? parseInt(manageGuests.value, 10) : 1;
            const roomsValue = manageRooms ? parseInt(manageRooms.value, 10) : 1;

            const checkinDate = parseDateValue(checkinValue);
            let checkoutDate = parseDateValue(checkoutValue);
            const isDaytripRecord = activeRecord && (String(activeRecord.nights) === '0' || activeRecord.checkin === activeRecord.checkout);

            if (checkinDate && (!checkoutDate || checkoutDate < checkinDate)) {
                checkoutDate = new Date(checkinDate);
                if (!isDaytripRecord) {
                    checkoutDate.setDate(checkoutDate.getDate() + 1);
                }
            }

            const updatedRecord = { ...activeRecord };
            updatedRecord.checkin = checkinDate ? toRecordDate(checkinValue) : updatedRecord.checkin;
            updatedRecord.checkout = checkoutDate ? toRecordDate(formatInputDate(checkoutDate)) : updatedRecord.checkout;

            if (checkinDate && checkoutDate) {
                const diff = Math.round((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
                if (diff <= 0) {
                    updatedRecord.nights = isDaytripRecord ? '0' : '1';
                } else {
                    updatedRecord.nights = String(diff);
                }
            }

            updatedRecord.roomCount = Number.isFinite(roomsValue) ? roomsValue : updatedRecord.roomCount || 1;
            updatedRecord.guests = Number.isFinite(guestsValue) ? guestsValue : updatedRecord.guests || 1;
            updatedRecord.rooms = buildRooms(updatedRecord, updatedRecord.roomCount, updatedRecord.guests);
            updatePlanRoomCounts(updatedRecord);
            updatedRecord.paymentStatus = managePaid && managePaid.checked ? 'paid' : updatedRecord.paymentStatus;
            updatedRecord.updatedAt = new Date().toISOString();

            updatedRecord.breakdown = computeBreakdown(updatedRecord);
            updatedRecord.totalPrice = updatedRecord.breakdown.total;

            saveRecord(updatedRecord);
            showResult(updatedRecord);
            showNotice('予約内容を更新しました。');
        });
    }

    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            if (!activeRecord || activeRecord.status === 'canceled') {
                return;
            }
            const confirmed = window.confirm('予約をキャンセルしますか？');
            if (!confirmed) {
                return;
            }
            const updatedRecord = { ...activeRecord };
            updatedRecord.status = 'canceled';
            updatedRecord.canceledAt = new Date().toISOString();
            saveRecord(updatedRecord);
            showResult(updatedRecord);
            showNotice('予約をキャンセルしました。');
        });
    }
})();
