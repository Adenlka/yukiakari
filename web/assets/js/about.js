(() => {
    document.addEventListener('DOMContentLoaded', () => {
        const hero = document.querySelector('.hero--about');
        if (hero) {
            requestAnimationFrame(() => hero.classList.add('is-ready'));
        }
    });
})();
