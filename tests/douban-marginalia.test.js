const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'douban-marginalia.user.js');
let source = fs.readFileSync(scriptPath, 'utf8');
source = source.replace(
    /\n\s*init\(\);\s*\n\}\)\(\);\s*$/,
    `\n    globalThis.__backupTest = { cleanComment, isVerificationResponse, csvCell, getAvailableFields, makeMissingDetailRows, selectedExportItem, exportItemKey };\n})();`
);

const context = {
    console,
    Blob,
    TextEncoder,
    URL,
    setTimeout,
    clearTimeout,
    globalThis: null
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: scriptPath });

const api = context.__backupTest;

test('自定义导出保留豆瓣原始评分，不做目标平台换算', () => {
    const result = api.selectedExportItem({
        title: '肖申克的救赎', id: '1292052', rating: 5, date: '2026-09-07', status: 'collect',
        tags: '', comment: '', intro: '', link: '', cover_url: '', detail: {}
    }, ['title', 'rating'], 0, false);

    assert.deepEqual({ ...result }, { title: '肖申克的救赎', user_rating: 5 });
    assert.equal('rating10' in result, false);
});

test('CSV 正确转义逗号、引号和换行', () => {
    assert.equal(api.csvCell('普通文本'), '普通文本');
    assert.equal(api.csvCell('a,b'), '"a,b"');
    assert.equal(api.csvCell('他说"好"'), '"他说""好"""');
    assert.equal(api.csvCell('第一行\n第二行'), '"第一行\n第二行"');
});

test('短评同时保留原文所依据的有效内容，并仅清除末尾有用数', () => {
    assert.equal(api.cleanComment('很喜欢（12 有用）'), '很喜欢');
    assert.equal(api.cleanComment('很喜欢 ( 12 有用 )'), '很喜欢');
    assert.equal(api.cleanComment('“有用”的部分在正文中'), '“有用”的部分在正文中');
});

test('安全验证、403 与 429 响应会触发暂停', () => {
    assert.equal(api.isVerificationResponse({ status: 403, url: 'https://movie.douban.com/subject/1/' }, ''), true);
    assert.equal(api.isVerificationResponse({ status: 200, url: 'https://sec.douban.com/' }, ''), true);
    assert.equal(api.isVerificationResponse({ status: 200, url: 'https://movie.douban.com/subject/1/' }, '请完成滑动验证'), true);
    assert.equal(api.isVerificationResponse({ status: 200, url: 'https://movie.douban.com/subject/1/' }, '<html>normal</html>'), false);
});

test('自定义字段按分类提供按需详情 ID', () => {
    assert.ok(Array.from(api.getAvailableFields('movie')).some(field => field.key === 'imdb_id' && field.name === 'IMDb'));
    assert.ok(Array.from(api.getAvailableFields('book')).some(field => field.key === 'isbn'));
    assert.equal(Array.from(api.getAvailableFields('music')).some(field => field.key === 'imdb_id' || field.key === 'isbn'), false);
});

test('自定义导出只写入勾选的 IMDb 或 ISBN', () => {
    const movie = api.selectedExportItem({
        title: 'Movie', id: '1', rating: '', date: '', status: 'collect', tags: '', comment: '', intro: '', link: '', cover_url: '',
        detail: { imdb_id: 'tt0111161' }
    }, ['title', 'imdb_id'], 0, false);
    const book = api.selectedExportItem({
        title: 'Book', id: '2', rating: '', date: '', status: 'collect', tags: '', comment: '', intro: '', link: '', cover_url: '',
        detail: { isbn: '9787532731087' }
    }, ['title', 'isbn'], 0, false);
    assert.deepEqual({ ...movie }, { title: 'Movie', imdb_id: 'tt0111161' });
    assert.deepEqual({ ...book }, { title: 'Book', isbn: '9787532731087' });
});

test('Excel 字段映射读取详情中的 IMDb，而不是列表页原始对象', () => {
    const item = {
        title: 'Movie', id: '1', rating: '', date: '', status: 'collect', tags: '', comment: '', intro: '', link: '', cover_url: '',
        detail: { imdb_id: 'tt0111161' }
    };
    const exported = api.selectedExportItem(item, ['title', 'imdb_id'], 0, false);
    assert.equal(exported[api.exportItemKey('imdb_id')], 'tt0111161');
    assert.equal(api.exportItemKey('id'), 'douban_id');
});

test('缺失详情报告只收集空缺或抓取失败的条目', () => {
    const rows = api.makeMissingDetailRows([
        { title: '已取得', id: '1', link: 'https://example.test/1', date: '2026-09-08', status: 'collect', detail: { imdb_id: 'tt0000001', detail_fetch_status: 'ok' } },
        { title: '豆瓣无 IMDb', id: '2', link: 'https://example.test/2', date: '2026-09-07', status: 'collect', detail: { imdb_id: '', detail_fetch_status: 'ok' } },
        { title: '请求失败', id: '3', link: 'https://example.test/3', date: '2026-09-06', status: 'collect', detail: { detail_fetch_status: 'failed', detail_fetch_error: 'HTTP 500' } }
    ], 'imdb_id');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].title, '豆瓣无 IMDb');
    assert.equal(rows[1].detail_fetch_error, 'HTTP 500');
});
