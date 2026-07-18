
(() => {
    const supabase = window.supabaseClient;

    const draftRaw = sessionStorage.getItem('reservationDraft');
    let draft = null;
    if (draftRaw) {
        try {
            draft = JSON.parse(draftRaw);
        } catch (error) {
            draft = null;
        }
    }

    const cartRaw = sessionStorage.getItem('reservationCart');
    let cartItems = [];
    if (cartRaw) {
        try {
            const parsed = JSON.parse(cartRaw);
            if (Array.isArray(parsed)) {
                cartItems = parsed;
            }
        } catch (error) {
            cartItems = [];
        }
    }

    if (!cartItems.length && draft && draft.planTitle) {
        cartItems = [
            {
                planId: draft.planRoom || 'legacy',
                title: draft.planTitle || '',
                amenity: draft.planAmenity || '',
                roomType: draft.planRoom || 'standard',
                price: Number(draft.planPrice) || 0,
                capacity: 4,
                baseGuests: 2,
                extraGuestRate: 3500,
                pricingModel: String(draft.nights) === '0' ? 'daytrip' : 'stay',
                extras: [],
                selectedExtras: {},
                guests: parseInt(draft.guests, 10) || 1,
                roomCount: 1,
                nights: draft.nights || '1',
                daytripOptions: {
                    plan: draft.daytripPlan || '',
                    spa: draft.daytripSpa || '',
                    meal: draft.daytripMeal || ''
                }
            }
        ];
    }

    const form = document.querySelector('[data-booking-form]');
    const agree = document.querySelector('[data-agree]');
    const submit = form ? form.querySelector('.booking-info__submit') : null;

    const nameInput = document.querySelector('#name');
    const kanaInput = document.querySelector('#kana');
    const emailInput = document.querySelector('#email');
    const telInput = document.querySelector('#tel');
    const addressInput = document.querySelector('#address');
    const arrivalSelect = document.querySelector('#arrival');
    const requestsInput = document.querySelector('#requests');
    const roomCountSelect = document.querySelector('#room-count');

    const roomListEl = document.querySelector('[data-room-list]');
    const roomSummaryEl = document.querySelector('[data-room-summary]');

    const summaryPaymentText = document.querySelector('[data-plan-payment]');
    const paymentMethodRadios = document.querySelectorAll('input[name="payment"]');

    const summaryEls = {
        title: document.querySelector('[data-plan-title]'),
        price: document.querySelector('[data-plan-price]'),
        amenity: document.querySelector('[data-plan-amenity]'),
        dates: document.querySelector('[data-plan-dates]'),
        guests: document.querySelector('[data-plan-guests]'),
        rooms: document.querySelector('[data-plan-rooms]'),
        total: document.querySelector('[data-plan-total]')
    };

    const breakdownEls = {
        base: document.querySelector('[data-breakdown-base]'),
        addons: document.querySelector('[data-breakdown-addons]'),
        subtotal: document.querySelector('[data-breakdown-subtotal]'),
        service: document.querySelector('[data-breakdown-service]'),
        tax: document.querySelector('[data-breakdown-tax]'),
        total: document.querySelector('[data-breakdown-total]')
    };

    const SERVICE_RATE = 0.1;
    const TAX_RATE = 0.1;

    // 【i18n】现地決済/銀行振込 复用 reserve.info.payment.onsite /
    // reserve.info.payment.bankTransfer(booking_info.html 静态区块本来就
    // 用这两个 key),用函数取值而不是常量对象,保证语言切换后取到最新翻译。
    const getPaymentMethodLabel = (method) => (
        method === 'bank_transfer'
            ? window.ykT('reserve.info.payment.bankTransfer', '銀行振込')
            : window.ykT('reserve.info.payment.onsite', '現地決済')
    );

    // 追加选项价格用来做前端即时展示估算,从数据库 plan_extras 读取(不再硬编码),
    // 真正入账价格由后端 submit_reservation() 重新计算。
    let extraOptions = {};

    const normalizePhone = (value) => (value || '').replace(/\D/g, '');

    const formatCurrency = (value) => (Number.isFinite(value) ? `¥${value.toLocaleString('ja-JP')}` : '--');

    const allocateGuests = (totalGuests, roomCount) => {
        const base = Math.floor(totalGuests / roomCount);
        const remainder = totalGuests % roomCount;
        return Array.from({ length: roomCount }, (_, index) => base + (index < remainder ? 1 : 0));
    };

    const isDaytrip = () => {
        if (cartItems.some((item) => item.pricingModel === 'daytrip' || String(item.nights) === '0')) {
            return true;
        }
        return draft && String(draft.nights) === '0';
    };

    const getNights = () => {
        const value = cartItems[0]?.nights ?? draft?.nights;
        if (value !== undefined) {
            const parsedValue = parseInt(value, 10);
            if (Number.isFinite(parsedValue) && parsedValue >= 0) {
                return parsedValue === 0 ? 1 : parsedValue;
            }
        }
        if (draft && draft.checkin && draft.checkout) {
            const checkin = new Date(draft.checkin.replace(/\//g, '-'));
            const checkout = new Date(draft.checkout.replace(/\//g, '-'));
            const diff = Math.round((checkout - checkin) / (1000 * 60 * 60 * 24));
            return diff <= 0 ? 1 : diff;
        }
        return 1;
    };

    // 【i18n】和 reserve.js 购物车里的日期格式共用同一组 key
    // (reserve.dynamic.dateRangeDaytrip / dateRangeStay),两处语义完全一致。
    const getDatesLabel = () => {
        if (draft && draft.checkin) {
            if (draft.checkin === draft.checkout || isDaytrip()) {
                return window.ykT('reserve.dynamic.dateRangeDaytrip', '日帰り {date}').replace('{date}', draft.checkin);
            }
            if (draft.checkout) {
                return window.ykT('reserve.dynamic.dateRangeStay', '{checkin} ～ {checkout}').replace('{checkin}', draft.checkin).replace('{checkout}', draft.checkout);
            }
            return draft.checkin;
        }
        const fallback = cartItems[0];
        if (fallback && fallback.checkin) {
            if (fallback.checkin === fallback.checkout || String(fallback.nights) === '0') {
                return window.ykT('reserve.dynamic.dateRangeDaytrip', '日帰り {date}').replace('{date}', fallback.checkin);
            }
            if (fallback.checkout) {
                return window.ykT('reserve.dynamic.dateRangeStay', '{checkin} ～ {checkout}').replace('{checkin}', fallback.checkin).replace('{checkout}', fallback.checkout);
            }
            return fallback.checkin;
        }
        return window.ykT('reserve.info.value.unselected', '未選択');
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
            // 日帰り子选项(风呂プラン/お食事)的附加费,和 reserve.js /
            // 后端 submit_reservation() 保持同一份对照表,详见 reserve.js 注释。
            const planAddonMap = { relax: 0, sauna: 400, private: 900 };
            const mealAddonMap = { none: 0, light: 400, lunch: 900 };
            const planAddon = planAddonMap[daytripOptionsValue.plan] || 0;
            const mealAddon = mealAddonMap[daytripOptionsValue.meal] || 0;
            addOns += (planAddon + mealAddon) * guests;
        }

        return { base, addOns };
    };

    const buildRoomsForItem = (item, roomCount, totalGuests) => {
        const rooms = [];
        const allocations = allocateGuests(totalGuests, roomCount);
        allocations.forEach((guestsValue) => {
            rooms.push({
                cartIndex: item.cartIndex,
                planId: item.planId,
                planDbId: item.planDbId || null,
                planTitle: item.title,
                planAmenity: item.amenity,
                roomType: item.roomType,
                rate: Number(item.price) || 0,
                baseGuests: item.baseGuests || 2,
                extraGuestRate: item.extraGuestRate || 3500,
                pricingModel: item.pricingModel || 'stay',
                extras: item.selectedExtras || {},
                daytripOptions: item.daytripOptions || {},
                guests: guestsValue,
                note: ''
            });
        });
        return rooms;
    };

    let roomState = [];

    const buildRoomState = () => {
        if (!cartItems.length) {
            roomState = [];
            return;
        }
        const rooms = [];
        cartItems.forEach((item, index) => {
            const roomCount = item.roomCount || 1;
            const guests = item.guests || 1;
            const planItem = { ...item, cartIndex: index };
            rooms.push(...buildRoomsForItem(planItem, roomCount, guests));
        });
        roomState = rooms;
    };

    buildRoomState();
    const supportsRoomCount = cartItems.length <= 1 && !isDaytrip();

    const setText = (el, value, fallback = '--') => {
        if (!el) {
            return;
        }
        el.textContent = value || fallback;
    };

    const updateRoomSummary = () => {
        if (!roomSummaryEl) {
            return;
        }
        roomSummaryEl.innerHTML = '';
        roomState.forEach((room, index) => {
            const line = document.createElement('div');
            const planLabel = room.planTitle ? `${room.planTitle} / ` : '';
            // 【i18n】"客室{n}: {plan}{guests}"这个组合格式没有对应的静态
            // data-i18n 元素(是每次渲染都重新拼的动态摘要行),新增
            // reserve.info.roomSummaryLine key。
            line.textContent = window.ykT('reserve.info.roomSummaryLine', '客室{n}: {plan}{guests}')
                .replace('{n}', String(index + 1))
                .replace('{plan}', planLabel)
                .replace('{guests}', window.ykT(`reserve.search.guests.${room.guests}`, `${room.guests}名`));
            roomSummaryEl.appendChild(line);
        });
    };

    const renderRooms = () => {
        if (!roomListEl) {
            return;
        }
        roomListEl.innerHTML = '';
        roomState.forEach((room, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'booking-info__room';
            wrapper.dataset.roomIndex = String(index);

            const head = document.createElement('div');
            head.className = 'booking-info__room-head';
            head.textContent = window.ykT('reserve.info.roomLabel', '客室 {n}').replace('{n}', String(index + 1));
            wrapper.appendChild(head);

            if (room.planTitle) {
                const planLine = document.createElement('div');
                planLine.className = 'booking-info__room-plan';
                planLine.textContent = `${room.planTitle}${room.planAmenity ? ` / ${room.planAmenity}` : ''}`;
                wrapper.appendChild(planLine);
            }

            const grid = document.createElement('div');
            grid.className = 'booking-info__room-grid';

            const guestsLabel = document.createElement('label');
            guestsLabel.className = 'booking-info__label';
            guestsLabel.textContent = window.ykT('reserve.info.label.guests', '人数');
            // 【i18n】复用 reserve.search.guests.N(reserve.html 已有 1-6 档翻译)
            const guestOptions = [1, 2, 3, 4, 5, 6].map((countValue) => ({
                value: String(countValue),
                label: window.ykT(`reserve.search.guests.${countValue}`, `${countValue}名`)
            }));
            const guestsSelect = document.createElement('select');
            guestsSelect.className = 'booking-info__select';
            guestOptions.forEach((option) => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                guestsSelect.appendChild(opt);
            });
            guestsSelect.value = String(room.guests || 1);
            guestsLabel.appendChild(guestsSelect);

            const noteLabel = document.createElement('label');
            noteLabel.className = 'booking-info__label';
            // 【i18n】复用 booking_info.html 静态区块已有的
            // reserve.info.field.requests / reserve.info.placeholder.requests。
            noteLabel.textContent = window.ykT('reserve.info.field.requests', 'ご要望');
            const noteInput = document.createElement('input');
            noteInput.className = 'booking-info__input';
            noteInput.type = 'text';
            noteInput.value = room.note || '';
            noteInput.placeholder = window.ykT('reserve.info.placeholder.requests', 'アレルギーや記念日のご相談など');
            noteLabel.appendChild(noteInput);

            grid.appendChild(guestsLabel);
            grid.appendChild(noteLabel);

            wrapper.appendChild(grid);
            roomListEl.appendChild(wrapper);

            const updateRoom = () => {
                roomState[index] = {
                    ...roomState[index],
                    guests: parseInt(guestsSelect.value, 10) || 1,
                    note: noteInput.value.trim()
                };
                updateSummary();
            };

            guestsSelect.addEventListener('change', updateRoom);
            noteInput.addEventListener('input', updateRoom);
        });
    };

    const computeBreakdown = () => {
        const nights = getNights();
        let base = 0;
        let addOns = 0;

        if (cartItems.length) {
            cartItems.forEach((item, index) => {
                const rooms = roomState.filter((room) => room.cartIndex === index);
                const totalGuests = rooms.reduce((sum, room) => sum + (room.guests || 1), 0) || item.guests || 1;
                const roomCount = rooms.length || item.roomCount || 1;
                const totals = computePlanTotals(item, {
                    guests: totalGuests,
                    roomCount,
                    nights,
                    extras: item.selectedExtras || {},
                    daytripOptions: item.daytripOptions || {}
                });
                base += totals.base;
                addOns += totals.addOns;
            });
        }

        const subtotal = base + addOns;
        const service = Math.round(subtotal * SERVICE_RATE);
        const tax = Math.round((subtotal + service) * TAX_RATE);
        const total = subtotal + service + tax;

        return { base, addOns, subtotal, service, tax, total };
    };

    const getSelectedPaymentMethod = () => (
        Array.from(paymentMethodRadios).find((radio) => radio.checked)?.value || 'onsite'
    );

    const updatePaymentSummary = () => {
        const label = getPaymentMethodLabel(getSelectedPaymentMethod()) || '--';
        if (summaryPaymentText) {
            summaryPaymentText.textContent = label;
        }
    };

    const updateSummary = () => {
        const totalGuests = roomState.reduce((sum, room) => sum + (room.guests || 1), 0);
        const totalRooms = roomState.length || 1;
        const planTitles = cartItems.map((item) => item.title).filter(Boolean).join(' / ');
        const planAmenities = cartItems.map((item) => item.amenity).filter(Boolean).join(' / ');
        const breakdown = computeBreakdown();

        setText(summaryEls.title, planTitles || window.ykT('reserve.info.value.selectPlan', 'プランを選択してください'));
        setText(summaryEls.price, formatCurrency(breakdown.base));
        setText(summaryEls.amenity, planAmenities || '--');
        setText(summaryEls.dates, getDatesLabel(), window.ykT('reserve.info.value.unselected', '未選択'));
        setText(summaryEls.guests, formatGuestsLabel(totalGuests));
        setText(summaryEls.rooms, formatRoomsLabel(totalRooms));
        setText(summaryEls.total, formatCurrency(breakdown.total));

        if (breakdownEls.base) {
            breakdownEls.base.textContent = formatCurrency(breakdown.base);
        }
        if (breakdownEls.addons) {
            breakdownEls.addons.textContent = formatCurrency(breakdown.addOns);
        }
        if (breakdownEls.subtotal) {
            breakdownEls.subtotal.textContent = formatCurrency(breakdown.subtotal);
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

        updateRoomSummary();
        updatePaymentSummary();
    };

    // 【安全/隐私】这个页面收集的都是顾客个人信息(姓名/邮箱/电话/住所等),
    // 不再像旧版那样自动存进 localStorage 做"草稿恢复"—— 哪怕去掉了信用卡
    // 字段,姓名/邮箱/电话/住所本身也是需要最小化收集的个人数据(需求文档
    // 第五节 GDPR 提醒),没必要为了"刷新页面不丢草稿"这种小的体验优化,
    // 把这些信息以明文长期留在用户浏览器本地存储里。

    const updateCardVisibility = () => {}; // 已移除信用卡区块,保留空函数避免遗漏调用处报错

    const showError = (field, message) => {
        if (!field) {
            return;
        }
        field.classList.add('is-invalid');
        const group = field.closest('.booking-info__group');
        if (!group) {
            return;
        }
        let error = group.querySelector('.booking-info__error');
        if (!error) {
            error = document.createElement('p');
            error.className = 'booking-info__error';
            group.appendChild(error);
        }
        error.textContent = message;
    };

    const clearError = (field) => {
        if (!field) {
            return;
        }
        field.classList.remove('is-invalid');
        const group = field.closest('.booking-info__group');
        if (!group) {
            return;
        }
        const error = group.querySelector('.booking-info__error');
        if (error) {
            error.remove();
        }
    };

    const validateField = (field) => {
        if (!field) {
            return true;
        }
        const value = field.value.trim();
        if (field.hasAttribute('required') && !value) {
            showError(field, window.ykT('reserve.info.validation.required', '必須項目です。'));
            return false;
        }
        if (field.type === 'email' && value && !field.validity.valid) {
            showError(field, window.ykT('reserve.info.validation.email', 'メールアドレスをご確認ください。'));
            return false;
        }
        if (field.id === 'tel' && value && normalizePhone(value).length < 9) {
            showError(field, window.ykT('reserve.info.validation.tel', '電話番号をご確認ください。'));
            return false;
        }
        clearError(field);
        return true;
    };

    // 前端校验只是体验优化(尽早提示格式问题),不是安全边界——真正的输入
    // 校验/转义在后端 submit_reservation() 数据库函数里做,即使有人绕过这里
    // 直接调用 Edge Function,后端校验依然会挡下不合法的数据。
    const attachValidation = (field) => {
        if (!field) {
            return;
        }
        field.addEventListener('blur', () => validateField(field));
        field.addEventListener('input', () => validateField(field));
    };

    const updateSubmitState = () => {
        if (!submit || !agree) {
            return;
        }
        submit.disabled = !agree.checked;
    };

    // 【i18n】客室数标签复用 reserve.info.roomCount.N(booking_info.html
    // 静态下拉本来就是这组 key,1-4 档已有翻译);超出这个范围(多个购物车
    // 项目合并后的总客室数可能超过单项上限4间)才退回模板拼接。
    const formatRoomsLabel = (n) => window.ykT(`reserve.info.roomCount.${n}`, null) || window.ykT('reserve.dynamic.roomsUnit', '{n}室').replace('{n}', n);
    // 【i18n】人数标签,复用 reserve.search.guests.N(现有 1-8 档),多个购物车
    // 项目的人数加总后超出这个范围才退回模板拼接。
    const formatGuestsLabel = (n) => window.ykT(`reserve.search.guests.${n}`, null) || window.ykT('reserve.dynamic.guestsUnit', '{n}名').replace('{n}', n);

    if (roomCountSelect) {
        const ensureRoomOption = (count) => {
            if (!roomCountSelect.querySelector(`option[value=\"${count}\"]`)) {
                const option = document.createElement('option');
                option.value = String(count);
                option.textContent = formatRoomsLabel(count);
                roomCountSelect.appendChild(option);
            }
        };
        if (!supportsRoomCount) {
            const totalRooms = roomState.length || 1;
            ensureRoomOption(totalRooms);
            roomCountSelect.value = String(totalRooms);
            roomCountSelect.disabled = true;
        } else {
            const roomsValue = cartItems[0]?.roomCount || roomState.length || 1;
            ensureRoomOption(roomsValue);
            roomCountSelect.value = String(roomsValue);
            roomCountSelect.addEventListener('change', () => {
                const count = parseInt(roomCountSelect.value, 10) || 1;
                if (cartItems[0]) {
                    cartItems[0].roomCount = count;
                }
                buildRoomState();
                renderRooms();
                updateSummary();
            });
        }
    }

    paymentMethodRadios.forEach((radio) => {
        radio.addEventListener('change', updatePaymentSummary);
    });

    if (agree) {
        agree.addEventListener('change', updateSubmitState);
        updateSubmitState();
    }

    [nameInput, kanaInput, emailInput, telInput].forEach(attachValidation);

    updateCardVisibility();
    renderRooms();

    // ---------- 提交错误提示区(替代原来的 alert) ----------
    let submitErrorEl = null;
    const showSubmitError = (message) => {
        if (!form) {
            return;
        }
        if (!submitErrorEl) {
            submitErrorEl = document.createElement('p');
            submitErrorEl.className = 'booking-info__error';
            submitErrorEl.style.cssText = 'margin-top:12px;font-weight:600;';
            submit.insertAdjacentElement('beforebegin', submitErrorEl);
        }
        submitErrorEl.textContent = message;
        submitErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    const clearSubmitError = () => {
        if (submitErrorEl) {
            submitErrorEl.textContent = '';
        }
    };

    // ---------- 组装提交给 submit-reservation Edge Function 的请求体 ----------
    const buildSubmissionPayload = () => {
        const items = cartItems.map((item, index) => {
            const rooms = roomState.filter((room) => room.cartIndex === index);
            const totalGuests = rooms.reduce((sum, room) => sum + (room.guests || 1), 0) || item.guests || 1;
            const roomCount = rooms.length || item.roomCount || 1;
            const extraCodes = Object.entries(item.selectedExtras || {})
                .filter(([, checked]) => checked)
                .map(([code]) => code);

            const toIsoDate = (value) => (value ? value.replace(/\//g, '-') : '');
            const checkin = toIsoDate(item.checkin || draft?.checkin || '');
            const checkoutRaw = item.checkout || draft?.checkout || item.checkin || draft?.checkin || '';
            const checkout = toIsoDate(checkoutRaw);

            return {
                plan_id: item.planDbId,
                checkin_date: checkin,
                checkout_date: item.pricingModel === 'daytrip' ? checkin : checkout,
                guests: totalGuests,
                room_count: roomCount,
                extra_codes: extraCodes,
                daytrip_options: item.pricingModel === 'daytrip' ? (item.daytripOptions || {}) : null
            };
        });

        // 各客室的个别备注(在客室ごとの内容里填写),schema 没有为每个房间
        // 单独建备注字段,合并进整单的 special_requests 一起提交。
        const roomNotes = roomState
            .filter((room) => room.note)
            .map((room, index) => `客室${index + 1}: ${room.note}`)
            .join(' / ');
        const requestsValue = requestsInput ? requestsInput.value.trim() : '';
        const combinedRequests = [requestsValue, roomNotes].filter(Boolean).join(' | ');

        return {
            guest_name: nameInput ? nameInput.value.trim() : '',
            guest_kana: kanaInput ? kanaInput.value.trim() : '',
            guest_email: emailInput ? emailInput.value.trim() : '',
            guest_phone: telInput ? telInput.value.trim() : '',
            guest_address: addressInput ? addressInput.value.trim() : null,
            arrival_time: arrivalSelect ? arrivalSelect.value : null,
            special_requests: combinedRequests || null,
            payment_method: getSelectedPaymentMethod(),
            locale: document.documentElement.lang || 'ja',
            items
        };
    };

    // supabase.functions.invoke 返回 { data, error };出错时 error.context 是
    // 原始 Response,里面是我们 Edge Function 自己写的、不含内部细节的中文提示。
    const extractErrorMessage = async (error) => {
        // 这个兜底提示只在 submit-reservation Edge Function 没能返回安全文案时
        // 才会用到(比如网络层面直接失败,error.context 拿不到 body),
        // 正常路径下用户看到的是后端返回的具体错误(如"库存不足"),那部分
        // 文案由后端 submit_reservation() 生成,不接入前端 i18n 字典
        // (后端目前只产出中文提示,属已知限制,见本轮变更记录)。
        const fallback = window.ykT('reserve.dynamic.submitReservationError', '予約の送信に失敗しました。しばらくしてから再度お試しください。');
        if (!error) {
            return fallback;
        }
        try {
            if (error.context && typeof error.context.json === 'function') {
                const body = await error.context.json();
                if (body && body.error) {
                    return body.error;
                }
            }
        } catch (parseError) {
            // 解析失败就用兜底提示,不把解析异常细节展示给用户
        }
        return fallback;
    };

    if (form && submit) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearSubmitError();

            const valid = [nameInput, kanaInput, emailInput, telInput].every(validateField);
            if (!valid) {
                const firstInvalid = form.querySelector('.is-invalid');
                firstInvalid?.focus();
                return;
            }
            if (agree && !agree.checked) {
                return;
            }
            if (!cartItems.length || cartItems.some((item) => !item.planDbId)) {
                showSubmitError(window.ykT('reserve.info.submitError.missingPlan', 'プラン情報が正しく取得できていません。予約ページからやり直してください。'));
                return;
            }
            if (!supabase) {
                // 【i18n】和 reserve.js 里的"未接続"提示是同一句日文,复用同一个
                // key(reserve.dynamic.connectError),不重复定义。
                showSubmitError(window.ykT('reserve.dynamic.connectError', '予約システムに接続できませんでした。しばらくしてから再度お試しください。'));
                return;
            }

            const payload = buildSubmissionPayload();

            submit.disabled = true;
            const originalLabel = submit.textContent;
            submit.textContent = window.ykT('reserve.info.submitSending', '送信中…');

            const { data, error } = await supabase.functions.invoke('submit-reservation', {
                body: payload
            });

            if (error || !data || !data.data) {
                const message = await extractErrorMessage(error);
                showSubmitError(message);
                submit.disabled = !agree || !agree.checked;
                submit.textContent = originalLabel;
                return;
            }

            const result = data.data;
            sessionStorage.setItem('reservationSuccess', JSON.stringify({
                code: result.code,
                totalPrice: result.total_price,
                paymentMethod: payload.payment_method,
                planTitles: cartItems.map((item) => item.title).filter(Boolean).join(' / ')
            }));
            sessionStorage.removeItem('reservationCart');
            sessionStorage.removeItem('reservationDraft');
            window.location.href = 'booking_complete.html';
        });
    }

    // ---------- 启动流程:先从数据库读取追加选项价格,再渲染页面 ----------
    const init = async () => {
        if (supabase) {
            const { data, error } = await supabase.from('plan_extras').select('*');
            if (error) {
                console.error('[booking_info] plan_extras 読み込み失敗', error);
            } else {
                extraOptions = {};
                (data || []).forEach((row) => {
                    extraOptions[row.code] = {
                        label: row.name_ja,
                        price: row.price,
                        per: row.charge_unit,
                        perNight: row.per_night
                    };
                });
            }
        }
        updateSummary();
    };

    // 【i18n】语言切换时重新渲染房间列表(标签/占位符文字)和顶部摘要。
    window.addEventListener('yk:languagechange', () => {
        renderRooms();
        updateSummary();
    });

    init();
})();
