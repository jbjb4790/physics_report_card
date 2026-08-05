(function () {
  'use strict';

  const core = window.TPLCore;
  const catalog = window.EXAM_CATALOG || [];
  const config = window.APP_CONFIG || {};
  const SETTINGS_KEY = `${config.storageKey || 'tpl-score-report-records-v1'}-settings`;
  const SEED_KEY = `${config.storageKey || 'tpl-score-report-records-v1'}-seed-version`;
  const BACKEND_SETUP_PARAM = config.backendSetupParam || 'appsScript';
  const seedMetadata = window.SEED_RECORDS_METADATA || {};
  const seedRecords = Array.isArray(window.SEED_RECORDS) ? window.SEED_RECORDS : [];
  const app = document.getElementById('app');
  const circled = ['', '①', '②', '③', '④', '⑤'];

  const state = {
    examId: catalog[0]?.id || '',
    school: '',
    name: '',
    answers: Array(20).fill(''),
    storageMode: config.backendUrl ? 'apps-script' : 'local',
    backendUrl: config.backendUrl || '',
    backendStatus: 'idle',
    backendStatusMessage: '',
    backendLastVerifiedAt: '',
    search: '',
    busy: false,
    editingId: ''
  };

  function normalizeBackendUrl(value) {
    const input = String(value || '').trim().replace(/\s+/g, '');
    if (!input) return '';
    const match = input.match(/^(https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec)\/?(?:[?#].*)?$/i);
    return match ? match[1] : input;
  }

  function isValidBackendUrl(value) {
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/i.test(normalizeBackendUrl(value));
  }

  function setupBackendUrlFromLocation() {
    try {
      const params = new URLSearchParams(window.location.search);
      return normalizeBackendUrl(params.get(BACKEND_SETUP_PARAM) || '');
    } catch (error) {
      return '';
    }
  }

  function removeBackendSetupParam() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(BACKEND_SETUP_PARAM)) return;
      url.searchParams.delete(BACKEND_SETUP_PARAM);
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    } catch (error) {
      console.warn('연결 설정 URL을 정리하지 못했습니다.', error);
    }
  }

  function loadSettings() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch (error) {
      console.warn('설정을 읽지 못했습니다.', error);
    }

    const setupUrl = setupBackendUrlFromLocation();
    const storedUrl = normalizeBackendUrl(saved.backendUrl || '');
    const configuredUrl = normalizeBackendUrl(config.backendUrl || '');
    const validCandidate = [setupUrl, storedUrl, configuredUrl].find(isValidBackendUrl);
    state.backendUrl = validCandidate || setupUrl || storedUrl || configuredUrl || '';
    state.backendLastVerifiedAt = saved.backendLastVerifiedAt || '';

    if (setupUrl) state.storageMode = 'apps-script';
    else if (saved.storageMode === 'local' || saved.storageMode === 'apps-script') state.storageMode = saved.storageMode;
    else if (state.backendUrl) state.storageMode = 'apps-script';

    if (state.backendUrl) {
      state.backendStatus = isValidBackendUrl(state.backendUrl) ? 'saved' : 'error';
      state.backendStatusMessage = isValidBackendUrl(state.backendUrl)
        ? '저장된 Apps Script 주소를 불러왔습니다. 자동 연결을 확인합니다.'
        : '저장된 주소 형식을 확인해 주세요.';
    }

    if (setupUrl) {
      saveSettings();
      removeBackendSetupParam();
    }
  }

  function saveSettings() {
    state.backendUrl = normalizeBackendUrl(state.backendUrl);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        storageMode: state.storageMode,
        backendUrl: state.backendUrl,
        backendLastVerifiedAt: state.backendLastVerifiedAt || '',
        updatedAt: new Date().toISOString()
      }));
    } catch (error) {
      console.warn('연결 설정을 저장하지 못했습니다.', error);
    }
  }

  function readStoredRecords() {
    try {
      const value = JSON.parse(localStorage.getItem(config.storageKey) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.warn('학생 기록을 읽지 못했습니다.', error);
      return [];
    }
  }

  function loadRecords() {
    return readStoredRecords();
  }

  function saveRecords(records) {
    localStorage.setItem(config.storageKey, JSON.stringify(records || []));
  }

  function normalizedSeedRecords() {
    return seedRecords
      .filter((record) => record && core.getExam(catalog, record.examId || state.examId) && record.name)
      .map((record, index) => {
        const seedExam = core.getExam(catalog, record.examId || state.examId);
        return {
          ...record,
          id: record.id || `seed-${index + 1}`,
          examId: record.examId || seedExam.id,
          round: Number(record.round || seedExam.round || 1),
          school: core.normalizeText(record.school || seedMetadata.schoolFallback || '미입력'),
          name: core.normalizeText(record.name),
          answers: core.normalizeAnswers(record.answers, seedExam.answerCount),
          createdAt: record.createdAt || '2024-05-20T00:00:00+09:00',
          updatedAt: record.updatedAt || new Date().toISOString(),
          source: record.source || seedMetadata.source || '기본 입력 데이터',
          seedVersion: record.seedVersion || seedMetadata.version || 'seed'
        };
      });
  }

  function mergeSeedRecords(records, options = {}) {
    const incoming = normalizedSeedRecords();
    if (!incoming.length) return { records, added: 0, updated: 0 };
    const output = [...records];
    let added = 0;
    let updated = 0;
    incoming.forEach((seed) => {
      const key = core.studentKey(seed);
      const index = output.findIndex((item) => item.id === seed.id || (item.examId === seed.examId && core.studentKey(item) === key));
      if (index >= 0) {
        if (options.overwriteSeed && output[index].seedVersion) {
          output[index] = { ...output[index], ...seed, id: output[index].id || seed.id, createdAt: output[index].createdAt || seed.createdAt, updatedAt: seed.updatedAt };
          updated += 1;
        }
      } else {
        output.push(seed);
        added += 1;
      }
    });
    return { records: output, added, updated };
  }

  function ensureSeedRecords(force = false) {
    if (!seedRecords.length) return { added: 0, updated: 0 };
    const currentVersion = seedMetadata.version || 'seed';
    const alreadySeeded = localStorage.getItem(SEED_KEY) === currentVersion;
    if (alreadySeeded && !force) return { added: 0, updated: 0 };
    const merged = mergeSeedRecords(readStoredRecords(), { overwriteSeed: force });
    if (merged.added || merged.updated || !alreadySeeded) {
      saveRecords(merged.records);
      localStorage.setItem(SEED_KEY, currentVersion);
    }
    return { added: merged.added, updated: merged.updated };
  }

  function upsertRecord(record) {
    const records = loadRecords();
    const key = core.studentKey(record);
    const index = records.findIndex((item) => item.examId === record.examId && core.studentKey(item) === key);
    const now = new Date().toISOString();
    if (index >= 0) {
      const previous = records[index];
      records[index] = {
        ...previous,
        ...record,
        id: previous.id || record.id,
        serverId: record.serverId || previous.serverId || '',
        createdAt: previous.createdAt || record.createdAt || now,
        updatedAt: now
      };
      saveRecords(records);
      return records[index];
    }
    const created = { ...record, id: record.id || core.makeId('local'), createdAt: record.createdAt || now, updatedAt: now };
    records.push(created);
    saveRecords(records);
    return created;
  }

  function deleteRecord(id) {
    saveRecords(loadRecords().filter((record) => record.id !== id));
  }

  function exam() { return core.getExam(catalog, state.examId); }

  function escape(value) { return core.escapeHtml(value); }

  function toast(message, type = '') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    stack.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function download(content, type, filename) {
    const blob = new Blob([content], { type });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      console.warn('Clipboard API 복사에 실패하여 대체 방식을 사용합니다.', error);
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('브라우저가 자동 복사를 허용하지 않았습니다.');
    return true;
  }

  function jsonp(url, params, timeout = config.backendTimeoutMs || 15000) {
    return new Promise((resolve, reject) => {
      if (!/^https:\/\//i.test(String(url || ''))) { reject(new Error('Apps Script /exec URL을 확인해 주세요.')); return; }
      const callback = `_tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const timer = setTimeout(() => { cleanup(); reject(new Error('서버 응답 시간이 초과되었습니다.')); }, timeout);
      function cleanup() { clearTimeout(timer); script.remove(); try { delete window[callback]; } catch (error) { window[callback] = undefined; } }
      window[callback] = (response) => {
        cleanup();
        if (response && response.ok === false) { const error = new Error(response.error || '서버 요청에 실패했습니다.'); error.code = response.code || ''; reject(error); }
        else resolve(response || {});
      };
      const target = new URL(url);
      Object.entries(params || {}).forEach(([key, value]) => target.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value)));
      target.searchParams.set('callback', callback);
      target.searchParams.set('_', String(Date.now()));
      script.src = target.href;
      script.async = true;
      script.onerror = () => { cleanup(); reject(new Error('Apps Script에 연결하지 못했습니다. 배포 권한과 URL을 확인하세요.')); };
      document.head.appendChild(script);
    });
  }

  let backendConnectionRequest = null;
  let lastAutoConnectUrl = '';

  function backendStatusHtml() {
    const valid = isValidBackendUrl(state.backendUrl);
    const status = state.backendStatus || (valid ? 'saved' : 'idle');
    const labelMap = {
      connected: 'Google Sheets 자동 연결됨',
      checking: 'Apps Script 연결 확인 중',
      saved: 'Apps Script 주소 저장됨',
      error: 'Apps Script 연결 확인 필요',
      idle: 'Apps Script 주소 미설정'
    };
    const defaultMessage = {
      connected: '새로고침하거나 사이트를 다시 배포해도 이 브라우저에서는 같은 주소로 자동 연결됩니다.',
      checking: '저장된 /exec 주소로 서버 응답을 확인하고 있습니다.',
      saved: '주소가 이 브라우저에 저장되었습니다. 연결 확인을 누르거나 잠시 기다려 주세요.',
      error: '웹 앱 배포 권한과 /exec 주소를 확인해 주세요.',
      idle: 'Google Sheets를 사용하려면 Apps Script 웹 앱의 /exec 주소를 입력하세요.'
    };
    let verified = '';
    if (state.backendLastVerifiedAt && status === 'connected') {
      try { verified = ` · 마지막 확인 ${new Date(state.backendLastVerifiedAt).toLocaleString('ko-KR')}`; }
      catch (error) { verified = ''; }
    }
    return `<div class="backend-connection backend-connection--${status}" id="backendConnectionStatus" role="status" aria-live="polite"><span class="backend-connection__dot" aria-hidden="true"></span><div><strong>${escape(labelMap[status] || labelMap.idle)}</strong><small>${escape(state.backendStatusMessage || defaultMessage[status] || defaultMessage.idle)}${escape(verified)}</small></div></div>`;
  }

  function setBackendStatus(status, message = '') {
    state.backendStatus = status;
    state.backendStatusMessage = message;
    const node = document.getElementById('backendConnectionStatus');
    if (node) node.outerHTML = backendStatusHtml();
    const modeTag = document.querySelector('#student-entry .card__head .tag');
    if (modeTag && state.storageMode === 'apps-script') {
      modeTag.textContent = status === 'connected' ? 'Google Sheet 자동 연결됨' : 'Google Sheet 누적 저장';
    }
  }

  function syncBackendUrlFromField() {
    const input = document.getElementById('backendUrl');
    if (input) {
      state.backendUrl = normalizeBackendUrl(input.value);
      if (input.value !== state.backendUrl) input.value = state.backendUrl;
    } else {
      state.backendUrl = normalizeBackendUrl(state.backendUrl);
    }
    saveSettings();
    return state.backendUrl;
  }

  function backendSetupLink() {
    const url = new URL('./', window.location.href);
    url.hash = '';
    url.searchParams.set(BACKEND_SETUP_PARAM, state.backendUrl);
    return url.href;
  }

  async function connectBackend(options = {}) {
    const { silent = false, force = false } = options;
    const url = syncBackendUrlFromField();
    if (!isValidBackendUrl(url)) {
      setBackendStatus('error', 'Apps Script 웹 앱의 https://script.google.com/macros/s/.../exec 주소를 입력해 주세요.');
      if (!silent) toast('Apps Script의 /exec URL을 입력해 주세요.', 'error');
      return false;
    }
    state.storageMode = 'apps-script';
    saveSettings();
    if (backendConnectionRequest && !force) return backendConnectionRequest;
    setBackendStatus('checking');
    backendConnectionRequest = jsonp(url, { action: 'ping' })
      .then((response) => {
        state.backendLastVerifiedAt = new Date().toISOString();
        state.backendStatus = 'connected';
        state.backendStatusMessage = response.message || 'Apps Script 서버와 연결되었습니다.';
        saveSettings();
        setBackendStatus('connected', state.backendStatusMessage);
        if (!silent) toast(response.message || 'Apps Script 서버 연결에 성공했습니다.', 'good');
        return true;
      })
      .catch((error) => {
        state.backendStatus = 'error';
        state.backendStatusMessage = error.message;
        setBackendStatus('error', error.message);
        if (!silent) toast(`서버 연결 실패: ${error.message}`, 'error');
        return false;
      })
      .finally(() => { backendConnectionRequest = null; });
    return backendConnectionRequest;
  }

  function autoConnectBackend() {
    if (config.backendAutoConnect === false || state.storageMode !== 'apps-script' || !isValidBackendUrl(state.backendUrl)) return;
    if (lastAutoConnectUrl === state.backendUrl && (state.backendStatus === 'connected' || state.backendStatus === 'checking')) return;
    lastAutoConnectUrl = state.backendUrl;
    window.setTimeout(() => connectBackend({ silent: true }), 0);
  }

  function reportUrl(snapshot, serverId = '') {
    const url = new URL('report.html', document.baseURI || window.location.href);
    const hash = new URLSearchParams();
    const useServer = Boolean(serverId && state.backendUrl);
    if (useServer) {
      hash.set(config.serverHashKey || 'id', serverId);
      hash.set('api', state.backendUrl);
    } else {
      hash.set(config.reportHashKey || 'report', core.encodePayload(snapshot));
    }
    url.hash = hash.toString();
    return url.href;
  }

  async function requestWithWriteKey(params) {
    let writeKey = sessionStorage.getItem('tpl-backend-write-key') || '';
    try {
      return await jsonp(state.backendUrl, { ...params, writeKey });
    } catch (error) {
      if (error.code !== 'WRITE_KEY_REQUIRED' && error.code !== 'INVALID_WRITE_KEY') throw error;
      writeKey = window.prompt('Google Sheets 저장 키를 입력하세요. 이 브라우저 탭에만 임시 보관됩니다.') || '';
      if (!writeKey) throw error;
      sessionStorage.setItem('tpl-backend-write-key', writeKey);
      return jsonp(state.backendUrl, { ...params, writeKey });
    }
  }

  function answerGridHtml() {
    return exam().questions.map((question, index) => {
      const value = state.answers[index] === '' ? '' : String(state.answers[index]);
      return `
      <div class="answer-card${value ? ' is-filled' : ''}" data-question="${question.no}">
        <div class="answer-card__top"><span class="answer-card__no">${question.no}</span><span class="answer-card__unit" title="${escape(question.unit)}">${escape(question.unit)}</span></div>
        <div class="answer-entry">
          <label class="sr-only" for="answer-${index}">${question.no}번 답안</label>
          <input id="answer-${index}" class="answer-input" type="text" inputmode="numeric" autocomplete="off" maxlength="1" pattern="[1-5]" placeholder="-" value="${escape(value)}" data-index="${index}" aria-label="${question.no}번 답안: 1부터 5까지 입력, 비우면 미기입">
          <button type="button" class="answer-clear" data-index="${index}" title="${question.no}번 미기입 처리">비우기</button>
        </div>
      </div>`;
    }).join('');
  }

  function previewHtml() {
    const result = core.grade(exam(), state.answers);
    return `<div class="score-preview__row"><div><div class="quick-stat__label">현재 입력 기준</div><div class="score-preview__score">${core.formatScore(result.score)}<small>/100</small></div></div><div class="score-preview__counts"><span class="count-pill good">정답 ${result.correct}</span><span class="count-pill bad">오답 ${result.wrong}</span><span class="count-pill blank">미기입 ${result.blank}</span></div></div>`;
  }

  function quickStatsHtml(records) {
    const current = records.filter((record) => record.examId === state.examId).map((record) => core.enrichRecord(catalog, record));
    const scores = current.map((record) => record.score);
    const last = [...records].sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0];
    return `<div class="quick-stats">
      <div class="quick-stat"><span class="quick-stat__icon" aria-hidden="true">01</span><span class="quick-stat__label">등록 학생</span><span class="quick-stat__value">${current.length}<small>명</small></span><span class="quick-stat__hint">현재 선택 시험 · 기본 데이터 포함</span></div>
      <div class="quick-stat"><span class="quick-stat__icon" aria-hidden="true">Σ</span><span class="quick-stat__label">전체 평균</span><span class="quick-stat__value">${current.length ? core.formatScore(core.average(scores)) : '-'}<small>점</small></span><span class="quick-stat__hint">이 브라우저 기준</span></div>
      <div class="quick-stat quick-stat--wide"><span class="quick-stat__icon" aria-hidden="true">↗</span><span class="quick-stat__label">최근 생성</span><span class="quick-stat__value quick-stat__value--name">${last ? `${escape(last.school)} ${escape(last.name)}` : '아직 없음'}</span><span class="quick-stat__hint">${last ? core.formatDate(last.updatedAt || last.createdAt) : '첫 성적표를 생성해 주세요.'}</span></div>
    </div>`;
  }

  function headerHtml() {
    const currentExam = exam();
    return `<header class="site-header"><div class="site-header__inner">
      <a class="brand" href="./" aria-label="Young's Physics 성적 분석 홈"><img class="brand__logo" src="assets/youngs-physics-logo.png" alt="Young's Physics"><span class="brand__descriptor">TPL SCORE LAB</span></a>
      <nav class="top-nav" aria-label="교사 화면 주요 메뉴"><a class="top-nav__link is-active" href="#overview">대시보드</a><a class="top-nav__link" href="#student-entry">답안 입력</a><a class="top-nav__link" href="#student-records">학생 기록</a><a class="top-nav__link" href="guide.html">사용 안내</a></nav>
      <div class="header-actions"><a class="btn btn--soft btn--small" href="${escape(currentExam.problemPdf)}" target="_blank" rel="noopener"><span class="btn-symbol">Q</span>${currentExam.round}회 시험지</a><a class="btn btn--soft btn--small" href="${escape(currentExam.solutionPdf)}" target="_blank" rel="noopener"><span class="btn-symbol">A</span>${currentExam.round}회 해설</a></div>
    </div></header>`;
  }

  function teacherSidebarHtml() {
    return `<aside class="teacher-sidebar" aria-label="교사 도구 바로가기">
      <div class="teacher-sidebar__title"><span>TEACHER</span><strong>성적 분석 도구</strong></div>
      <nav class="side-nav">
        <a class="side-nav__link is-active" href="#overview"><span class="side-nav__icon">⌂</span><span>대시보드</span></a>
        <a class="side-nav__link" href="#student-entry"><span class="side-nav__icon">✎</span><span>학생 답안 입력</span></a>
        <a class="side-nav__link" href="#student-records"><span class="side-nav__icon">▤</span><span>학생 기록</span></a>
        <a class="side-nav__link" href="assets/학생답안_입력양식.csv" download><span class="side-nav__icon">↓</span><span>CSV 입력 양식</span></a>
        <a class="side-nav__link" href="guide.html"><span class="side-nav__icon">?</span><span>설치·운영 안내</span></a>
      </nav>
      <div class="teacher-sidebar__orbit" aria-hidden="true"><img src="assets/youngs-physics-mark.png" alt=""></div>
      <p class="teacher-sidebar__foot">YOUNG'S PHYSICS</p>
    </aside>`;
  }

  function formHtml() {
    const modeText = state.storageMode === 'apps-script' ? (state.backendStatus === 'connected' ? 'Google Sheet 자동 연결됨' : 'Google Sheet 누적 저장') : '브라우저 저장·링크 백업';
    return `<section id="student-entry" class="card sticky-card anchor-section">
      <div class="card__head"><div><h2>학생 답안 입력</h2><p>학교·이름·20문항 답안을 입력하세요.</p></div><span class="tag">${modeText}</span></div>
      <div class="card__body">
        <div class="field"><label for="examSelect">시험</label><select id="examSelect" class="select">${catalog.map((item) => `<option value="${escape(item.id)}"${item.id === state.examId ? ' selected' : ''}>${escape(item.title)}</option>`).join('')}</select></div>
        <div class="form-row"><div class="field"><label for="schoolInput">학교</label><input class="input" id="schoolInput" maxlength="60" placeholder="예: 한국과학영재학교" value="${escape(state.school)}"></div><div class="field"><label for="nameInput">학생 이름</label><input class="input" id="nameInput" maxlength="30" placeholder="예: 김물리" value="${escape(state.name)}"></div></div>
        <div class="field"><label for="bulkInput">답안 한 번에 붙여넣기</label><textarea class="textarea" id="bulkInput" placeholder="4 5 4 1 3 3 5 5 2 5 4 5 3 5 2 5 2 5 4 1"></textarea><small>공백·쉼표로 구분합니다. 0, X, -는 미기입입니다.</small></div>
        <div class="button-row" style="margin-top:0"><button class="btn btn--secondary btn--small" type="button" id="applyBulk">붙여넣기 적용</button><button class="btn btn--soft btn--small" type="button" id="sampleData">예시 입력</button></div>
        <div class="form-divider"></div>
        <div class="section-label"><strong>문항별 답안</strong><span>정답 +5 · 오답 -1.25 · 미기입 0</span></div>
        <div class="answer-grid" id="answerGrid">${answerGridHtml()}</div>
        <div class="score-preview" id="scorePreview">${previewHtml()}</div>
        <details style="margin-top:17px"><summary style="cursor:pointer;font-size:12px;font-weight:800;color:var(--brand)">누적 저장 방식 설정</summary>
          <div style="padding-top:13px"><div class="field"><label for="storageMode">저장 방식</label><select class="select" id="storageMode"><option value="local"${state.storageMode === 'local' ? ' selected' : ''}>브라우저 저장 + 링크 내 결과 포함</option><option value="apps-script"${state.storageMode === 'apps-script' ? ' selected' : ''}>Google Sheets + Apps Script</option></select></div>
          <div class="field${state.storageMode === 'apps-script' ? '' : ' hidden'}" id="backendField"><label for="backendUrl">Apps Script 웹 앱 URL</label><input class="input" id="backendUrl" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://script.google.com/macros/s/.../exec" value="${escape(state.backendUrl)}">${backendStatusHtml()}<small class="backend-setting-note">주소는 입력하는 즉시 이 브라우저에 저장되고, 다음 접속부터 자동으로 연결을 확인합니다. 학생 링크에는 무작위 결과 토큰과 조회용 서버 주소만 들어갑니다. <strong>WRITE_KEY는 보안을 위해 계속 현재 탭에만 임시 저장됩니다.</strong></small><div class="button-row backend-field-actions"><button class="btn btn--primary btn--small" type="button" id="pingBackend">주소 저장·연결 확인</button><button class="btn btn--soft btn--small" type="button" id="copyBackendSetup">다른 기기 설정 링크 복사</button><button class="btn btn--soft btn--small" type="button" id="forgetWriteKey">저장 키 지우기</button><button class="btn btn--ghost btn--small" type="button" id="clearBackendConnection">연결 주소 지우기</button></div></div></div>
        </details>
        <div class="button-row report-create-row"><button class="btn btn--primary btn--copy-report" type="button" id="generateReport"${state.busy ? ' disabled' : ''}><span class="btn-symbol">↗</span><span>${state.busy ? '저장·링크 복사 중…' : state.editingId ? '수정하고 분석 링크 복사' : '성적 분석 링크 생성·복사'}</span></button><button class="btn btn--soft" type="button" id="clearForm">초기화</button></div>
      </div>
    </section>`;
  }

  function statusDots(record) {
    const result = core.grade(core.getExam(catalog, record.examId), record.answers);
    return result.questionResults.map((item) => `<i class="status-dot ${item.status}" title="${item.no}번 ${item.status}"></i>`).join('');
  }

  function recordRows(records) {
    const query = core.normalizeKey(state.search);
    const filtered = records
      .filter((record) => !query || core.normalizeKey(`${record.school} ${record.name} ${record.examId}`).includes(query))
      .sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    if (!filtered.length) return '';
    return filtered.map((record) => {
      const enriched = core.enrichRecord(catalog, record);
      return `<tr data-id="${escape(record.id)}"><td><span class="student-name">${escape(record.name)}</span><span class="student-school">${escape(record.school)}</span></td><td>${escape(enriched.examTitle || record.examId)}</td><td class="score-cell">${core.formatScore(enriched.score)}</td><td><div class="status-dots">${statusDots(record)}</div></td><td>${core.formatDate(record.updatedAt || record.createdAt)}</td><td><div class="row-actions"><button class="btn btn--soft btn--small" data-action="edit">수정</button><button class="btn btn--primary btn--small" data-action="copy">링크 복사</button><button class="btn btn--secondary btn--small" data-action="open">열기</button><button class="btn btn--danger btn--small" data-action="delete">삭제</button></div></td></tr>`;
    }).join('');
  }

  function recordsHtml(records) {
    const rows = recordRows(records);
    return `<section id="student-records" class="card anchor-section"><div class="card__head"><div><h2>학생 기록과 결과 링크</h2><p>같은 학교·이름·시험을 다시 입력하면 기존 기록을 갱신합니다.</p></div></div><div class="card__body">
      <div class="table-tools"><input id="recordSearch" class="input table-tools__search" type="search" placeholder="학교 또는 학생 이름 검색" value="${escape(state.search)}"><div class="tool-group"><button class="btn btn--soft btn--small" id="exportCsv">CSV</button><button class="btn btn--soft btn--small" id="exportJson">JSON 백업</button>${seedRecords.length ? '<button class="btn btn--soft btn--small" id="restoreSeedData">1·2·3·4·5회 기존 데이터 다시 불러오기</button>' : ''}<button class="btn btn--soft btn--small" id="importData">가져오기</button><input id="importFile" class="hidden" type="file" accept=".csv,.json,text/csv,application/json"></div></div>
      ${rows ? `<div class="table-wrap"><table><thead><tr><th>학생</th><th>시험</th><th>점수</th><th>문항 결과</th><th>수정 시각</th><th><span class="sr-only">작업</span></th></tr></thead><tbody id="recordBody">${rows}</tbody></table></div>` : `<div class="empty-state"><div class="empty-state__mark">◎</div><strong>${state.search ? '검색 결과가 없습니다.' : '아직 학생 기록이 없습니다.'}</strong><span>${state.search ? '다른 이름이나 학교를 검색해 보세요.' : '첫 학생의 답안을 입력하면 전체 평균과 문항별 정답률이 계산됩니다.'}</span></div>`}
      <div class="notice"><strong>개인정보와 링크 보안</strong><br>결과 링크는 비밀번호가 없는 ‘소지자 링크’입니다. 링크를 아는 사람은 학생 정보를 볼 수 있으므로 공개 게시판에는 올리지 마세요. 브라우저 모드의 전체 통계는 현재 기기에 저장된 기록만 기준으로 합니다.</div>
      <div class="source-links"><a class="btn btn--secondary btn--small" href="assets/학생답안_입력양식.csv" download>CSV 입력 양식</a><a class="btn btn--secondary btn--small" href="assets/1회v3_학생기록_사이트반영.csv" download>1회 데이터 CSV</a><a class="btn btn--secondary btn--small" href="assets/2회v2_학생기록_사이트반영.csv" download>2회 데이터 CSV</a><a class="btn btn--secondary btn--small" href="assets/3회_학생기록_사이트반영.csv" download>3회 데이터 CSV</a><a class="btn btn--secondary btn--small" href="assets/4회_학생기록_사이트반영.csv" download>4회 데이터 CSV</a><a class="btn btn--secondary btn--small" href="assets/5회_학생기록_사이트반영.csv" download>5회 데이터 CSV</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_1회.pdf" target="_blank">1회 시험지</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_1회_해설.pdf" target="_blank">1회 해설</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_2회.pdf" target="_blank">2회 시험지</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_2회_해설.pdf" target="_blank">2회 해설</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_3회.pdf" target="_blank">3회 시험지</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_3회_해설.pdf" target="_blank">3회 해설</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_4회.pdf" target="_blank">4회 시험지</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_4회_해설.pdf" target="_blank">4회 해설</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_5회.pdf" target="_blank">5회 시험지</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_5회_해설.pdf" target="_blank">5회 해설</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_6회.pdf" target="_blank">6회 시험지</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_6회_해설.pdf" target="_blank">6회 해설</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_7회.pdf" target="_blank">7회 시험지</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_7회_해설.pdf" target="_blank">7회 해설</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_8회.pdf" target="_blank">8회 시험지</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_8회_해설.pdf" target="_blank">8회 해설</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_9회.pdf" target="_blank">9회 시험지</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_9회_해설.pdf" target="_blank">9회 해설</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_10회.pdf" target="_blank">10회 시험지</a><a class="btn btn--secondary btn--small" href="assets/TPL_중급_모의고사_10회_해설.pdf" target="_blank">10회 해설</a></div>
    </div></section>`;
  }

  function pageHtml() {
    const records = loadRecords();
    return `${headerHtml()}<div class="admin-workspace">${teacherSidebarHtml()}<main class="container">
      <section id="overview" class="admin-hero anchor-section"><div class="hero-panel"><div class="hero-panel__brand"><img src="assets/youngs-physics-mark.png" alt=""><span>YOUNG'S PHYSICS · TPL SCORE LAB</span></div><p class="eyebrow">TEACHER CONSOLE</p><h1>답안을 한 번 입력하면<br>학생별 성적표와 학습 분석 링크가 완성됩니다.</h1><p>자동 채점, 전체 성적 비교, 문항별 정답률, 이전 회차 추세, 강점·취약점, 오답 해설·공식, 직접 풀고 채점하는 동형 문제를 하나의 브랜드 리포트로 제공합니다.</p><div class="hero-badges"><span class="hero-badge">정답 +5점</span><span class="hero-badge">오답 -1.25점</span><span class="hero-badge">미기입 0점</span><span class="hero-badge">학생별 고유 링크</span><span class="hero-badge">PDF·Word 출력</span></div></div>${quickStatsHtml(records)}</section>
      <section class="admin-grid">${formHtml()}${recordsHtml(records)}</section>
      <div class="notice source-correction"><strong>${escape(exam().shortTitle || exam().title)} 자료 기준 및 해설 메모</strong><br>${escape(exam().sourceNotice)}</div>
    </main></div><footer class="site-footer"><div class="site-footer__inner"><img src="assets/youngs-physics-mark.png" alt=""><span>Young's Physics · TPL Score Lab</span><small>GitHub Pages 정적 사이트 + 선택형 Google Sheets 저장</small></div></footer>`;
  }

  function render() {
    app.innerHTML = pageHtml();
    bindEvents();
  }

  function refreshAnswerInputs() {
    document.querySelectorAll('.answer-input').forEach((input) => {
      const index = Number(input.dataset.index);
      const value = state.answers[index] === '' ? '' : String(state.answers[index]);
      if (document.activeElement !== input) input.value = value;
      input.closest('.answer-card')?.classList.toggle('is-filled', Boolean(value));
    });
  }

  function updatePreviewOnly(refreshGrid = false) {
    const grid = document.getElementById('answerGrid');
    if (grid && refreshGrid) {
      grid.innerHTML = answerGridHtml();
      bindAnswerInputs();
    } else {
      refreshAnswerInputs();
    }
    const preview = document.getElementById('scorePreview');
    if (preview) preview.innerHTML = previewHtml();
  }

  function focusAnswer(index) {
    const input = document.querySelector(`.answer-input[data-index="${index}"]`);
    if (input) { input.focus(); input.select(); }
  }

  function setAnswerValue(index, rawValue) {
    const normalized = core.normalizeAnswer(rawValue);
    state.answers[index] = normalized === null ? '' : normalized;
  }

  function bindAnswerInputs() {
    document.querySelectorAll('.answer-input').forEach((input) => {
      input.addEventListener('input', (event) => {
        const index = Number(input.dataset.index);
        const raw = event.target.value;
        const parsedMany = core.parseAnswerText(raw, exam().answerCount);
        if (parsedMany.length > 1) {
          state.answers = core.normalizeAnswers(parsedMany, exam().answerCount);
          updatePreviewOnly(true);
          focusAnswer(Math.min(parsedMany.length, exam().answerCount) - 1);
          return;
        }
        setAnswerValue(index, raw);
        input.value = state.answers[index] === '' ? '' : String(state.answers[index]);
        updatePreviewOnly(false);
        if (state.answers[index] !== '' && index < exam().answerCount - 1) focusAnswer(index + 1);
      });
      input.addEventListener('keydown', (event) => {
        const index = Number(input.dataset.index);
        if (event.key === 'ArrowRight' || event.key === 'Enter') { event.preventDefault(); focusAnswer(Math.min(index + 1, exam().answerCount - 1)); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); focusAnswer(Math.max(index - 1, 0)); }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          if (input.value === '') { state.answers[index] = ''; updatePreviewOnly(false); }
        }
        if (/^[0xX\-]$/.test(event.key)) {
          event.preventDefault(); state.answers[index] = ''; input.value = ''; updatePreviewOnly(false); if (index < exam().answerCount - 1) focusAnswer(index + 1);
        }
      });
      input.addEventListener('paste', (event) => {
        const text = event.clipboardData?.getData('text') || '';
        const parsed = core.parseAnswerText(text, exam().answerCount);
        if (parsed.length > 1) {
          event.preventDefault(); state.answers = core.normalizeAnswers(parsed, exam().answerCount); updatePreviewOnly(true); focusAnswer(Math.min(parsed.length, exam().answerCount) - 1);
        }
      });
    });
    document.querySelectorAll('.answer-clear').forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      state.answers[index] = '';
      updatePreviewOnly(false);
      focusAnswer(index);
    }));
  }

  function bindEvents() {
    bindAnswerInputs();
    document.getElementById('examSelect')?.addEventListener('change', (event) => {
      state.examId = event.target.value; state.answers = Array(core.getExam(catalog, state.examId).answerCount).fill(''); render();
    });
    document.getElementById('schoolInput')?.addEventListener('input', (event) => { state.school = event.target.value; });
    document.getElementById('nameInput')?.addEventListener('input', (event) => { state.name = event.target.value; });
    document.getElementById('applyBulk')?.addEventListener('click', () => {
      const input = document.getElementById('bulkInput');
      const parsed = core.parseAnswerText(input.value, exam().answerCount);
      if (!parsed.length) { toast('답안을 인식하지 못했습니다.', 'error'); return; }
      state.answers = core.normalizeAnswers(parsed, exam().answerCount);
      updatePreviewOnly(true);
      toast(`${Math.min(parsed.length, exam().answerCount)}개 답안을 적용했습니다.`, 'good');
    });
    document.getElementById('sampleData')?.addEventListener('click', () => {
      state.school = '예시고등학교'; state.name = '김물리';
      state.answers = [...exam().answerKey]; state.answers[2] = 2; state.answers[6] = ''; state.answers[9] = 3; state.answers[13] = 4; state.answers[17] = '';
      render(); toast('기능 확인용 예시 답안을 넣었습니다.');
    });
    document.getElementById('storageMode')?.addEventListener('change', (event) => {
      state.storageMode = event.target.value;
      document.getElementById('backendField')?.classList.toggle('hidden', state.storageMode !== 'apps-script');
      saveSettings();
      if (state.storageMode === 'apps-script') autoConnectBackend();
    });
    document.getElementById('backendUrl')?.addEventListener('input', (event) => {
      state.backendUrl = String(event.target.value || '').trim();
      state.storageMode = 'apps-script';
      state.backendStatus = isValidBackendUrl(state.backendUrl) ? 'saved' : (state.backendUrl ? 'error' : 'idle');
      state.backendStatusMessage = isValidBackendUrl(state.backendUrl)
        ? '주소가 이 브라우저에 저장되었습니다. 연결 확인을 눌러 주세요.'
        : (state.backendUrl ? 'Apps Script의 /exec 주소 형식을 확인해 주세요.' : '');
      saveSettings();
      setBackendStatus(state.backendStatus, state.backendStatusMessage);
    });
    document.getElementById('backendUrl')?.addEventListener('change', (event) => {
      state.backendUrl = normalizeBackendUrl(event.target.value);
      event.target.value = state.backendUrl;
      saveSettings();
    });
    document.getElementById('pingBackend')?.addEventListener('click', () => connectBackend({ force: true }));
    document.getElementById('copyBackendSetup')?.addEventListener('click', async () => {
      syncBackendUrlFromField();
      if (!isValidBackendUrl(state.backendUrl)) { toast('먼저 올바른 Apps Script /exec 주소를 입력해 주세요.', 'error'); return; }
      await copyText(backendSetupLink());
      toast('다른 기기에서 한 번 열면 자동 연결되는 설정 링크를 복사했습니다.', 'good');
    });
    document.getElementById('clearBackendConnection')?.addEventListener('click', () => {
      if (state.backendUrl && !confirm('이 브라우저에 저장된 Apps Script 연결 주소를 지울까요? 학생 기록은 삭제되지 않습니다.')) return;
      state.backendUrl = '';
      state.backendLastVerifiedAt = '';
      state.backendStatus = 'idle';
      state.backendStatusMessage = '';
      state.storageMode = 'local';
      lastAutoConnectUrl = '';
      saveSettings();
      render();
      toast('Apps Script 연결 주소를 지우고 브라우저 저장 방식으로 전환했습니다.');
    });
    document.getElementById('forgetWriteKey')?.addEventListener('click', () => {
      sessionStorage.removeItem('tpl-backend-write-key');
      toast('이 탭에 임시 저장된 Google Sheets 저장 키를 지웠습니다.');
    });
    document.getElementById('generateReport')?.addEventListener('click', generate);
    document.getElementById('clearForm')?.addEventListener('click', () => { state.school=''; state.name=''; state.answers=Array(exam().answerCount).fill(''); state.editingId=''; render(); });
    bindRecordEvents();
  }

  function bindRecordEvents() {
    document.getElementById('recordSearch')?.addEventListener('input', (event) => { state.search = event.target.value; renderRecordsArea(); });
    document.getElementById('recordBody')?.addEventListener('click', recordAction);
    document.getElementById('exportCsv')?.addEventListener('click', exportCsv);
    document.getElementById('exportJson')?.addEventListener('click', exportJson);
    document.getElementById('restoreSeedData')?.addEventListener('click', () => {
      const result = ensureSeedRecords(true);
      render();
      toast(result.added || result.updated ? `기존 성적 데이터 ${result.added}명 추가, ${result.updated}명 갱신했습니다.` : '기존 1·2·3·4·5회 데이터가 이미 모두 들어 있습니다.', 'good');
    });
    document.getElementById('importData')?.addEventListener('click', () => document.getElementById('importFile')?.click());
    document.getElementById('importFile')?.addEventListener('change', importFile);
  }

  function renderRecordsArea() {
    const card = document.querySelector('.admin-grid > section.card:last-child');
    if (card) { card.outerHTML = recordsHtml(loadRecords()); bindRecordEvents(); }
  }

  function validateStudent() {
    if (!state.school.trim()) { toast('학교를 입력해 주세요.', 'error'); document.getElementById('schoolInput')?.focus(); return false; }
    if (!state.name.trim()) { toast('학생 이름을 입력해 주세요.', 'error'); document.getElementById('nameInput')?.focus(); return false; }
    if (state.storageMode === 'apps-script') {
      syncBackendUrlFromField();
      if (!isValidBackendUrl(state.backendUrl)) { toast('Apps Script의 /exec URL을 입력해 주세요.', 'error'); return false; }
    }
    return true;
  }

  async function generate() {
    if (state.busy || !validateStudent()) return;
    state.busy = true; render();
    try {
      let record = upsertRecord({
        id: state.editingId || core.makeId('local'), examId: state.examId, round: exam().round,
        school: state.school.trim(), name: state.name.trim(), answers: core.normalizeAnswers(state.answers, exam().answerCount),
        createdAt: new Date().toISOString()
      });
      let records = loadRecords();
      let snapshot = core.buildSnapshot(catalog, record, records);
      let serverId = record.serverId || '';
      let serverWorked = false;
      if (state.storageMode === 'apps-script') {
        saveSettings();
        try {
          const serverPayload = { examId: record.examId, round: record.round, school: record.school, name: record.name, answers: record.answers, createdAt: record.createdAt };
          const response = await requestWithWriteKey({ action: 'save', payload: JSON.stringify(serverPayload) });
          serverId = response.token || response.id || response.report?.record?.id || serverId;
          if (serverId) record = upsertRecord({ ...record, serverId });
          if (response.report?.record) snapshot = response.report;
          serverWorked = true;
        } catch (error) {
          toast(`Google Sheet 저장 실패: ${error.message} 브라우저 백업 링크로 생성합니다.`, 'error');
        }
      }
      const url = reportUrl(snapshot, serverWorked ? serverId : '');
      let copied = false;
      try {
        await copyText(url);
        copied = true;
      } catch (copyError) {
        console.warn('생성된 링크 자동 복사 실패', copyError);
      }
      openLinkModal(url, snapshot, serverWorked, copied);
      state.editingId = record.id;
      toast(copied ? `${record.name} 학생의 성적 분석 링크를 생성하고 복사했습니다.` : `${record.name} 학생의 성적 분석 링크를 생성했습니다. 팝업의 링크 복사 버튼을 눌러 주세요.`, copied ? 'good' : '');
    } catch (error) {
      console.error(error); toast(`리포트 생성 중 오류: ${error.message}`, 'error');
    } finally {
      state.busy = false; render();
    }
  }

  function openLinkModal(url, snapshot, serverWorked, copied = false) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="linkModalTitle"><div class="modal__head"><div><h3 id="linkModalTitle">${copied ? '성적 분석 링크 복사 완료' : `${escape(snapshot.record.name)} 학생 전용 링크`}</h3><p style="margin:5px 0 0;color:var(--muted);font-size:12px">${escape(snapshot.record.school)} · ${escape(snapshot.record.examTitle)}</p></div><button class="close-button" aria-label="닫기">×</button></div><div class="modal__body"><div class="link-copy-alert ${copied ? 'is-copied' : 'is-manual'}"><strong>${copied ? '바로 붙여넣을 수 있게 클립보드에 복사했습니다.' : '브라우저가 자동 복사를 막았습니다.'}</strong><span>${copied ? '카카오톡, 문자, 이메일 등에 그대로 붙여넣어 공유하면 됩니다.' : '아래의 큰 링크 복사 버튼을 한 번 눌러 주세요.'}</span></div><div class="score-preview"><div class="score-preview__row"><div><span class="quick-stat__label">산출 점수</span><div class="score-preview__score">${core.formatScore(snapshot.record.score)}<small>/100</small></div></div><div class="score-preview__counts"><span class="count-pill good">정답 ${snapshot.record.correct}</span><span class="count-pill bad">오답 ${snapshot.record.wrong}</span><span class="count-pill blank">미기입 ${snapshot.record.blank}</span></div></div></div><div class="link-box">${escape(url)}</div><div class="button-row link-modal-actions"><button class="btn btn--primary" id="modalCopy"><span class="btn-symbol">↗</span>링크 다시 복사</button><a class="btn btn--secondary" href="${escape(url)}" target="_blank" rel="noopener">성적표 열기</a></div><p style="font-size:11px;color:var(--muted)">${serverWorked ? 'Google Sheet에서 무작위 토큰으로 결과와 최신 누적 통계를 불러옵니다. 링크를 아는 사람은 별도 로그인 없이 학생 리포트를 볼 수 있습니다.' : '링크 안에 현재 성적과 통계 백업이 포함되어 있어 다른 기기에서도 열 수 있습니다.'}</p></div></div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('.close-button')) close(); });
    modal.querySelector('#modalCopy').addEventListener('click', async () => { await copyText(url); toast('학생 성적 분석 링크를 복사했습니다.', 'good'); });
  }

  async function recordAction(event) {
    const button = event.target.closest('button[data-action]');
    const row = button?.closest('tr[data-id]');
    if (!button || !row) return;
    const record = loadRecords().find((item) => item.id === row.dataset.id);
    if (!record) return;
    if (button.dataset.action === 'edit') {
      state.examId=record.examId; state.school=record.school; state.name=record.name; state.answers=core.normalizeAnswers(record.answers, core.getExam(catalog, record.examId).answerCount); state.editingId=record.id; render(); window.scrollTo({top:0,behavior:'smooth'}); toast('학생 기록을 입력 칸에 불러왔습니다.');
    }
    if (button.dataset.action === 'copy') {
      const snapshot = core.buildSnapshot(catalog, record, loadRecords());
      const url = reportUrl(snapshot, record.serverId || '');
      try {
        await copyText(url);
        toast(`${record.name} 학생 성적 분석 링크를 복사했습니다.`, 'good');
      } catch (error) {
        toast(`링크 복사 실패: ${error.message}`, 'error');
      }
    }
    if (button.dataset.action === 'open') {
      const snapshot = core.buildSnapshot(catalog, record, loadRecords());
      window.open(reportUrl(snapshot, record.serverId || ''), '_blank', 'noopener');
    }
    if (button.dataset.action === 'delete') {
      const hasServerRecord = Boolean(record.serverId && state.backendUrl);
      const message = hasServerRecord
        ? `${record.school} ${record.name} 학생의 브라우저 기록과 Google Sheet 결과를 함께 삭제할까요?\n기존 학생 링크는 더 이상 열리지 않습니다.`
        : `${record.school} ${record.name} 학생의 이 브라우저 기록을 삭제할까요?`;
      if (!confirm(message)) return;
      if (hasServerRecord) {
        try { await requestWithWriteKey({ action: 'delete', id: record.serverId }); }
        catch (error) { toast(`서버 삭제 실패: ${error.message}`, 'error'); return; }
      }
      deleteRecord(record.id); render(); toast(hasServerRecord ? '브라우저와 서버 기록을 삭제했습니다.' : '브라우저 기록을 삭제했습니다.');
    }
  }

  function exportCsv() {
    const records = loadRecords();
    if (!records.length) { toast('내보낼 기록이 없습니다.', 'error'); return; }
    download(core.toCsv(records, catalog), 'text/csv;charset=utf-8', `TPL_학생기록_${new Date().toISOString().slice(0,10)}.csv`);
  }

  function exportJson() {
    const records = loadRecords();
    if (!records.length) { toast('백업할 기록이 없습니다.', 'error'); return; }
    download(JSON.stringify({version:1,exportedAt:new Date().toISOString(),records}, null, 2), 'application/json;charset=utf-8', `TPL_학생기록_백업_${new Date().toISOString().slice(0,10)}.json`);
  }

  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value=''; if (!file) return;
    try {
      const text = await file.text();
      let incoming;
      if (/\.csv$/i.test(file.name)) incoming = core.csvToRecords(text, catalog);
      else { const parsed = JSON.parse(text); incoming = Array.isArray(parsed) ? parsed : parsed.records; }
      if (!Array.isArray(incoming)) throw new Error('학생 기록 배열이 없습니다.');
      let count=0;
      incoming.forEach((record) => { if (record?.school && record?.name && core.getExam(catalog, record.examId)) { upsertRecord({...record,answers:core.normalizeAnswers(record.answers,core.getExam(catalog,record.examId).answerCount)}); count++; } });
      render(); toast(`${count}개 학생 기록을 가져왔습니다.`, 'good');
    } catch (error) { toast(`파일을 가져오지 못했습니다: ${error.message}`, 'error'); }
  }

  loadSettings();
  const seedResult = ensureSeedRecords(false);
  if (seedResult.added) console.info(`기본 1·2·3·4·5회 데이터 ${seedResult.added}명을 불러왔습니다.`);
  render();
  autoConnectBackend();
})();
