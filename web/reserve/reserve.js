
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

    // ---------- Supabase 接入 ----------
    // 商品目录(plans/plan_extras/plan_available_extras)和房态查询
    // (get_availability RPC)都改成从数据库读取,替换掉原来硬编码的
    // planDetailsByRoom/daytripPlans/extraOptions 和伪随机可用性算法。
    // 没有 supabaseClient 说明 config.js/CDN 没接好,预约功能没法用,
    // 直接给出明显提示并中止,而不是静默展示假数据。
    const supabase = window.supabaseClient;
    if (!supabase) {
        console.error('[reserve] window.supabaseClient 未初始化,请检查 config.js 与 supabase-js CDN 是否正确引入。');
        if (resultsSummary) {
            // 【i18n】动态文案改用 ykT() 读取 YK_I18N 字典(需求文档2.7/4.2),
            // 详见 assets/js/i18n-runtime.js 的说明;第二个参数是查不到 key
            // 时的兜底文案,原样保留原来的日文,不会因为字典缺项而白屏。
            resultsSummary.textContent = window.ykT('reserve.dynamic.connectError', '予約システムに接続できませんでした。しばらくしてから再度お試しください。');
        }
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 9);

    const SERVICE_RATE = 0.1;
    const TAX_RATE = 0.1;
    const MAX_ROOMS = 4;

    // 日帰りプランの子選択肢(お風呂プラン/お食事)の追加料金。plans/plan_extras
    // の schema にはこの2つの子選択肢専用の列がなく、後端の submit_reservation()
    // (supabase/migrations/0002_rls_policies.sql)にも同じ対応表がハードコードされている。
    // 表示価格はあくまで目安で、最終価格は必ずサーバー側で再計算されるため、
    // 万一この対応表がずれても金額の不整合は起きない(セキュリティ上の問題にはならない)。
    const DAYTRIP_PLAN_ADDON = { relax: 0, sauna: 400, private: 900 };
    const DAYTRIP_MEAL_ADDON = { none: 0, light: 400, lunch: 900 };

    // 展示用文案(セールスポイント/館内設備リスト)。plans テーブルの schema には
    // こうした一覧型の項目がないため、これらは今回もフロント側の静的データとして
    // 保持する ——「価格・在庫・追加オプション」というお金に直結するデータを
    // データベース駆動にするのが今回の改修の主眼で、マーケティング文言まで
    // データベースに移す必要はない。
    const PLAN_STATIC_CONTENT = {
        villa: {
            features: ['専用露天風呂', '囲炉裏の間', '森の独立棟'],
            facilities: ['湯上がり処', '雪見テラス', '送迎サービス']
        },
        viewbath: {
            features: ['展望風呂', '雪景色ビュー', '広縁'],
            facilities: ['湯上がり処', '雪見テラス', 'ラウンジドリンク']
        },
        modern: {
            features: ['和洋室', '琉球畳', 'ツインベッド'],
            facilities: ['湯上がり処', 'ラウンジドリンク', '売店']
        },
        standard: {
            features: ['純和風客室', '広縁', '静かな眺望'],
            facilities: ['湯上がり処', '売店', '回廊散策']
        }
    };

    const DAYTRIP_STATIC_CONTENT = {
        'daytrip-relax': {
            title: '日帰り温泉「雪灯り」プラン',
            text: '雪見露天と檜の大浴場で湯けむりを満喫。湯上がり処で静かな時間をお過ごしください。',
            amenity: '温泉利用付',
            badges: ['日帰り', '人気'],
            meta: ['利用時間 10:00～15:00', 'タオル付 / 湯上がり処利用可'],
            image: 'url("../assets/images/onsen/onsen-01.jpg")',
            features: ['雪見露天風呂', '檜の大浴場', '湯上がり処'],
            facilities: ['露天風呂', '大浴場', '湯上がり処']
        },
        'daytrip-sauna': {
            title: 'サウナ集中「ととのい」プラン',
            text: 'ロウリュサウナと水風呂でリフレッシュ。外気浴テラスで深くととのいます。',
            amenity: 'サウナ利用付',
            badges: ['日帰り', 'サウナ'],
            meta: ['利用時間 10:00～14:00', '外気浴テラス利用'],
            image: 'url("../assets/images/onsen/onsen-06.jpg")',
            features: ['ロウリュサウナ', '外気浴テラス', '水風呂'],
            facilities: ['サウナ', '水風呂', '外気浴テラス']
        },
        'daytrip-private': {
            title: '貸切風呂「灯」プラン',
            text: '信楽焼の貸切風呂で静かな時間を。雪見障子越しの景色をご堪能ください。',
            amenity: '貸切風呂付',
            badges: ['日帰り', '限定'],
            meta: ['利用時間 11:00～15:00', '事前予約必須'],
            image: 'url("../assets/images/onsen/onsen-03.jpg")',
            features: ['信楽焼貸切風呂', '雪見障子', 'プライベート空間'],
            facilities: ['貸切風呂', '湯上がり処']
        }
    };

    // 数据库读取结果填充到这几个变量里,取代原来的硬编码常量。
    let extraOptions = {};
    let planDetailsByRoom = {};
    let daytripPlans = [];
    let plansByCode = new Map();

    // 从 plans / plan_extras / plan_available_extras 三张表读取商品目录。
    // 这三张表的 RLS 只对 anon 开放 SELECT(见 0002_rls_policies.sql),
    // 用 anon key 直接查询是安全的。
    const loadCatalog = async () => {
        const [plansRes, extrasRes, mappingRes] = await Promise.all([
            supabase.from('plans').select('*').eq('is_active', true).order('sort_order'),
            supabase.from('plan_extras').select('*'),
            supabase.from('plan_available_extras').select('plan_id, extra_id')
        ]);

        if (plansRes.error || extrasRes.error || mappingRes.error) {
            console.error('[reserve] 商品目录読み込み失敗', plansRes.error || extrasRes.error || mappingRes.error);
            return false;
        }

        const extrasById = new Map();
        extraOptions = {};
        (extrasRes.data || []).forEach((row) => {
            extraOptions[row.code] = {
                label: row.name_ja,
                price: row.price,
                per: row.charge_unit,
                perNight: row.per_night
            };
            extrasById.set(row.id, row.code);
        });

        const extrasByPlanId = new Map();
        (mappingRes.data || []).forEach((row) => {
            const code = extrasById.get(row.extra_id);
            if (!code) {
                return;
            }
            if (!extrasByPlanId.has(row.plan_id)) {
                extrasByPlanId.set(row.plan_id, []);
            }
            extrasByPlanId.get(row.plan_id).push(code);
        });

        plansByCode = new Map();
        planDetailsByRoom = {};
        const daytripRows = [];

        (plansRes.data || []).forEach((row) => {
            plansByCode.set(row.code, row);
            const availableExtras = extrasByPlanId.get(row.id) || [];

            if (row.plan_type === 'room') {
                const staticContent = PLAN_STATIC_CONTENT[row.code] || { features: [], facilities: [] };
                planDetailsByRoom[row.code] = {
                    dbId: row.id,
                    capacity: row.capacity,
                    baseGuests: row.base_guests,
                    extraGuestRate: row.extra_guest_rate,
                    unitLabel: row.unit_label,
                    pricingModel: 'stay',
                    price: row.base_price,
                    extras: availableExtras,
                    features: staticContent.features || [],
                    facilities: staticContent.facilities || []
                };
            } else {
                const staticContent = DAYTRIP_STATIC_CONTENT[row.code] || {};
                daytripRows.push({
                    id: row.code,
                    dbId: row.id,
                    title: staticContent.title || row.name_ja,
                    text: staticContent.text || '',
                    amenity: staticContent.amenity || '',
                    price: row.base_price,
                    roomType: 'none',
                    badges: staticContent.badges || [],
                    meta: staticContent.meta || [],
                    image: staticContent.image || '',
                    capacity: row.capacity,
                    baseGuests: row.base_guests,
                    extraGuestRate: row.extra_guest_rate,
                    unitLabel: row.unit_label,
                    pricingModel: 'daytrip',
                    extras: availableExtras,
                    features: staticContent.features || [],
                    facilities: staticContent.facilities || [],
                    sortOrder: row.sort_order || 0
                });
            }
        });

        daytripRows.sort((a, b) => a.sortOrder - b.sortOrder);
        daytripPlans = daytripRows;
        return true;
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

    // 【i18n】人数标签(如"3名"/"3 guests")优先用 reserve.search.guests.N 这组
    // 已翻译好的分级 key(原有 1-6 档已扩充到 1-8,覆盖购物车人数下拉的范围),
    // 理论上不会走到兜底分支,兜底只是防止字典漏配时显示空白。
    const formatGuestsLabel = (n) => window.ykT(`reserve.search.guests.${n}`, `${n}名`);
    // 【i18n】客室数标签(如"2室"/"2 rooms")复用 reserve.info.roomCount.N
    // (booking_info.html 已有的 1-4 档,和这里的 MAX_ROOMS=4 上限完全对齐)。
    const formatRoomsLabel = (n) => window.ykT(`reserve.info.roomCount.${n}`, null) || window.ykT('reserve.dynamic.roomsUnit', '{n}室').replace('{n}', n);
    // 【i18n】晚数标签(如"2泊")优先复用 reserve.search.nights.N(reserve.html
    // 静态下拉已有 1-14 档翻译),超出范围(理论上很少见,住宿上限见
    // submit_reservation() 的30晚校验)才退回模板拼接。
    const formatNightsLabel = (n) => window.ykT(`reserve.search.nights.${n}`, null) || window.ykT('reserve.dynamic.nightsUnit', '{n}泊').replace('{n}', n);
    // 【i18n】价格卡片/弹窗共用的"日帰り"或"{人数} / {晚数}"标签,抽成共享函数
    // 避免写两份重复逻辑。
    const formatGuestsNightsLabel = (guests, nightsValue) => (
        isDaytrip()
            ? window.ykT('reserve.search.nights.daytrip', '日帰り')
            : `${formatGuestsLabel(guests)} / ${formatNightsLabel(nightsValue)}`
    );

    // ---------- 房态查询:调用 get_availability_range() 批量 RPC ----------
    // 【性能修复】原来 computeDateStatus() 对日历网格里每一天 × 每个 plan 各
    // 发一次 get_availability() RPC,一个月网格 35~42 格 × 4 个房型 ≈ 140 次
    // 独立 HTTP 请求(DevTools 实测单页 188 requests)。现在改成每次渲染一个
    // 新月份时,对"这个月全部 plan(不管当前是否被房型筛选/住宿-日帰り模式
    // 过滤掉)"只发一次 get_availability_range 批量请求,结果整月一次性存进
    // availabilityCache;computeDateStatus() 改成纯读缓存的同步函数,不再发
    // 请求。之所以每次都拉全部 plan 而不是只拉当前筛选下用得到的 plan,是为
    // 了让"切换住宿/日帰り模式、切换房型筛选"这两个操作命中同一份月度缓存,
    // 不必因为筛选变了就重新请求——见下方 loadedAvailabilityRanges 的说明。
    // 缓存 key 为 `${planDbId}:${YYYY-MM-DD}`,与旧版保持一致的格式,便于对照。
    const availabilityCache = new Map();

    // 记录"哪些月份已经批量拉取过全部 plan 的库存数据",key 形如 `${year}-${month}`。
    // 同一个月内不管翻多少次筛选条件、切换多少次住宿/日帰り模式,只要这个
    // key 已经在集合里,就不会重复发请求,直接读 availabilityCache。
    const loadedAvailabilityRanges = new Set();

    // 当前商品目录里全部 plan 的数据库 UUID(住宿房型 + 日帰り,不做筛选),
    // 用于批量请求时一次性把整月、全部 plan 的库存都拉回来。
    const getAllPlanDbIds = () => {
        const ids = new Set();
        Object.values(planDetailsByRoom).forEach((plan) => {
            if (plan.dbId) {
                ids.add(plan.dbId);
            }
        });
        daytripPlans.forEach((plan) => {
            if (plan.dbId) {
                ids.add(plan.dbId);
            }
        });
        return Array.from(ids);
    };

    // 拉取"某个月份、日历网格里实际会展示的那些天"(裁剪到 [today, maxDate]
    // 范围内,过去的日期和超过9个月预订上限的日期本来就是禁用格子,不需要
    // 查库存)对应的批量库存数据。只有 monthDate 这个月第一次被渲染时才会
    // 真正发请求,重复调用直接短路返回。
    const fetchAvailabilityRangeForMonth = async (monthDate) => {
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const rangeKey = `${year}-${month}`;
        if (loadedAvailabilityRanges.has(rangeKey)) {
            return;
        }
        const planIds = getAllPlanDbIds();
        if (!planIds.length) {
            return;
        }
        const firstOfMonth = new Date(year, month, 1);
        const lastOfMonth = new Date(year, month + 1, 0);
        const rangeStart = firstOfMonth < today ? today : firstOfMonth;
        // get_availability_range 是 [p_start, p_end) 半开区间,p_end 要传
        // "最后一天的次日"才能覆盖到当月最后一天。
        const rangeEndExclusive = new Date(Math.min(lastOfMonth.getTime(), maxDate.getTime()));
        rangeEndExclusive.setDate(rangeEndExclusive.getDate() + 1);
        if (rangeStart >= rangeEndExclusive) {
            // 这个月全部日期都在禁用范围外(理论上只有 minMonth/maxMonth 边界
            // 月份可能出现),没有需要查询的天,直接标记为"已加载"即可。
            loadedAvailabilityRanges.add(rangeKey);
            return;
        }
        const { data, error } = await supabase.rpc('get_availability_range', {
            p_plan_ids: planIds,
            p_start: formatDateInput(rangeStart),
            p_end: formatDateInput(rangeEndExclusive)
        });
        if (error) {
            console.error('[reserve] get_availability_range 呼び出し失敗', error);
            // 查询失败时不写入缓存、也不标记为已加载——computeDateStatus() 在
            // 缓存缺失时的兜底是展示"可选"(见下方),不会因为这次失败就把
            // 日期误标成满房;下次翻回这个月时会自动重试这次请求。
            return;
        }
        (data || []).forEach((row) => {
            const key = `${row.plan_id}:${row.occ_date}`;
            availabilityCache.set(key, typeof row.remaining === 'number' ? row.remaining : null);
        });
        loadedAvailabilityRanges.add(rangeKey);
    };

    // 汇总"当前模式(住宿/日帰り) + 当前房型筛选"下相关 plan 在某天的总剩余量,
    // 换算成日历要用的 available/limited/unavailable 三档展示。纯读缓存,
    // 不发请求——缓存由 fetchAvailabilityRangeForMonth() 统一批量填充。
    const computeDateStatus = (date) => {
        const daytripMode = isDaytrip();
        const relevantPlans = daytripMode ? daytripPlans : Object.keys(planDetailsByRoom).map((code) => ({
            roomType: code,
            dbId: planDetailsByRoom[code].dbId
        }));
        const roomFilter = roomSelect ? roomSelect.value : '';
        const filtered = (!daytripMode && roomFilter && roomFilter !== 'all' && roomFilter !== 'none')
            ? relevantPlans.filter((plan) => plan.roomType === roomFilter)
            : relevantPlans;
        const targets = filtered.length ? filtered : relevantPlans;

        const dateKey = formatDateInput(date);
        const results = targets.map((plan) => {
            if (!plan.dbId) {
                return undefined;
            }
            const key = `${plan.dbId}:${dateKey}`;
            return availabilityCache.get(key);
        });
        const validResults = results.filter((value) => typeof value === 'number');
        if (!validResults.length) {
            // 缓存缺失(还没拉到/请求失败)时保守展示为"可选",不因为前端查询
            // 故障就把日期误标成满房劝退用户 —— 真正的库存校验在提交时由
            // 后端 submit_reservation() 再做一次,不会因为这里的展示问题
            // 导致超卖。
            return 'available';
        }
        const total = validResults.reduce((sum, value) => sum + Math.max(0, value), 0);
        if (total <= 0) {
            return 'unavailable';
        }
        if (total <= 2) {
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

    let defaultPlans = [];
    let currentPlans = [];

    const buildDefaultPlans = () => planCards.map(getPlanDataFromCard).map((plan) => ({
        ...plan,
        ...(planDetailsByRoom[plan.roomType] || {})
    }));

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

    // 前端即时计价:只用于选房阶段的展示反馈,不是最终成交价。
    // 真正入账的价格由后端 submit_reservation()(SECURITY DEFINER)按数据库
    // 当前价格重新计算,前端这份计算结果即使被人在控制台里改掉也不影响实际扣款。
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
            const planAddon = DAYTRIP_PLAN_ADDON[daytripOptionsValue.plan] || 0;
            const mealAddon = DAYTRIP_MEAL_ADDON[daytripOptionsValue.meal] || 0;
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
            priceSub.textContent = window.ykT('reserve.dynamic.priceEstimateLabel', '目安合計 {price} ({label})')
                .replace('{price}', formatCurrency(totals.total))
                .replace('{label}', formatGuestsNightsLabel(guests, nightsValue));
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
            resultsTitle.textContent = daytripMode
                ? window.ykT('reserve.results.title.daytrip', 'おすすめ日帰りプラン')
                : window.ykT('reserve.results.title.stay', 'おすすめ宿泊プラン');
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
        option.textContent = formatNightsLabel(value);
        nightsSelect.appendChild(option);
    };

    const updateSummary = () => {
        if (!resultsSummary) {
            return;
        }
        const guests = getGuestsValue();
        if (!checkinDate) {
            resultsSummary.textContent = window.ykT('reserve.dynamic.selectDate', '日付を選択してください。');
            return;
        }
        if (checkinDate && checkoutDate) {
            if (isDaytrip() && isSameDay(checkinDate, checkoutDate)) {
                resultsSummary.textContent = window.ykT('reserve.dynamic.summaryDaytrip', '日帰り {date} / {guests}')
                    .replace('{date}', formatDate(checkinDate))
                    .replace('{guests}', formatGuestsLabel(guests));
                return;
            }
            resultsSummary.textContent = window.ykT('reserve.dynamic.summaryStay', 'チェックイン {checkin} / チェックアウト {checkout} / {guests}')
                .replace('{checkin}', formatDate(checkinDate))
                .replace('{checkout}', formatDate(checkoutDate))
                .replace('{guests}', formatGuestsLabel(guests));
            return;
        }
        resultsSummary.textContent = window.ykT('reserve.dynamic.summaryCheckinOnly', 'チェックイン {checkin} / {guests}')
            .replace('{checkin}', formatDate(checkinDate))
            .replace('{guests}', formatGuestsLabel(guests));
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

    // 日历网格的日期可用性(available/limited/unavailable)现在来自数据库真实
    // 库存,而不是伪随机数。为了不阻塞翻页/切换筛选的即时反馈,renderCalendar()
    // 先同步画出格子(默认给一个乐观的 is-available 初始状态),再用
    // refreshVisibleAvailability() 异步把真实结果补上去——现在这一步只对
    // "当前月份是否已经批量拉取过"发起至多一次 get_availability_range 请求
    // (fetchAvailabilityRangeForMonth 内部会短路已加载过的月份),不再是
    // 每个格子各发一次请求。
    let availabilityRequestToken = 0;

    const refreshVisibleAvailability = async () => {
        const token = (availabilityRequestToken += 1);
        await fetchAvailabilityRangeForMonth(currentMonth);
        if (token !== availabilityRequestToken) {
            // 用户在这次批量请求返回之前已经翻页/切换了月份,这批结果已经
            // 过期,不应用(避免把新月份的格子误刷成旧月份的库存状态)。
            return;
        }
        const buttons = Array.from(calendarGrid.querySelectorAll('button[data-date]'));
        buttons.forEach((button) => {
            const date = parseDate(button.dataset.date);
            if (!date || !button.isConnected) {
                return;
            }
            const status = computeDateStatus(date);
            button.classList.remove('is-available', 'is-limited', 'is-unavailable');
            button.classList.add(`is-${status}`);
        });
    };

    const renderCalendar = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        monthLabel.textContent = window.ykT('reserve.dynamic.calendarMonth', '{year}年{month}月')
            .replace('{year}', String(year))
            .replace('{month}', String(month + 1));
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
                    // 初始给乐观的 is-available,真实状态由 refreshVisibleAvailability() 异步补上
                    button.classList.add('is-available');
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

        refreshVisibleAvailability();
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
        roomSelect.addEventListener('change', () => {
            applySearch();
            renderCalendar();
        });
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

    // 购物车里存的是"用户临时选择状态"(选了哪个 plan、日期、人数、勾了哪些
    // 追加项),不含任何个人身份信息或价格承诺,继续用 sessionStorage 暂存没有
    // 安全问题——真正会写入数据库的顾客信息在 booking_info.html 才收集,
    // 且直接提交给后端,不落 localStorage。
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

    // 价格免责声明:提醒这里看到的都是即时展示用的估算价,不是最终成交价。
    const insertDisclaimer = (afterEl, text) => {
        if (!afterEl || !afterEl.parentElement) {
            return;
        }
        if (afterEl.parentElement.querySelector('[data-price-disclaimer]')) {
            return;
        }
        const p = document.createElement('p');
        p.dataset.priceDisclaimer = '';
        p.style.cssText = 'margin-top:6px;font-size:0.78em;opacity:0.7;line-height:1.5;';
        p.textContent = text;
        afterEl.parentElement.appendChild(p);
    };

    const cartSummaryEl = document.querySelector('.reserve-cart__summary');
    insertDisclaimer(cartSummaryEl, window.ykT('reserve.dynamic.priceDisclaimerCart', '※表示価格は目安です。実際のご請求額はご予約確定時にサーバー側で再計算されます。'));
    if (planModalPrice) {
        insertDisclaimer(planModalPrice, window.ykT('reserve.dynamic.priceDisclaimerModal', '※上記は目安価格です。最終価格はご予約確定時に再計算されます。'));
    }

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
            planDbId: plan.dbId || null, // 真正提交预约时用的数据库 UUID
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
            // 【i18n】复用静态 HTML 里 data-i18n="reserve.cart.empty" 已有的
            // 同一句翻译(reserve.html 的空购物车提示),不新建重复 key。
            empty.textContent = window.ykT('reserve.cart.empty', 'プランがまだ追加されていません。');
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
                ? window.ykT('reserve.dynamic.dateRangeDaytrip', '日帰り {date}').replace('{date}', item.checkin)
                : window.ykT('reserve.dynamic.dateRangeStay', '{checkin} ～ {checkout}').replace('{checkin}', item.checkin).replace('{checkout}', item.checkout))
                : window.ykT('reserve.dynamic.dateUnselected', '日付未選択');
            const guestLine = document.createElement('span');
            guestLine.textContent = `${formatGuestsLabel(item.guests)} / ${formatRoomsLabel(item.roomCount)}`;
            meta.appendChild(dateLine);
            meta.appendChild(guestLine);

            const controls = document.createElement('div');
            controls.className = 'reserve-cart__item-controls';

            const guestLabel = document.createElement('label');
            // 【i18n】复用 booking_info.html 已有的 reserve.info.label.guests
            // ("人数"这个词在两个页面语义完全相同),不新建重复 key。
            guestLabel.textContent = window.ykT('reserve.info.label.guests', '人数');
            const guestSelect = document.createElement('select');
            guestSelect.className = 'reserve-cart__select';
            for (let i = 1; i <= 8; i += 1) {
                const opt = document.createElement('option');
                opt.value = String(i);
                opt.textContent = formatGuestsLabel(i);
                guestSelect.appendChild(opt);
            }
            guestSelect.value = String(item.guests);
            guestLabel.appendChild(guestSelect);

            const roomLabel = document.createElement('label');
            // 【i18n】复用 booking_info.html 已有的 reserve.info.field.roomCount。
            roomLabel.textContent = window.ykT('reserve.info.field.roomCount', '客室数');
            const roomSelectEl = document.createElement('select');
            roomSelectEl.className = 'reserve-cart__select';
            for (let i = 1; i <= MAX_ROOMS; i += 1) {
                const opt = document.createElement('option');
                opt.value = String(i);
                opt.textContent = formatRoomsLabel(i);
                roomSelectEl.appendChild(opt);
            }
            roomSelectEl.value = String(item.roomCount);
            roomLabel.appendChild(roomSelectEl);

            const removeButton = document.createElement('button');
            removeButton.className = 'reserve-cart__remove';
            removeButton.type = 'button';
            removeButton.textContent = window.ykT('reserve.dynamic.remove', '削除');

            controls.appendChild(guestLabel);
            controls.appendChild(roomLabel);
            controls.appendChild(removeButton);

            const extrasWrap = document.createElement('div');
            extrasWrap.className = 'reserve-cart__item-meta';
            if (item.extras && item.extras.length) {
                const extrasTitle = document.createElement('span');
                // 【i18n】复用 booking_info.html 价格明细里的 reserve.info.breakdown.addons
                // (同样是"追加选项"这个概念的"オプション"一词)。
                extrasTitle.textContent = window.ykT('reserve.info.breakdown.addons', 'オプション');
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
                    // 【已知限制】rule.label 来自数据库 plan_extras.name_ja(如"夕朝食
                    // アップグレード"),是业务数据不是 UI 文案,不接入 i18n 字典——
                    // 和 reserve.js 顶部 PLAN_STATIC_CONTENT 的既定原则一致(只把
                    // "价格/库存"这类数据接入数据库,不把营销文案/商品名做成多语言,
                    // 这两者本来就不在同一责任范围)。这里只翻译"室/名/・泊"这几个
                    // 单位词本身。
                    const target = rule.per === 'room' ? window.ykT('reserve.dynamic.unitRoom', '室') : window.ykT('reserve.dynamic.unitGuest', '名');
                    const perNightSuffix = rule.perNight ? window.ykT('reserve.dynamic.perNightSuffix', '・泊') : '';
                    text.textContent = `${rule.label} (+${formatCurrency(rule.price)} / ${target}${perNightSuffix})`;
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
            showCartNote(window.ykT('reserve.dynamic.roomsAutoAdjusted', '人数に合わせて客室数を自動調整しました。'));
        } else if (hasOverRooms) {
            showCartNote(window.ykT('reserve.dynamic.roomsOverNote', '人数に対して客室数が多めのプランがあります。'));
        } else {
            showCartNote('');
        }
        saveCart();
    };

    const addToCart = (plan, extras) => {
        if (!checkinDate) {
            showCartNote(window.ykT('reserve.dynamic.selectDate', '日付を選択してください。'));
            focusCalendar();
            return;
        }
        if (!isDaytrip() && !checkoutDate) {
            showCartNote(window.ykT('reserve.dynamic.selectCheckout', 'チェックアウト日を選択してください。'));
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
            existing.planDbId = updated.planDbId;
            showCartNote(window.ykT('reserve.dynamic.updatedSamePlan', '同じプランを更新しました。'));
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
        planModalPrice.textContent = window.ykT('reserve.dynamic.priceModalLabel', '{price} ({label})')
            .replace('{price}', formatCurrency(totals.total))
            .replace('{label}', formatGuestsNightsLabel(guests, nightsValue));
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
                // 【已知限制】同上方 renderCart() 里的说明:rule.label 是数据库
                // plan_extras.name_ja(业务数据),不接入 i18n,这里只翻译单位词。
                const target = rule.per === 'room' ? window.ykT('reserve.dynamic.unitRoom', '室') : window.ykT('reserve.dynamic.unitGuest', '名');
                const perNightSuffix = rule.perNight ? window.ykT('reserve.dynamic.perNightSuffix', '・泊') : '';
                text.textContent = `${rule.label} (+${formatCurrency(rule.price)} / ${target}${perNightSuffix})`;
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

    // ---------- 启动流程:先从数据库加载商品目录,再进行原有的初始化 ----------
    const init = async () => {
        const ok = await loadCatalog();
        if (!ok) {
            if (resultsSummary) {
                resultsSummary.textContent = window.ykT('reserve.dynamic.catalogError', 'プラン情報の取得に失敗しました。しばらくしてから再度お試しください。');
            }
            return;
        }
        defaultPlans = buildDefaultPlans();
        currentPlans = defaultPlans;

        toggleOptions();
        setSelectionMode('checkin');
        renderCalendar();
        updateCheckoutBounds();
        updateSummary();
        applySearch();
        loadCart();
        renderCart();
    };

    // 【i18n】语言切换时(script.js 的 applyLanguage() 会 dispatch 这个事件,
    // 见该文件对应位置注释)重新渲染一遍这几处"JS 动态生成"的内容——
    // updateSummary()/renderCalendar()/renderCart() 覆盖了购物车、日历月份
    // 标题、搜索结果摘要这几块 data-i18n 覆盖不到的地方;updatePlanCards()
    // 会连带刷新已渲染的价格卡片文案(含 おすすめ日帰り/宿泊プラン 标题)。
    window.addEventListener('yk:languagechange', () => {
        updateSummary();
        renderCalendar();
        renderCart();
        updatePlanCards(isDaytrip());
        applySearch();
    });

    init();
})();
