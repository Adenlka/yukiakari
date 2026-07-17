
(() => {
    const calendarRoot = document.querySelector('[data-calendar]');
    const calendarGrid = document.querySelector('[data-cal-grid]');
    const monthLabel = document.querySelector('[data-cal-month]');
    const prevButton = document.querySelector('[data-cal-prev]');
    const nextButton = document.querySelector('[data-cal-next]');
    const checkinInput = document.querySelector('#checkin-date');
    const checkoutInput = document.querySelector('#checkout-date');
    const nightsSelect = document.querySelector('#stay-nights');
    const guestsSelect = document.querySelector('#stay-guests');
    const roomSelect = document.querySelector('#room-type');
    const daytripOptions = document.querySelector('[data-options-daytrip]');
    const stayOptions = document.querySelector('[data-options-stay]');
    const daytripFields = document.querySelectorAll('[data-daytrip-field]');
    const stayFields = document.querySelectorAll('[data-stay-field]');
    const resultsSummary = document.querySelector('[data-results-summary]');
    const resultsTitle = document.querySelector('.reserve-results__title');
    const sortSelect = document.querySelector('[data-sort]');
    const results = document.querySelector('[data-results]');
    const resultsList = document.querySelector('.reserve-results__list');
    const planCards = Array.from(document.querySelectorAll('.plan-card'));

    const cartList = document.querySelector('[data-cart-list]');
    const cartTotal = document.querySelector('[data-cart-total]');
    const cartNote = document.querySelector('[data-cart-note]');
    const cartContinue = document.querySelector('[data-cart-continue]');

    const planModal = document.querySelector('[data-plan-modal]');
    const planModalTitle = document.querySelector('#plan-modal-title');
    const planModalText = document.querySelector('[data-plan-modal-text]');
    const planModalFeatures = document.querySelector('[data-plan-modal-features]');
    const planModalFacilities = document.querySelector('[data-plan-modal-facilities]');
    const planModalPrice = document.querySelector('[data-plan-modal-price]');
    const planModalExtras = document.querySelector('[data-plan-modal-extras]');
    const planModalAdd = document.querySelector('[data-plan-add-modal]');
    const planModalClose = Array.from(document.querySelectorAll('[data-plan-close]'));

    const cartConfirm = document.querySelector('[data-cart-confirm]');
    const cartConfirmCancel = Array.from(document.querySelectorAll('[data-cart-confirm-cancel]'));
    const cartConfirmAccept = document.querySelector('[data-cart-confirm-accept]');

    if (!calendarRoot || !calendarGrid || !monthLabel) {
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 9);

    const SERVICE_RATE = 0.1;
    const TAX_RATE = 0.1;
    const MAX_ROOMS = 4;

    const extraOptions = {
        dinnerUpgrade: { label: '夕朝食アップグレード', price: 2000, per: 'guest', perNight: true },
        loungeAccess: { label: '雪見ラウンジ利用', price: 500, per: 'guest', perNight: false },
        privateBath: { label: '貸切風呂', price: 1600, per: 'room', perNight: true },
        lateCheckout: { label: 'レイトチェックアウト', price: 900, per: 'room', perNight: false },
        daytripAllAccess: { label: '館内オールアクセス', price: 500, per: 'guest', perNight: false },
        daytripMealUpgrade: { label: '季節の昼食追加', price: 1000, per: 'guest', perNight: false }
    };

    const planDetailsByRoom = {
        villa: {
            capacity: 4,
            baseGuests: 2,
            extraGuestRate: 3000,
            unitLabel: '1室 / 1泊',
            pricingModel: 'stay',
            extras: ['dinnerUpgrade', 'privateBath', 'loungeAccess', 'lateCheckout'],
            features: ['専用露天風呂', '囲炉裏の間', '森の独立棟'],
            facilities: ['湯上がり処', '雪見テラス', '送迎サービス']
        },
        viewbath: {
            capacity: 3,
            baseGuests: 2,
            extraGuestRate: 2500,
            unitLabel: '1室 / 1泊',
            pricingModel: 'stay',
            extras: ['dinnerUpgrade', 'loungeAccess', 'lateCheckout'],
            features: ['展望風呂', '雪景色ビュー', '広縁'],
            facilities: ['湯上がり処', '雪見テラス', 'ラウンジドリンク']
        },
        modern: {
            capacity: 4,
            baseGuests: 2,
            extraGuestRate: 2000,
            unitLabel: '1室 / 1泊',
            pricingModel: 'stay',
            extras: ['dinnerUpgrade', 'loungeAccess'],
            features: ['和洋室', '琉球畳', 'ツインベッド'],
            facilities: ['湯上がり処', 'ラウンジドリンク', '売店']
        },
        standard: {
            capacity: 5,
            baseGuests: 2,
            extraGuestRate: 1600,
            unitLabel: '1室 / 1泊',
            pricingModel: 'stay',
            extras: ['dinnerUpgrade', 'loungeAccess'],
            features: ['純和風客室', '広縁', '静かな眺望'],
            facilities: ['湯上がり処', '売店', '回廊散策']
        }
    };
    const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
    const isSameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}/${m}/${d}`;
    };
    const formatDateInput = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const parseDate = (value) => {
        if (!value) {
            return null;
        }
        const parts = value.split(/[\/-]/).map((part) => parseInt(part, 10));
        if (parts.length !== 3 || parts.some(Number.isNaN)) {
            return null;
        }
        const [year, month, day] = parts;
        const parsed = new Date(year, month - 1, day);
        if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
            return null;
        }
        parsed.setHours(0, 0, 0, 0);
        return parsed;
    };

    const formatCurrency = (value) => (Number.isFinite(value) ? `¥${value.toLocaleString('ja-JP')}` : '--');

    const availabilityForDate = (date) => {
        const seed = date.getFullYear() + date.getMonth() * 31 + date.getDate();
        const mod = seed % 7;
        if (mod === 0 || mod === 1) {
            return 'unavailable';
        }
        if (mod === 2) {
            return 'limited';
        }
        return 'available';
    };

    const readText = (el) => (el ? el.textContent.trim() : '');

    const getPlanDataFromCard = (card) => {
        const titleEl = card.querySelector('.plan-card__title');
        const textEl = card.querySelector('.plan-card__text');
        const amenityEl = card.querySelector('.plan-card__amenity');
        const badgeEls = Array.from(card.querySelectorAll('.plan-card__badge'));
        const metaEls = Array.from(card.querySelectorAll('.plan-card__meta span'));
        const media = card.querySelector('.plan-card__media');

        return {
            id: card.dataset.planRoom || card.dataset.planTitle || readText(titleEl),
            title: readText(titleEl),
            text: readText(textEl),
            amenity: readText(amenityEl),
            price: Number(card.dataset.planPrice) || 0,
            roomType: card.dataset.planRoom || '',
            badges: badgeEls.map((badge) => badge.textContent.trim()).filter(Boolean),
            meta: metaEls.map((meta) => meta.textContent.trim()),
            image: media ? getComputedStyle(media).backgroundImage : ''
        };
    };

    const defaultPlans = planCards.map(getPlanDataFromCard).map((plan) => ({
        ...plan,
        ...planDetailsByRoom[plan.roomType]
    }));

    const daytripPlans = [
        {
            id: 'daytrip-relax',
            title: '日帰り温泉「雪灯り」プラン',
            text: '雪見露天と檜の大浴場で湯けむりを満喫。湯上がり処で静かな時間をお過ごしください。',
            amenity: '温泉利用付',
            price: 4800,
            roomType: 'none',
            badges: ['日帰り', '人気'],
            meta: ['利用時間 10:00～15:00', 'タオル付 / 湯上がり処利用可'],
            image: 'url("../assets/images/onsen/onsen-01.jpg")',
            capacity: 6,
            baseGuests: 1,
            extraGuestRate: 0,
            unitLabel: '1名 / 日帰り',
            pricingModel: 'daytrip',
            extras: ['daytripAllAccess', 'daytripMealUpgrade'],
            features: ['雪見露天風呂', '檜の大浴場', '湯上がり処'],
            facilities: ['露天風呂', '大浴場', '湯上がり処']
        },
        {
            id: 'daytrip-sauna',
            title: 'サウナ集中「ととのい」プラン',
            text: 'ロウリュサウナと水風呂でリフレッシュ。外気浴テラスで深くととのいます。',
            amenity: 'サウナ利用付',
            price: 5400,
            roomType: 'none',
            badges: ['日帰り', 'サウナ'],
            meta: ['利用時間 10:00～14:00', '外気浴テラス利用'],
            image: 'url("../assets/images/onsen/onsen-06.jpg")',
            capacity: 6,
            baseGuests: 1,
            extraGuestRate: 0,
            unitLabel: '1名 / 日帰り',
            pricingModel: 'daytrip',
            extras: ['daytripAllAccess', 'daytripMealUpgrade'],
            features: ['ロウリュサウナ', '外気浴テラス', '水風呂'],
            facilities: ['サウナ', '水風呂', '外気浴テラス']
        },
        {
            id: 'daytrip-private',
            title: '貸切風呂「灯」プラン',
            text: '信楽焼の貸切風呂で静かな時間を。雪見障子越しの景色をご堪能ください。',
            amenity: '貸切風呂付',
            price: 7200,
            roomType: 'none',
            badges: ['日帰り', '限定'],
            meta: ['利用時間 11:00～15:00', '事前予約必須'],
            image: 'url("../assets/images/onsen/onsen-03.jpg")',
            capacity: 4,
            baseGuests: 1,
            extraGuestRate: 0,
            unitLabel: '1名 / 日帰り',
            pricingModel: 'daytrip',
            extras: ['daytripAllAccess', 'daytripMealUpgrade'],
            features: ['信楽焼貸切風呂', '雪見障子', 'プライベート空間'],
            facilities: ['貸切風呂', '湯上がり処']
        }
    ];

    let currentPlans = defaultPlans;

    const allocateGuests = (totalGuests, roomCount) => {
        const base = Math.floor(totalGuests / roomCount);
        const remainder = totalGuests % roomCount;
        return Array.from({ length: roomCount }, (_, index) => base + (index < remainder ? 1 : 0));
    };
    const getGuestsValue = () => {
        if (!guestsSelect) {
            return 1;
        }
        const value = parseInt(guestsSelect.value, 10);
        return Number.isFinite(value) && value > 0 ? value : 1;
    };

    const getNightsValue = () => {
        if (checkinDate && checkoutDate) {
            const diff = Math.round((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
            if (diff >= 0) {
                return diff;
            }
        }
        if (nightsSelect) {
            const value = parseInt(nightsSelect.value, 10);
            return Number.isFinite(value) && value >= 0 ? value : 1;
        }
        return 1;
    };

    const isDaytrip = () => nightsSelect && nightsSelect.value === '0';

    const getMinRooms = (plan, guests) => {
        if (plan.pricingModel === 'daytrip') {
            return 1;
        }
        const capacity = plan.capacity || 4;
        return Math.max(1, Math.ceil(guests / capacity));
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

        const subtotal = base + addOns;
        const service = Math.round(subtotal * SERVICE_RATE);
        const tax = Math.round((subtotal + service) * TAX_RATE);
        const total = subtotal + service + tax;

        return { base, addOns, service, tax, total };
    };

    const updatePlanPriceDisplay = (card, plan) => {
        const priceMain = card.querySelector('[data-price-main]');
        const priceSub = card.querySelector('[data-price-sub]');
        const priceNote = card.querySelector('.plan-card__price-note');
        const guests = getGuestsValue();
        const nightsValue = isDaytrip() ? 1 : Math.max(1, getNightsValue());
        const roomCount = getMinRooms(plan, guests);
        const totals = computePlanTotals(plan, {
            guests,
            roomCount,
            nights: nightsValue,
            extras: {},
            daytripOptions: {
                plan: document.querySelector('#daytrip-plan')?.value || '',
                meal: document.querySelector('#daytrip-meal')?.value || ''
            }
        });

        if (priceMain) {
            priceMain.textContent = formatCurrency(plan.price);
        }
        if (priceNote) {
            priceNote.textContent = plan.unitLabel || '1室 / 1泊';
        }
        if (priceSub) {
            const label = isDaytrip() ? '日帰り' : `${guests}名 / ${nightsValue}泊`;
            priceSub.textContent = `目安合計 ${formatCurrency(totals.total)} (${label})`;
        }
    };

    const updatePlanCard = (card, data) => {
        const titleEl = card.querySelector('.plan-card__title');
        const textEl = card.querySelector('.plan-card__text');
        const amenityEl = card.querySelector('.plan-card__amenity');
        const badgeWrap = card.querySelector('.plan-card__badges');
        const metaEls = Array.from(card.querySelectorAll('.plan-card__meta span'));
        const media = card.querySelector('.plan-card__media');

        card.dataset.planTitle = data.title;
        card.dataset.planPrice = String(data.price || 0);
        card.dataset.planAmenity = data.amenity;
        card.dataset.planRoom = data.roomType || '';

        if (titleEl) {
            titleEl.textContent = data.title;
        }
        if (textEl) {
            textEl.textContent = data.text;
        }
        if (amenityEl) {
            amenityEl.textContent = data.amenity;
        }
        if (badgeWrap) {
            badgeWrap.innerHTML = '';
            data.badges.forEach((badge) => {
                const span = document.createElement('span');
                span.className = 'plan-card__badge';
                span.textContent = badge;
                badgeWrap.appendChild(span);
            });
        }
        if (metaEls.length) {
            metaEls.forEach((metaEl, index) => {
                metaEl.textContent = data.meta[index] || '';
            });
        }
        if (media && data.image) {
            media.style.backgroundImage = data.image;
        }
        updatePlanPriceDisplay(card, data);
    };

    const updatePlanCards = (daytripMode) => {
        const plans = daytripMode ? daytripPlans : defaultPlans;
        currentPlans = plans;
        planCards.forEach((card, index) => {
            const plan = plans[index];
            if (!plan) {
                card.style.display = 'none';
                return;
            }
            card.style.display = '';
            updatePlanCard(card, plan);
        });
        if (resultsTitle) {
            resultsTitle.textContent = daytripMode ? 'おすすめ日帰りプラン' : 'おすすめ宿泊プラン';
        }
    };

    const updateRoomOptions = (daytripMode) => {
        if (!roomSelect) {
            return;
        }
        const allowed = daytripMode ? ['none', 'villa', 'viewbath'] : null;
        Array.from(roomSelect.options).forEach((option) => {
            if (!daytripMode) {
                option.disabled = false;
                return;
            }
            option.disabled = !allowed.includes(option.value);
        });
        if (daytripMode && !allowed.includes(roomSelect.value)) {
            roomSelect.value = 'none';
        }
    };

    const applySearch = () => {
        if (!planCards.length) {
            return;
        }
        const roomFilter = roomSelect ? roomSelect.value : '';

        planCards.forEach((card, index) => {
            const plan = currentPlans[index];
            if (!plan) {
                card.style.display = 'none';
                return;
            }

            let visible = true;
            if (roomFilter && roomFilter !== 'all' && roomFilter !== 'none') {
                visible = plan.roomType === roomFilter;
            }

            card.style.display = visible ? '' : 'none';
        });
    };
    let currentMonth = startOfMonth(today);
    const minMonth = startOfMonth(today);
    const maxMonth = startOfMonth(maxDate);

    let checkinDate = null;
    let checkoutDate = null;
    let selectionMode = 'checkin';

    const setSelectionMode = (mode) => {
        selectionMode = mode;
        calendarRoot.classList.toggle('is-selecting-checkin', mode === 'checkin');
        calendarRoot.classList.toggle('is-selecting-checkout', mode === 'checkout');
        renderCalendar();
    };

    const focusCalendar = () => {
        calendarRoot.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const openNativePicker = (input) => {
        if (!input || typeof input.showPicker !== 'function') {
            return;
        }
        input.showPicker();
    };

    if (checkinInput) {
        checkinInput.addEventListener('focus', () => setSelectionMode('checkin'));
        checkinInput.addEventListener('click', () => {
            setSelectionMode('checkin');
            openNativePicker(checkinInput);
        });
    }

    if (checkoutInput) {
        checkoutInput.addEventListener('focus', () => setSelectionMode('checkout'));
        checkoutInput.addEventListener('click', () => {
            setSelectionMode('checkout');
            openNativePicker(checkoutInput);
        });
    }

    const updateInputs = () => {
        if (checkinInput) {
            checkinInput.value = checkinDate ? formatDateInput(checkinDate) : '';
        }
        if (checkoutInput) {
            checkoutInput.value = checkoutDate ? formatDateInput(checkoutDate) : '';
        }
    };

    const ensureNightsOption = (value) => {
        if (!nightsSelect || value === 0) {
            return;
        }
        const exists = Array.from(nightsSelect.options).some((opt) => parseInt(opt.value, 10) === value);
        if (exists) {
            return;
        }
        const option = document.createElement('option');
        option.value = String(value);
        option.textContent = `${value}泊`;
        nightsSelect.appendChild(option);
    };

    const updateSummary = () => {
        if (!resultsSummary) {
            return;
        }
        const guests = getGuestsValue();
        if (!checkinDate) {
            resultsSummary.textContent = '日付を選択してください。';
            return;
        }
        if (checkinDate && checkoutDate) {
            if (isDaytrip() && isSameDay(checkinDate, checkoutDate)) {
                resultsSummary.textContent = `日帰り ${formatDate(checkinDate)} / ${guests}名`;
                return;
            }
            resultsSummary.textContent = `チェックイン ${formatDate(checkinDate)} / チェックアウト ${formatDate(checkoutDate)} / ${guests}名`;
            return;
        }
        resultsSummary.textContent = `チェックイン ${formatDate(checkinDate)} / ${guests}名`;
    };

    const updateNights = () => {
        if (!nightsSelect || !checkinDate || !checkoutDate) {
            return;
        }
        const diff = Math.round((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
        if (diff >= 0) {
            ensureNightsOption(diff);
            nightsSelect.value = String(diff);
        }
    };

    const updateCheckoutBounds = () => {
        if (!checkoutInput) {
            return;
        }
        if (!checkinDate) {
            checkoutInput.min = formatDateInput(today);
            checkoutInput.max = formatDateInput(maxDate);
            return;
        }
        const minDate = new Date(checkinDate);
        if (!isDaytrip()) {
            minDate.setDate(minDate.getDate() + 1);
        }
        checkoutInput.min = formatDateInput(minDate);
        checkoutInput.max = formatDateInput(maxDate);
        if (checkoutDate && checkoutDate < minDate) {
            checkoutDate = new Date(minDate);
            updateInputs();
        }
    };

    const applyNights = () => {
        if (!nightsSelect || !checkinDate) {
            return;
        }
        const nights = parseInt(nightsSelect.value, 10);
        if (Number.isNaN(nights) || nights < 0) {
            return;
        }
        const newCheckout = new Date(checkinDate);
        newCheckout.setDate(newCheckout.getDate() + nights);
        if (newCheckout <= maxDate) {
            checkoutDate = newCheckout;
        }
        updateCheckoutBounds();
        updateInputs();
        updateSummary();
        renderCalendar();
    };

    const toggleOptions = () => {
        const daytripMode = isDaytrip();
        if (daytripOptions) {
            daytripOptions.classList.toggle('is-hidden', !daytripMode);
        }
        if (stayOptions) {
            stayOptions.classList.toggle('is-hidden', daytripMode);
        }
        daytripFields.forEach((field) => field.classList.toggle('is-hidden', !daytripMode));
        stayFields.forEach((field) => field.classList.toggle('is-hidden', daytripMode));
        updateRoomOptions(daytripMode);
        updatePlanCards(daytripMode);
        applySearch();
    };

    const renderCalendar = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        monthLabel.textContent = `${year}年${month + 1}月`;
        if (prevButton) {
            prevButton.disabled = currentMonth <= minMonth;
        }
        if (nextButton) {
            nextButton.disabled = currentMonth >= maxMonth;
        }

        calendarGrid.innerHTML = '';

        const firstDay = new Date(year, month, 1);
        const startWeekday = firstDay.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const totalCells = 42;

        for (let i = 0; i < totalCells; i += 1) {
            const dayNumber = i - startWeekday + 1;
            const cellDate = new Date(year, month, dayNumber);
            const isCurrentMonth = dayNumber > 0 && dayNumber <= daysInMonth;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'reserve-calendar__day';
            button.textContent = String(cellDate.getDate());

            if (!isCurrentMonth) {
                button.classList.add('is-muted');
                button.disabled = true;
            } else {
                const isPast = cellDate < today;
                const isFutureLimit = cellDate > maxDate;
                if (isPast || isFutureLimit) {
                    button.classList.add('is-disabled');
                    button.disabled = true;
                } else {
                    const availability = availabilityForDate(cellDate);
                    button.classList.add(`is-${availability}`);
                    button.dataset.date = formatDate(cellDate);
                }
            }

            if (isSameDay(cellDate, checkinDate) || isSameDay(cellDate, checkoutDate)) {
                button.classList.add('is-selected');
            } else if (checkinDate && checkoutDate && cellDate > checkinDate && cellDate < checkoutDate) {
                button.classList.add('is-in-range');
            }

            calendarGrid.appendChild(button);
        }
    };

    const moveMonth = (direction) => {
        const nextMonth = new Date(currentMonth);
        nextMonth.setMonth(nextMonth.getMonth() + direction);
        if (nextMonth < minMonth || nextMonth > maxMonth) {
            return;
        }
        currentMonth = startOfMonth(nextMonth);
        renderCalendar();
    };

    const handleDayClick = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement)) {
            return;
        }
        const dateValue = target.dataset.date;
        if (!dateValue) {
            return;
        }
        const selected = parseDate(dateValue);
        if (!selected) {
            return;
        }

        if (selectionMode === 'checkout') {
            if (!checkinDate || selected < checkinDate) {
                checkinDate = selected;
                checkoutDate = null;
                if (isDaytrip()) {
                    checkoutDate = selected;
                }
                setSelectionMode('checkout');
            } else {
                checkoutDate = selected;
            }
        } else {
            checkinDate = selected;
            if (checkoutDate && checkoutDate < selected) {
                checkoutDate = null;
            }
            if (isDaytrip()) {
                checkoutDate = selected;
            }
            setSelectionMode('checkout');
        }

        updateInputs();
        updateNights();
        updateCheckoutBounds();
        updateSummary();
        renderCalendar();
        focusCalendar();
        updatePlanCards(isDaytrip());
        syncCartDates();
    };

    calendarGrid.addEventListener('click', handleDayClick);
    if (prevButton) {
        prevButton.addEventListener('click', () => moveMonth(-1));
    }
    if (nextButton) {
        nextButton.addEventListener('click', () => moveMonth(1));
    }

    if (checkinInput) {
        checkinInput.addEventListener('change', (event) => {
            const value = parseDate(event.target.value);
            if (!value) {
                return;
            }
            checkinDate = value;
            if (isDaytrip()) {
                checkoutDate = value;
            } else if (checkoutDate && checkoutDate < value) {
                checkoutDate = null;
            }
            applyNights();
            updateCheckoutBounds();
            updateSummary();
            renderCalendar();
            updatePlanCards(isDaytrip());
            syncCartDates();
        });
    }

    if (checkoutInput) {
        checkoutInput.addEventListener('change', (event) => {
            const value = parseDate(event.target.value);
            if (!value) {
                return;
            }
            if (!checkinDate) {
                checkinDate = value;
            }
            if (value < checkinDate) {
                checkoutDate = checkinDate;
            } else {
                checkoutDate = value;
            }
            updateInputs();
            updateNights();
            updateCheckoutBounds();
            updateSummary();
            renderCalendar();
            updatePlanCards(isDaytrip());
            syncCartDates();
        });
    }

    if (nightsSelect) {
        nightsSelect.addEventListener('change', () => {
            toggleOptions();
            applyNights();
            updateCheckoutBounds();
            updatePlanCards(isDaytrip());
            syncCartDates();
        });
    }

    if (guestsSelect) {
        guestsSelect.addEventListener('change', () => {
            updateSummary();
            updatePlanCards(isDaytrip());
            renderCart();
        });
    }

    const daytripPlanSelect = document.querySelector('#daytrip-plan');
    const daytripMealSelect = document.querySelector('#daytrip-meal');
    if (daytripPlanSelect) {
        daytripPlanSelect.addEventListener('change', () => {
            updatePlanCards(isDaytrip());
            syncCartDates();
        });
    }
    if (daytripMealSelect) {
        daytripMealSelect.addEventListener('change', () => {
            updatePlanCards(isDaytrip());
            syncCartDates();
        });
    }

    if (roomSelect) {
        roomSelect.addEventListener('change', applySearch);
    }

    const searchForm = document.querySelector('.reserve-search__form');
    if (searchForm) {
        searchForm.addEventListener('submit', (event) => {
            event.preventDefault();
        });
    }

    if (sortSelect && resultsList) {
        const cards = Array.from(resultsList.children);
        const originalOrder = cards.slice();
        sortSelect.addEventListener('change', () => {
            let sorted = [];
            if (sortSelect.value === 'price-low') {
                sorted = cards.slice().sort((a, b) => Number(a.dataset.planPrice) - Number(b.dataset.planPrice));
            } else if (sortSelect.value === 'price-high') {
                sorted = cards.slice().sort((a, b) => Number(b.dataset.planPrice) - Number(a.dataset.planPrice));
            } else {
                sorted = originalOrder;
            }
            sorted.forEach((card) => resultsList.appendChild(card));
        });
    }
    let cart = [];

    const saveCart = () => {
        sessionStorage.setItem('reservationCart', JSON.stringify(cart));
    };

    const loadCart = () => {
        const raw = sessionStorage.getItem('reservationCart');
        if (!raw) {
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                cart = parsed;
            }
        } catch (error) {
            cart = [];
        }
    };

    const showCartNote = (message) => {
        if (!cartNote) {
            return;
        }
        cartNote.textContent = message || '';
    };

    const normalizeExtras = (plan, extras) => {
        const result = {};
        (plan.extras || []).forEach((extraId) => {
            result[extraId] = Boolean(extras && extras[extraId]);
        });
        return result;
    };

    const buildCartItem = (plan, extras) => {
        const guests = getGuestsValue();
        const nightsValue = getNightsValue();
        const roomCount = getMinRooms(plan, guests);
        const daytripOptionsValue = {
            plan: document.querySelector('#daytrip-plan')?.value || '',
            spa: document.querySelector('#daytrip-spa')?.value || '',
            meal: document.querySelector('#daytrip-meal')?.value || ''
        };

        return {
            id: `${plan.id}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            planId: plan.id,
            title: plan.title,
            amenity: plan.amenity,
            roomType: plan.roomType,
            price: plan.price,
            capacity: plan.capacity || 4,
            baseGuests: plan.baseGuests || 2,
            extraGuestRate: plan.extraGuestRate || 3500,
            pricingModel: plan.pricingModel || 'stay',
            extras: plan.extras || [],
            selectedExtras: normalizeExtras(plan, extras),
            checkin: checkinDate ? formatDate(checkinDate) : '',
            checkout: checkoutDate ? formatDate(checkoutDate) : '',
            nights: isDaytrip() ? '0' : String(nightsValue),
            guests,
            roomCount,
            daytripOptions: daytripOptionsValue
        };
    };

    const syncCartDates = () => {
        if (!cart.length) {
            return;
        }
        const checkin = checkinDate ? formatDate(checkinDate) : '';
        const checkout = checkoutDate ? formatDate(checkoutDate) : '';
        const nightsValue = isDaytrip() ? '0' : String(getNightsValue());
        const daytripOptionsValue = {
            plan: document.querySelector('#daytrip-plan')?.value || '',
            spa: document.querySelector('#daytrip-spa')?.value || '',
            meal: document.querySelector('#daytrip-meal')?.value || ''
        };
        cart.forEach((item) => {
            item.checkin = checkin;
            item.checkout = checkout;
            item.nights = nightsValue;
            if (item.pricingModel === 'daytrip') {
                item.daytripOptions = daytripOptionsValue;
            }
        });
        renderCart();
    };

    const renderCart = () => {
        if (!cartList) {
            return;
        }
        cartList.innerHTML = '';

        if (!cart.length) {
            const empty = document.createElement('p');
            empty.className = 'reserve-cart__empty';
            empty.textContent = 'プランがまだ追加されていません。';
            cartList.appendChild(empty);
            if (cartTotal) {
                cartTotal.textContent = '--';
            }
            if (cartContinue) {
                cartContinue.disabled = true;
            }
            showCartNote('');
            return;
        }

        let totalSum = 0;
        let hasOverRooms = false;
        let autoAdjusted = false;

        cart.forEach((item) => {
            const minRooms = getMinRooms(item, item.guests);
            if (item.roomCount < minRooms) {
                item.roomCount = minRooms;
                autoAdjusted = true;
            }
            if (item.roomCount > minRooms) {
                hasOverRooms = true;
            }

            const totals = computePlanTotals(item, {
                guests: item.guests,
                roomCount: item.roomCount,
                nights: isDaytrip() ? 1 : Math.max(1, parseInt(item.nights, 10) || 1),
                extras: item.selectedExtras,
                daytripOptions: item.daytripOptions
            });
            totalSum += totals.total;

            const itemEl = document.createElement('div');
            itemEl.className = 'reserve-cart__item';
            itemEl.dataset.cartId = item.id;

            const head = document.createElement('div');
            head.className = 'reserve-cart__item-head';
            const title = document.createElement('p');
            title.className = 'reserve-cart__item-title';
            title.textContent = item.title;
            const price = document.createElement('span');
            price.className = 'reserve-cart__item-price';
            price.textContent = formatCurrency(totals.total);
            head.appendChild(title);
            head.appendChild(price);

            const meta = document.createElement('div');
            meta.className = 'reserve-cart__item-meta';
            const dateLine = document.createElement('span');
            dateLine.textContent = item.checkin ? (item.checkin === item.checkout || item.nights === '0'
                ? `日帰り ${item.checkin}`
                : `${item.checkin} ～ ${item.checkout}`) : '日付未選択';
            const guestLine = document.createElement('span');
            guestLine.textContent = `${item.guests}名 / ${item.roomCount}室`;
            meta.appendChild(dateLine);
            meta.appendChild(guestLine);

            const controls = document.createElement('div');
            controls.className = 'reserve-cart__item-controls';

            const guestLabel = document.createElement('label');
            guestLabel.textContent = '人数';
            const guestSelect = document.createElement('select');
            guestSelect.className = 'reserve-cart__select';
            for (let i = 1; i <= 8; i += 1) {
                const opt = document.createElement('option');
                opt.value = String(i);
                opt.textContent = `${i}名`;
                guestSelect.appendChild(opt);
            }
            guestSelect.value = String(item.guests);
            guestLabel.appendChild(guestSelect);

            const roomLabel = document.createElement('label');
            roomLabel.textContent = '客室数';
            const roomSelectEl = document.createElement('select');
            roomSelectEl.className = 'reserve-cart__select';
            for (let i = 1; i <= MAX_ROOMS; i += 1) {
                const opt = document.createElement('option');
                opt.value = String(i);
                opt.textContent = `${i}室`;
                roomSelectEl.appendChild(opt);
            }
            roomSelectEl.value = String(item.roomCount);
            roomLabel.appendChild(roomSelectEl);

            const removeButton = document.createElement('button');
            removeButton.className = 'reserve-cart__remove';
            removeButton.type = 'button';
            removeButton.textContent = '削除';

            controls.appendChild(guestLabel);
            controls.appendChild(roomLabel);
            controls.appendChild(removeButton);

            const extrasWrap = document.createElement('div');
            extrasWrap.className = 'reserve-cart__item-meta';
            if (item.extras && item.extras.length) {
                const extrasTitle = document.createElement('span');
                extrasTitle.textContent = 'オプション';
                extrasWrap.appendChild(extrasTitle);
                item.extras.forEach((extraId) => {
                    const rule = extraOptions[extraId];
                    if (!rule) {
                        return;
                    }
                    const label = document.createElement('label');
                    label.style.display = 'flex';
                    label.style.alignItems = 'center';
                    label.style.gap = '6px';
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = Boolean(item.selectedExtras[extraId]);
                    checkbox.addEventListener('change', () => {
                        item.selectedExtras[extraId] = checkbox.checked;
                        saveCart();
                        renderCart();
                    });
                    const text = document.createElement('span');
                    const target = rule.per === 'room' ? '室' : '名';
                    text.textContent = `${rule.label} (+${formatCurrency(rule.price)} / ${target}${rule.perNight ? '・泊' : ''})`;
                    label.appendChild(checkbox);
                    label.appendChild(text);
                    extrasWrap.appendChild(label);
                });
            }

            guestSelect.addEventListener('change', () => {
                item.guests = parseInt(guestSelect.value, 10) || 1;
                const minRooms = getMinRooms(item, item.guests);
                if (item.roomCount < minRooms) {
                    item.roomCount = minRooms;
                }
                saveCart();
                renderCart();
            });

            roomSelectEl.addEventListener('change', () => {
                item.roomCount = parseInt(roomSelectEl.value, 10) || 1;
                const minRooms = getMinRooms(item, item.guests);
                if (item.roomCount < minRooms) {
                    item.roomCount = minRooms;
                }
                saveCart();
                renderCart();
            });

            removeButton.addEventListener('click', () => {
                cart = cart.filter((cartItem) => cartItem.id !== item.id);
                saveCart();
                renderCart();
            });

            itemEl.appendChild(head);
            itemEl.appendChild(meta);
            itemEl.appendChild(controls);
            if (extrasWrap.childElementCount) {
                itemEl.appendChild(extrasWrap);
            }
            cartList.appendChild(itemEl);
        });

        if (cartTotal) {
            cartTotal.textContent = formatCurrency(totalSum);
        }
        if (cartContinue) {
            cartContinue.disabled = false;
        }
        if (autoAdjusted) {
            showCartNote('人数に合わせて客室数を自動調整しました。');
        } else if (hasOverRooms) {
            showCartNote('人数に対して客室数が多めのプランがあります。');
        } else {
            showCartNote('');
        }
        saveCart();
    };

    const addToCart = (plan, extras) => {
        if (!checkinDate) {
            showCartNote('日付を選択してください。');
            focusCalendar();
            return;
        }
        if (!isDaytrip() && !checkoutDate) {
            showCartNote('チェックアウト日を選択してください。');
            focusCalendar();
            return;
        }
        const existing = cart.find((item) => item.planId === plan.id);
        if (existing) {
            const updated = buildCartItem(plan, extras);
            existing.guests = updated.guests;
            existing.roomCount = updated.roomCount;
            existing.selectedExtras = updated.selectedExtras;
            existing.daytripOptions = updated.daytripOptions;
            existing.checkin = updated.checkin;
            existing.checkout = updated.checkout;
            existing.nights = updated.nights;
            showCartNote('同じプランを更新しました。');
        } else {
            cart.push(buildCartItem(plan, extras));
        }
        renderCart();
    };
    let activePlan = null;
    let activeExtras = {};

    const closePlanModal = () => {
        if (!planModal) {
            return;
        }
        planModal.classList.remove('is-open');
        planModal.setAttribute('aria-hidden', 'true');
        activePlan = null;
    };

    const updatePlanModalPrice = () => {
        if (!activePlan || !planModalPrice) {
            return;
        }
        const guests = getGuestsValue();
        const nightsValue = isDaytrip() ? 1 : Math.max(1, getNightsValue());
        const roomCount = getMinRooms(activePlan, guests);
        const totals = computePlanTotals(activePlan, {
            guests,
            roomCount,
            nights: nightsValue,
            extras: activeExtras,
            daytripOptions: {
                plan: document.querySelector('#daytrip-plan')?.value || '',
                meal: document.querySelector('#daytrip-meal')?.value || ''
            }
        });
        const label = isDaytrip() ? '日帰り' : `${guests}名 / ${nightsValue}泊`;
        planModalPrice.textContent = `${formatCurrency(totals.total)} (${label})`;
    };

    const openPlanModal = (plan) => {
        if (!planModal) {
            return;
        }
        activePlan = plan;
        activeExtras = normalizeExtras(plan, {});
        if (planModalTitle) {
            planModalTitle.textContent = plan.title;
        }
        if (planModalText) {
            planModalText.textContent = plan.text;
        }
        if (planModalFeatures) {
            planModalFeatures.innerHTML = '';
            (plan.features || []).forEach((item) => {
                const li = document.createElement('li');
                li.textContent = item;
                planModalFeatures.appendChild(li);
            });
        }
        if (planModalFacilities) {
            planModalFacilities.innerHTML = '';
            (plan.facilities || []).forEach((item) => {
                const li = document.createElement('li');
                li.textContent = item;
                planModalFacilities.appendChild(li);
            });
        }
        if (planModalExtras) {
            planModalExtras.innerHTML = '';
            (plan.extras || []).forEach((extraId) => {
                const rule = extraOptions[extraId];
                if (!rule) {
                    return;
                }
                const label = document.createElement('label');
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = Boolean(activeExtras[extraId]);
                input.addEventListener('change', () => {
                    activeExtras[extraId] = input.checked;
                    updatePlanModalPrice();
                });
                const text = document.createElement('span');
                const target = rule.per === 'room' ? '室' : '名';
                text.textContent = `${rule.label} (+${formatCurrency(rule.price)} / ${target}${rule.perNight ? '・泊' : ''})`;
                label.appendChild(input);
                label.appendChild(text);
                planModalExtras.appendChild(label);
            });
        }
        updatePlanModalPrice();
        planModal.classList.add('is-open');
        planModal.setAttribute('aria-hidden', 'false');
    };

    planModalClose.forEach((button) => {
        button.addEventListener('click', closePlanModal);
    });

    if (planModalAdd) {
        planModalAdd.addEventListener('click', () => {
            if (!activePlan) {
                return;
            }
            addToCart(activePlan, activeExtras);
            closePlanModal();
        });
    }

    planCards.forEach((card, index) => {
        const detailButton = card.querySelector('[data-plan-detail]');
        const addButton = card.querySelector('[data-plan-add]');
        const openDetail = () => {
            const plan = currentPlans[index];
            if (plan) {
                openPlanModal(plan);
            }
        };

        card.addEventListener('click', (event) => {
            if (event.target.closest('[data-plan-add]')) {
                return;
            }
            openDetail();
        });

        if (detailButton) {
            detailButton.addEventListener('click', (event) => {
                event.stopPropagation();
                openDetail();
            });
        }

        if (addButton) {
            addButton.addEventListener('click', (event) => {
                event.stopPropagation();
                const plan = currentPlans[index];
                if (plan) {
                    addToCart(plan, {});
                }
            });
        }
    });

    if (cartContinue) {
        cartContinue.addEventListener('click', () => {
            if (!cart.length) {
                return;
            }
            const hasOverRooms = cart.some((item) => item.roomCount > getMinRooms(item, item.guests));
            if (hasOverRooms && cartConfirm) {
                cartConfirm.classList.add('is-open');
                cartConfirm.setAttribute('aria-hidden', 'false');
                return;
            }
            sessionStorage.setItem('reservationCart', JSON.stringify(cart));
            sessionStorage.setItem('reservationDraft', JSON.stringify({
                checkin: checkinDate ? formatDate(checkinDate) : '',
                checkout: checkoutDate ? formatDate(checkoutDate) : '',
                guests: String(getGuestsValue()),
                nights: nightsSelect ? nightsSelect.value : '',
                daytripPlan: document.querySelector('#daytrip-plan')?.value || '',
                daytripSpa: document.querySelector('#daytrip-spa')?.value || '',
                daytripMeal: document.querySelector('#daytrip-meal')?.value || '',
                dinnerTime: document.querySelector('#dinner-time')?.value || '',
                privateBath: document.querySelector('#private-bath')?.value || ''
            }));
            window.location.href = 'booking_info.html';
        });
    }

    cartConfirmCancel.forEach((button) => {
        button.addEventListener('click', () => {
            if (!cartConfirm) {
                return;
            }
            cartConfirm.classList.remove('is-open');
            cartConfirm.setAttribute('aria-hidden', 'true');
        });
    });

    if (cartConfirmAccept) {
        cartConfirmAccept.addEventListener('click', () => {
            if (cartConfirm) {
                cartConfirm.classList.remove('is-open');
                cartConfirm.setAttribute('aria-hidden', 'true');
            }
            sessionStorage.setItem('reservationCart', JSON.stringify(cart));
            sessionStorage.setItem('reservationDraft', JSON.stringify({
                checkin: checkinDate ? formatDate(checkinDate) : '',
                checkout: checkoutDate ? formatDate(checkoutDate) : '',
                guests: String(getGuestsValue()),
                nights: nightsSelect ? nightsSelect.value : '',
                daytripPlan: document.querySelector('#daytrip-plan')?.value || '',
                daytripSpa: document.querySelector('#daytrip-spa')?.value || '',
                daytripMeal: document.querySelector('#daytrip-meal')?.value || '',
                dinnerTime: document.querySelector('#dinner-time')?.value || '',
                privateBath: document.querySelector('#private-bath')?.value || ''
            }));
            window.location.href = 'booking_info.html';
        });
    }
    const maxDateInput = formatDateInput(maxDate);
    if (checkinInput) {
        checkinInput.min = formatDateInput(today);
        checkinInput.max = maxDateInput;
    }
    if (checkoutInput) {
        checkoutInput.min = formatDateInput(today);
        checkoutInput.max = maxDateInput;
    }

    toggleOptions();
    setSelectionMode('checkin');
    renderCalendar();
    updateCheckoutBounds();
    updateSummary();
    applySearch();
    loadCart();
    renderCart();
})();
