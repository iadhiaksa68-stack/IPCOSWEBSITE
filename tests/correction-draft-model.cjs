const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeEntry, normalizeEnvelope, fingerprint} = require('../correction-drafts.js');

const now = Date.parse('2026-10-29T03:00:00.000Z');
const ttl = 24 * 60 * 60 * 1000;
const scope = 'correction-session-1';
const owner = '001234';
const plain = value => JSON.parse(JSON.stringify(value));
const entry = (changes = {}) => ({
    base: 'server:' + 'a'.repeat(64), savedAt: now,
    note: '  Teks asli eCommerce O’Connor <img src=x> & \\n\nBaris kedua.  ',
    fields: {title: ' Judul eCommerce <b>literal</b> ', oldSupervisor: 'Dosen Lama', newSupervisor: 'Dosen Baru', reason: 'Alasan\nmasih sama'},
    labels: ['Transkrip', 'Isian pengajuan'], checks: ['Transkrip'], activeLabel: 'Transkrip',
    files: [{label: 'Transkrip', name: 'Transkrip O’Connor.pdf', size: 256, type: 'application/pdf', lastModified: 123}],
    ...changes
});
const envelope = (requests = {}, changes = {}) => ({version: 1, owner, scope, requests, ...changes});
const slot = (saved = entry(), working = null) => ({saved, working});
const rejected = (value, message) => assert.equal(normalizeEntry(value, now), null, message);
function freeze(value) {
    if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);}
    return value;
}

test('preserves exact authored text, labels, confirmation values, and file metadata without mutating input', () => {
    const original = freeze(entry()), before = plain(original), normalized = normalizeEntry(original, now);
    assert.deepEqual(plain(normalized), before);
    assert.deepEqual(plain(original), before);
    assert.notEqual(normalized, original);
    for (const key of ['fields', 'labels', 'checks', 'files']) assert.notEqual(normalized[key], original[key]);
    assert.notEqual(normalized.files[0], original.files[0]);
    assert.deepEqual(Object.keys(normalized).sort(), ['base', 'savedAt', 'note', 'fields', 'checks', 'labels', 'activeLabel', 'files'].sort());
    assert.deepEqual(Object.keys(normalized.files[0]).sort(), ['label', 'name', 'size', 'type', 'lastModified'].sort());
});

test('accepts empty edits and exact text, field, label, and metadata limits', () => {
    assert(normalizeEntry(entry({note: '', fields: {}, labels: [], checks: [], activeLabel: '', files: []}), now));
    const labels = ['A', 'B', 'C', 'D', 'E', 'L'.repeat(120)];
    const bounded = entry({
        base: 'view:' + 'f'.repeat(32), note: 'n'.repeat(5000),
        fields: {title: 't'.repeat(500), oldSupervisor: 'o'.repeat(500), newSupervisor: 'p'.repeat(500), reason: 'r'.repeat(2000)},
        labels, checks: labels.slice(), activeLabel: labels.at(-1),
        files: labels.slice(0, 5).map((label, index) => ({label, name: 'f'.repeat(255), size: index ? 10 * 1024 * 1024 : 0, type: 'm'.repeat(100), lastModified: index}))
    });
    assert.deepEqual(plain(normalizeEntry(bounded, now)), bounded);
});

test('accepts only current finite timestamps, including the TTL and future allowance boundaries', () => {
    for (const savedAt of [now - ttl, now, now + 60000]) assert(normalizeEntry(entry({savedAt}), now), String(savedAt));
    for (const savedAt of [now - ttl - 1, now + 60001, NaN, Infinity, -Infinity, null, String(now)]) rejected(entry({savedAt}), String(savedAt));
});

test('rejects missing or extra entry keys, malformed shapes, invalid fingerprints, and overlong notes', () => {
    for (const value of [null, [], true, 1, 'draft', {}, new Date(now)]) rejected(value);
    for (const key of Object.keys(entry())) {const value = entry(); delete value[key]; rejected(value, 'Missing ' + key);}
    for (const changes of [
        {token: 'private-auth-token'}, {base: ''}, {base: 'a'.repeat(64)}, {base: 'server:' + 'g'.repeat(64)},
        {base: 'server:' + 'a'.repeat(63)}, {base: 'view:' + 'a'.repeat(33)}, {base: 'view:' + 'a'.repeat(31)},
        {note: 'x'.repeat(5001)}, {note: null}, {note: 42}, {fields: []}, {fields: null},
        {labels: null}, {checks: {}}, {files: {}}, {activeLabel: null}
    ]) rejected(entry(changes), JSON.stringify(changes));
    const dangerous = entry(); Object.defineProperty(dangerous, '__proto__', {value: {polluted: true}, enumerable: true});
    rejected(dangerous, 'Unknown own __proto__ entry key');
    assert.equal({}.polluted, undefined);
});

test('allows only bounded correction field strings and rejects privileged or prototype keys', () => {
    for (const fields of [
        {title: 'x'.repeat(501)}, {oldSupervisor: 'x'.repeat(501)}, {newSupervisor: 'x'.repeat(501)},
        {reason: 'x'.repeat(2001)}, {title: 5}, {title: null}, {title: {}}, {status: 'Accepted'},
        {token: 'secret'}, {dospem: 'Injected'}, {constructor: 'Injected'},
        JSON.parse('{"__proto__":{"polluted":true}}')
    ]) rejected(entry({fields}), JSON.stringify(fields));
    assert.equal({}.polluted, undefined);
});

test('requires unique bounded labels, label-bound confirmations, and a valid active item', () => {
    for (const changes of [
        {labels: ['']}, {labels: ['x'.repeat(121)]}, {labels: [42]}, {labels: ['Transkrip', 'Transkrip']},
        {labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G']}, {checks: ['Transkrip', 'Transkrip']},
        {checks: ['Unrequested']}, {checks: [42]}, {activeLabel: 'Unrequested'}, {activeLabel: 0}
    ]) rejected(entry(changes), JSON.stringify(changes));
    assert(normalizeEntry(entry({activeLabel: ''}), now));
    assert(normalizeEntry(entry({checks: ['Transkrip', 'Isian pengajuan']}), now));
});

test('rejects file bytes, URLs, tokens, unsupported labels, duplicate associations, and invalid metadata', () => {
    const file = entry().files[0];
    for (const changes of [
        {base64: 'cHJpdmF0ZS1ieXRlcw=='}, {bytes: [1, 2, 3]}, {blob: {}}, {file: {}}, {url: 'blob:private'},
        {token: 'private-auth-token'}, {label: 'Unrequested'}, {label: 'Isian pengajuan'}, {label: ''},
        {name: ''}, {name: 'f'.repeat(256)}, {name: 1}, {size: -1}, {size: 10 * 1024 * 1024 + 1},
        {size: 0.5}, {size: '256'}, {size: Infinity}, {type: 'x'.repeat(101)}, {type: null},
        {lastModified: -1}, {lastModified: 0.5}, {lastModified: '123'}, {lastModified: Infinity}
    ]) rejected(entry({files: [{...file, ...changes}]}), JSON.stringify(changes));
    for (const key of Object.keys(file)) {const incomplete = {...file}; delete incomplete[key]; rejected(entry({files: [incomplete]}), 'Missing file ' + key);}
    rejected(entry({files: [{...file}, {...file}]}), 'Duplicate document labels');
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    rejected(entry({labels, checks: [], activeLabel: '', files: labels.map(label => ({...file, label}))}), 'More than five metadata rows');
    for (const value of [null, [], 'private bytes', new Uint8Array([1, 2])]) rejected(entry({files: [value]}));
});

test('rejects another owner, session, schema, or malformed envelope without changing its input', () => {
    const valid = envelope({request: slot()});
    const invalid = [
        null, [], 'broken', {}, {...valid, version: 2}, {...valid, version: '1'},
        {...valid, owner: 'another-student'}, {...valid, scope: 'another-session'},
        {...valid, requests: []}, {...valid, requests: null}, {...valid, token: 'private-token'}
    ];
    for (const value of invalid) {
        const before = value === undefined ? undefined : plain(value);
        const normalized = normalizeEnvelope(value, scope, owner, now);
        assert.deepEqual(plain(normalized), envelope());
        if (value !== undefined) assert.deepEqual(plain(value), before);
    }
});

test('normalizes saved and working drafts separately, keeping the surviving branch', () => {
    const expired = entry({savedAt: now - ttl - 1});
    const saved = entry({note: 'Older offered copy', savedAt: now - 100});
    const working = entry({note: 'Current edits must stay separate'});
    const original = freeze(envelope({
        both: slot(saved, working), savedOnly: slot(saved), workingOnly: slot(expired, working),
        invalidSaved: slot({...saved, base: 'corrupt'}, working), expired: slot(expired, expired),
        empty: {saved: null, working: null}, malformed: [],
        unsupported: {...slot(saved), token: 'private-token'}
    }));
    const before = plain(original), normalized = normalizeEnvelope(original, scope, owner, now);
    assert.deepEqual(plain(normalized), envelope({
        both: slot(saved, working), savedOnly: slot(saved), workingOnly: slot(null, working), invalidSaved: slot(null, working)
    }));
    assert.deepEqual(plain(original), before);
    assert.notEqual(normalized.requests.both.saved, original.requests.both.saved);
    assert.notEqual(normalized.requests.both.working, original.requests.both.working);
});

test('validates request IDs and handles dangerous own data keys without prototype mutation', () => {
    const requests = Object.fromEntries([
        ['valid-id', slot()], ['x'.repeat(200), slot()], ['', slot()], ['x'.repeat(201), slot()],
        ['bad\nrequest', slot()], ['bad\u0000request', slot()], ['bad\u007frequest', slot()],
        ['__proto__', slot()], ['constructor', slot()], ['toString', slot()]
    ]);
    const normalized = normalizeEnvelope(envelope(requests), scope, owner, now);
    assert.deepEqual(Object.keys(normalized.requests).sort(), ['valid-id', 'x'.repeat(200), '__proto__', 'constructor', 'toString'].sort());
    for (const key of ['__proto__', 'constructor', 'toString']) {
        assert(Object.hasOwn(normalized.requests, key), key + ' remains own data');
        assert.equal(normalized.requests[key].saved.note, entry().note);
    }
    assert.equal({}.polluted, undefined);
    assert.equal(Object.getPrototypeOf({}), Object.prototype);
    assert.deepEqual(plain(normalized).requests.__proto__, slot());
});

test('keeps twelve most recent requests using the newest surviving branch in each slot', () => {
    const requests = Object.fromEntries(Array.from({length: 15}, (_, index) => [
        'request-' + index,
        slot(entry({savedAt: now - 1000 + index}), index === 0 ? entry({savedAt: now}) : null)
    ]));
    const normalized = normalizeEnvelope(envelope(requests), scope, owner, now);
    assert.equal(Object.keys(normalized.requests).length, 12);
    assert(Object.hasOwn(normalized.requests, 'request-0'), 'Recent working edits retain a request with an older saved offer');
    for (const index of [1, 2, 3]) assert(!Object.hasOwn(normalized.requests, 'request-' + index));
    for (let index = 4; index < 15; index++) assert(Object.hasOwn(normalized.requests, 'request-' + index));
});

test('uses a valid server revision directly; the fallback fingerprint detects every request snapshot field', () => {
    const item = freeze({id: 'request-A', status: 'Revision', jenis: 'Outline', detail: '<b>Judul:</b> Original', note: '[{"message":"Correct it"}]', link: 'Original file'});
    const before = plain(item), fallback = fingerprint(item);
    assert.match(fallback, /^view:[a-f0-9]{32}$/);
    assert.equal(fingerprint({...item}), fallback);
    for (const key of ['id', 'status', 'jenis', 'detail', 'note', 'link']) assert.notEqual(fingerprint({...item, [key]: item[key] + ' changed'}), fallback, key);
    assert.equal(fingerprint({...item, irrelevant: 'display only'}), fallback);
    assert.equal(fingerprint({...item, reviewVersion: 'invalid'}), fallback);
    assert.equal(fingerprint({...item, reviewVersion: 'a'.repeat(63)}), fallback);
    assert.notEqual(fingerprint({...item, note: 'Same high surrogate \u{1f600}'}), fingerprint({...item, note: 'Same high surrogate \u{1f601}'}), 'Emoji sharing a high surrogate must remain distinct');
    const version = '0123456789abcdef'.repeat(4);
    assert.equal(fingerprint({...item, reviewVersion: version}), 'server:' + version);
    assert.equal(fingerprint({...item, reviewVersion: version, note: 'Changed display copy'}), 'server:' + version);
    assert.deepEqual(plain(item), before);
});
