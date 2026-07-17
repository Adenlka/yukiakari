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
                labelOutput.textContent =
                    slides[index].dataset.shortLabel ||
                    slides[index].dataset.label ||
                    '';
            }
        };

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
