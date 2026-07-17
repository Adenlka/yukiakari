(() => {
    document.addEventListener('DOMContentLoaded', () => {
        const hero = document.querySelector('.hero--rooms');
        if (hero) {
            requestAnimationFrame(() => hero.classList.add('is-ready'));
        }
    });
})();
