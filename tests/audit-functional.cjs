const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

test('relative notification dates use WIB for timestamps without an offset', () => {
  const clock = Date.parse('2026-10-13T05:00:00Z');
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
  }
  const context = vm.createContext({ Date: FixedDate, currentLang: 'id' });
  vm.runInContext(section('function displayDate(', '// ==========================================\n// 1.5.'), context);
  assert.equal(context.timeAgo('2026-10-13 11:30:00'), '30 menit lalu');
  assert.equal(context.timeAgo('2026-10-13T04:00:30Z'), '59 menit lalu');
  assert.equal(context.timeAgo('invalid'), '-');
});

test('internal overdue filtering uses a WIB timestamp at the 24-hour boundary', () => {
  let clock = Date.parse('2026-10-14T04:29:59Z');
  class FixedDate extends Date {static now() {return clock;}}
  const context = vm.createContext({Date: FixedDate, serviceSetting: () => ({adminDays: 1, studentDays: 1})});
  vm.runInContext(section('function displayDate(', 'function formatDate('), context);
  const features = fs.readFileSync(path.join(__dirname, '../features.js'), 'utf8');
  vm.runInContext(features.slice(features.indexOf('function caseWaiting('), features.indexOf('function caseDocumentOptions(')), context);
  const item = {status: 'Pending', jenis: 'Proposal', date: '2026-10-13 11:30:00', note: '[]'};
  assert.equal(context.caseWaiting(item).days, 0);
  assert.equal(context.caseWaiting(item).overdue, false);
  clock = Date.parse('2026-10-14T04:30:00Z');
  assert.equal(context.caseWaiting(item).days, 1);
  assert.equal(context.caseWaiting(item).overdue, true);
});

test('Yudisium countdown follows the next calendar deadline and closes each date in WIB', () => {
  const context = vm.createContext({
    getChecklistData: () => [
      {title: 'Period II', items: [{text: '19 Okt 2026'}]},
      {title: 'Period III', items: [{text: '18 Jan 2027'}, {text: '31 Feb 2027'}]},
    ], contentText: text => text,
  });
  vm.runInContext(section('function academicCalendarDate(', 'function downloadICS('), context);
  vm.runInContext(section('function nearestYudisiumDeadline(', 'function openChatTimeline('), context);
  const current = context.nearestYudisiumDeadline(Date.parse('2026-10-19T16:59:58Z'));
  assert.equal(current.title, 'Period II');
  assert.equal(current.deadline, Date.parse('2026-10-19T16:59:59Z'));
  const next = context.nearestYudisiumDeadline(Date.parse('2026-10-19T17:00:00Z'));
  assert.equal(next.title, 'Period III');
  assert.equal(next.deadline, Date.parse('2027-01-18T16:59:59Z'));
  assert.equal(context.nearestYudisiumDeadline(Date.parse('2027-01-18T17:00:00Z')), null);
});

test('an expired calendar shows no upcoming schedule and disables its reminder', () => {
  const timer = {}, label = {}, button = {}, reminders = [];
  class FixedDate extends Date {static now() {return Date.parse('2027-03-01T00:00:00Z');}}
  const context = vm.createContext({
    Date: FixedDate, getChecklistData: () => [{title: 'Past', items: [{text: '18 Jan 2027'}]}],
    contentText: text => text, uxText: text => text, showToast() {},
    downloadICS: (...args) => reminders.push(args),
    document: {querySelectorAll: selector => selector === '.countdown-period-label' ? [label] : selector === '[data-next-yudisium-reminder]' ? [button] : [timer]},
  });
  vm.runInContext(section('function academicCalendarDate(', 'function downloadICS('), context);
  vm.runInContext(section('function nearestYudisiumDeadline(', 'function openChatTimeline('), context);
  context.renderYudisiumCountdown();
  assert.equal(timer.textContent, 'Jadwal belum tersedia');
  assert.equal(label.textContent, 'Menunggu jadwal berikutnya');
  assert.equal(button.disabled, true);
  context.downloadNearestYudisiumReminder();
  assert.equal(reminders.length, 0);
});

test('dropped files follow picker change handlers and respect single-file inputs', () => {
  const first = {name: 'first.pdf'}, second = {name: 'second.pdf'}, events = [];
  const input = {multiple: false, dispatchEvent: event => events.push(event)};
  class DataTransfer {
    constructor() {
      this.files = [];
      this.items = {add: file => this.files.push(file)};
    }
  }
  const context = vm.createContext({
    document: {getElementById: () => input}, DataTransfer,
    Event: class {constructor(type, options) {this.type = type; Object.assign(this, options);}},
  });
  vm.runInContext(section('function handleDropZone(', 'function formatFileSize('), context);
  context.handleDropZone({preventDefault() {}, dataTransfer: {files: [first, second]}}, {classList: {remove() {}}}, 'file', 'label');
  assert.equal(input.files.length, 1);
  assert.equal(input.files[0], first);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'change');
  assert.equal(events[0].bubbles, true);
});

test('global search trims surrounding spaces and renders keyboard-operable results', () => {
  const container = {innerHTML: ''};
  const context = vm.createContext({
    document: {getElementById: () => container}, currentLang: 'id',
    searchDatabase: [{title: 'Kewajiban Magang', keywords: 'magang', tab: 'magang'}],
    searchEnglishKeywords: {}, canAccessTab: () => true, systemText: text => text,
    escapeHtml: text => String(text), uxText: text => text,
  });
  vm.runInContext(section('function renderSearchResults(', 'function executeSearchNavigation('), context);
  context.renderSearchResults('  magang  ');
  assert.match(container.innerHTML, /<button type="button" class="search-result"/);
  assert.match(container.innerHTML, /Kewajiban Magang/);
});

test('global search requires login and cancels a previous close animation on reopen', () => {
  const modal = {id: 'modal-global-search', style: {display: 'none'}, contains: () => true};
  const input = {value: '', focus() {}};
  const cancelled = [], timers = new Map([['modal-global-search', 42]]);
  const context = vm.createContext({
    currentUser: {role: ''}, getSessionToken: () => '',
    document: {getElementById: id => id === 'modal-global-search' ? modal : input},
    modalCloseTimers: timers, clearTimeout: id => cancelled.push(id), setTimeout() {}, renderSearchResults() {},
  });
  vm.runInContext(section('function openGlobalSearch(', "document.getElementById('global-search-input')?.addEventListener"), context);
  context.openGlobalSearch();
  assert.equal(modal.style.display, 'none');
  context.currentUser.role = 'mhs'; context.getSessionToken = () => 'student-token';
  context.openGlobalSearch();
  assert.equal(modal.style.display, 'flex');
  assert.deepEqual(cancelled, [42]);
  assert.equal(timers.has('modal-global-search'), false);
});

test('returning to registration keeps a prepared review and selected files', () => {
  const review = {hidden: false}, file = {files: [{name: 'selected.pdf'}]};
  let resets = 0, reads = 0;
  const context = vm.createContext({
    document: {getElementById: id => id === 'registration-review' ? review : {}, querySelectorAll: () => [file]},
    sessionStorage: {getItem: () => {reads++; return JSON.stringify({'reg-jenis-utama': 'Proposal'});}},
    toggleExamForm: () => resets++,
  });
  vm.runInContext(section('function loadFormDraft(', 'function clearFormDraft('), context);
  context.loadFormDraft();
  review.hidden = true;
  context.loadFormDraft();
  assert.equal(resets, 0);
  assert.equal(reads, 0);
  assert.equal(file.files[0].name, 'selected.pdf');
});

test('notification and search respect a rejected leave-form confirmation', () => {
  let navigated = false;
  const reads = [], opened = [], closed = [], dropdown = {style: {display: 'block'}};
  const context = vm.createContext({
    switchTab: () => navigated, getReadNotificationIds: () => [], saveReadNotificationIds: values => reads.push(values),
    renderNotifications() {}, document: {getElementById: () => dropdown}, openCaseDetail: id => opened.push(id),
    closeModal: id => closed.push(id),
  });
  vm.runInContext(section('function openNotification(', 'function toggleNotifDropdown('), context);
  vm.runInContext(section('function executeSearchNavigation(', '// ==========================================\n// 4.'), context);
  context.openNotification('unread', 'case-a', 'student-status');
  context.executeSearchNavigation('dashboard');
  assert.equal(reads.length, 0);
  assert.equal(opened.length, 0);
  assert.equal(closed.length, 0);
  assert.equal(dropdown.style.display, 'block');
  navigated = true;
  context.openNotification('unread', 'case-a', 'student-status');
  context.executeSearchNavigation('dashboard');
  assert.equal(reads.length, 1);
  assert.deepEqual(opened, ['case-a']);
  assert.deepEqual(closed, ['modal-global-search']);
  assert.equal(dropdown.style.display, 'none');
});

function announcementContext() {
  const values = new Map(), session = new Map(), nodes = new Map(), timeouts = new Map();
  let nextTimer = 0;
  const node = id => {
    if (!nodes.has(id)) {
      const attributes = new Map();
      nodes.set(id, {id, tagName: 'DIV', checked: false, style: {display: 'none'}, innerText: '',
        getAttribute: name => attributes.get(name) || null, setAttribute: (name, value) => attributes.set(name, String(value))});
    }
    return nodes.get(id);
  };
  const store = map => ({getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value)});
  const context = vm.createContext({
    document: {getElementById: node}, currentUser: {role: 'mhs', nim: 'A'}, sessionEpoch: 1,
    sessionStorage: store(session), localStorage: store(values), modalCloseTimers: new Map(),
    setTimeout: fn => {timeouts.set(++nextTimer, fn); return nextTimer;}, clearTimeout: id => timeouts.delete(id),
    window: {}, applyJourneySnapshot() {}, serviceSettings: [], renderServiceSettings() {}, normalizeData: values => values,
    renderNotifications() {}, refreshServiceAvailability() {}, DB_MAHASISWA: {}, isDbLoaded: false,
    loadStudentStatus() {}, renderActivityTimeline() {}, setSyncPhase() {},
  });
  vm.runInContext(section('function notificationHash(', 'function notificationReadKey('), context);
  vm.runInContext(section('function announcementDismissalKey(', '// ==========================================\n// FITUR BARU'), context);
  vm.runInContext(section('function closeModal(', 'function syncThemeControl('), context);
  vm.runInContext(section('function applyDatabaseSnapshot(', 'function switchLoginMode('), context);
  return {context, node, values, session, flush: () => {const pending = [...timeouts.values()]; timeouts.clear(); pending.forEach(fn => fn());}};
}

test('broadcast sync retains the dismissal choice and separates it between student accounts', () => {
  const fixture = announcementContext(), {context, node} = fixture;
  const snapshot = () => ({registrations: [], announcements: [{Id: 'announcement-1', Tipe: 'important', Pesan: 'Important announcement'}]});
  context.applyDatabaseSnapshot(snapshot());
  node('chk-dont-show-announcement').checked = true;
  context.applyDatabaseSnapshot(snapshot());
  assert.equal(node('chk-dont-show-announcement').checked, true);
  context.closeAnnouncementModal(); fixture.flush();
  const keyA = context.announcementDismissalKey('hide', 'announcement-1');
  assert.equal(fixture.values.get(keyA), 'true');
  context.applyDatabaseSnapshot(snapshot());
  assert.equal(node('modal-important-announcement').style.display, 'none');
  context.currentUser.nim = 'B'; context.applyDatabaseSnapshot(snapshot());
  assert.equal(node('modal-important-announcement').style.display, 'flex');
  assert.notEqual(context.announcementDismissalKey('hide', 'announcement-1'), keyA);
});

test('generic announcement dismissal is remembered while logout cleanup does not dismiss it', () => {
  const fixture = announcementContext(), {context, node} = fixture;
  node('modal-important-announcement').setAttribute('data-current-ann-id', 'announcement-2');
  context.closeModal('modal-important-announcement');
  assert.equal(fixture.session.get(context.announcementDismissalKey('seen', 'announcement-2')), 'true');
  node('modal-important-announcement').setAttribute('data-current-ann-id', 'announcement-3');
  context.closeModal('modal-important-announcement', true);
  assert.equal(fixture.session.has(context.announcementDismissalKey('seen', 'announcement-3')), false);
});

test('a dismissed banner stays hidden across sync but a new broadcast remains visible', () => {
  const fixture = announcementContext(), {context, node} = fixture;
  const snapshot = id => ({registrations: [], announcements: [{Id: id, Tipe: 'info', Pesan: 'Broadcast ' + id}]});
  context.applyDatabaseSnapshot(snapshot('first'));
  context.dismissAnnouncementBanner();
  context.applyDatabaseSnapshot(snapshot('first'));
  assert.equal(node('announcement-banner').style.display, 'none');
  context.applyDatabaseSnapshot(snapshot('second'));
  assert.equal(node('announcement-banner').style.display, 'flex');
  context.currentUser.nim = 'B';
  context.applyDatabaseSnapshot(snapshot('first'));
  assert.equal(node('announcement-banner').style.display, 'flex');
});

test('admin login sends the password exactly as entered', async () => {
  const nodes = {
    'input-nim': {value: ''}, 'input-admin-user': {value: ' admin '},
    'input-admin-pass': {value: ' significant spaces '}, 'error-msg-admin': {style: {}},
  };
  const button = {}, calls = [];
  const context = vm.createContext({
    document: {getElementById: id => nodes[id], querySelector: () => button},
    loginBusy: false, loginAttempt: 0, isOffline: false, GAS_URL: 'fixture',
    apiPost: async (url, options) => {calls.push(JSON.parse(options.body)); return {};},
    readApiResult: async () => ({status: 'success', token: 'admin-token'}),
    clearPrivateCache() {}, sessionStorage: {setItem() {}}, finalizeLogin() {},
    showToast() {}, resetLoginButtons() {}, uxText: text => text,
    setLoginError: () => assert.fail('Valid credentials should not fail locally'),
  });
  vm.runInContext(section('async function performLogin(', 'function loginMhs('), context);
  await context.performLogin('admin');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].username, 'admin');
  assert.equal(calls[0].password, ' significant spaces ');
});

function formContext(type, fields) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {value: fields[id] || '', hidden: false, disabled: false, textContent: '', files: [{name: 'fixture.pdf', type: 'application/pdf', size: 20}], reset() {}});
    return nodes.get(id);
  };
  node('reg-jenis-utama').value = type;
  node('registration-review').hidden = false;
  const calls = [];
  const context = vm.createContext({
    document: {getElementById: node, querySelectorAll: () => []},
    sessionStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    currentUser: {nim: 'A', nama: 'Student A'}, sessionEpoch: 1,
    isSubmittingRegistration: false, preflightBusy: false, isOffline: false,
    currentLang: 'id', activeReceipt: null, lastSubmittedCaseId: '', GAS_URL: 'fixture',
    window: {crypto: {randomUUID: () => 'request-id'}, IPCOSExperience: {feedback() {}}},
    editRegistration() {}, validateRegistration: () => true, showToast() {},
    setSubmissionStage() {}, setProcessNotice() {}, showLoader() {}, hideLoader() {},
    systemText: text => text, uxText: text => text, fileToBase64: async () => 'JVBERg==',
    submissionSignature: async () => 'signature', apiPost: async (url, options) => {calls.push(JSON.parse(options.body)); return {};},
    readApiResult: async () => ({status: 'success', id: 'created'}),
    showSubmissionReceipt() {}, clearFormDraft() {}, toggleExamForm() {},
    setFieldError() {}, syncDatabase: async () => {},
  });
  vm.runInContext(section('function escapeHtml(', 'function safeUrl('), context);
  vm.runInContext(section('async function submitForm(', 'function showSubmissionReceipt('), context);
  return {context, calls};
}

test('submission rich-text preserves user titles and supervisor reasons literally', async () => {
  const title = formContext('Proposal', {'reg-judul': '  A < B & <b>literal title</b>  '});
  await title.context.submitForm({preventDefault() {}});
  assert.equal(title.calls.length, 1);
  assert.equal(title.calls[0].detail, '<b>Judul:</b> A &lt; B &amp; &lt;b&gt;literal title&lt;/b&gt;');
  const change = formContext('Pergantian Pembimbing', {
    'reg-dosen-lama': 'Old & Co', 'reg-dosen-baru': 'New <Name>', 'reg-alasan-ganti': 'Use <b>literal</b> & accurate text',
  });
  await change.context.submitForm({preventDefault() {}});
  assert.equal(change.calls.length, 1);
  assert.equal(change.calls[0].detail, '<b>Dosen Lama:</b> Old &amp; Co<br><b>Dosen Baru:</b> New &lt;Name&gt;<br><b>Alasan:</b> Use &lt;b&gt;literal&lt;/b&gt; &amp; accurate text');
});

function academicContext() {
  const listeners = {}, nodes = new Map(), calls = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {id, value: '', dataset: {}, style: {}, options: [], innerHTML: '', textContent: '', hidden: false, replaceChildren() {}, remove() {}});
    return nodes.get(id);
  };
  node('correct-request-type').value = 'Pendadaran';
  node('correct-request-reason').value = 'Documents were submitted for the defence.';
  let releaseVersion, versionCalls = 0;
  const version = new Promise(resolve => {releaseVersion = resolve;});
  const context = vm.createContext({
    document: {getElementById: node, querySelectorAll: () => [], addEventListener: (name, fn) => (listeners[name] ||= []).push(fn)},
    window: {
      addEventListener: (name, fn) => (listeners[name] ||= []).push(fn),
      IPCOSReviewTools: {dirty: () => false, version: () => {versionCalls++; return version;}, discardLocal() {}},
      IPCOSReview: {actionsChanged() {}}, IPCOSAdminDrafts: {forget() {}},
    },
    currentUser: {role: 'admin'}, sessionEpoch: 1, selectedCaseId: 'case-a',
    activeUpdateIds: new Set(), crypto: {randomUUID: () => 'request-id'},
    currentCase: () => ({id: 'case-a', jenis: 'Proposal', status: 'Pending', note: '[]'}),
    uxText: text => text, escapeHtml: text => String(text), serviceLabel: text => text,
    activeSameType: () => false, confirmLeaveCase: () => true, confirm: () => true,
    GAS_URL: 'fixture', systemText: text => text, syncPhase: 'error', syncDatabase: async () => {},
    apiPostSuccess: async (url, options) => {calls.push(JSON.parse(options.body)); return {status: 'success'};},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../academic-workflow.js'), 'utf8'), context);
  context.window.IPCOSAcademic.apply({academicSupported: true});
  const click = () => listeners.click.forEach(fn => fn({target: {closest: selector => selector === '[data-change-request-type]' ? {} : null}}));
  return {context, calls, click, releaseVersion, versionCalls: () => versionCalls, logout: () => listeners['ipcos:logout'].forEach(fn => fn())};
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('request type correction locks before version lookup and ignores repeated clicks', async () => {
  const fixture = academicContext();
  fixture.click();
  fixture.click();
  assert.equal(fixture.versionCalls(), 1);
  assert.equal(fixture.context.activeUpdateIds.has('case-a'), true);
  fixture.releaseVersion('version-a');
  await flush();
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].version, 'version-a');
  assert.equal(fixture.context.activeUpdateIds.size, 0);
});

test('request type correction cannot mutate after logout during version lookup', async () => {
  const fixture = academicContext();
  fixture.click();
  fixture.context.sessionEpoch++;
  fixture.context.currentUser = {role: 'mhs'};
  fixture.context.activeUpdateIds.clear();
  fixture.logout();
  fixture.releaseVersion('old-version');
  await flush();
  assert.equal(fixture.calls.length, 0);
});
