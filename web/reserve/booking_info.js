
(() => {
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

    const paymentCheckbox = document.querySelector('#payment-complete');
    const paymentStatusText = document.querySelector('[data-payment-status]');
    const summaryPaymentText = document.querySelector('[data-plan-payment]');
    const paymentMethodRadios = document.querySelectorAll('input[name="payment"]');
    const cardSection = document.querySelector('[data-card-section]');

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

    const draftKey = 'bookingDraft';
    const SERVICE_RATE = 0.1;
    const TAX_RATE = 0.1;

    const extraOptions = {
        dinnerUpgrade: { label: '夕朝食アップグレード', price: 2000, per: 'guest', perNight: true },
        loungeAccess: { label: '雪見ラウンジ利用', price: 500, per: 'guest', perNight: false },
        privateBath: { label: '貸切風呂', price: 1600, per: 'room', perNight: true },
        lateCheckout: { label: 'レイトチェックアウト', price: 900, per: 'room', perNight: false },
        daytripAllAccess: { label: '館内オールアクセス', price: 500, per: 'guest', perNight: false },
        daytripMealUpgrade: { label: '季節の昼食追加', price: 1000, per: 'guest', perNight: false }
    };

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

    const getDatesLabel = () => {
        if (draft && draft.checkin) {
            if (draft.checkin === draft.checkout || isDaytrip()) {
                return `日帰り ${draft.checkin}`;
            }
            if (draft.checkout) {
                return `${draft.checkin} ～ ${draft.checkout}`;
            }
            return draft.checkin;
        }
        const fallback = cartItems[0];
        if (fallback && fallback.checkin) {
            if (fallback.checkin === fallback.checkout || String(fallback.nights) === '0') {
                return `日帰り ${fallback.checkin}`;
            }
            if (fallback.checkout) {
                return `${fallback.checkin} ～ ${fallback.checkout}`;
            }
            return fallback.checkin;
        }
        return '未選択';
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

    const buildRoomsForItem = (item, roomCount, totalGuests) => {
        const rooms = [];
        const allocations = allocateGuests(totalGuests, roomCount);
        allocations.forEach((guestsValue) => {
            rooms.push({
                cartIndex: item.cartIndex,
                planId: item.planId,
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
            line.textContent = `客室${index + 1}: ${planLabel}${room.guests}名`;
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
            head.textContent = `客室 ${index + 1}`;
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
            guestsLabel.textContent = '人数';
            const guestOptions = [1, 2, 3, 4, 5, 6].map((countValue) => ({
                value: String(countValue),
                label: `${countValue}名`
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
            noteLabel.textContent = 'ご要望';
            const noteInput = document.createElement('input');
            noteInput.className = 'booking-info__input';
            noteInput.type = 'text';
            noteInput.value = room.note || '';
            noteInput.placeholder = 'アレルギー・記念日など';
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
                saveDraft();
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

        return {
            base,
            addOns,
            subtotal,
            service,
            tax,
            total
        };
    };

    const updatePaymentStatus = () => {
        const paid = paymentCheckbox && paymentCheckbox.checked;
        const statusText = paid ? '支払い済み' : '未決済';
        if (paymentStatusText) {
            paymentStatusText.textContent = statusText;
        }
        if (summaryPaymentText) {
            summaryPaymentText.textContent = statusText;
        }
    };

    const updateSummary = () => {
        const totalGuests = roomState.reduce((sum, room) => sum + (room.guests || 1), 0);
        const totalRooms = roomState.length || 1;
        const planTitles = cartItems.map((item) => item.title).filter(Boolean).join(' / ');
        const planAmenities = cartItems.map((item) => item.amenity).filter(Boolean).join(' / ');
        const breakdown = computeBreakdown();

        setText(summaryEls.title, planTitles || 'プランを選択してください');
        setText(summaryEls.price, formatCurrency(breakdown.base));
        setText(summaryEls.amenity, planAmenities || '--');
        setText(summaryEls.dates, getDatesLabel(), '未選択');
        setText(summaryEls.guests, `${totalGuests}名`);
        setText(summaryEls.rooms, `${totalRooms}室`);
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
        updatePaymentStatus();
    };

    const saveDraft = () => {
        const draftData = {
            name: nameInput ? nameInput.value : '',
            kana: kanaInput ? kanaInput.value : '',
            email: emailInput ? emailInput.value : '',
            tel: telInput ? telInput.value : '',
            address: addressInput ? addressInput.value : '',
            arrival: arrivalSelect ? arrivalSelect.value : '',
            requests: requestsInput ? requestsInput.value : '',
            roomCount: roomCountSelect ? roomCountSelect.value : '1',
            rooms: roomState,
            paymentMethod: Array.from(paymentMethodRadios).find((radio) => radio.checked)?.value || 'card',
            paymentComplete: paymentCheckbox ? paymentCheckbox.checked : false,
            cardName: form ? form.querySelector('[name="card_name"]')?.value : '',
            cardNumber: form ? form.querySelector('[name="card_number"]')?.value : '',
            cardExpiry: form ? form.querySelector('[name="card_expiry"]')?.value : '',
            cardCvc: form ? form.querySelector('[name="card_cvc"]')?.value : ''
        };
        localStorage.setItem(draftKey, JSON.stringify(draftData));
    };

    const restoreDraft = () => {
        const raw = localStorage.getItem(draftKey);
        if (!raw) {
            return;
        }
        try {
            const stored = JSON.parse(raw);
            if (nameInput && stored.name !== undefined) {
                nameInput.value = stored.name;
            }
            if (kanaInput && stored.kana !== undefined) {
                kanaInput.value = stored.kana;
            }
            if (emailInput && stored.email !== undefined) {
                emailInput.value = stored.email;
            }
            if (telInput && stored.tel !== undefined) {
                telInput.value = stored.tel;
            }
            if (addressInput && stored.address !== undefined) {
                addressInput.value = stored.address;
            }
            if (arrivalSelect && stored.arrival) {
                arrivalSelect.value = stored.arrival;
            }
            if (requestsInput && stored.requests !== undefined) {
                requestsInput.value = stored.requests;
            }
            if (roomCountSelect && stored.roomCount) {
                roomCountSelect.value = stored.roomCount;
            }
            if (Array.isArray(stored.rooms) && stored.rooms.length) {
                roomState = roomState.map((room, index) => ({
                    ...room,
                    guests: parseInt(stored.rooms[index]?.guests, 10) || room.guests,
                    note: stored.rooms[index]?.note || room.note
                }));
            }
            if (paymentMethodRadios.length && stored.paymentMethod) {
                paymentMethodRadios.forEach((radio) => {
                    radio.checked = radio.value === stored.paymentMethod;
                });
            }
            if (paymentCheckbox && stored.paymentComplete) {
                paymentCheckbox.checked = Boolean(stored.paymentComplete);
            }
            if (form) {
                const cardName = form.querySelector('[name="card_name"]');
                const cardNumber = form.querySelector('[name="card_number"]');
                const cardExpiry = form.querySelector('[name="card_expiry"]');
                const cardCvc = form.querySelector('[name="card_cvc"]');
                if (cardName && stored.cardName !== undefined) {
                    cardName.value = stored.cardName;
                }
                if (cardNumber && stored.cardNumber !== undefined) {
                    cardNumber.value = stored.cardNumber;
                }
                if (cardExpiry && stored.cardExpiry !== undefined) {
                    cardExpiry.value = stored.cardExpiry;
                }
                if (cardCvc && stored.cardCvc !== undefined) {
                    cardCvc.value = stored.cardCvc;
                }
            }
        } catch (error) {
            return;
        }
    };
    const updateCardVisibility = () => {
        if (!cardSection || !paymentMethodRadios.length) {
            return;
        }
        const selected = Array.from(paymentMethodRadios).find((radio) => radio.checked);
        const isCard = selected ? selected.value === 'card' : true;
        cardSection.style.display = isCard ? '' : 'none';
    };

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
            showError(field, '必須項目です。');
            return false;
        }
        if (field.type === 'email' && value && !field.validity.valid) {
            showError(field, 'メールアドレスをご確認ください。');
            return false;
        }
        if (field.id === 'tel' && value && normalizePhone(value).length < 9) {
            showError(field, '電話番号をご確認ください。');
            return false;
        }
        clearError(field);
        return true;
    };

    const attachValidation = (field) => {
        if (!field) {
            return;
        }
        field.addEventListener('blur', () => validateField(field));
        field.addEventListener('input', () => {
            validateField(field);
            saveDraft();
        });
    };

    const updateSubmitState = () => {
        if (!submit || !agree) {
            return;
        }
        submit.disabled = !agree.checked;
    };

    if (roomCountSelect) {
        const ensureRoomOption = (count) => {
            if (!roomCountSelect.querySelector(`option[value=\"${count}\"]`)) {
                const option = document.createElement('option');
                option.value = String(count);
                option.textContent = `${count}室`;
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
                saveDraft();
            });
        }
    }

    if (paymentCheckbox) {
        paymentCheckbox.addEventListener('change', () => {
            updatePaymentStatus();
            saveDraft();
        });
    }

    paymentMethodRadios.forEach((radio) => {
        radio.addEventListener('change', () => {
            updateCardVisibility();
            saveDraft();
        });
    });

    if (agree) {
        agree.addEventListener('change', updateSubmitState);
        updateSubmitState();
    }

    [nameInput, kanaInput, emailInput, telInput].forEach(attachValidation);

    if (addressInput) {
        addressInput.addEventListener('input', saveDraft);
    }
    if (arrivalSelect) {
        arrivalSelect.addEventListener('change', saveDraft);
    }
    if (requestsInput) {
        requestsInput.addEventListener('input', saveDraft);
    }
    if (form) {
        form.querySelectorAll('[name^="card_"]').forEach((input) => {
            input.addEventListener('input', saveDraft);
        });
    }

    restoreDraft();
    updateCardVisibility();
    renderRooms();
    updateSummary();

    const generateCode = (records) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        do {
            code = '';
            for (let i = 0; i < 16; i += 1) {
                code += chars[Math.floor(Math.random() * chars.length)];
            }
        } while (records && records[code]);
        return code;
    };

    if (form && submit) {
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const valid = [nameInput, kanaInput, emailInput, telInput].every(validateField);
            if (!valid) {
                const firstInvalid = form.querySelector('.is-invalid');
                firstInvalid?.focus();
                return;
            }
            if (agree && !agree.checked) {
                return;
            }
            const phone = normalizePhone(telInput ? telInput.value : '');
            const recordsRaw = localStorage.getItem('reservationRecords');
            let records = {};
            if (recordsRaw) {
                try {
                    records = JSON.parse(recordsRaw) || {};
                } catch (error) {
                    records = {};
                }
            }
            const code = generateCode(records);
            const breakdown = computeBreakdown();
            const totalGuests = roomState.reduce((sum, room) => sum + (room.guests || 1), 0);
            const planTitles = cartItems.map((item) => item.title).filter(Boolean).join(' / ');
            const planAmenities = cartItems.map((item) => item.amenity).filter(Boolean).join(' / ');

            const fallbackDates = cartItems[0] || {};
            const record = {
                code,
                phone,
                status: 'confirmed',
                planTitle: planTitles,
                planAmenity: planAmenities,
                plans: cartItems,
                checkin: draft?.checkin || fallbackDates.checkin || '',
                checkout: draft?.checkout || fallbackDates.checkout || '',
                nights: draft?.nights || fallbackDates.nights || '',
                rooms: roomState,
                roomCount: roomState.length,
                guests: totalGuests,
                totalPrice: breakdown.total,
                breakdown,
                paymentStatus: paymentCheckbox && paymentCheckbox.checked ? 'paid' : 'unpaid',
                paymentMethod: Array.from(paymentMethodRadios).find((radio) => radio.checked)?.value || 'card',
                createdAt: new Date().toISOString()
            };

            records[code] = record;
            localStorage.setItem('reservationRecords', JSON.stringify(records));
            sessionStorage.setItem('reservationSuccess', JSON.stringify(record));
            localStorage.removeItem(draftKey);
            window.location.href = 'booking_complete.html';
        });
    }
})();
