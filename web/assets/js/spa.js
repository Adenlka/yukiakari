  (() => {
    document.addEventListener('DOMContentLoaded', () => {
        const hero = document.querySelector('.hero--spa');
        if (hero) {
            requestAnimationFrame(() => hero.classList.add('is-ready'));
        }
    });
})();
