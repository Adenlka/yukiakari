// assets/js/i18n-runtime.js
//
// 用途:给 reserve/ 四个页面的 JS(reserve.js/booking_info.js/
// booking_lookup.js/booking_complete.js)提供一个轻量翻译函数,用来翻译
// "JS 运行时动态生成的文案"(购物车提示、报错信息、房间标签等,见需求文档
// 2.7/4.2)——这类文案没法像静态 HTML 那样直接写 data-i18n 属性,因为它们
// 是提交/筛选/渲染购物车等操作触发时才拼出来的字符串。
//
// 复用和 script.js 的 initLanguagePicker() 完全相同的语言解析逻辑(读
// localStorage['preferredLanguage'],找不到就退回 <html lang> 或 'ja'),
// 保证这里翻译出来的文案和页面其它 data-i18n 元素显示的语言永远一致。
//
// 加载顺序要求:必须排在 i18n-data.js 之后(要用到 window.YK_I18N),排在
// 页面脚本(reserve.js 等)之前即可,和 script.js 谁先谁后没有依赖关系。
//
// 语言切换后如何让"已经渲染出来的"动态内容跟着变:script.js 的
// applyLanguage() 每次切换语言都会 dispatch 一个 'yk:languagechange' 的
// window 事件(见 script.js 对应位置的注释),reserve/ 页面脚本自己监听这个
// 事件、重新调用一次自己的渲染函数(比如购物车列表)。这个事件名是两边硬
// 编码的同一个字符串常量,不依赖谁先加载谁。

(() => {
    const getCurrentLang = () => (
        (typeof localStorage !== 'undefined' && localStorage.getItem('preferredLanguage'))
        || document.documentElement.lang
        || 'ja'
    );

    // key:YK_I18N 字典里的 key;fallback:字典里(含日语兜底)也查不到时的
    // 兜底文案。不传 fallback 时,查不到就返回 key 本身(便于调试时一眼看出
    // 漏翻译了哪个 key,而不是显示一个空白)。
    window.ykT = (key, fallback) => {
        const dict = window.YK_I18N || {};
        const lang = getCurrentLang();
        const map = dict[lang] || {};
        if (typeof map[key] === 'string') {
            return map[key];
        }
        const jaMap = dict.ja || {};
        if (typeof jaMap[key] === 'string') {
            return jaMap[key];
        }
        return fallback !== undefined ? fallback : key;
    };

    window.YK_LANGUAGE_CHANGE_EVENT = 'yk:languagechange';
})();
