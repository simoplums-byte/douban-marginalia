// ==UserScript==
// @name         Douban Marginalia
// @name:en      Douban Marginalia
// @name:zh-CN   Douban Marginalia
// @namespace    https://local.codex/douban-marginalia
// @version      1.0.4
// @description  按需导出豆瓣电影、读书、音乐和游戏收藏，支持 JSON/Excel/CSV、IMDb、ISBN 和封面资源 ZIP。
// @description:en Export selected Douban movie, book, music and game fields to JSON/Excel/CSV, with optional IMDb, ISBN and cover assets.
// @author       ming (original project); Sean Li (local modifications)
// @match        https://*.douban.com/*
// @match        https://douban.com/*
// @match        https://www.douban.com/people/*
// @match        https://movie.douban.com/mine*
// @match        https://movie.douban.com/people/*/collect*
// @match        https://movie.douban.com/people/*/wish*
// @match        https://movie.douban.com/people/*/do*
// @match        https://book.douban.com/mine*
// @match        https://book.douban.com/people/*/collect*
// @match        https://book.douban.com/people/*/wish*
// @match        https://book.douban.com/people/*/do*
// @match        https://music.douban.com/mine*
// @match        https://music.douban.com/people/*/collect*
// @match        https://music.douban.com/people/*/wish*
// @match        https://music.douban.com/people/*/do*
// @match        https://www.douban.com/people/*/games*
// @require      https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      *.doubanio.com
// @connect      doubanio.com
// @connect      img1.doubanio.com
// @connect      img2.doubanio.com
// @connect      img3.doubanio.com
// @connect      img4.doubanio.com
// @connect      img5.doubanio.com
// @connect      img6.doubanio.com
// @connect      img7.doubanio.com
// @connect      img8.doubanio.com
// @connect      img9.doubanio.com
// @license      MIT
// @homepageURL  https://github.com/byJming/douban-movie-exporter
// @source       https://github.com/byJming/douban-movie-exporter
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        minDelay: 2000,
        maxDelay: 2800,
        stateKey: 'db_export_state_v2',
        dataKey: 'db_export_data_v2',
        fieldsKey: 'db_export_fields_v2',
        detailCacheKey: 'db_export_detail_cache_v1',
        detailDelay: 2000,
        coverConcurrency: 2
    };

    const CATEGORIES = {
        movie: { label: '电影', icon: '🎬', sheet: '电影收藏', file: 'Movie', pageSize: 15 },
        book: { label: '读书', icon: '📚', sheet: '读书收藏', file: 'Book', pageSize: 15 },
        music: { label: '音乐', icon: '🎵', sheet: '音乐收藏', file: 'Music', pageSize: 15 },
        game: { label: '游戏', icon: '🎮', sheet: '游戏收藏', file: 'Game', pageSize: 15 }
    };

    const STATUS_LABELS = {
        movie: { wish: '想看', do: '在看', collect: '看过' },
        book: { wish: '想读', do: '在读', collect: '读过' },
        music: { wish: '想听', do: '在听', collect: '听过' },
        game: { wish: '想玩', do: '在玩', collect: '玩过' }
    };
    const STATUS_ORDER = ['wish', 'do', 'collect'];

    const COMMON_FIELDS = [
        { key: 'title', name: '标题', default: true },
        { key: 'id', name: '豆瓣条目 ID', default: false },
        { key: 'rating', name: '个人评分', default: true },
        { key: 'date', name: '标记日期', default: true },
        { key: 'status', name: '收藏状态', default: false },
        { key: 'tags', name: '标签', default: false },
        { key: 'comment', name: '短评/备注', default: true },
        { key: 'intro', name: '简介/出版信息', default: false },
        { key: 'link', name: '豆瓣链接', default: true }
    ];

    const CATEGORY_FIELDS = {
        movie: [{ key: 'imdb_id', name: 'IMDb', default: false, requiresDetail: true }],
        book: [{ key: 'isbn', name: 'ISBN', default: false, requiresDetail: true }],
        music: [],
        game: []
    };


    const styleText = `
        #db-export-summary-btn {
            position: fixed; top: 110px; right: 20px; z-index: 9999;
            padding: 10px 18px; border: 0; border-radius: 24px; cursor: pointer;
            background: #3eaf7c; color: #fff; font-size: 14px; font-weight: 700;
            box-shadow: 0 4px 12px rgba(62,175,124,.35); transition: .2s;
        }
        #db-export-summary-btn:hover { background: #339268; transform: translateY(-1px); }
        #db-export-task-controls {
            position: fixed; top: 160px; right: 20px; z-index: 9999; width: 210px;
            padding: 12px; border: 1px solid #e6ebe8; border-radius: 10px; background: #fff;
            box-shadow: 0 8px 22px rgba(0,0,0,.16); font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        }
        .db-task-title { color:#333; font-size:13px; font-weight:700; }
        .db-task-meta { margin-top:4px; color:#777; font-size:12px; }
        .db-task-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
        .db-task-actions button { flex:1 1 88px; padding:7px 6px; border:0; border-radius:5px; cursor:pointer; font-size:12px; font-weight:700; }
        #db-task-stop { background:#fce8e6; color:#b42318; }
        #db-task-export { background:#fff4ce; color:#765500; }
        #db-task-restart { background:#e8f4ee; color:#177245; }
        #db-export-summary-overlay, #db-export-modal-overlay {
            position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.52);
            display: flex; align-items: center; justify-content: center;
        }
        #db-export-summary-panel, #db-export-modal {
            box-sizing: border-box; width: min(520px, 92vw); max-height: 86vh; overflow-y: auto;
            padding: 24px; border-radius: 10px; background: #fff; color: #333;
            font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
            box-shadow: 0 12px 36px rgba(0,0,0,.22); animation: dbFadeIn .2s ease-out;
        }
        #db-export-summary-panel h3, #db-export-modal h3 { margin: 0; padding-bottom: 12px; border-bottom: 2px solid #3eaf7c; font-size: 18px; }
        .db-summary-help { margin: 12px 0 16px; color:#666; font-size: 13px; line-height: 1.6; }
        .db-summary-list { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .db-summary-card { display:flex; align-items:center; gap: 10px; padding: 12px; border:1px solid #e8e8e8; border-radius: 8px; }
        .db-summary-cover { width: 40px; height: 54px; flex: 0 0 40px; object-fit: cover; border-radius: 3px; background:#f2f2f2; }
        .db-summary-main { min-width:0; flex:1; }
        .db-summary-title { font-weight:700; font-size:14px; }
        .db-summary-meta { margin-top:4px; color:#888; font-size:12px; line-height:1.4; }
        .db-summary-action { margin-top:8px; padding: 6px 10px; border:0; border-radius:5px; cursor:pointer; color:#fff; background:#3eaf7c; font-size:12px; }
        .db-summary-action:hover { background:#339268; }
        .db-btn { padding: 8px 14px; border: 0; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 700; }
        .db-btn-primary { background:#3eaf7c; color:#fff; }
        .db-btn-primary:hover { background:#339268; }
        .db-btn-secondary { background:#f0f0f0; color:#666; }
        .db-btn-secondary:hover { background:#e2e2e2; }
        .db-checkbox-group { display:flex; flex-direction:column; gap:9px; max-height:330px; overflow-y:auto; margin:16px 0; }
        .db-checkbox-label { display:flex; align-items:center; gap:9px; cursor:pointer; color:#444; font-size:14px; user-select:none; }
        .db-checkbox-label input { width:16px; height:16px; accent-color:#3eaf7c; }
        .db-page-range { display:flex; align-items:center; gap:8px; margin:9px 0 0 25px; padding:10px; border-radius:7px; background:#f7f9f8; }
        .db-page-range[hidden] { display:none; }
        .db-page-range input { box-sizing:border-box; width:72px; padding:5px 7px; border:1px solid #d7dedb; border-radius:5px; }
        .db-download-section { padding:12px; border:1px solid #e6ebe8; border-radius:8px; }
        .db-download-section + .db-download-section { margin-top:10px; }
        .db-download-title { margin-bottom:8px; color:#333; font-weight:700; font-size:13px; }
        .db-download-actions { display:flex; flex-direction:column; gap:8px; }
        .db-btn-group { display:flex; justify-content:flex-end; gap:9px; margin-top:20px; }
        .db-note { color:#777; font-size:12px; line-height:1.6; }
        .db-progress-track { height:6px; margin-top:10px; overflow:hidden; border-radius:999px; background:#edf1ef; }
        .db-progress-bar { width:0; height:100%; border-radius:inherit; background:#3eaf7c; transition:width .15s ease; }
        @keyframes dbFadeIn { from { opacity:0; transform:translateY(-12px); } to { opacity:1; transform:translateY(0); } }
        @media (max-width: 560px) { .db-summary-list { grid-template-columns: 1fr; } }
    `;

    function addStyle(css) {
        if (typeof GM_addStyle === 'function') GM_addStyle(css);
        else {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        }
    }

    function textOf(el) {
        return el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }

    function parseJson(value, fallback) {
        try { return value ? JSON.parse(value) : fallback; } catch (e) { return fallback; }
    }

    function getProfileSlug() {
        const match = location.pathname.match(/^\/people\/([^/]+)/);
        if (match) return match[1];
        const userId = window._GLOBAL_NAV && window._GLOBAL_NAV.USER_ID;
        if (userId) return String(userId);
        const profileLink = [...document.querySelectorAll('a[href]')].find(link => {
            const label = textOf(link);
            return ['我的主页', '个人主页', '豆瓣主页'].includes(label)
                && /https?:\/\/www\.douban\.com\/people\/[^/?#]+\/?(?:[?#]|$)/.test(link.href);
        });
        const profileMatch = profileLink && profileLink.href.match(/\/people\/([^/?#]+)/);
        return profileMatch ? profileMatch[1] : '';
    }

    function detectContext() {
        const host = location.hostname;
        const path = location.pathname;
        if (host === 'movie.douban.com' && (/\/mine/.test(path) || /\/people\/[^/]+\/(?:collect|wish|do)/.test(path))) return 'movie';
        if (host === 'book.douban.com' && (/\/mine/.test(path) || /\/people\/[^/]+\/(?:collect|wish|do)/.test(path))) return 'book';
        if (host === 'music.douban.com' && (/\/mine/.test(path) || /\/people\/[^/]+\/(?:collect|wish|do)/.test(path))) return 'music';
        if (host === 'www.douban.com' && /\/people\/[^/]+\/games/.test(path)) return 'game';
        if (host === 'www.douban.com' && /^\/people\/[^/]+\/?$/.test(path)) return 'profile';
        if ((host === 'douban.com' || host.endsWith('.douban.com')) && host !== 'accounts.douban.com') return 'generic';
        return '';
    }

    function storageKey(key) {
        // /mine 首页的下一页通常会跳到 /people/<id>/collect，按 host 存储可跨分页保持状态。
        return `${key}:${location.hostname}`;
    }

    function getState() {
        return parseJson(localStorage.getItem(storageKey(CONFIG.stateKey)), { status: 'idle' });
    }

    function setState(state) {
        localStorage.setItem(storageKey(CONFIG.stateKey), JSON.stringify(state));
    }

    function getStoredData() {
        return parseJson(localStorage.getItem(storageKey(CONFIG.dataKey)), []);
    }

    function setStoredData(data) {
        localStorage.setItem(storageKey(CONFIG.dataKey), JSON.stringify(data));
    }

    function getAvailableFields(category) {
        return [...COMMON_FIELDS, ...(CATEGORY_FIELDS[category] || [])];
    }

    function getSelectedFields(category = detectContext()) {
        const availableFields = getAvailableFields(category);
        const allowed = new Set(availableFields.map(field => field.key));
        return parseJson(localStorage.getItem(storageKey(CONFIG.fieldsKey)), availableFields.filter(f => f.default).map(f => f.key))
            .filter(field => allowed.has(field));
    }

    function getDetailCache() {
        return parseJson(localStorage.getItem(storageKey(CONFIG.detailCacheKey)), {});
    }

    function setDetailCache(category, id, detail) {
        const cache = getDetailCache();
        cache[`${category}:${id}`] = detail;
        localStorage.setItem(storageKey(CONFIG.detailCacheKey), JSON.stringify(cache));
    }

    function cleanComment(value) {
        return String(value || '').replace(/\s*[（(]\s*\d+\s*有用\s*[）)]\s*$/, '').trim();
    }

    function captchaError(url) {
        const error = new Error('豆瓣要求完成安全验证');
        error.code = 'DOUBAN_CAPTCHA_REQUIRED';
        error.captchaUrl = url;
        return error;
    }

    function isVerificationResponse(response, html) {
        const url = String(response.url || '');
        return response.status === 403 || response.status === 429
            || /sec\.douban\.com|captcha|安全验证|滑动验证/i.test(url)
            || /sec\.douban\.com|请完成验证|滑动验证|安全验证/i.test(String(html || '').slice(0, 12000));
    }

    function infoValueFromDoc(doc, label) {
        const labels = [...doc.querySelectorAll('#info .pl')];
        const marker = labels.find(el => textOf(el).replace(/[:：]\s*$/, '') === label);
        if (!marker) return '';
        const parts = [];
        let node = marker.nextSibling;
        while (node && !(node.nodeType === 1 && node.matches('.pl'))) {
            const value = node.nodeType === 3 ? node.textContent.trim() : textOf(node);
            if (value) parts.push(value);
            node = node.nextSibling;
        }
        return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    function parseMovieDetail(doc) {
        const infoText = textOf(doc.querySelector('#info'));
        const imdb = infoText.match(/IMDb[:：]\s*(tt\d+)/i);
        return { imdb_id: imdb ? imdb[1] : '' };
    }

    function parseBookDetail(doc) {
        const isbn = infoValueFromDoc(doc, 'ISBN');
        const isbnDigits = isbn.replace(/[^0-9X]/gi, '');
        return { isbn: isbn || isbnDigits };
    }

    async function enrichDetails(records, category, fields, onProgress = null) {
        const needsDetails = fields.some(field => getAvailableFields(category).find(item => item.key === field)?.requiresDetail);
        if (!needsDetails || !['movie', 'book'].includes(category)) return records;
        const cache = getDetailCache();
        let completed = 0;
        let cached = 0;
        const reportProgress = currentTitle => {
            if (!onProgress) return;
            const remainingFetches = records.slice(completed)
                .filter(record => !cache[`${category}:${record.id}`]).length;
            onProgress({
                currentTitle,
                completed,
                total: records.length,
                cached,
                estimatedRemainingSeconds: Math.ceil(remainingFetches * CONFIG.detailDelay / 1000)
            });
        };
        reportProgress('准备读取详情…');
        for (let index = 0; index < records.length; index += 1) {
            const record = records[index];
            const cacheKey = `${category}:${record.id}`;
            let detail = cache[cacheKey];
            reportProgress(record.title);
            if (!detail) {
                try {
                    const response = await fetch(record.link, { credentials: 'include' });
                    const html = await response.text();
                    if (isVerificationResponse(response, html)) throw captchaError(record.link);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    detail = category === 'movie' ? parseMovieDetail(doc) : parseBookDetail(doc);
                    detail.detail_fetch_status = 'ok';
                    detail.detail_fetched_at = new Date().toISOString();
                    setDetailCache(category, record.id, detail);
                    cache[cacheKey] = detail;
                } catch (error) {
                    if (error.code === 'DOUBAN_CAPTCHA_REQUIRED') throw error;
                    detail = {
                        detail_fetch_status: 'failed',
                        detail_fetch_error: String(error && error.message ? error.message : error),
                        detail_fetched_at: new Date().toISOString()
                    };
                }
                if (index < records.length - 1) await new Promise(resolve => setTimeout(resolve, CONFIG.detailDelay));
            } else cached += 1;
            completed += 1;
            record.detail = detail;
            reportProgress(record.title);
        }
        return records;
    }

    function cleanTitle(value) {
        return value.replace(/^\[.*?\]\s*/, '').replace(/\s+/g, ' ').trim();
    }

    function extractDate(value) {
        const match = value.match(/\d{4}-\d{1,2}-\d{1,2}/);
        return match ? match[0] : value.trim();
    }

    function parseRating(el) {
        if (!el) return '';
        const attr = el.getAttribute('data-rating');
        if (attr && /^\d+(?:\.\d+)?$/.test(attr)) return Number(attr);
        const cls = el.className || '';
        const rating = cls.match(/rating(\d)-t/);
        if (rating) return Number(rating[1]);
        const stars = cls.match(/allstar(\d+)/);
        if (stars) return Number(stars[1]) / 10;
        return '';
    }

    function getRating(item) {
        return parseRating(item.querySelector('[class^="rating"][class$="-t"], [class*="allstar"], [data-rating]'));
    }

    function getCover(item, category) {
        const img = item && item.querySelector('img[data-src], img[data-original], img[src]');
        if (!img) return '';
        let url = img.getAttribute('data-src') || img.getAttribute('data-original') || img.src || '';
        if (['book', 'music'].includes(category)) url = url.replace('/view/subject/s/public/', '/view/subject/l/public/').replace('/view/subject/m/public/', '/view/subject/l/public/');
        return url;
    }

    function getId(link) {
        const match = (link || '').match(/\/(?:subject|game)\/(\d+)/);
        return match ? match[1] : '';
    }

    function getStatusFromUrl() {
        const url = new URL(location.href);
        const param = url.searchParams.get('status') || url.searchParams.get('action');
        if (param) return param;
        const match = url.pathname.match(/\/(collect|wish|do)\/?$/);
        return match ? match[1] : 'collect';
    }

    function baseRecord(category, link, item) {
        return {
            category,
            id: getId(link),
            title: '',
            rating: '',
            date: '',
            status: getStatusFromUrl(),
            tags: '',
            comment: '',
            comment_raw: '',
            intro: '',
            cover_url: getCover(item, category),
            link
        };
    }

    function parseMoviePage() {
        const items = [...document.querySelectorAll('.grid-view .item, .list-view .item')]
            .filter(item => item.querySelector('a[href*="/subject/"]'));
        return items.map(item => {
            const titleLink = item.querySelector('.title a[href*="/subject/"]') || item.querySelector('a[href*="/subject/"]');
            const record = baseRecord('movie', titleLink ? titleLink.href : '', item);
            record.title = cleanTitle(textOf(titleLink));
            record.rating = getRating(item);
            record.date = extractDate(textOf(item.querySelector('.date')));
            record.tags = textOf(item.querySelector('.tags')).replace(/^标签[:：]\s*/, '');
            record.comment_raw = textOf(item.querySelector('.comment'));
            record.comment = cleanComment(record.comment_raw);
            record.intro = textOf(item.querySelector('.intro'));
            return record;
        });
    }

    function parseBookPage() {
        return [...document.querySelectorAll('.subject-item')].map(item => {
            const titleLink = item.querySelector('.info h2 a[href*="/subject/"]') || item.querySelector('a[href*="/subject/"]');
            const record = baseRecord('book', titleLink ? titleLink.href : '', item);
            record.title = cleanTitle(textOf(titleLink));
            record.rating = getRating(item);
            record.date = extractDate(textOf(item.querySelector('.date')));
            record.tags = textOf(item.querySelector('.tags')).replace(/^标签[:：]\s*/, '');
            record.comment_raw = textOf(item.querySelector('.comment'));
            record.comment = cleanComment(record.comment_raw);
            record.intro = textOf(item.querySelector('.pub'));
            return record;
        }).filter(record => record.link);
    }

    function parseMusicPage() {
        return [...document.querySelectorAll('.item.comment-item, .item')]
            .filter(item => item.querySelector('a[href*="/subject/"]'))
            .map(item => {
                const titleLink = item.querySelector('.title a[href*="/subject/"]') || item.querySelector('a[href*="/subject/"]');
                const record = baseRecord('music', titleLink ? titleLink.href : '', item);
                record.title = cleanTitle(textOf(titleLink));
                record.rating = getRating(item);
                record.date = extractDate(textOf(item.querySelector('.date')));
                record.comment_raw = textOf(item.querySelector('.comment'));
                record.comment = cleanComment(record.comment_raw);
                record.intro = textOf(item.querySelector('.intro'));
                return record;
            }).filter(record => record.link);
    }

    function parseGamePage() {
        return [...document.querySelectorAll('.game-list .common-item')].map(item => {
            const titleLink = item.querySelector('.title a[href*="/game/"]') || item.querySelector('a[href*="/game/"]');
            const record = baseRecord('game', titleLink ? titleLink.href : '', item);
            record.title = cleanTitle(textOf(titleLink));
            record.rating = getRating(item);
            record.date = extractDate(textOf(item.querySelector('.date')));
            const desc = item.querySelector('.desc');
            if (desc) {
                const clone = desc.cloneNode(true);
                clone.querySelector('.rating-info')?.remove();
                record.intro = textOf(clone);
            }
            const comment = [...item.querySelectorAll('.content > div')]
                .find(el => !el.classList.contains('title') && !el.classList.contains('desc') && !el.classList.contains('user-operation'));
            record.comment_raw = textOf(comment);
            record.comment = cleanComment(record.comment_raw);
            return record;
        }).filter(record => record.link);
    }

    async function enrichMovieFromList(records, fields) {
        if (!fields.includes('tags') && !fields.includes('comment')) return records;
        try {
            const listUrl = new URL(location.href);
            listUrl.searchParams.set('mode', 'list');
            const response = await fetch(listUrl.href, { credentials: 'include' });
            const html = await response.text();
            if (isVerificationResponse(response, html)) throw captchaError(listUrl.href);
            if (!response.ok) return records;
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const detailMap = new Map();
            [...doc.querySelectorAll('.list-view .item')].forEach(item => {
                const link = item.querySelector('.title a[href*="/subject/"]');
                if (!link) return;
                detailMap.set(getId(link.href), {
                    tags: textOf(item.querySelector('.tags')).replace(/^标签[:：]\s*/, ''),
                    comment_raw: textOf(item.querySelector('.comment')),
                    comment: cleanComment(textOf(item.querySelector('.comment')))
                });
            });
            records.forEach(record => Object.assign(record, detailMap.get(record.id) || {}));
        } catch (e) {
            if (e.code === 'DOUBAN_CAPTCHA_REQUIRED') throw e;
            console.warn('[Douban Export] 无法补充电影列表字段:', e);
        }
        return records;
    }

    async function scrapeCurrentPage(category, fields, onDetailProgress) {
        let records;
        if (category === 'movie') records = parseMoviePage();
        else if (category === 'book') records = parseBookPage();
        else if (category === 'music') records = parseMusicPage();
        else records = parseGamePage();
        if (category === 'movie') records = await enrichMovieFromList(records, fields);
        records = await enrichDetails(records, category, fields, onDetailProgress);
        return records;
    }

    function getNextPage() {
        const next = document.querySelector('.paginator .next a[href]');
        return next && next.href && !next.href.startsWith('javascript:') ? next.href : '';
    }

    function getCurrentPageNumber(category) {
        const current = Number.parseInt(textOf(document.querySelector('.paginator .thispage')), 10);
        if (Number.isInteger(current) && current > 0) return current;
        const start = Number.parseInt(new URL(location.href).searchParams.get('start') || '0', 10);
        return Math.floor((Number.isFinite(start) ? start : 0) / CATEGORIES[category].pageSize) + 1;
    }

    function getTotalPageCount() {
        const pages = [...document.querySelectorAll('.paginator .thispage, .paginator a')]
            .map(element => Number.parseInt(textOf(element), 10))
            .filter(page => Number.isInteger(page) && page > 0);
        return pages.length ? Math.max(...pages) : 1;
    }

    function formatPageRange(pageRange) {
        return pageRange ? `第 ${pageRange.startPage}～${pageRange.endPage} 页` : '全部页（从第 1 页开始）';
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function getCategoryUrl(category, slug, section) {
        const link = section && section.querySelector('a[href*="status=collect"], a[href*="games?action=collect"]');
        if (link) return new URL(link.href, location.href).href;
        if (category === 'movie') return slug ? `https://movie.douban.com/people/${slug}/collect?mode=grid` : 'https://movie.douban.com/mine?status=collect&mode=grid';
        if (category === 'book') return slug ? `https://book.douban.com/people/${slug}/collect?mode=grid` : 'https://book.douban.com/mine?status=collect&mode=grid';
        if (category === 'music') return slug ? `https://music.douban.com/people/${slug}/collect?mode=grid` : 'https://music.douban.com/mine?status=collect&mode=grid';
        return slug ? `https://www.douban.com/people/${slug}/games?action=collect` : '';
    }

    function getCategoryStatusLabel(category) {
        const labels = STATUS_LABELS[category] || STATUS_LABELS.movie;
        return labels[getStatusFromUrl()] || labels.collect;
    }

    function getCategoryStatusUrl(category, slug, status) {
        if (category === 'game') {
            return slug
                ? `https://www.douban.com/people/${slug}/games?action=${status}`
                : '';
        }
        const host = category === 'book' ? 'book' : category === 'music' ? 'music' : 'movie';
        return slug
            ? `https://${host}.douban.com/people/${slug}/${status}?mode=grid`
            : `https://${host}.douban.com/mine?status=${status}&mode=grid`;
    }

    function getGameStatusBridgeUrl(status) {
        const bridge = new URL('https://www.douban.com/mine/');
        bridge.hash = new URLSearchParams({
            db_export: '1',
            db_export_category: 'game',
            db_export_status: status
        }).toString();
        return bridge.href;
    }

    function getPendingExportRequest() {
        if (!location.hash) return null;
        const hashValue = location.hash.slice(1).split('?')[0];
        const params = new URLSearchParams(hashValue);
        const category = params.get('db_export_category');
        const status = params.get('db_export_status');
        if (params.get('db_export') !== '1' || category !== 'game' || !STATUS_ORDER.includes(status)) return null;
        return { category, status };
    }

    function redirectPendingExport(context) {
        const pending = getPendingExportRequest();
        if (!pending || context !== 'profile') return false;
        const target = getCategoryStatusUrl(pending.category, getProfileSlug(), pending.status);
        if (!target) return false;
        window.location.replace(withAutoExport(target));
        return true;
    }

    function getCategoryStatusFilePart() {
        const parts = { collect: 'Collect', wish: 'Wish', do: 'Do' };
        return parts[getStatusFromUrl()] || 'Collect';
    }

    function withAutoExport(url) {
        if (!url) return '';
        const next = new URL(url, location.href);
        next.searchParams.set('db_export', '1');
        return next.href;
    }

    function getSummaryEntries(context) {
        const slug = getProfileSlug();
        const sections = [...document.querySelectorAll('.sort[id]')]
            .filter(section => Object.prototype.hasOwnProperty.call(CATEGORIES, section.id));
        if (context === 'profile' && sections.length) {
            return sections.map(section => {
                const category = section.id;
                const heading = section.querySelector('h2');
                const image = section.querySelector('img.climg');
                return {
                    category,
                    label: CATEGORIES[category].label,
                    icon: CATEGORIES[category].icon,
                    summary: textOf(heading).replace(/·/g, '').replace(/\s+/g, ' ').trim() || '打开收藏页查看全部',
                    cover: image ? image.src : '',
                    current: false,
                    url: withAutoExport(getCategoryUrl(category, slug, section))
                };
            });
        }
        return Object.keys(CATEGORIES).map(category => ({
            category,
            label: CATEGORIES[category].label,
            icon: CATEGORIES[category].icon,
            summary: category === context ? `当前页面：${document.title}` : '打开对应收藏页开始导出',
            cover: '',
            current: category === context,
            url: withAutoExport(getCategoryUrl(category, slug))
        }));
    }

    function showSummaryPanel(context) {
        if (document.getElementById('db-export-summary-overlay')) return;
        const entries = getSummaryEntries(context);
        const overlay = document.createElement('div');
        overlay.id = 'db-export-summary-overlay';
        overlay.innerHTML = `<div id="db-export-summary-panel" role="dialog" aria-label="书影音游戏数据汇总">
            <h3>📊 书影音游戏数据汇总</h3>
            <p class="db-summary-help">从这里选择分类。当前收藏页直接打开字段选择，其他分类会在新标签页打开并自动进入导出流程。个人主页的栏目顺序沿用豆瓣原生页面顺序。</p>
            <div class="db-summary-list">${entries.map(entry => `<div class="db-summary-card">
                ${entry.cover ? `<img class="db-summary-cover" src="${escapeHtml(entry.cover)}" alt="${escapeHtml(entry.label)}封面">` : '<div class="db-summary-cover"></div>'}
                <div class="db-summary-main"><div class="db-summary-title">${escapeHtml(entry.icon)} ${escapeHtml(entry.label)}</div><div class="db-summary-meta">${escapeHtml(entry.summary)}</div><button class="db-summary-action" data-current="${entry.current ? '1' : '0'}" data-category="${escapeHtml(entry.category)}" data-url="${escapeHtml(entry.url)}">${entry.current ? '导出当前分类' : '去导出'}</button></div>
            </div>`).join('')}</div>
            <div class="db-btn-group"><button class="db-btn db-btn-secondary" id="db-close-summary">关闭</button></div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.id === 'db-close-summary') { overlay.remove(); return; }
            const action = event.target.closest('.db-summary-action');
            if (!action) return;
            if (action.dataset.current === '1') { overlay.remove(); showConfigPanel(); return; }
            overlay.remove();
            showStatusChooser(action.dataset.category);
        });
    }

    function showStatusChooser(category) {
        if (document.getElementById('db-export-modal-overlay')) return;
        const slug = getProfileSlug();
        const labels = STATUS_LABELS[category];
        const overlay = document.createElement('div');
        overlay.id = 'db-export-modal-overlay';
        overlay.innerHTML = `<div id="db-export-modal">
            <h3>${CATEGORIES[category].icon} 选择要导出的${CATEGORIES[category].label}收藏</h3>
            <p class="db-note">请选择要导出的收藏状态，将在新标签页打开对应收藏页并自动进入导出流程。</p>
            <div class="db-download-actions">${STATUS_ORDER.map(status => `<button class="db-btn db-btn-primary" data-status="${status}" style="text-align:left">${labels[status]}</button>`).join('')}</div>
            <div class="db-btn-group"><button class="db-btn db-btn-secondary" id="db-status-cancel">取消</button></div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#db-status-cancel').onclick = () => overlay.remove();
        overlay.querySelectorAll('button[data-status]').forEach(button => {
            button.onclick = () => {
                overlay.remove();
                const target = getCategoryStatusUrl(category, slug, button.dataset.status);
                if (!target) {
                    if (category === 'game') {
                        window.open(getGameStatusBridgeUrl(button.dataset.status), '_blank', 'noopener');
                    } else {
                        alert('无法识别当前登录用户，请先打开个人主页后再导出。');
                    }
                    return;
                }
                window.open(withAutoExport(target), '_blank', 'noopener');
            };
        });
    }

    function renderSummaryButton(context) {
        if (document.getElementById('db-export-summary-btn')) return;
        addStyle(styleText);
        const button = document.createElement('button');
        button.id = 'db-export-summary-btn';
        button.type = 'button';
        const state = getState();
        button.textContent = state.status === 'running' && state.category === context ? '⏳ 抓取中 · 汇总' : '📊 书影音游戏汇总';
        button.title = '汇总并导航到具体分类导出';
        button.onclick = () => showSummaryPanel(context);
        document.body.appendChild(button);
    }

    function clearActiveExport() {
        localStorage.removeItem(storageKey(CONFIG.dataKey));
        setState({ status: 'idle' });
    }

    function getRestartUrl(category) {
        const target = new URL(getPageStartUrl(category, 1));
        target.searchParams.set('db_export', '1');
        return target.href;
    }

    function renderTaskControls(category) {
        const state = getState();
        if (state.status !== 'running' || state.category !== category) return;
        const progress = state.detailProgress;
        const progressText = progress
            ? `第 ${progress.pageNumber}/${progress.pageTotal} 页 · 详情 ${progress.completed}/${progress.total}${progress.cached ? `（缓存 ${progress.cached}）` : ''} · 约 ${progress.estimatedRemainingSeconds} 秒${progress.currentTitle ? ` · ${progress.currentTitle.slice(0, 20)}` : ''}`
            : '正在读取列表页…';
        const existing = document.getElementById('db-export-task-controls');
        if (existing) {
            existing.querySelector('.db-task-meta').textContent = `已暂存 ${getStoredData().length} 条；${progressText}`;
            return;
        }
        const control = document.createElement('aside');
        control.id = 'db-export-task-controls';
        control.innerHTML = `<div class="db-task-title">⏳ 正在导出${CATEGORIES[category].label}</div>
            <div class="db-task-meta">已暂存 ${getStoredData().length} 条；${progressText}</div>
            <div class="db-task-actions"><button id="db-task-export" type="button">停止并导出</button><button id="db-task-stop" type="button">终止并清理</button><button id="db-task-restart" type="button">重新开始</button></div>`;
        document.body.appendChild(control);
        control.querySelector('#db-task-export').onclick = () => {
            if (!window.confirm('停止后将导出目前已经完成的部分；当前正在读取的条目不会写入。')) return;
            const current = getState();
            setState({ ...current, status: 'paused_for_download', stoppedEarly: true, stoppedAt: new Date().toISOString() });
            control.remove();
            showDownloadPanel(category);
        };
        control.querySelector('#db-task-stop').onclick = () => {
            if (!window.confirm('终止本次导出并清除已暂存的数据？此操作不会影响豆瓣收藏。')) return;
            clearActiveExport();
            location.reload();
        };
        control.querySelector('#db-task-restart').onclick = () => {
            if (!window.confirm('重新开始会清除本次已暂存的数据，并回到字段选择。')) return;
            clearActiveExport();
            location.href = getRestartUrl(category);
        };
    }

    function getCoverAssetPath(item, index) {
        if (!item.cover_url) return '';
        const pathname = new URL(item.cover_url, location.href).pathname;
        const suffix = ((pathname.match(/\.(avif|webp|png|jpe?g|gif)$/i) || [])[1] || 'jpg').toLowerCase();
        const key = item.id || String(index + 1).padStart(4, '0');
        return `covers/${item.category || 'douban'}-${key}.${suffix}`;
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 KB';
        if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    function estimateCoverSize(count) {
        return `${formatBytes(count * 15 * 1024)}～${formatBytes(count * 80 * 1024)}`;
    }

    const CRC32_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n += 1) {
            let value = n;
            for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
            table[n] = value >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let value = 0xffffffff;
        for (let index = 0; index < bytes.length; index += 1) value = (value >>> 8) ^ CRC32_TABLE[(value ^ bytes[index]) & 0xff];
        return (value ^ 0xffffffff) >>> 0;
    }

    function utf8Bytes(value) {
        return new TextEncoder().encode(value);
    }

    function dosDateTime(date = new Date()) {
        const year = Math.max(1980, date.getFullYear());
        return {
            time: ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xffff,
            date: (((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff
        };
    }

    function createZipLocalHeader(name, bytes, crc, dateTime) {
        const header = new Uint8Array(30 + name.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0x0800, true); // UTF-8 file name
        view.setUint16(8, 0, true); // STORE
        view.setUint16(10, dateTime.time, true);
        view.setUint16(12, dateTime.date, true);
        view.setUint32(14, crc, true);
        view.setUint32(18, bytes.byteLength, true);
        view.setUint32(22, bytes.byteLength, true);
        view.setUint16(26, name.length, true);
        view.setUint16(28, 0, true);
        header.set(name, 30);
        return header;
    }

    function createZipCentralHeader(name, bytes, crc, dateTime, offset) {
        const header = new Uint8Array(46 + name.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(8, 0x0800, true); // UTF-8 file name
        view.setUint16(10, 0, true); // STORE
        view.setUint16(12, dateTime.time, true);
        view.setUint16(14, dateTime.date, true);
        view.setUint32(16, crc, true);
        view.setUint32(20, bytes.byteLength, true);
        view.setUint32(24, bytes.byteLength, true);
        view.setUint16(28, name.length, true);
        view.setUint16(30, 0, true);
        view.setUint16(32, 0, true);
        view.setUint16(34, 0, true);
        view.setUint16(36, 0, true);
        view.setUint32(38, 0, true);
        view.setUint32(42, offset, true);
        header.set(name, 46);
        return header;
    }

    function createZipEndRecord(fileCount, centralSize, centralOffset) {
        const end = new Uint8Array(22);
        const view = new DataView(end.buffer);
        view.setUint32(0, 0x06054b50, true);
        view.setUint16(8, fileCount, true);
        view.setUint16(10, fileCount, true);
        view.setUint32(12, centralSize, true);
        view.setUint32(16, centralOffset, true);
        return end;
    }

    async function createStoredZipBlob(entries, manifestText, statusEl, progressBar, onProgress) {
        const files = entries.filter(Boolean).map(entry => ({ ...entry, name: entry.path, nameBytes: utf8Bytes(entry.path) }));
        const manifestBytes = utf8Bytes(manifestText);
        files.push({ path: 'cover-manifest.json', bytes: manifestBytes, name: 'cover-manifest.json', nameBytes: utf8Bytes('cover-manifest.json'), crc: crc32(manifestBytes) });
        if (files.length > 0xffff) throw new Error('ZIP 文件数超过传统 ZIP 格式限制');
        let offset = 0;
        let centralSize = 0;
        const parts = [];
        const centralParts = [];
        const dateTime = dosDateTime();
        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            const local = createZipLocalHeader(file.nameBytes, file.bytes, file.crc, dateTime);
            const central = createZipCentralHeader(file.nameBytes, file.bytes, file.crc, dateTime, offset);
            parts.push(local, file.bytes);
            centralParts.push(central);
            offset += local.byteLength + file.bytes.byteLength;
            centralSize += central.byteLength;
            if (offset > 0xffffffff) throw new Error('ZIP 文件超过 4 GB 限制');
            const percent = Math.round(((index + 1) / files.length) * 100);
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (statusEl && statusEl.firstChild) statusEl.firstChild.textContent = `正在生成 ZIP：${percent}%，已写入 ${index + 1}/${files.length} 个文件（图片无需重新压缩）`;
            if (onProgress) onProgress(percent);
            if (index % 8 === 7) await new Promise(resolve => setTimeout(resolve, 0));
        }
        const centralOffset = offset;
        parts.push(...centralParts, createZipEndRecord(files.length, centralSize, centralOffset));
        return new Blob(parts, { type: 'application/zip' });
    }

    function requestCoverBytes(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('当前脚本管理器不支持 GM_xmlhttpRequest'));
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                // 直接拿 ArrayBuffer，避免 Tampermonkey 沙箱 Blob 交给 ZIP 写入器时卡在 FileReader。
                responseType: 'arraybuffer',
                anonymous: false,
                headers: {
                    Referer: location.href,
                    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
                },
                onload: async response => {
                    if (response.status < 200 || response.status >= 300 || !response.response) {
                        reject(new Error(`HTTP ${response.status}`));
                        return;
                    }
                    try {
                        let body = response.response;
                        // 兼容少数脚本管理器忽略 responseType 的情况。
                        if (body && typeof body.arrayBuffer === 'function') body = await body.arrayBuffer();
                        let bytes = null;
                        if (body instanceof Uint8Array) bytes = body;
                        else if (ArrayBuffer.isView(body)) bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
                        else if (body instanceof ArrayBuffer || (body && typeof body.byteLength === 'number')) bytes = new Uint8Array(body);
                        if (!bytes || !bytes.byteLength) throw new Error('图片响应不是有效的二进制数据');
                        resolve(bytes);
                    } catch (error) {
                        reject(new Error(`图片二进制转换失败：${error.message || error}`));
                    }
                },
                onerror: () => reject(new Error('网络请求失败')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    async function downloadCoversZip(category, statusEl, button) {
        const records = getStoredData()
            .map((item, dataIndex) => ({ item, dataIndex }))
            .filter(entry => entry.item.cover_url);
        if (!records.length) { alert('没有可下载的封面资源'); return; }
        if (records.length > 200 && !confirm(`将下载 ${records.length} 张封面，粗略占用 ${estimateCoverSize(records.length)}，生成 ZIP 时还会占用额外浏览器内存。是否继续？`)) return;
        if (button) { button.disabled = true; button.textContent = '正在下载封面…'; }
        const fileEntries = [];
        let nextIndex = 0;
        let completed = 0;
        let totalBytes = 0;
        const manifest = records.map(({ item, dataIndex }) => ({
            record_key: `${category}:${item.id || dataIndex + 1}`,
            category,
            douban_id: item.id,
            title: item.title,
            douban_url: item.link,
            rating: item.rating === '' ? null : item.rating,
            mark_date: item.date,
            status: item.status,
            cover_file: getCoverAssetPath(item, dataIndex),
            downloaded: false,
            bytes: 0
        }));
        const worker = async () => {
            while (true) {
                const index = nextIndex;
                nextIndex += 1;
                if (index >= records.length) return;
                const { item, dataIndex } = records[index];
                try {
                    const bytes = await requestCoverBytes(item.cover_url);
                    totalBytes += bytes.byteLength;
                    fileEntries[index] = { path: getCoverAssetPath(item, dataIndex), bytes, crc: crc32(bytes) };
                    manifest[index].downloaded = true;
                    manifest[index].bytes = bytes.byteLength;
                } catch (error) {
                    manifest[index].error = String(error.message || error);
                }
                completed += 1;
                if (statusEl) statusEl.textContent = `正在下载封面：${completed}/${records.length}，已获取 ${formatBytes(totalBytes)}`;
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONFIG.coverConcurrency, records.length) }, worker));
        const failures = manifest.filter(item => !item.downloaded);
        if (statusEl) statusEl.textContent = `封面下载完成：成功 ${records.length - failures.length}，失败 ${failures.length}；正在准备资源包中的 JSON、Excel 和 CSV…`;
        const packageEntries = buildDataPackageEntries(category);
        fileEntries.push(...packageEntries);
        const exportState = getState();
        const manifestText = JSON.stringify({
            category,
            total: records.length,
            downloaded: records.length - failures.length,
            failed: failures.length,
            source_bytes: totalBytes,
            page_range: exportState.pageRange || null,
            page_range_label: formatPageRange(exportState.pageRange),
            package_files: packageEntries.map(entry => entry.path),
            items: manifest,
            failures
        }, null, 2);
        if (statusEl) statusEl.innerHTML = `封面下载完成：成功 ${records.length - failures.length}，失败 ${failures.length}，图片共 ${formatBytes(totalBytes)}；正在生成 ZIP（无需重新压缩图片）…<div class="db-progress-track"><div class="db-progress-bar"></div></div>`;
        const progressBar = statusEl && statusEl.querySelector('.db-progress-bar');
        const generationStartedAt = Date.now();
        let lastPercent = 0;
        const progressTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - generationStartedAt) / 1000);
            if (statusEl && statusEl.firstChild) statusEl.firstChild.textContent = `正在生成 ZIP：${Math.round(lastPercent)}%，已用时 ${elapsed} 秒（图片无需重新压缩，请保持页面打开）`;
        }, 1000);
        let blob;
        try {
            blob = await createStoredZipBlob(fileEntries, manifestText, statusEl, progressBar, percent => { lastPercent = percent; });
        } finally {
            clearInterval(progressTimer);
        }
        const statusPart = getCategoryStatusFilePart();
        triggerDownload(blob, `Douban_${CATEGORIES[category].file}${statusPart ? `_${statusPart}` : ''}_Covers_${new Date().toISOString().slice(0, 10)}.zip`);
        if (statusEl) statusEl.textContent = `封面 ZIP 已生成：${formatBytes(blob.size)}；成功 ${records.length - failures.length}，失败 ${failures.length}`;
        if (button) { button.disabled = false; button.textContent = '🖼️ 重新下载封面 ZIP'; }
    }

    function renderFloatingButton(category) {
        renderSummaryButton(category);
    }

    function showConfigPanel() {
        if (document.getElementById('db-export-modal-overlay')) return;
        const category = detectContext();
        if (!CATEGORIES[category]) return;
        const selected = getSelectedFields(category);
        const availableFields = getAvailableFields(category);
        const detailFieldHint = category === 'movie'
            ? '勾选 IMDb 时才会逐条读取电影详情页。'
            : category === 'book'
                ? '勾选 ISBN 时才会逐条读取图书详情页。'
                : '当前分类的字段均来自列表页。';
        const cachedDetailCount = Object.keys(getDetailCache()).filter(key => key.startsWith(`${category}:`)).length;
        // 封面下载会额外占用网络、内存和磁盘，因此每次新任务都要求用户主动选择。
        const includeCovers = false;
        const totalPages = getTotalPageCount();
        const overlay = document.createElement('div');
        overlay.id = 'db-export-modal-overlay';
        overlay.innerHTML = `<div id="db-export-modal">
            <h3>${CATEGORIES[category].icon} 导出${CATEGORIES[category].label}（${getCategoryStatusLabel(category)}）</h3>
            <p class="db-note">选择需要的字段。不勾选详情字段时只读取列表页，速度更快；${detailFieldHint} JSON、Excel 和 CSV 都是原始导出，不包含任何目标平台转换。</p>
            <div class="db-checkbox-group" id="db-custom-fields">${availableFields.map(field => `<label class="db-checkbox-label"><input class="db-field-checkbox" type="checkbox" value="${field.key}" ${selected.includes(field.key) ? 'checked' : ''}>${field.name}${field.requiresDetail ? '（读取详情页）' : ''}</label>`).join('')}</div>
            <label class="db-checkbox-label" style="padding:10px;border:1px solid #e8e8e8;border-radius:7px"><input id="db-include-covers" type="checkbox" ${includeCovers ? 'checked' : ''}><span><b>同时导出海报/封面资源</b><br><small style="color:#888">完成后下载独立 ZIP；会增加网络流量、浏览器内存与磁盘占用</small></span></label>
            <label class="db-checkbox-label" style="margin-top:12px"><input id="db-limit-pages" type="checkbox"><span><b>仅导出指定页码范围</b><br><small style="color:#888">默认不勾选，将从第 1 页导出到最后一页</small></span></label>
            <div class="db-page-range" id="db-page-range" hidden><label>从第 <input id="db-start-page" type="number" min="1" max="${totalPages}" value="1"> 页</label><span>至</span><label>第 <input id="db-end-page" type="number" min="1" max="${totalPages}" value="${totalPages}"> 页</label></div>
            <p class="db-note">当前共识别到 ${totalPages} 页，每页最多 ${CATEGORIES[category].pageSize} 条。无论从哪一页打开导出，未限制范围时都会先返回第 1 页。</p>
            <p class="db-note">详情缓存：当前分类已缓存 ${cachedDetailCount} 条。<button class="db-btn db-btn-secondary" id="db-clear-detail-cache" type="button" style="padding:4px 8px;margin-left:6px">清空详情缓存</button></p>
            <div class="db-btn-group"><button class="db-btn db-btn-secondary" id="db-cancel-btn">取消</button><button class="db-btn db-btn-primary" id="db-start-btn">开始抓取</button></div>
        </div>`;
        document.body.appendChild(overlay);
        const rangeToggle = overlay.querySelector('#db-limit-pages');
        const rangeFields = overlay.querySelector('#db-page-range');
        rangeToggle.onchange = () => { rangeFields.hidden = !rangeToggle.checked; };
        overlay.querySelector('#db-clear-detail-cache').onclick = () => {
            if (!window.confirm(`清空当前站点已缓存的 ${cachedDetailCount} 条详情？下次勾选 IMDb 或 ISBN 时将重新读取详情页。`)) return;
            localStorage.removeItem(storageKey(CONFIG.detailCacheKey));
            overlay.remove();
            showConfigPanel();
        };
        overlay.querySelector('#db-cancel-btn').onclick = () => overlay.remove();
        overlay.querySelector('#db-start-btn').onclick = () => {
            const fields = [...overlay.querySelectorAll('.db-field-checkbox:checked')].map(input => input.value);
            const exportCovers = overlay.querySelector('#db-include-covers').checked;
            if (!fields.length && !exportCovers) { alert('请至少选择一个数据字段或封面资源！'); return; }
            let pageRange = null;
            if (rangeToggle.checked) {
                const startPage = Number.parseInt(overlay.querySelector('#db-start-page').value, 10);
                const endPage = Number.parseInt(overlay.querySelector('#db-end-page').value, 10);
                if (!Number.isInteger(startPage) || !Number.isInteger(endPage) || startPage < 1 || endPage < startPage || endPage > totalPages) {
                    alert(`请输入 1～${totalPages} 之间的有效页码，且结束页不能小于起始页。`);
                    return;
                }
                pageRange = { startPage, endPage };
            }
            localStorage.setItem(storageKey(CONFIG.fieldsKey), JSON.stringify(fields));
            overlay.remove();
            startScraping(category, fields, exportCovers, pageRange);
        };
    }

    function makeMissingDetailRows(data, field) {
        return data.filter(item => !item.detail?.[field]).map(item => ({
            title: item.title,
            douban_id: item.id,
            douban_url: item.link,
            mark_date: item.date,
            status: item.status,
            detail_fetch_status: item.detail?.detail_fetch_status || 'not_fetched',
            detail_fetch_error: item.detail?.detail_fetch_error || ''
        }));
    }

    function getMissingDetailReport(category) {
        const detailField = category === 'movie' ? 'imdb_id' : category === 'book' ? 'isbn' : '';
        if (!detailField || !getSelectedFields(category).includes(detailField)) return null;
        return {
            field: detailField,
            label: detailField === 'imdb_id' ? 'IMDb' : 'ISBN',
            rows: makeMissingDetailRows(getStoredData(), detailField)
        };
    }

    function buildMissingReportCsvBytes(report) {
        const fields = ['title', 'douban_id', 'douban_url', 'mark_date', 'status', 'detail_fetch_status', 'detail_fetch_error'];
        const headers = ['标题', '豆瓣条目 ID', '豆瓣链接', '标记日期', '收藏状态', '详情抓取状态', '详情抓取错误'];
        const lines = [headers.map(csvCell).join(',')];
        report.rows.forEach(row => lines.push(fields.map(field => csvCell(row[field])).join(',')));
        return utf8Bytes(`\uFEFF${lines.join('\r\n')}`);
    }

    function generateMissingDetailReport(category) {
        const report = getMissingDetailReport(category);
        if (!report || !report.rows.length) return;
        const name = `${getExportBaseName(category)}_Missing_${report.label}`;
        triggerDownload(new Blob([buildMissingReportCsvBytes(report)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
    }

    function showDownloadPanel(category) {
        if (document.getElementById('db-export-modal-overlay')) return;
        const data = getStoredData();
        const state = getState();
        const includeCovers = Boolean(state.includeCovers);
        const missingReport = getMissingDetailReport(category);
        const isPartial = Boolean(state.stoppedEarly);
        const coverCount = data.filter(item => item.cover_url).length;
        const coverAction = includeCovers && coverCount > 0 ? `<button class="db-btn db-btn-primary" style="background:#7b61ff" id="db-dl-covers">📦 下载完整资源包 ZIP（封面 + JSON + Excel + CSV）</button>` : '';
        const coverNote = !includeCovers
            ? '本次未选择封面资源，不会产生额外图片请求或占用。'
            : coverCount > 0
                ? `识别到 ${coverCount} 张封面，粗略占用 ${estimateCoverSize(coverCount)}。下面按钮可单独下载数据文件；完整资源包 ZIP 还会包含封面图片、JSON、Excel、CSV 和 cover-manifest.json。`
                : '本次选择了封面资源，但页面中没有识别到可下载图片，因此不会产生封面 ZIP；数据文件中的封面路径为空。';
        const overlay = document.createElement('div');
        overlay.id = 'db-export-modal-overlay';
        overlay.innerHTML = `<div id="db-export-modal">
            <h3>${isPartial ? '⏹️ 已停止导出' : '✅ 抓取完成'}</h3><p style="font-size:16px;text-align:center">${isPartial ? '已保留' : '共收集到'} <b>${data.length}</b> 条${CATEGORIES[category].label}数据（${formatPageRange(state.pageRange)}）</p>
            <p class="db-note">${coverNote}</p>
            <div class="db-download-section"><div class="db-download-title">单独导出数据文件</div><div class="db-download-actions"><button class="db-btn db-btn-primary" id="db-dl-json">🤖 单独导出 JSON（权威备份）</button><button class="db-btn db-btn-primary" id="db-dl-xlsx">📊 单独导出 Excel (.xlsx)</button><button class="db-btn db-btn-primary" style="background:#2c3e50" id="db-dl-csv">🧾 单独导出 CSV</button></div></div>
            ${missingReport && missingReport.rows.length ? `<div class="db-download-section"><div class="db-download-title">未取得 ${missingReport.label} 的条目</div><p class="db-note">共 ${missingReport.rows.length} 条，包含空缺和详情抓取失败的条目，方便日后重试。</p><div class="db-download-actions"><button class="db-btn db-btn-secondary" id="db-dl-missing">下载缺失 ${missingReport.label} 报告 (.csv)</button></div></div>` : ''}
            ${includeCovers && coverCount > 0 ? `<div class="db-download-section"><div class="db-download-title">完整资源包</div><div class="db-download-actions">${coverAction}</div><p class="db-note">ZIP 内含 covers/、data/*.json、data/*.xlsx、data/*.csv 和 cover-manifest.json。</p></div>` : ''}
            <div class="db-btn-group"><button class="db-btn db-btn-secondary" id="db-close-finish">关闭并清理</button></div><p class="db-note" id="db-cover-status" aria-live="polite"></p>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#db-dl-xlsx').onclick = () => generateFile(category, 'xlsx');
        overlay.querySelector('#db-dl-json').onclick = () => generateFile(category, 'json');
        overlay.querySelector('#db-dl-csv').onclick = () => generateFile(category, 'csv');
        const missingButton = overlay.querySelector('#db-dl-missing');
        if (missingButton) missingButton.onclick = () => generateMissingDetailReport(category);
        const coverButton = overlay.querySelector('#db-dl-covers');
        if (coverButton) coverButton.onclick = () => downloadCoversZip(category, overlay.querySelector('#db-cover-status'), coverButton).catch(error => {
            const status = overlay.querySelector('#db-cover-status');
            if (status) status.textContent = `封面 ZIP 生成失败：${error.message || error}`;
            coverButton.disabled = false;
            coverButton.textContent = '🖼️ 重试下载封面 ZIP';
        });
        overlay.querySelector('#db-close-finish').onclick = () => {
            localStorage.removeItem(storageKey(CONFIG.dataKey));
            setState({ status: 'idle' });
            location.reload();
        };
    }

    function showCaptchaPanel(category, captchaUrl, autoOpen = false) {
        if (document.getElementById('db-export-modal-overlay')) return;
        const state = getState();
        const verifyUrl = captchaUrl || state.captchaUrl || location.href;
        const overlay = document.createElement('div');
        overlay.id = 'db-export-modal-overlay';
        overlay.innerHTML = `<div id="db-export-modal">
            <h3>🛡️ 豆瓣要求安全验证</h3>
            <p class="db-note">详情抓取已暂停，尚未抓到详情的数据不会被猜测或写入。请在验证页完成滑块或图形验证，再回到此页面继续；已完成的详情会使用本地缓存，不会重复请求。</p>
            <p class="db-note">若浏览器拦截了自动弹窗，请点击“打开验证页”。</p>
            <div class="db-btn-group"><a class="db-btn db-btn-secondary" id="db-open-captcha" target="_blank" rel="noopener">打开验证页</a><button class="db-btn db-btn-primary" id="db-resume-captcha">我已完成验证，继续导出</button></div>
        </div>`;
        document.body.appendChild(overlay);
        const verifyLink = overlay.querySelector('#db-open-captcha');
        verifyLink.href = verifyUrl;
        if (autoOpen) window.open(verifyUrl, '_blank', 'noopener');
        overlay.querySelector('#db-resume-captcha').onclick = () => {
            const current = getState();
            setState({
                ...current,
                status: 'running',
                captchaUrl: '',
                resumedAt: new Date().toISOString()
            });
            overlay.remove();
            processPage(category, getSelectedFields());
        };
    }

    function setGridMode(category, url) {
        if (!['movie', 'book', 'music'].includes(category)) return url;
        const next = new URL(url);
        next.searchParams.set('mode', 'grid');
        return next.href;
    }

    function getPageStartUrl(category, pageNumber) {
        const target = new URL(setGridMode(category, location.href));
        target.searchParams.set('start', String(Math.max(0, (pageNumber - 1) * CATEGORIES[category].pageSize)));
        target.searchParams.delete('db_export');
        return target.href;
    }

    function startScraping(category, fields, includeCovers, pageRange) {
        const current = new URL(location.href);
        const target = getPageStartUrl(category, pageRange ? pageRange.startPage : 1);
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setState({ status: 'running', runId, category, sourceUrl: current.href, includeCovers: Boolean(includeCovers), pageRange: pageRange || null, detailProgress: null, startedAt: new Date().toISOString() });
        setStoredData([]);
        if (target !== current.href) {
            location.href = target;
            return;
        }
        renderTaskControls(category);
        processPage(category, fields);
    }

    async function processPage(category, fields) {
        const state = getState();
        if (state.status !== 'running') return;
        const runId = state.runId;
        const delay = Math.floor(Math.random() * (CONFIG.maxDelay - CONFIG.minDelay) + CONFIG.minDelay);
        setTimeout(async () => {
            const activeState = getState();
            if (activeState.status !== 'running' || activeState.category !== category || activeState.runId !== runId) return;
            try {
                const pageNumber = getCurrentPageNumber(category);
                const pageData = await scrapeCurrentPage(category, fields, progress => {
                    const current = getState();
                    if (current.status !== 'running' || current.runId !== runId) return;
                    setState({ ...current, detailProgress: { ...progress, pageNumber, pageTotal: getTotalPageCount() } });
                    renderTaskControls(category);
                });
                const finalState = getState();
                if (finalState.status !== 'running' || finalState.category !== category || finalState.runId !== runId) return;
                if (!finalState.includeCovers) pageData.forEach(item => { item.cover_url = ''; });
                const merged = new Map(getStoredData().map(item => [item.link || item.id, item]));
                pageData.forEach(item => merged.set(item.link || item.id, item));
                setStoredData([...merged.values()]);
                const currentPage = getCurrentPageNumber(category);
                const reachedRangeEnd = finalState.pageRange && currentPage >= finalState.pageRange.endPage;
                const next = reachedRangeEnd ? '' : getNextPage();
                if (next) location.href = next;
                else {
                    setState({ status: 'paused_for_download', category, runId, sourceUrl: finalState.sourceUrl || '', includeCovers: Boolean(finalState.includeCovers), pageRange: finalState.pageRange || null, detailProgress: finalState.detailProgress || null, startedAt: finalState.startedAt, finishedAt: new Date().toISOString() });
                    showDownloadPanel(category);
                }
            } catch (error) {
                console.error('[Douban Export] 页面解析失败:', error);
                if (getState().status !== 'running' || getState().runId !== runId) return;
                if (error.code === 'DOUBAN_CAPTCHA_REQUIRED') {
                    setState({
                        status: 'paused_for_captcha',
                        category,
                        runId,
                        sourceUrl: activeState.sourceUrl || '',
                        includeCovers: Boolean(activeState.includeCovers),
                        pageRange: activeState.pageRange || null,
                        startedAt: activeState.startedAt,
                        captchaUrl: error.captchaUrl || location.href,
                        captchaDetectedAt: new Date().toISOString()
                    });
                    showCaptchaPanel(category, error.captchaUrl, true);
                    return;
                }
                setState({ status: 'error', category, runId, sourceUrl: activeState.sourceUrl || '', includeCovers: Boolean(activeState.includeCovers), pageRange: activeState.pageRange || null, message: String(error) });
                alert('本页解析失败，请打开控制台查看错误后重试。');
            }
        }, delay);
    }

    function selectedExportItem(item, fields, index, includeCovers) {
        const result = {};
        if (fields.includes('title')) result.title = item.title;
        if (fields.includes('id')) result.douban_id = item.id;
        if (fields.includes('rating')) result.user_rating = item.rating === '' ? null : item.rating;
        if (fields.includes('date')) result.mark_date = item.date;
        if (fields.includes('status')) result.status = item.status;
        if (fields.includes('tags')) result.tags = item.tags ? item.tags.split(/\s+/).filter(Boolean) : [];
        if (fields.includes('comment')) result.comment = item.comment;
        if (fields.includes('intro')) result.intro = item.intro;
        if (fields.includes('link')) result.douban_url = item.link;
        if (fields.includes('imdb_id')) result.imdb_id = item.detail?.imdb_id || '';
        if (fields.includes('isbn')) result.isbn = item.detail?.isbn || '';
        if (includeCovers && item.cover_url) result.cover_file = getCoverAssetPath(item, index);
        return result;
    }

    function exportItemKey(field) {
        return {
            id: 'douban_id',
            rating: 'user_rating',
            date: 'mark_date',
            link: 'douban_url'
        }[field] || field;
    }

    function getExportBaseName(category) {
        const statusPart = getCategoryStatusFilePart();
        return `Douban_${CATEGORIES[category].file}${statusPart ? `_${statusPart}` : ''}_Export_${new Date().toISOString().slice(0, 10)}`;
    }

    function buildJsonOutput(category) {
        const data = getStoredData();
        const fields = getSelectedFields(category);
        const state = getState();
        const includeCovers = Boolean(state.includeCovers);
        return {
            meta: {
                schema_name: 'douban-custom-export',
                schema_version: 1,
                export_template: 'custom',
                category,
                category_name: `${CATEGORIES[category].label}（${getCategoryStatusLabel(category)}）`,
                export_date: new Date().toISOString(),
                total_count: data.length,
                page_range: state.pageRange || null,
                page_range_label: formatPageRange(state.pageRange),
                source: 'Douban Marginalia (adapted from byJming/douban-movie-exporter)',
                source_url: state.sourceUrl || location.href,
                rating_scale: 5,
                detail_fields: fields.filter(field => getAvailableFields(category).find(item => item.key === field)?.requiresDetail),
                cover_note: includeCovers ? 'cover_file 指向完整资源包 ZIP 中 covers/ 下的本地文件' : '本次未下载封面文件'
            },
            items: data.map((item, index) => selectedExportItem(item, fields, index, includeCovers))
        };
    }

    function buildWorkbook(category) {
        if (typeof XLSX === 'undefined') throw new Error('Excel 组件加载失败，请刷新页面后重试。');
        const data = getStoredData();
        const fields = getSelectedFields(category);
        const state = getState();
        const includeCovers = Boolean(state.includeCovers);
        const headers = {
            title: '标题', id: '豆瓣条目 ID', rating: '个人评分', date: '标记日期', status: '收藏状态', tags: '标签',
            comment: '短评/备注（已清洗）', intro: '简介/出版信息', cover_file: '封面文件', link: '豆瓣链接',
            imdb_id: 'IMDb', isbn: 'ISBN',
            category: '分类', douban_id: '豆瓣条目 ID', user_rating: '个人评分', rating_scale: '评分满分',
            mark_date: '标记日期', douban_url: '豆瓣链接', cover_url: '封面原始地址',
            detail_fetch_status: '详情抓取状态', detail_fetch_error: '详情抓取错误', detail_fetched_at: '详情抓取时间'
        };
        const exportFields = includeCovers ? [...fields, 'cover_file'] : fields;
        const sheet = [exportFields.map(field => headers[field] || field)];
        data.forEach((item, index) => {
            const exportItem = selectedExportItem(item, fields, index, includeCovers);
            sheet.push(exportFields.map(field => {
                const value = exportItem[exportItemKey(field)];
                return Array.isArray(value) ? value.join(' / ') : (value ?? '');
            }));
        });
        const ws = XLSX.utils.aoa_to_sheet(sheet);
        ws['!cols'] = exportFields.map(field => ({ wch: field === 'title' ? 42 : field === 'comment' || field === 'comment_raw' || field === 'intro' ? 52 : field === 'link' ? 64 : field === 'cover_file' ? 36 : 16 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `${CATEGORIES[category].sheet}（${getCategoryStatusLabel(category)}）`);
        return wb;
    }

    function csvCell(value) {
        if (value === null || value === undefined) return '';
        const text = String(value);
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function buildCsvBytes(category) {
        const items = buildJsonOutput(category).items.map(item => ({
            ...item,
            tags: Array.isArray(item.tags) ? item.tags.join(' / ') : item.tags
        }));
        const fields = [...new Set(items.flatMap(item => Object.keys(item)))];
        const lines = [fields.map(csvCell).join(',')];
        items.forEach(item => lines.push(fields.map(field => csvCell(item[field])).join(',')));
        return utf8Bytes(`\uFEFF${lines.join('\r\n')}`);
    }

    function buildXlsxBytes(category) {
        const output = XLSX.write(buildWorkbook(category), { bookType: 'xlsx', type: 'array' });
        return output instanceof Uint8Array ? output : new Uint8Array(output);
    }

    function buildDataPackageEntries(category) {
        const baseName = getExportBaseName(category);
        const jsonBytes = utf8Bytes(JSON.stringify(buildJsonOutput(category), null, 2));
        const xlsxBytes = buildXlsxBytes(category);
        const csvBytes = buildCsvBytes(category);
        return [
            { path: `data/${baseName}.json`, bytes: jsonBytes, crc: crc32(jsonBytes) },
            { path: `data/${baseName}.xlsx`, bytes: xlsxBytes, crc: crc32(xlsxBytes) },
            { path: `data/${baseName}.csv`, bytes: csvBytes, crc: crc32(csvBytes) }
        ];
    }

    function generateFile(category, format) {
        const data = getStoredData();
        if (!data.length) { alert('无数据'); return; }
        const name = getExportBaseName(category);
        try {
            if (format === 'json') {
                const bytes = utf8Bytes(JSON.stringify(buildJsonOutput(category), null, 2));
                triggerDownload(new Blob([bytes], { type: 'application/json;charset=utf-8' }), `${name}.json`);
                return;
            }
            if (format === 'csv') {
                triggerDownload(new Blob([buildCsvBytes(category)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
                return;
            }
            const bytes = buildXlsxBytes(category);
            triggerDownload(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`);
        } catch (error) {
            alert(error.message || error);
        }
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function init() {
        const context = detectContext();
        if (!context) return;
        if (context === 'profile') {
            if (redirectPendingExport(context)) return;
            renderSummaryButton(context);
            return;
        }
        renderFloatingButton(context);
        const state = getState();
        if (state.status === 'paused_for_download' && state.category === context) {
            showDownloadPanel(context);
        } else if (state.status === 'paused_for_captcha' && state.category === context) {
            showCaptchaPanel(context, state.captchaUrl);
        } else if (state.status === 'running' && state.category === context) {
            renderTaskControls(context);
            setTimeout(() => processPage(context, getSelectedFields()), 800);
        } else if (context !== 'generic' && new URL(location.href).searchParams.get('db_export') === '1') {
            setTimeout(showConfigPanel, 500);
        }
    }

    init();
})();
