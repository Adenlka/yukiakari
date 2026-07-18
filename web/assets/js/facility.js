(() => {
    const initCarousel = (carousel) => {
        const track = carousel.querySelector('[data-carousel-track]');
        if (!track) {
            return;
        }
        const slides = Array.from(track.children);
        if (slides.length === 0) {
            return;
        }
        const prevButton = carousel.querySelector('[data-carousel-prev]');
        const nextButton = carousel.querySelector('[data-carousel-next]');
        const dots = Array.from(carousel.querySelectorAll('[data-carousel-dot]'));
        const labelOutput = carousel.querySelector('[data-carousel-label-output]');

        let index = 0;

        const update = (nextIndex) => {
            const total = slides.length;
            index = ((nextIndex % total) + total) % total;
            track.style.transform = `translateX(-${index * 100}%)`;
            slides.forEach((slide, idx) => {
                slide.classList.toggle('is-active', idx === index);
            });
            dots.forEach((dot, idx) => {
                dot.classList.toggle('is-active', idx === index);
            });
            if (labelOutput) {
                // 【i18n补全 · 2026-07-19】原来这里直接读 dataset.shortLabel/
                // dataset.label,里面存的是硬编码日文("本館"/"新館"/"離れ"),
                // 语言切换后这个跟随轮播联动的小标签依然只会显示日文——即使
                // 給旁边的翻页按钮/圆点都加了 data-i18n-aria,这个由 JS 动态
                // 写入的文字不受 script.js 的 translatePage() 管辖,加了也没用。
                // 改成优先读 dataset.shortLabelKey(i18n字典key),用
                // window.ykT() 查当前语言的译文;查不到(极端情况下 i18n
                // 脚本还没加载完)才退回旧的原始日文兜底,不会白屏。
                const key = slides[index].dataset.shortLabelKey;
                labelOutput.textContent = (key && window.ykT)
                    ? window.ykT(key, slides[index].dataset.shortLabel || slides[index].dataset.label || '')
                    : (slides[index].dataset.shortLabel || slides[index].dataset.label || '');
            }
        };

        // 语言切换时,当前正显示的这个标签也要跟着重新翻译一遍——不然要等
        // 用户手动点一次翻页按钮才会更新,体验上会有一瞬间的"切换了语言但
        // 这个小标签没变"的不一致。
        window.addEventListener('yk:languagechange', () => update(index));

        prevButton?.addEventListener('click', () => update(index - 1));
        nextButton?.addEventListener('click', () => update(index + 1));

        dots.forEach((dot) => {
            dot.addEventListener('click', () => {
                const targetIndex = parseInt(dot.dataset.carouselDot, 10);
                if (!Number.isNaN(targetIndex)) {
                    update(targetIndex);
                }
            });
        });

        carousel.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                update(index - 1);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                update(index + 1);
            } else if (event.key === 'Home') {
                event.preventDefault();
                update(0);
            } else if (event.key === 'End') {
                event.preventDefault();
                update(slides.length - 1);
            }
        });

        update(0);
    };

    document.addEventListener('DOMContentLoaded', () => {
        const hero = document.querySelector('.hero--facility');
        if (hero) {
            requestAnimationFrame(() => hero.classList.add('is-ready'));
        }

        document.querySelectorAll('[data-carousel]').forEach((carousel) => {
            initCarousel(carousel);
        });
    });
})();
