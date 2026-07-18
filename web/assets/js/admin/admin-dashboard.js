// assets/js/admin/admin-dashboard.js
//
// 用途:预约管理页(admin/dashboard.html)逻辑——会话校验、拉取预约列表、
// 筛选、状态变更(完了にする/キャンセル)、退出登录。
//
// 【安全要点:只改 status/cancelled_at 两列】
// supabase/migrations/0002_rls_policies.sql 里对 reservations 表做了列级
// 权限限制:`revoke update on reservations from authenticated; grant update
// (status, cancelled_at) on reservations to authenticated;`——也就是说,
// 就算这段代码手滑写了 `.update({ guest_email: '...' })` 这种越权更新,
// 数据库也会直接拒绝(permission denied for table reservations)。但"数据库
// 会拒绝"不代表这段代码可以随便写,养成"只请求真正需要的字段"的习惯本身也是
// 减少误操作风险的一部分,所以下面的更新函数从设计上就只接受 status 和
// cancelled_at 这两个字段,没有留一个"顺手多传几个字段"的口子。
//
// 状态机说明:reservations.status 的取值是 confirmed / cancelled /
// completed(见 0001_init_schema.sql 的 check 约束)。submit_reservation()
// 插入时固定写 'confirmed',没有"待确认"这个中间状态,所以管理员能做的
// 两个有意义的操作是:把已确认的预约标记为"完了"(利用/入住已完成)或者
// "キャンセル"(取消)。这是根据实际状态机设计出的两个动作,不是任务卡
// 字面提到的"确认"在裸抠字眼实现一个多余的按钮。
//
// 【安全修复 · 安全审查报告严重问题①】renderRow() 里 code/guest_name/
// guest_email/guest_phone 这四个字段全部来自顾客在预约表单自由填写的内容
// (submit_reservation() 只校验邮箱格式和非空,不限制字符集),之前直接
// 拼进 innerHTML 构成存储型 XSS——顾客提交一次带 <script>/<img onerror>
// 的姓名,管理员打开预约列表就会在自己的浏览器里执行该脚本,而管理员的
// Supabase Auth JWT 默认存在 localStorage,等于可以被脚本直接读走、完全
// 接管管理后台。修复方式:比照 admin-contact-messages.js 已有的
// escapeHtml(),对这四个字段转义后再拼进模板。

(() => {
    const supabase = window.supabaseClient;

    const userEl = document.querySelector('[data-admin-user]');
    const logoutButton = document.querySelector('[data-logout]');
    const loadingEl = document.querySelector('[data-loading]');
    const emptyEl = document.querySelector('[data-empty]');
    const errorEl = document.querySelector('[data-load-error]');
    const tableWrap = document.querySelector('[data-table-wrap]');
    const tableBody = document.querySelector('[data-table-body]');

    const filterForm = document.querySelector('[data-filter-form]');
    const filterCode = document.querySelector('#filter-code');
    const filterName = document.querySelector('#filter-name');
    const filterDate = document.querySelector('#filter-date');
    const filterReset = document.querySelector('[data-filter-reset]');

    const STATUS_LABELS = {
        confirmed: { text: '予約確定', className: 'admin-badge--confirmed' },
        cancelled: { text: 'キャンセル済み', className: 'admin-badge--cancelled' },
        completed: { text: '利用完了', className: 'admin-badge--completed' }
    };

    const PAYMENT_METHOD_LABELS = {
        onsite: '現地決済',
        bank_transfer: '銀行振込'
    };

    let allReservations = [];

    // 顾客可控字段(code/guest_name/guest_email/guest_phone)拼进 innerHTML
    // 前必须转义,防止存储型 XSS(安全审查报告严重问题①)。
    const escapeHtml = (input) => String(input || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const formatCurrency = (value) => (Number.isFinite(Number(value)) ? `¥${Number(value).toLocaleString('ja-JP')}` : '--');

    const formatDateTime = (isoString) => {
        if (!isoString) {
            return '--';
        }
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) {
            return '--';
        }
        return date.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    const formatItemsSummary = (items) => {
        if (!Array.isArray(items) || !items.length) {
            return '--';
        }
        return items
            .map((item) => {
                const planName = item.plans ? item.plans.name_ja : 'プラン';
                const dates = item.checkin_date === item.checkout_date
                    ? `日帰り ${item.checkin_date}`
                    : `${item.checkin_date}〜${item.checkout_date}`;
                return `${planName}(${dates})`;
            })
            .join(' / ');
    };

    const dateWithinItem = (item, dateValue) => {
        if (!dateValue) {
            return true;
        }
        if (item.checkin_date === item.checkout_date) {
            return item.checkin_date === dateValue;
        }
        return item.checkin_date <= dateValue && dateValue < item.checkout_date;
    };

    const setLoading = (loading) => {
        if (loadingEl) {
            loadingEl.classList.toggle('is-hidden', !loading);
        }
    };

    const showLoadError = (message) => {
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.toggle('is-hidden', !message);
        }
    };

    const renderRow = (reservation) => {
        const tr = document.createElement('tr');
        const statusInfo = STATUS_LABELS[reservation.status] || { text: reservation.status, className: '' };
        const totalGuests = (reservation.reservation_items || []).reduce((sum, item) => sum + (Number(item.guests) || 0), 0);
        const totalRooms = (reservation.reservation_items || []).reduce((sum, item) => sum + (Number(item.room_count) || 0), 0);

        const actionsHtml = reservation.status === 'confirmed'
            ? `
                <button class="admin-button admin-button--small" type="button" data-action="complete">完了にする</button>
                <button class="admin-button admin-button--danger admin-button--small" type="button" data-action="cancel">キャンセル</button>
              `
            : '<span class="admin-text-muted">--</span>';

        tr.innerHTML = `
            <td>${escapeHtml(reservation.code)}</td>
            <td>${escapeHtml(reservation.guest_name) || '--'}</td>
            <td>${escapeHtml(reservation.guest_email)}<br>${escapeHtml(reservation.guest_phone)}</td>
            <td class="admin-table__wrap">${formatItemsSummary(reservation.reservation_items)}</td>
            <td>${totalGuests}名 / ${totalRooms}室</td>
            <td>${formatCurrency(reservation.total_price)}</td>
            <td>${PAYMENT_METHOD_LABELS[reservation.payment_method] || '--'}</td>
            <td><span class="admin-badge ${statusInfo.className}">${statusInfo.text}</span></td>
            <td>${formatDateTime(reservation.created_at)}</td>
            <td class="admin-table__actions">${actionsHtml}</td>
        `;

        const completeButton = tr.querySelector('[data-action="complete"]');
        const cancelButton = tr.querySelector('[data-action="cancel"]');
        if (completeButton) {
            completeButton.addEventListener('click', () => updateStatus(reservation.id, 'completed'));
        }
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                const confirmed = window.confirm(`予約 ${reservation.code} をキャンセルします。よろしいですか?`);
                if (confirmed) {
                    updateStatus(reservation.id, 'cancelled');
                }
            });
        }

        return tr;
    };

    const applyFilters = () => {
        const code = filterCode ? filterCode.value.trim().toUpperCase() : '';
        const name = filterName ? filterName.value.trim() : '';
        const date = filterDate ? filterDate.value : '';

        return allReservations.filter((reservation) => {
            if (code && !(reservation.code || '').toUpperCase().includes(code)) {
                return false;
            }
            if (name && !(reservation.guest_name || '').includes(name)) {
                return false;
            }
            if (date) {
                const items = reservation.reservation_items || [];
                if (!items.some((item) => dateWithinItem(item, date))) {
                    return false;
                }
            }
            return true;
        });
    };

    const renderTable = () => {
        if (!tableBody) {
            return;
        }
        const filtered = applyFilters();
        tableBody.innerHTML = '';

        if (!filtered.length) {
            tableWrap?.classList.add('is-hidden');
            emptyEl?.classList.remove('is-hidden');
            return;
        }
        emptyEl?.classList.add('is-hidden');
        tableWrap?.classList.remove('is-hidden');
        filtered.forEach((reservation) => {
            tableBody.appendChild(renderRow(reservation));
        });
    };

    // 只更新 status(和取消时的 cancelled_at),不传其它字段——
    // 即使这里手滑多传了别的字段,RLS 的列级权限也会拒绝整个请求,
    // 但正确的写法本身就不应该给自己留这个手滑的机会。
    const updateStatus = async (reservationId, nextStatus) => {
        const payload = { status: nextStatus };
        if (nextStatus === 'cancelled') {
            payload.cancelled_at = new Date().toISOString();
        }

        const { error } = await supabase
            .from('reservations')
            .update(payload)
            .eq('id', reservationId);

        if (error) {
            console.error('[admin-dashboard] update reservation status error', error);
            window.alert('更新に失敗しました。しばらくしてから再度お試しください。');
            return;
        }

        const target = allReservations.find((r) => r.id === reservationId);
        if (target) {
            target.status = nextStatus;
            if (payload.cancelled_at) {
                target.cancelled_at = payload.cancelled_at;
            }
        }
        renderTable();
    };

    const loadReservations = async () => {
        setLoading(true);
        showLoadError('');
        emptyEl?.classList.add('is-hidden');
        tableWrap?.classList.add('is-hidden');

        const { data, error } = await supabase
            .from('reservations')
            .select('*, reservation_items(id, checkin_date, checkout_date, guests, room_count, line_total, plans(name_ja))')
            .order('created_at', { ascending: false });

        setLoading(false);

        if (error) {
            console.error('[admin-dashboard] load reservations error', error);
            showLoadError('予約データの取得に失敗しました。しばらくしてから再度お試しください。');
            return;
        }

        allReservations = data || [];
        renderTable();
    };

    if (filterForm) {
        filterForm.addEventListener('submit', (event) => {
            event.preventDefault();
            renderTable();
        });
    }
    if (filterReset) {
        filterReset.addEventListener('click', () => {
            if (filterCode) filterCode.value = '';
            if (filterName) filterName.value = '';
            if (filterDate) filterDate.value = '';
            renderTable();
        });
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            window.AdminGuard?.signOut();
        });
    }

    const init = async () => {
        if (!window.AdminGuard) {
            console.error('[admin-dashboard] AdminGuard 未読み込み');
            window.location.href = 'login.html';
            return;
        }
        const admin = await window.AdminGuard.requireAdmin();
        if (!admin) {
            return; // requireAdmin 内部已经跳转回登录页
        }
        if (userEl) {
            userEl.textContent = admin.profile.display_name || admin.user.email || '--';
        }
        await loadReservations();
    };

    init();
})();
