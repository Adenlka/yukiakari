(() => {
    document.addEventListener('DOMContentLoaded', () => {
        const title = document.querySelector('.page-title');
        if (title) {
            requestAnimationFrame(() => title.classList.add('is-ready'));
        }
    });
})();
