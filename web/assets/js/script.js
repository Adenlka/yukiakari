(() => {
    const sections = document.querySelectorAll('.reveal');
    const header = document.querySelector('.header');
    const menuButton = document.querySelector('.header__menu-btn');
    const menuOverlay = document.querySelector('#site-menu');
    const logoLink = document.querySelector('.header__logo');
    const hero = document.querySelector('.hero');

    document.documentElement.classList.add('js-ready');
    if (!('IntersectionObserver' in window)) {
        document.documentElement.classList.remove('js-ready');
        sections.forEach((section) => section.classList.add('is-visible'));
        return;
    }
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.2 }
    );

    sections.forEach((section) => observer.observe(section));

    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    let lastFocused = null;

    const getFocusable = () => {
        if (!menuOverlay) {
            return [];
        }
        return Array.from(menuOverlay.querySelectorAll(focusableSelector)).filter((el) => el.offsetParent !== null);
    };

    const setMenuOpen = (open) => {
        if (!menuButton || !menuOverlay) {
            return;
        }
        if (open) {
            lastFocused = document.activeElement;
        }
        menuOverlay.classList.toggle('menu--open', open);
        menuButton.classList.toggle('is-open', open);
        document.body.classList.toggle('menu-open', open);
        menuOverlay.setAttribute('aria-hidden', String(!open));
        menuButton.setAttribute('aria-expanded', String(open));
        menuButton.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
        if (open) {
            header?.classList.add('header--menu');
            const focusable = getFocusable();
            if (focusable.length) {
                focusable[0].focus();
            }
        } else {
            updateHeaderMode();
            if (lastFocused && typeof lastFocused.focus === 'function') {
                lastFocused.focus();
            }
        }
    };

    let headerThreshold = 120;

    const updateHeaderThreshold = () => {
        const heroHeight = hero ? hero.offsetHeight : 0;
        headerThreshold = heroHeight ? heroHeight * 0.5 : 120;
    };

    const updateHeaderMode = () => {
        if (!header) {
            return;
        }
        const isMenuMode = window.scrollY > headerThreshold;
        const isMenuOpen = menuOverlay && menuOverlay.classList.contains('menu--open');
        header.classList.toggle('header--menu', isMenuMode || isMenuOpen);
    };

    const handleMenuKeydown = (event) => {
        if (!menuOverlay || !menuOverlay.classList.contains('menu--open')) {
            return;
        }
        if (event.key === 'Escape') {
            setMenuOpen(false);
            return;
        }
        if (event.key !== 'Tab') {
            return;
        }
        const focusable = getFocusable();
        if (!focusable.length) {
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    if (menuButton && menuOverlay) {
        menuButton.addEventListener('click', () => {
            const shouldOpen = !menuOverlay.classList.contains('menu--open');
            setMenuOpen(shouldOpen);
        });

        if (logoLink) {
            logoLink.addEventListener('click', (event) => {
                event.preventDefault();
                setMenuOpen(true);
            });
        }

        menuOverlay.addEventListener('click', (event) => {
            if (event.target === menuOverlay) {
                setMenuOpen(false);
            }
        });

        document.addEventListener('keydown', handleMenuKeydown);
    }

    const setActiveNav = () => {
        const page = document.body?.dataset?.page || '';
        const map = {
            about: 'about',
            access: 'access',
            contact: 'contact',
            dining: 'dining',
            facility: 'facility',
            faq: 'faq',
            guidelines: 'guidelines',
            rooms: 'rooms',
            'room-awanoyuki': 'rooms',
            'room-kazahana': 'rooms',
            'room-tsukiakari': 'rooms',
            'room-standard': 'rooms',
            spa: 'spa',
            privacy: 'privacy',
            sitepolicy: 'sitepolicy',
            reserve: 'reserve',
            'reserve-info': 'reserve',
            'reserve-complete': 'reserve',
            'reserve-lookup': 'reserve'
        };
        const key = map[page];
        if (!key) {
            return;
        }
        document.querySelectorAll(`[data-nav="${key}"]`).forEach((link) => {
            link.classList.add('is-active');
            if (link.tagName === 'A') {
                link.setAttribute('aria-current', 'page');
            }
        });
    };

    const initLanguagePicker = () => {
        const langButtons = Array.from(document.querySelectorAll('[data-lang]'));
        if (!langButtons.length) {
            return;
        }
        const dictionary = window.YK_I18N || {};
        const toast = document.createElement('div');
        toast.className = 'lang-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);

        let toastTimer = null;

        const updateActive = (lang) => {
            langButtons.forEach((btn) => {
                const isActive = btn.dataset.lang === lang;
                btn.classList.toggle('is-active', isActive);
                btn.setAttribute('aria-pressed', String(isActive));
            });
        };

        const showToast = (message) => {
            toast.textContent = message;
            toast.classList.add('is-visible');
            if (toastTimer) {
                window.clearTimeout(toastTimer);
            }
            toastTimer = window.setTimeout(() => {
                toast.classList.remove('is-visible');
            }, 2200);
        };

        // 【体验修复 · 2026-07-19】暴露成全局函数,给 reserve/ 页面的 JS
        // (reserve.js 等)复用这套"固定定位、不受滚动位置影响"的提示样式。
        // 起因:reserve.js 加购物车漏填日期时原本只把提示写进购物车面板里的
        // 一小行文字(.reserve-cart__note),但同时会把页面滚动到日历区域
        // (focusCalendar()),这两个位置往往不在同一屏,滚动过去后根本看不到
        // 那行提示,体验上等于"点了没反应"(任务卡原话:静默失败)。这个
        // toast 是 position: fixed(见 style.css .lang-toast),不管页面滚动到
        // 哪里都会显示在右下角,能真正解决"看不到提示"的问题。
        window.ykToast = showToast;

        const translatePage = (lang) => {
            const map = dictionary[lang] || dictionary.ja || {};
            document.querySelectorAll('[data-i18n]').forEach((el) => {
                const key = el.dataset.i18n;
                if (!key) {
                    return;
                }
                const value = map[key];
                if (typeof value === 'string') {
                    el.textContent = value;
                }
            });
            document.querySelectorAll('[data-nav]').forEach((el) => {
                const navKey = el.dataset.nav;
                if (!navKey) {
                    return;
                }
                if (el.children.length > 0) {
                    return;
                }
                if (el.dataset.i18n || el.dataset.i18nHtml || el.dataset.i18nValue || el.dataset.i18nPlaceholder) {
                    return;
                }
                const value = map[`nav.${navKey}`];
                if (typeof value === 'string') {
                    el.textContent = value;
                }
            });
            document.querySelectorAll('[data-i18n-html]').forEach((el) => {
                const key = el.dataset.i18nHtml;
                if (!key) {
                    return;
                }
                const value = map[key];
                if (typeof value === 'string') {
                    el.innerHTML = value;
                }
            });
            document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
                const key = el.dataset.i18nPlaceholder;
                if (!key) {
                    return;
                }
                const value = map[key];
                if (typeof value === 'string') {
                    el.setAttribute('placeholder', value);
                }
            });
            document.querySelectorAll('[data-i18n-value]').forEach((el) => {
                const key = el.dataset.i18nValue;
                if (!key) {
                    return;
                }
                const value = map[key];
                if (typeof value === 'string') {
                    el.setAttribute('value', value);
                }
            });
            document.querySelectorAll('[data-i18n-dataset]').forEach((el) => {
                const raw = el.dataset.i18nDataset;
                if (!raw) {
                    return;
                }
                raw.split(';').forEach((pair) => {
                    const [dataKey, i18nKey] = pair.split(':').map((part) => part && part.trim());
                    if (!dataKey || !i18nKey) {
                        return;
                    }
                    const value = map[i18nKey];
                    if (typeof value === 'string') {
                        el.dataset[dataKey] = value;
                    }
                });
            });
            document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
                const key = el.dataset.i18nAria;
                if (!key) {
                    return;
                }
                const value = map[key];
                if (typeof value === 'string') {
                    el.setAttribute('aria-label', value);
                }
            });
            // 【i18n补全 · 2026-07-19】新增 alt 属性的翻译支持——之前只有
            // textContent(data-i18n)/innerHTML(data-i18n-html)/placeholder/
            // value/aria-label 这几种,唯独没有 img alt,导致全站客室画廊、
            // 楼层地图图例、菜品图这类"内容全靠 alt 传达"的图片一直没法
            // 多语言化(体验审查报告262处清单里的大部分正是这一类)。
            document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
                const key = el.dataset.i18nAlt;
                if (!key) {
                    return;
                }
                const value = map[key];
                if (typeof value === 'string') {
                    el.setAttribute('alt', value);
                }
            });
            const pageKey = document.body?.dataset?.page ? `page.${document.body.dataset.page}` : '';
            if (pageKey) {
                const title = map[`${pageKey}.title`];
                if (typeof title === 'string') {
                    document.title = title;
                }
                const desc = map[`${pageKey}.description`];
                if (typeof desc === 'string') {
                    const meta = document.querySelector('meta[name=\"description\"]');
                    if (meta) {
                        meta.setAttribute('content', desc);
                    }
                }
            }
        };

        const applyLanguage = (lang) => {
            if (!lang) {
                return;
            }
            document.documentElement.lang = lang;
            if (document.body) {
                document.body.dataset.lang = lang;
            }
            updateActive(lang);
            translatePage(lang);
            // reserve/ 四个页面的 JS 里有一部分文案是运行时动态拼出来的
            // (购物车提示、查询结果等),不在上面 data-i18n 系列选择器覆盖
            // 范围内。这里广播一个事件,让这些页面自己的脚本(见
            // assets/js/i18n-runtime.js 的注释)在语言切换时重新渲染一次,
            // 不然切换语言只会更新静态文案,已经渲染出来的动态内容不会跟着变。
            window.dispatchEvent(new CustomEvent('yk:languagechange', { detail: { lang } }));
        };

        // 【体验修复 · 2026-07-19】原来这里是
        // `stored || document.documentElement.lang || 'ja'`——但每个 HTML
        // 文件的 <html lang> 都硬编码写死 "ja"(见各页面 <head> 部分),
        // 从来不会是空值,导致第二个 fallback 形同虚设:没有 stored 偏好时
        // 永远直接落到 "ja",从没真正读过浏览器语言,无痕窗口下访问不管
        // 浏览器语言是什么都只会显示日语。改成没有 stored 偏好时去匹配
        // navigator.languages(浏览器按优先级排好的语言列表),匹配不到
        // 任何支持的语言才最终 fallback 到 'ja'。
        const SUPPORTED_LANGS = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant'];

        // 把 navigator.languages 里的 BCP-47 标签匹配到站点支持的语言代码。
        // 中文单独处理:navigator 报告的是 zh-TW/zh-HK/zh-CN 这类"地区"代码,
        // 站点用的是 zh-Hans/zh-Hant 这种"文字体系"代码,两者对不上,需要
        // 按任务卡要求的对照关系手动映射——繁体地区(台湾/香港/澳门)落到
        // zh-Hant,简体地区(大陆/新加坡)及裸 "zh" 落到 zh-Hans。
        const matchBrowserLanguage = (languages) => {
            for (const raw of languages || []) {
                const tag = (raw || '').toLowerCase();
                if (!tag) {
                    continue;
                }
                if (tag.startsWith('zh')) {
                    if (tag.includes('hant') || tag === 'zh-tw' || tag === 'zh-hk' || tag === 'zh-mo') {
                        return 'zh-Hant';
                    }
                    return 'zh-Hans';
                }
                const primary = tag.split('-')[0];
                if (SUPPORTED_LANGS.includes(primary)) {
                    return primary;
                }
            }
            return null;
        };

        const stored = localStorage.getItem('preferredLanguage');
        const browserMatch = matchBrowserLanguage(
            navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]
        );
        applyLanguage(stored || browserMatch || 'ja');

        langButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.lang || '';
                if (!lang) {
                    return;
                }
                localStorage.setItem('preferredLanguage', lang);
                applyLanguage(lang);
                showToast(`表示言語: ${btn.textContent.trim()}`);
            });
        });
    };

    const initQuickNav = () => {
        const navBlocks = Array.from(document.querySelectorAll('[data-quick-nav]'));
        navBlocks.forEach((nav) => {
            const input = nav.querySelector('[data-quick-search]');
            const links = Array.from(nav.querySelectorAll('[data-quick-link]'));
            const empty = nav.querySelector('[data-quick-empty]');

            const filter = () => {
                const query = input ? input.value.trim().toLowerCase() : '';
                const tokens = query ? query.split(/\s+/) : [];
                let visibleCount = 0;
                links.forEach((link) => {
                    const text = link.textContent.trim().toLowerCase();
                    const match = tokens.length === 0 || tokens.every((token) => text.includes(token));
                    link.classList.toggle('is-hidden', !match);
                    if (match) {
                        visibleCount += 1;
                    }
                });
                if (empty) {
                    empty.classList.toggle('is-hidden', visibleCount !== 0);
                }
            };

            if (input) {
                input.addEventListener('input', filter);
            }
            filter();
        });
    };

    setActiveNav();
    initLanguagePicker();
    initQuickNav();

    let scrollTicking = false;
    const handleScroll = () => {
        if (scrollTicking) {
            return;
        }
        scrollTicking = true;
        window.requestAnimationFrame(() => {
            updateHeaderMode();
            scrollTicking = false;
        });
    };

    updateHeaderThreshold();
    updateHeaderMode();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', () => {
        updateHeaderThreshold();
        updateHeaderMode();
    });
    window.addEventListener('load', () => {
        updateHeaderThreshold();
        updateHeaderMode();
    });
})();
