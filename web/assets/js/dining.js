(() => {
    document.addEventListener('DOMContentLoaded', () => {
        const hero = document.querySelector('.hero--dining');
        if (hero) {
            requestAnimationFrame(() => hero.classList.add('is-ready'));
        }
    });
})();
