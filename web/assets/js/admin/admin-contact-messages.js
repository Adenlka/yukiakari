// assets/js/admin/admin-contact-messages.js
//
// 【超出上一轮骨架规划范围的补充文件】admin/contact-messages.html 这个占位
// 页面在上一轮只引入了 supabase-client.js,没有对应的页面脚本文件——因为
// 那一轮的骨架清单里漏列了这一个(admin-auth.js/admin-dashboard.js 都有,
// 唯独留言管理页没有单独的 JS 占位)。本轮按同样的命名习惯新增
// admin-contact-messages.js,已在变更记录里说明。
//
// 用途:留言管理页(admin/contact-messages.html)逻辑——会话校验、拉取
// contact_messages 列表、按状态/关键词筛选、标记已读/未読。
//
// 【安全要点:只改 status 一列】和 admin-dashboard.js 一样,
// contact_messages 的列级权限只放开了 status(见 0002_rls_policies.sql 的
// `grant update (status) on contact_messages to authenticated;`),下面的
// 更新函数从设计上就只传这一个字段。

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
    const filterStatus = document.querySelector('#filter-status');
    const filterKeyword = document.querySelector('#filter-keyword');
    const filterReset = document.querySelector('[data-filter-reset]');

    const STATUS_LABELS = {
        unread: { text: '未読', className: 'admin-badge--unread' },
        read: { text: '既読', className: 'admin-badge--read' }
    };

    let allMessages = [];

    const escapeHtml = (input) => String(input || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

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

    const renderRow = (message) => {
        const tr = document.createElement('tr');
        const statusInfo = STATUS_LABELS[message.status] || { text: message.status, className: '' };
        const toggleLabel = message.status === 'unread' ? '既読にする' : '未読に戻す';
        const nextStatus = message.status === 'unread' ? 'read' : 'unread';

        tr.innerHTML = `
            <td>${formatDateTime(message.created_at)}</td>
            <td>${escapeHtml(message.guest_name)}${message.guest_kana ? `<br><span class="admin-text-muted">${escapeHtml(message.guest_kana)}</span>` : ''}</td>
            <td>${escapeHtml(message.guest_email)}${message.guest_phone ? `<br>${escapeHtml(message.guest_phone)}` : ''}</td>
            <td class="admin-table__wrap">${escapeHtml(message.message)}</td>
            <td><span class="admin-badge ${statusInfo.className}">${statusInfo.text}</span></td>
            <td class="admin-table__actions">
                <button class="admin-button admin-button--small admin-button--ghost" type="button" data-action="toggle">${toggleLabel}</button>
            </td>
        `;

        const toggleButton = tr.querySelector('[data-action="toggle"]');
        if (toggleButton) {
            toggleButton.addEventListener('click', () => updateStatus(message.id, nextStatus));
        }
        return tr;
    };

    const applyFilters = () => {
        const status = filterStatus ? filterStatus.value : '';
        const keyword = filterKeyword ? filterKeyword.value.trim() : '';

        return allMessages.filter((message) => {
            if (status && message.status !== status) {
                return false;
            }
            if (keyword) {
                const haystack = `${message.guest_name || ''} ${message.guest_email || ''}`.toLowerCase();
                if (!haystack.includes(keyword.toLowerCase())) {
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
        filtered.forEach((message) => {
            tableBody.appendChild(renderRow(message));
        });
    };

    // 只更新 status 一个字段,不传其它内容。
    const updateStatus = async (messageId, nextStatus) => {
        const { error } = await supabase
            .from('contact_messages')
            .update({ status: nextStatus })
            .eq('id', messageId);

        if (error) {
            console.error('[admin-contact-messages] update status error', error);
            window.alert('更新に失敗しました。しばらくしてから再度お試しください。');
            return;
        }

        const target = allMessages.find((m) => m.id === messageId);
        if (target) {
            target.status = nextStatus;
        }
        renderTable();
    };

    const loadMessages = async () => {
        setLoading(true);
        showLoadError('');
        emptyEl?.classList.add('is-hidden');
        tableWrap?.classList.add('is-hidden');

        const { data, error } = await supabase
            .from('contact_messages')
            .select('*')
            .order('created_at', { ascending: false });

        setLoading(false);

        if (error) {
            console.error('[admin-contact-messages] load messages error', error);
            showLoadError('お問い合わせデータの取得に失敗しました。しばらくしてから再度お試しください。');
            return;
        }

        allMessages = data || [];
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
            if (filterStatus) filterStatus.value = '';
            if (filterKeyword) filterKeyword.value = '';
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
            console.error('[admin-contact-messages] AdminGuard 未読み込み');
            window.location.href = 'login.html';
            return;
        }
        const admin = await window.AdminGuard.requireAdmin();
        if (!admin) {
            return;
        }
        if (userEl) {
            userEl.textContent = admin.profile.display_name || admin.user.email || '--';
        }
        await loadMessages();
    };

    init();
})();
