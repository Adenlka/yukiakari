(() => {
    const hero = document.querySelector('.hero');
    const loader = document.querySelector('.page-loader');

    if (!hero) {
        return;
    }

    const reelList = hero.querySelector('.hero__reel-list');
    if (!reelList) {
        return;
    }

    const heroImages = [
        'assets/images/hero/hero-slide-01-exterior.jpg',
        'assets/images/hero/hero-slide-02-Onsen.jpg',
        'assets/images/hero/hero-slide-03-stonewall.jpg',
        'assets/images/hero/hero-slide-04-river.jpg',
        'assets/images/hero/hero-slide-05-forest.jpg',
        'assets/images/hero/hero-slide-06-stoneSteps.jpg',
        'assets/images/hero/hero-slide-07-roof.jpg',
        'assets/images/hero/hero-slide-08-AutumnleavesandRooftops.jpg',
        'assets/images/hero/hero-slide-09-Bamboopipe.jpg',
        'assets/images/hero/hero-slide-10-Onsenhotel.jpg'
    ];

    const imageCache = new Map();
    let loaderHidden = false;
    let order = [];
    let items = [];
    let currentIndex = 0;
    let timerId = null;
    let isRunning = false;
    let durationMs = 14000;

    const createImageRecord = (src) => {
        const img = new Image();
        const record = {
            img,
            loaded: false,
            failed: false,
            promise: null
        };

        record.promise = new Promise((resolve) => {
            img.onload = () => {
                record.loaded = true;
                resolve(record);
            };
            img.onerror = () => {
                record.failed = true;
                resolve(record);
            };
        });

        img.decoding = 'async';
        img.loading = 'eager';
        img.src = src;

        if (img.complete && img.naturalWidth > 0) {
            record.loaded = true;
        }

        return record;
    };

    const hideLoader = () => {
        if (!loader || loaderHidden) {
            return;
        }
        loaderHidden = true;
        loader.classList.add('is-hidden');
    };

    const waitForImage = (src, callback) => {
        const record = imageCache.get(src);
        if (!record) {
            callback(false);
            return;
        }
        if (record.loaded) {
            callback(true);
            return;
        }
        if (record.failed) {
            callback(false);
            return;
        }
        record.promise.then(() => callback(record.loaded));
    };

    const waitForImages = (sources, minCount = 1, timeoutMs = 3600) => {
        if (!sources.length || !loader) {
            hideLoader();
            return;
        }
        let loadedCount = 0;
        let done = false;

        const finalize = () => {
            if (done) {
                return;
            }
            done = true;
            hideLoader();
        };

        sources.forEach((src) => {
            waitForImage(src, (loaded) => {
                if (loaded) {
                    loadedCount += 1;
                }
                if (loadedCount >= minCount) {
                    finalize();
                }
            });
        });

        window.setTimeout(finalize, timeoutMs);
    };

    const shuffle = (array) => {
        const arr = array.slice();
        for (let i = arr.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    const createItem = (src) => {
        const item = document.createElement('li');
        item.className = 'hero__reel-item';
        const inner = document.createElement('div');
        inner.className = 'hero__reel-inner';
        inner.style.backgroundImage = `url("${src}")`;
        item.appendChild(inner);
        return item;
    };

    const setClasses = (nextIndex) => {
        items.forEach((item) => {
            item.classList.remove('is-current', 'is-prev');
        });
        const prevIndex = nextIndex - 1 < 0 ? items.length - 1 : nextIndex - 1;
        const currentItem = items[nextIndex];
        const prevItem = items[prevIndex];
        if (prevItem) {
            prevItem.classList.add('is-prev');
        }
        if (currentItem) {
            currentItem.classList.add('is-current');
        }
    };

    const getDurationMs = (element) => {
        if (!element) {
            return 14000;
        }
        const style = window.getComputedStyle(element);
        const parseTime = (value) => {
            if (!value) {
                return 0;
            }
            const token = value.split(',')[0].trim();
            if (token.endsWith('ms')) {
                return parseFloat(token);
            }
            if (token.endsWith('s')) {
                return parseFloat(token) * 1000;
            }
            const num = parseFloat(token);
            return Number.isFinite(num) ? num : 0;
        };
        return Math.max(parseTime(style.animationDuration), parseTime(style.transitionDuration), 8000);
    };

    const setupItems = () => {
        order = shuffle(heroImages);
        reelList.innerHTML = '';
        items = order.map((src) => createItem(src));
        items.forEach((item) => reelList.appendChild(item));
    };

    const refreshOrder = () => {
        order = shuffle(heroImages);
        order.forEach((src, idx) => {
            const inner = items[idx]?.querySelector('.hero__reel-inner');
            if (inner) {
                inner.style.backgroundImage = `url("${src}")`;
            }
        });
    };

    const play = () => {
        timerId = window.setTimeout(() => {
            if (document.hidden) {
                isRunning = false;
                timerId = null;
                return;
            }
            let nextIndex = currentIndex + 1;
            if (nextIndex >= items.length) {
                refreshOrder();
                nextIndex = 0;
            }
            setClasses(nextIndex);
            currentIndex = nextIndex;
            play();
        }, durationMs);
    };

    const start = () => {
        if (isRunning || !items.length) {
            return;
        }
        const firstSrc = order[0];
        waitForImage(firstSrc, (loaded) => {
            if (!loaded) {
                timerId = window.setTimeout(start, 500);
                return;
            }
            isRunning = true;
            currentIndex = 0;
            setClasses(currentIndex);
            hideLoader();
            durationMs = getDurationMs(items[0]);
            play();
        });
    };

    const stop = () => {
        if (timerId) {
            window.clearTimeout(timerId);
            timerId = null;
        }
        isRunning = false;
    };

    heroImages.forEach((src) => {
        if (!imageCache.has(src)) {
            imageCache.set(src, createImageRecord(src));
        }
    });

    setupItems();
    waitForImages(order.slice(0, 3), 2);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stop();
        } else {
            start();
        }
    });

    window.addEventListener('focus', start);
    window.addEventListener('pageshow', start);
    window.addEventListener('pagehide', stop);

    const wrapChars = (element, useWrapper = false) => {
        if (!element || element.dataset.charsWrapped === 'true' || element.querySelector('.char')) {
            return;
        }
        const text = element.textContent || '';
        element.textContent = '';
        const target = useWrapper ? document.createElement('span') : element;
        target.classList.add('char-animate');
        Array.from(text).forEach((char, index) => {
            const span = document.createElement('span');
            span.className = char.trim() ? 'char' : 'char char--space';
            span.style.setProperty('--char-delay', `${index * 35}ms`);
            span.textContent = char.trim() ? char : '\u00A0';
            target.appendChild(span);
        });
        if (useWrapper) {
            element.appendChild(target);
        }
        element.dataset.charsWrapped = 'true';
    };

    const initCharReveal = () => {
        document.querySelectorAll('.feature__eyebrow, .feature .js-wrap').forEach((el) => {
            wrapChars(el, el.classList.contains('feature__eyebrow'));
        });
    };

    initCharReveal();
    start();
})();
