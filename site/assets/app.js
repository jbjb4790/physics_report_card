(function () {
  'use strict';

  const core = window.TPLCore;
  const catalog = window.EXAM_CATALOG || [];
  const config = window.APP_CONFIG || {};
  const SETTINGS_KEY = `${config.storageKey || 'tpl-score-report-records-v1'}-settings`;
  const SEED_KEY = `${config.storageKey || 'tpl-score-report-records-v1'}-seed-version`;
  const BACKEND_SETUP_PARAM = config.backendSetupParam || 'appsScript';
  const WRITE_KEY_STORAGE_KEY = `${config.storageKey || 'tpl-score-report-records-v1'}-backend-write-key`;
  const seedMetadata = window.SEED_RECORDS_METADATA || {};
  const seedRecords = Array.isArray(window.SEED_RECORDS) ? window.SEED_RECORDS : [];
  const app = document.getElementById('app');
  const circled = ['', '①', '②', '③', '④', '⑤'];
  const normalizeSchool = (value) => typeof core.normalizeSchool === 'function'
    ? core.normalizeSchool(value)
    : (core.normalizeText(value) || '미입력');

  function recordIdentity(record) {
    const examId = core.normalizeText(record?.examId || '');
    const school = normalizeSchool(record?.school);
    const name = core.normalizeText(record?.name);
    return `${examId}::${core.studentKey({ school, name })}`;
  }

  function recordTimestamp(record) {
    const value = Date.parse(String(record?.updatedAt || record?.createdAt || ''));
    return Number.isFinite(value) ? value : 0;
  }

  function serverLocalId(serverId) {
    const token = String(serverId || '').trim();
    return token ? `server-${token}` : '';
  }

  function normalizeLocalRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const currentExam = core.getExam(catalog, raw.examId || state.examId);
    const name = core.normalizeText(raw.name);
    if (!currentExam || !name) return null;
    const serverId = String(raw.serverId || '').trim();
    return {
      ...raw,
      examId: currentExam.id,
      round: Number(raw.round || currentExam.round || 0),
      school: normalizeSchool(raw.school),
      name,
      answers: core.normalizeAnswers(raw.answers, currentExam.answerCount),
      serverId,
      createdAt: raw.createdAt || raw.updatedAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString()
    };
  }

  function repairRecords(records) {
    const byIdentity = new Map();
    (records || []).map(normalizeLocalRecord).filter(Boolean).forEach((record) => {
      const identity = recordIdentity(record);
      const previous = byIdentity.get(identity);
      if (!previous) {
        byIdentity.set(identity, record);
        return;
      }
      const newer = recordTimestamp(record) >= recordTimestamp(previous) ? record : previous;
      const older = newer === record ? previous : record;
      byIdentity.set(identity, {
        ...older,
        ...newer,
        serverId: newer.serverId || older.serverId || '',
        createdAt: older.createdAt || newer.createdAt,
        updatedAt: newer.updatedAt || older.updatedAt
      });
    });

    const usedIds = new Set();
    const serverOwners = new Map();
    const repaired = [];
    byIdentity.forEach((raw, identity) => {
      const record = { ...raw };
      let serverId = String(record.serverId || '').trim();
      if (serverId) {
        const owner = serverOwners.get(serverId);
        if (owner && owner !== identity) {
          // A stale browser ID/token must never make two different students share one link.
          // Clear the later token so the next open/copy operation re-saves this exact student.
          serverId = '';
          record.serverId = '';
          record.integrityWarning = 'duplicate-server-token-cleared';
        } else {
          serverOwners.set(serverId, identity);
        }
      }

      let id = serverId ? serverLocalId(serverId) : String(record.id || '').trim();
      if (!id || usedIds.has(id)) id = core.makeId('local');
      usedIds.add(id);
      repaired.push({ ...record, id, serverId });
    });
    return repaired;
  }

  function recordRef(record) {
    const serverId = String(record?.serverId || '').trim();
    return serverId ? `server:${serverId}` : `local:${String(record?.id || '').trim()}`;
  }

  function findRecordByRef(records, ref) {
    const value = String(ref || '');
    if (value.startsWith('server:')) {
      const serverId = value.slice(7);
      return (records || []).find((record) => String(record.serverId || '') === serverId) || null;
    }
    if (value.startsWith('local:')) {
      const id = value.slice(6);
      return (records || []).find((record) => String(record.id || '') === id) || null;
    }
    return null;
  }

  function currentInputIdentity() {
    return recordIdentity({ examId: state.examId, school: state.school, name: state.name });
  }

  function resolveExistingRecord(records, editingId, inputRecord) {
    const identity = recordIdentity(inputRecord);
    const editingCandidate = editingId ? (records || []).find((item) => item.id === editingId) : null;
    if (editingCandidate && recordIdentity(editingCandidate) === identity) return editingCandidate;
    return (records || []).find((item) => recordIdentity(item) === identity) || null;
  }

  function detachEditingIfIdentityChanged() {
    if (!state.editingId) return;
    const records = loadRecords();
    const editing = records.find((record) => record.id === state.editingId);
    const original = state.editingIdentity || (editing ? recordIdentity(editing) : '');
    if (!editing || !original || currentInputIdentity() !== original) {
      state.editingId = '';
      state.editingIdentity = '';
      document.querySelectorAll('.js-generate-report .entry-action-dock__button-text strong, .js-generate-report > span:last-child')
        .forEach((node) => { node.textContent = generateActionLabel(); });
    }
  }

  function assertSnapshotMatchesRecord(snapshot, expectedRecord) {
    const actual = snapshot?.record;
    if (!actual) {
      const error = new Error('서버가 학생 성적 데이터를 반환하지 않았습니다.');
      error.code = 'REPORT_IDENTITY_MISSING';
      throw error;
    }
    if (recordIdentity(actual) !== recordIdentity(expectedRecord)) {
      const error = new Error(`요청한 ${expectedRecord.name} 학생과 서버가 반환한 ${actual.name || '다른 학생'}의 정보가 일치하지 않습니다. 잘못된 링크 생성을 차단했습니다. 서버 기록을 새로고침한 뒤 다시 시도해 주세요.`);
      error.code = 'REPORT_IDENTITY_MISMATCH';
      throw error;
    }
    return snapshot;
  }

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
    writeKey: '',
    serverSyncStatus: 'idle',
    serverSyncMessage: '',
    serverRecordCount: 0,
    serverLastSyncedAt: '',
    serverSyncBusy: false,
    storageSettingsOpen: false,
    search: '',
    busy: false,
    busyMessage: '',
    editingId: '',
    editingIdentity: ''
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

  function readWriteKey() {
    try {
      const persistent = localStorage.getItem(WRITE_KEY_STORAGE_KEY) || '';
      const legacySession = sessionStorage.getItem('tpl-backend-write-key') || '';
      const value = String(persistent || legacySession || '').trim();
      if (value && !persistent) localStorage.setItem(WRITE_KEY_STORAGE_KEY, value);
      if (value) sessionStorage.setItem('tpl-backend-write-key', value);
      return value;
    } catch (error) {
      console.warn('Google Sheets 저장 키를 읽지 못했습니다.', error);
      return '';
    }
  }

  function saveWriteKey(value) {
    const normalized = String(value || '').trim();
    state.writeKey = normalized;
    try {
      if (normalized) {
        localStorage.setItem(WRITE_KEY_STORAGE_KEY, normalized);
        sessionStorage.setItem('tpl-backend-write-key', normalized);
      } else {
        localStorage.removeItem(WRITE_KEY_STORAGE_KEY);
        sessionStorage.removeItem('tpl-backend-write-key');
      }
    } catch (error) {
      console.warn('Google Sheets 저장 키를 저장하지 못했습니다.', error);
    }
    return normalized;
  }

  function focusWriteKeyField(message = '') {
    state.storageSettingsOpen = true;
    const details = document.getElementById('storageSettings');
    if (details) details.open = true;
    const input = document.getElementById('backendWriteKey');
    if (input) {
      input.value = state.writeKey || '';
      window.setTimeout(() => input.focus(), 0);
    }
    if (message) toast(message, 'error');
  }

  function loadSettings() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch (error) {
      console.warn('설정을 읽지 못했습니다.', error);
    }

    state.writeKey = readWriteKey();

    const setupUrl = setupBackendUrlFromLocation();
    const storedUrl = normalizeBackendUrl(saved.backendUrl || '');
    const configuredUrl = normalizeBackendUrl(config.backendUrl || '');
    const validCandidate = [setupUrl, storedUrl, configuredUrl].find(isValidBackendUrl);
    state.backendUrl = validCandidate || setupUrl || storedUrl || configuredUrl || '';
    state.backendLastVerifiedAt = saved.backendLastVerifiedAt || '';
    state.serverLastSyncedAt = saved.serverLastSyncedAt || '';
    state.serverRecordCount = Number(saved.serverRecordCount || 0);
    state.serverSyncStatus = state.serverLastSyncedAt ? 'synced' : 'idle';
    state.serverSyncMessage = state.serverLastSyncedAt
      ? '이 기기에 마지막으로 동기화한 Google Sheets 학생 기록입니다.'
      : '';

    const requireBackend = Boolean(config.backendRequiredForSaves && isValidBackendUrl(state.backendUrl));
    if (requireBackend || setupUrl) state.storageMode = 'apps-script';
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
        serverLastSyncedAt: state.serverLastSyncedAt || '',
        serverRecordCount: Number(state.serverRecordCount || 0),
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
    return repairRecords(readStoredRecords());
  }

  function saveRecords(records) {
    localStorage.setItem(config.storageKey, JSON.stringify(repairRecords(records || [])));
  }

  function repairStoredRecords() {
    const before = readStoredRecords();
    const after = repairRecords(before);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      localStorage.setItem(config.storageKey, JSON.stringify(after));
      console.info(`학생 기록 식별자 ${before.length}개를 점검하고 중복 ID를 복구했습니다.`);
    }
    return after;
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
          school: normalizeSchool(record.school || seedMetadata.schoolFallback),
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
    const normalized = normalizeLocalRecord(record);
    if (!normalized) throw new Error('저장할 학생 기록이 올바르지 않습니다.');
    const identity = recordIdentity(normalized);
    const serverId = String(normalized.serverId || '').trim();
    let index = serverId
      ? records.findIndex((item) => String(item.serverId || '') === serverId)
      : -1;
    if (index < 0) index = records.findIndex((item) => recordIdentity(item) === identity);
    const now = new Date().toISOString();

    if (index >= 0) {
      const previous = records[index];
      const nextServerId = serverId || previous.serverId || '';
      records[index] = {
        ...previous,
        ...normalized,
        id: nextServerId ? serverLocalId(nextServerId) : (previous.id || normalized.id || core.makeId('local')),
        serverId: nextServerId,
        createdAt: previous.createdAt || normalized.createdAt || now,
        updatedAt: now
      };
      saveRecords(records);
      return loadRecords().find((item) => recordIdentity(item) === identity) || records[index];
    }

    const created = {
      ...normalized,
      id: serverId ? serverLocalId(serverId) : (normalized.id || core.makeId('local')),
      createdAt: normalized.createdAt || now,
      updatedAt: now
    };
    records.push(created);
    saveRecords(records);
    return loadRecords().find((item) => recordIdentity(item) === identity) || created;
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
  let serverSyncRequest = null;
  let serverSyncTimer = null;
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
    const { silent = false, force = false, syncRecords = true } = options;
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
      .then(async (response) => {
        state.backendLastVerifiedAt = new Date().toISOString();
        state.backendStatus = 'connected';
        state.backendStatusMessage = response.message || 'Apps Script 서버와 연결되었습니다.';
        saveSettings();
        setBackendStatus('connected', state.backendStatusMessage);
        if (!silent) toast(response.message || 'Apps Script 서버 연결에 성공했습니다.', 'good');

        if (syncRecords && config.syncServerRecordsOnLoad !== false) {
          const key = state.writeKey || readWriteKey();
          if (key) await syncServerRecords({ silent: true, force: true });
          else {
            state.serverSyncStatus = 'needs-key';
            state.serverSyncMessage = '다른 컴퓨터의 학생 기록을 불러오려면 이 기기에서 Google Sheets 저장 키를 한 번 입력하세요.';
            renderRecordsArea();
          }
        }
        return true;
      })
      .catch((error) => {
        state.backendStatus = 'error';
        state.backendStatusMessage = error.message;
        state.serverSyncStatus = 'error';
        state.serverSyncMessage = error.message;
        setBackendStatus('error', error.message);
        renderRecordsArea();
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
      if (typeof core.identityFingerprint === 'function') hash.set('k', core.identityFingerprint(snapshot.record));
    } else {
      hash.set(config.reportHashKey || 'report', core.encodePayload(snapshot));
    }
    url.hash = hash.toString();
    return url.href;
  }

  async function requestWithWriteKey(params) {
    const writeKey = state.writeKey || readWriteKey();
    if (!writeKey) {
      const error = new Error('누적 저장 방식 설정에서 Google Sheets 저장 키를 한 번 입력해 주세요. 입력한 키는 이 교사 기기에 저장되어 다음 제출부터 다시 묻지 않습니다.');
      error.code = 'WRITE_KEY_NOT_SAVED';
      throw error;
    }
    try {
      return await jsonp(state.backendUrl, { ...params, writeKey });
    } catch (error) {
      if (error.code === 'INVALID_WRITE_KEY') {
        saveWriteKey('');
        const input = document.getElementById('backendWriteKey');
        if (input) input.value = '';
        error.message = '저장된 Google Sheets 저장 키가 올바르지 않습니다. 누적 저장 방식 설정에서 키를 다시 입력해 주세요.';
      }
      throw error;
    }
  }


  function normalizeServerReport(item) {
    const raw = item?.record || item?.report?.record || null;
    if (!raw) return null;
    const currentExam = core.getExam(catalog, raw.examId);
    const normalizedName = core.normalizeText(raw.name);
    if (!currentExam || !normalizedName) return null;
    const serverId = String(item.token || raw.serverId || raw.id || '').trim();
    if (!serverId) return null;
    return {
      ...raw,
      id: serverLocalId(serverId),
      serverId,
      examId: currentExam.id,
      round: Number(raw.round || currentExam.round || 0),
      school: normalizeSchool(raw.school),
      name: normalizedName,
      answers: core.normalizeAnswers(raw.answers, currentExam.answerCount),
      createdAt: raw.createdAt || raw.updatedAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
      source: 'Google Sheets'
    };
  }

  function mergeServerReports(reports) {
    const incoming = (reports || []).map(normalizeServerReport).filter(Boolean);
    const serverTokens = new Set(incoming.map((record) => String(record.serverId)));
    let records = loadRecords().filter((record) => !record.serverId || serverTokens.has(String(record.serverId)));
    let added = 0;
    let updated = 0;

    incoming.forEach((record) => {
      let index = records.findIndex((item) => String(item.serverId || '') === String(record.serverId || ''));
      if (index < 0) index = records.findIndex((item) => recordIdentity(item) === recordIdentity(record));
      if (index >= 0) {
        const previous = records[index];
        records[index] = {
          ...previous,
          ...record,
          id: serverLocalId(record.serverId),
          serverId: record.serverId,
          createdAt: record.createdAt || previous.createdAt,
          updatedAt: record.updatedAt || previous.updatedAt
        };
        updated += 1;
      } else {
        records.push({ ...record, id: serverLocalId(record.serverId) });
        added += 1;
      }
    });

    saveRecords(records);
    const repaired = loadRecords();
    return { records: repaired, added, updated, serverCount: incoming.length };
  }

  async function fetchAllServerReports() {
    const pageSize = Math.max(50, Math.min(500, Number(config.serverSyncPageSize || 250)));
    const reports = [];
    let offset = 0;
    let total = 0;
    let pageCount = 0;

    while (pageCount < 100) {
      const response = await requestWithWriteKey({ action: 'list', limit: String(pageSize), offset: String(offset) });
      const page = Array.isArray(response.reports) ? response.reports : [];
      reports.push(...page);
      total = Number(response.total || reports.length);
      pageCount += 1;

      if (response.hasMore === true) {
        const next = Number(response.nextOffset);
        offset = Number.isFinite(next) && next > offset ? next : offset + page.length;
      } else if (total > reports.length && page.length) {
        offset += page.length;
      } else {
        break;
      }
      if (!page.length) break;
    }

    return { reports, total: Math.max(total, reports.length) };
  }

  function localOnlyRecords() {
    return loadRecords().filter((record) => !record.serverId);
  }

  function serverSyncPanelHtml(records) {
    const serverBacked = records.filter((record) => Boolean(record.serverId)).length;
    const localOnly = records.length - serverBacked;
    const status = state.serverSyncBusy ? 'syncing' : (state.serverSyncStatus || 'idle');
    const labels = {
      synced: 'Google Sheets 학생 기록 동기화 완료',
      syncing: 'Google Sheets 학생 기록 동기화 중',
      'needs-key': '이 컴퓨터의 교사 인증이 필요합니다',
      error: 'Google Sheets 학생 기록 동기화 확인 필요',
      idle: 'Google Sheets 학생 기록 동기화 대기'
    };
    const messages = {
      synced: `${state.serverRecordCount || serverBacked}개 서버 기록을 이 기기에 불러왔습니다.`,
      syncing: '다른 컴퓨터에서 입력한 기록까지 불러오고 있습니다.',
      'needs-key': '누적 저장 방식 설정에 저장 키를 한 번 입력하면 다른 컴퓨터의 학생 기록도 자동으로 나타납니다.',
      error: state.serverSyncMessage || 'Apps Script 배포와 저장 키를 확인해 주세요.',
      idle: state.backendStatus === 'connected' ? '저장 키가 있으면 자동으로 동기화됩니다.' : 'Apps Script 연결을 확인해 주세요.'
    };
    let last = '';
    if (state.serverLastSyncedAt) {
      try { last = `마지막 동기화 ${new Date(state.serverLastSyncedAt).toLocaleString('ko-KR')}`; }
      catch (error) { last = ''; }
    }
    return `<div class="server-sync-panel server-sync-panel--${status}" role="status" aria-live="polite"><div class="server-sync-panel__status"><span class="server-sync-panel__dot" aria-hidden="true"></span><div><strong>${escape(labels[status] || labels.idle)}</strong><span>${escape(state.serverSyncMessage || messages[status] || messages.idle)}${last ? ` · ${escape(last)}` : ''}</span><small>서버 저장 ${serverBacked}개${localOnly ? ` · 이 기기에만 있는 기록 ${localOnly}개` : ''}</small></div></div><div class="server-sync-panel__actions"><button class="btn btn--primary btn--small" type="button" id="syncServerRecords"${state.serverSyncBusy ? ' disabled' : ''}>${state.serverSyncBusy ? '동기화 중…' : '서버 기록 새로고침'}</button>${localOnly ? `<button class="btn btn--soft btn--small" type="button" id="uploadLocalRecords"${state.serverSyncBusy ? ' disabled' : ''}>이 기기 기록 ${localOnly}개 서버로 올리기</button>` : ''}${status === 'needs-key' ? '<button class="btn btn--secondary btn--small" type="button" id="focusServerKey">저장 키 입력</button>' : ''}</div></div>`;
  }

  async function syncServerRecords(options = {}) {
    const { silent = false, force = false } = options;
    if (serverSyncRequest && !force) return serverSyncRequest;
    if (state.storageMode !== 'apps-script' || !isValidBackendUrl(state.backendUrl)) {
      state.serverSyncStatus = 'error';
      state.serverSyncMessage = 'Apps Script /exec 주소가 연결되지 않았습니다.';
      renderRecordsArea();
      if (!silent) toast(state.serverSyncMessage, 'error');
      return false;
    }

    state.writeKey = state.writeKey || readWriteKey();
    if (!state.writeKey) {
      state.serverSyncStatus = 'needs-key';
      state.serverSyncMessage = '다른 컴퓨터의 학생 기록을 불러오려면 이 기기에서 저장 키를 한 번 입력해 주세요.';
      renderRecordsArea();
      if (!silent) focusWriteKeyField(state.serverSyncMessage);
      return false;
    }

    state.serverSyncBusy = true;
    state.serverSyncStatus = 'syncing';
    state.serverSyncMessage = 'Google Sheets의 학생 기록을 불러오는 중입니다.';
    renderRecordsArea();

    serverSyncRequest = (async () => {
      try {
        const fetched = await fetchAllServerReports();
        const merged = mergeServerReports(fetched.reports);
        state.serverRecordCount = fetched.total;
        state.serverLastSyncedAt = new Date().toISOString();
        state.serverSyncStatus = 'synced';
        state.serverSyncMessage = `${merged.serverCount}개 서버 기록을 불러와 이 기기의 학생 목록과 합쳤습니다.`;
        saveSettings();
        if (!silent) toast(`Google Sheets 학생 기록 ${merged.serverCount}개를 동기화했습니다.`, 'good');
        return true;
      } catch (error) {
        if (error.code === 'WRITE_KEY_NOT_SAVED' || error.code === 'INVALID_WRITE_KEY') {
          state.serverSyncStatus = 'needs-key';
        } else {
          state.serverSyncStatus = 'error';
        }
        state.serverSyncMessage = error.message;
        if (!silent) toast(`학생 기록 동기화 실패: ${error.message}`, 'error');
        return false;
      } finally {
        state.serverSyncBusy = false;
        serverSyncRequest = null;
        render();
      }
    })();
    return serverSyncRequest;
  }

  async function saveManyRecordsToServer(records) {
    const valid = (records || [])
      .filter((record) => record?.name && core.getExam(catalog, record.examId))
      .map((record) => ({
        ...record,
        school: normalizeSchool(record.school),
        name: core.normalizeText(record.name)
      }));
    if (!valid.length) return { saved: 0, failed: 0 };
    const chunks = [];
    for (let index = 0; index < valid.length; index += 5) chunks.push(valid.slice(index, index + 5));
    let saved = 0;
    let failed = 0;

    for (const chunk of chunks) {
      try {
        const response = await requestWithWriteKey({ action: 'saveBatch', payload: JSON.stringify(chunk.map(serverPayload)) });
        const results = Array.isArray(response.saved) ? response.saved : [];
        const byKey = new Map(chunk.map((record) => [`${record.examId}|${core.studentKey(record)}`, record]));
        results.forEach((item) => {
          const original = byKey.get(`${item.examId}|${core.studentKey(item)}`);
          if (!original || !item.token) return;
          upsertRecord({
            ...original,
            serverId: item.token,
            createdAt: item.createdAt || original.createdAt,
            updatedAt: item.updatedAt || new Date().toISOString()
          });
          saved += 1;
        });
        if (!results.length) throw new Error('서버가 일괄 저장 결과를 반환하지 않았습니다.');
      } catch (error) {
        if (error.code === 'UNKNOWN_ACTION') {
          for (const record of chunk) {
            try { await saveRecordToServer(record); saved += 1; }
            catch (singleError) { console.error(singleError); failed += 1; }
          }
        } else {
          console.error(error);
          failed += chunk.length;
        }
      }
    }
    return { saved, failed };
  }

  function updateGenerateProgress(message) {
    state.busyMessage = String(message || '저장·링크 복사 중…');
    const button = document.getElementById('generateReport');
    const label = button?.querySelector('span:last-child');
    if (state.busy && label) label.textContent = state.busyMessage;
  }

  function recordUpdatedTime(record) {
    const value = Date.parse(String(record?.updatedAt || record?.createdAt || ''));
    return Number.isFinite(value) ? value : 0;
  }

  function latestSameExamRecords(currentRecord) {
    const currentExam = core.getExam(catalog, currentRecord?.examId);
    if (!currentExam) return [];
    const latest = new Map();
    [...loadRecords(), currentRecord].forEach((raw) => {
      if (!raw || raw.examId !== currentExam.id || !core.normalizeText(raw.name)) return;
      const normalized = {
        ...raw,
        examId: currentExam.id,
        round: Number(raw.round || currentExam.round || 0),
        school: normalizeSchool(raw.school),
        name: core.normalizeText(raw.name),
        answers: core.normalizeAnswers(raw.answers, currentExam.answerCount)
      };
      const key = core.studentKey(normalized);
      const previous = latest.get(key);
      if (!previous || recordUpdatedTime(normalized) >= recordUpdatedTime(previous)) latest.set(key, normalized);
    });

    const normalizedCurrent = {
      ...currentRecord,
      examId: currentExam.id,
      round: Number(currentRecord.round || currentExam.round || 0),
      school: normalizeSchool(currentRecord.school),
      name: core.normalizeText(currentRecord.name),
      answers: core.normalizeAnswers(currentRecord.answers, currentExam.answerCount)
    };
    latest.set(core.studentKey(normalizedCurrent), normalizedCurrent);
    return [...latest.values()];
  }

  async function ensureSameExamCohortOnServer(currentRecord, options = {}) {
    if (config.autoSyncSameExamCohortOnSave === false) {
      return { expectedTotal: 1, candidates: 0, saved: 0, failed: 0 };
    }
    const forceAll = Boolean(options.forceAll);
    const cohort = latestSameExamRecords(currentRecord);
    const currentKey = core.studentKey(currentRecord);
    const candidates = cohort.filter((record) => {
      if (core.studentKey(record) === currentKey) return false;
      return forceAll || !record.serverId;
    });
    if (!candidates.length) return { expectedTotal: cohort.length, candidates: 0, saved: 0, failed: 0 };

    updateGenerateProgress(`같은 시험 기존 ${candidates.length}명 서버 반영 중…`);
    const result = await saveManyRecordsToServer(candidates);
    if (result.failed) {
      const error = new Error(`같은 시험 기존 학생 ${result.failed}명의 Google Sheets 저장에 실패했습니다. 서버 기록 새로고침 후 다시 시도해 주세요.`);
      error.code = 'COHORT_SYNC_FAILED';
      throw error;
    }
    return { expectedTotal: cohort.length, candidates: candidates.length, ...result };
  }

  async function saveRecordWithFullCohort(record) {
    const localCohort = latestSameExamRecords(record);
    const expectedTotal = Math.max(1, localCohort.length);

    await ensureSameExamCohortOnServer(record);
    updateGenerateProgress('학생 결과 저장·전체 통계 계산 중…');
    let saved = await saveRecordToServer(record);
    let serverTotal = Number(saved.snapshot?.cohort?.total || 0);

    // 이전 배포·다른 Sheet의 serverId가 남아 있거나 기존 자료가 아직 서버에
    // 없으면, 같은 시험의 로컬 기록을 한 번 전부 다시 올린 뒤 현재 학생을
    // 재저장한다. 이 과정을 거쳐 새 학생도 기존 응시자 전체와 비교된다.
    if (config.verifyServerCohortOnSave !== false && serverTotal < expectedTotal) {
      await ensureSameExamCohortOnServer(saved.record || record, { forceAll: true });
      updateGenerateProgress('전체 응시자 평균·석차 다시 계산 중…');
      saved = await saveRecordToServer(saved.record || record);
      serverTotal = Number(saved.snapshot?.cohort?.total || 0);
    }

    if (config.verifyServerCohortOnSave !== false && serverTotal < expectedTotal) {
      const error = new Error(`같은 시험의 기존 기록은 ${expectedTotal}명이지만 Google Sheets 통계에는 ${serverTotal}명만 반영되었습니다. 학생 기록 영역의 ‘서버 기록 새로고침’을 누른 뒤 다시 제출해 주세요.`);
      error.code = 'COHORT_COUNT_MISMATCH';
      throw error;
    }

    state.serverRecordCount = Math.max(Number(state.serverRecordCount || 0), serverTotal);
    state.serverSyncStatus = 'synced';
    state.serverSyncMessage = `${saved.snapshot?.record?.examTitle || '동일 시험'} ${serverTotal}명 기준으로 평균과 석차를 계산했습니다.`;
    saveSettings();
    return { ...saved, expectedTotal, serverTotal };
  }

  async function uploadLocalRecordsToServer() {
    const pending = localOnlyRecords();
    if (!pending.length) { toast('이 기기에만 있는 학생 기록이 없습니다.', 'good'); return; }
    state.writeKey = state.writeKey || readWriteKey();
    if (!state.writeKey) { focusWriteKeyField('서버로 올리려면 Google Sheets 저장 키를 한 번 입력해 주세요.'); return; }
    if (!confirm(`이 기기에만 저장된 학생 기록 ${pending.length}개를 Google Sheets에 올릴까요?\n같은 학교·이름·시험 기록이 있으면 서버 기록을 갱신합니다.`)) return;

    state.serverSyncBusy = true;
    state.serverSyncStatus = 'syncing';
    state.serverSyncMessage = `이 기기 기록 ${pending.length}개를 Google Sheets에 올리는 중입니다.`;
    renderRecordsArea();
    const result = await saveManyRecordsToServer(pending);
    state.serverSyncBusy = false;
    if (result.failed) toast(`${result.saved}개 저장, ${result.failed}개 실패했습니다.`, 'error');
    else toast(`이 기기 기록 ${result.saved}개를 Google Sheets에 저장했습니다.`, 'good');
    await syncServerRecords({ silent: true, force: true });
  }

  function startServerSyncPolling() {
    if (serverSyncTimer) window.clearInterval(serverSyncTimer);
    const interval = Math.max(60000, Number(config.serverSyncIntervalMs || 120000));
    serverSyncTimer = window.setInterval(() => {
  // v3.2.0 · top sticky score/save dock for student answer entry.
      if (document.visibilityState !== 'visible') return;
      if (state.storageMode !== 'apps-script' || state.serverSyncBusy || !readWriteKey()) return;
      syncServerRecords({ silent: true });
    }, interval);
    window.addEventListener('focus', () => {
      if (state.storageMode !== 'apps-script' || state.serverSyncBusy || !readWriteKey()) return;
      const last = state.serverLastSyncedAt ? Date.parse(state.serverLastSyncedAt) : 0;
      if (!last || Date.now() - last > 30000) syncServerRecords({ silent: true });
    });
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

  function currentGrade() {
    return core.grade(exam(), state.answers);
  }

  function previewHtml() {
    const result = currentGrade();
    return `<div class="score-preview__row"><div><div class="quick-stat__label">현재 입력 기준</div><div class="score-preview__score">${core.formatScore(result.score)}<small>/100</small></div></div><div class="score-preview__counts"><span class="count-pill good">정답 ${result.correct}</span><span class="count-pill bad">오답 ${result.wrong}</span><span class="count-pill blank">미기입 ${result.blank}</span></div></div>`;
  }

  function generateActionLabel() {
    if (state.busy) return state.busyMessage || '저장·성적표 생성 중…';
    return state.editingId ? '수정 저장 및 성적표 생성' : '저장 및 성적표 생성';
  }

  function entryLiveScoreHtml() {
    const result = currentGrade();
    const answered = result.correct + result.wrong;
    const student = core.normalizeText(state.name) || '학생 이름 입력 전';
    return `<div class="entry-live-score__identity"><span class="entry-live-score__eyebrow">현재 학생 점수</span><strong class="entry-live-score__student" id="entryStudentLabel">${escape(student)}</strong></div><div class="entry-live-score__value">${core.formatScore(result.score)}<small>/100</small></div><div class="entry-live-score__details"><span class="count-pill good">정답 ${result.correct}</span><span class="count-pill bad">오답 ${result.wrong}</span><span class="count-pill blank">미기입 ${result.blank}</span><span class="entry-live-score__answered">입력 ${answered}/${exam().answerCount}</span></div>`;
  }

  function entryActionDockHtml() {
    return `<div class="entry-action-dock" id="entryActionDock" role="region" aria-label="학생 점수와 성적표 생성"><div class="entry-live-score" id="entryLiveScore" aria-live="polite">${entryLiveScoreHtml()}</div><div class="entry-action-dock__actions"><button class="btn btn--primary btn--copy-report js-generate-report" type="button" id="generateReportTop"${state.busy ? ' disabled' : ''}><span class="btn-symbol">✓</span><span class="entry-action-dock__button-text"><strong>${generateActionLabel()}</strong><small>Google Sheets 저장 후 결과 링크 자동 복사</small></span></button><button class="btn btn--soft entry-clear-btn js-clear-form" type="button" id="clearFormTop"${state.busy ? ' disabled' : ''}><span aria-hidden="true">↺</span><span>초기화</span></button></div></div>`;
  }

  function quickStatsHtml(records) {
    const current = records.filter((record) => record.examId === state.examId).map((record) => core.enrichRecord(catalog, record));
    const scores = current.map((record) => record.score);
    const last = [...records].sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0];
    const sourceHint = state.serverSyncStatus === 'synced'
      ? `Google Sheets ${state.serverRecordCount || records.filter((record) => record.serverId).length}개 동기화 기준`
      : '이 기기 캐시 기준 · 서버 동기화 전';
    return `<div class="quick-stats">
      <div class="quick-stat"><span class="quick-stat__icon" aria-hidden="true">01</span><span class="quick-stat__label">등록 학생</span><span class="quick-stat__value">${current.length}<small>명</small></span><span class="quick-stat__hint">현재 선택 시험 · 기본 데이터 포함</span></div>
      <div class="quick-stat"><span class="quick-stat__icon" aria-hidden="true">Σ</span><span class="quick-stat__label">전체 평균</span><span class="quick-stat__value">${current.length ? core.formatScore(core.average(scores)) : '-'}<small>점</small></span><span class="quick-stat__hint">${escape(sourceHint)}</span></div>
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
      <div class="card__head"><div><h2>학생 답안 입력</h2><p>학생 이름과 20문항 답안을 입력하세요. 학교는 선택 입력입니다.</p></div><span class="tag">${modeText}</span></div>
      <div class="card__body">
        ${entryActionDockHtml()}
        <div class="field"><label for="examSelect">시험</label><select id="examSelect" class="select">${catalog.map((item) => `<option value="${escape(item.id)}"${item.id === state.examId ? ' selected' : ''}>${escape(item.title)}</option>`).join('')}</select></div>
        <div class="form-row"><div class="field"><label for="schoolInput">학교 <span class="field-optional">선택</span></label><input class="input" id="schoolInput" maxlength="60" placeholder="비워두면 ‘미입력’으로 저장됩니다" value="${escape(state.school)}" aria-describedby="schoolInputHelp"><small id="schoolInputHelp">학교를 입력하지 않아도 제출할 수 있으며, 성적표에는 <strong>미입력</strong>으로 표시됩니다.</small></div><div class="field"><label for="nameInput">학생 이름</label><input class="input" id="nameInput" maxlength="30" placeholder="예: 김물리" value="${escape(state.name)}"></div></div>
        <div class="field"><label for="bulkInput">답안 한 번에 붙여넣기</label><textarea class="textarea" id="bulkInput" placeholder="엑셀 한 행을 그대로 복사해 붙여넣거나, 4 5 4 1 ... 형식으로 입력"></textarea><small>엑셀·Google Sheets에서 복사한 탭 구분 행은 <strong>빈 셀 위치까지 그대로 보존</strong>합니다. 공백 구분 입력에서는 0, X, -를 미기입으로 사용하세요.</small></div>
        <div class="button-row" style="margin-top:0"><button class="btn btn--secondary btn--small" type="button" id="applyBulk">붙여넣기 적용</button><button class="btn btn--soft btn--small" type="button" id="sampleData">예시 입력</button></div>
        <div class="form-divider"></div>
        <div class="section-label"><strong>문항별 답안</strong><span>정답 +5 · 오답 -1.25 · 미기입 0</span></div>
        <div class="answer-grid" id="answerGrid">${answerGridHtml()}</div>
        <div class="score-preview" id="scorePreview">${previewHtml()}</div>
        <details id="storageSettings" style="margin-top:17px"${state.storageSettingsOpen ? ' open' : ''}><summary style="cursor:pointer;font-size:12px;font-weight:800;color:var(--brand)">누적 저장 방식 설정</summary>
          <div style="padding-top:13px"><div class="field"><label for="storageMode">저장 방식</label><select class="select" id="storageMode"><option value="apps-script"${state.storageMode === 'apps-script' ? ' selected' : ''}>Google Sheets + Apps Script · 모든 교사 기기 동기화</option><option value="local"${state.storageMode === 'local' ? ' selected' : ''}${config.backendRequiredForSaves ? ' disabled' : ''}>브라우저 임시 저장 · 이 기기에서만 확인</option></select></div>
          <div class="field${state.storageMode === 'apps-script' ? '' : ' hidden'}" id="backendField"><label for="backendUrl">Apps Script 웹 앱 URL</label><input class="input" id="backendUrl" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://script.google.com/macros/s/.../exec" value="${escape(state.backendUrl)}">${backendStatusHtml()}<div class="backend-write-key"><label for="backendWriteKey">Google Sheets 저장 키</label><input class="input" id="backendWriteKey" type="password" autocomplete="current-password" spellcheck="false" placeholder="Apps Script의 WRITE_KEY" value="${escape(state.writeKey)}"><small>한 번 입력하면 <strong>이 교사 기기의 브라우저에 계속 저장</strong>되어 학생 제출 때마다 팝업이 나타나지 않습니다. 공용 기기에서는 작업 후 ‘저장 키 지우기’를 누르세요.</small></div><small class="backend-setting-note">학생 결과는 Google Sheets를 원본으로 저장합니다. 다른 컴퓨터에서는 같은 저장 키를 <strong>처음 한 번만</strong> 입력하면 기존 학생 목록이 자동으로 동기화됩니다.</small><div class="button-row backend-field-actions"><button class="btn btn--primary btn--small" type="button" id="pingBackend">연결 확인·학생 기록 동기화</button><button class="btn btn--soft btn--small" type="button" id="copyBackendSetup">다른 기기 연결 주소 복사</button><button class="btn btn--soft btn--small" type="button" id="forgetWriteKey">저장 키 지우기</button><button class="btn btn--ghost btn--small" type="button" id="clearBackendConnection">연결 주소 지우기</button></div></div></div>
        </details>
        <div class="button-row report-create-row report-create-row--bottom"><button class="btn btn--primary btn--copy-report js-generate-report" type="button" id="generateReport"${state.busy ? ' disabled' : ''}><span class="btn-symbol">↗</span><span>${generateActionLabel()}·링크 복사</span></button><button class="btn btn--soft js-clear-form" type="button" id="clearForm"${state.busy ? ' disabled' : ''}>초기화</button></div>
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
      return `<tr data-record-ref="${escape(recordRef(record))}"><td><span class="student-name">${escape(record.name)}</span><span class="student-school">${escape(record.school)}</span></td><td>${escape(enriched.examTitle || record.examId)}</td><td class="score-cell">${core.formatScore(enriched.score)}</td><td><div class="status-dots">${statusDots(record)}</div></td><td>${core.formatDate(record.updatedAt || record.createdAt)}</td><td><div class="row-actions"><button class="btn btn--soft btn--small" data-action="edit">수정</button><button class="btn btn--primary btn--small" data-action="copy">링크 복사</button><button class="btn btn--secondary btn--small" data-action="open">열기</button><button class="btn btn--danger btn--small" data-action="delete">삭제</button></div></td></tr>`;
    }).join('');
  }

  function recordsHtml(records) {
    const rows = recordRows(records);
    return `<section id="student-records" class="card anchor-section"><div class="card__head"><div><h2>학생 기록과 결과 링크</h2><p>Google Sheets를 원본으로 사용하여 다른 컴퓨터에서도 같은 학생 기록을 확인합니다.</p></div></div><div class="card__body">
      ${serverSyncPanelHtml(records)}
      <div class="table-tools"><input id="recordSearch" class="input table-tools__search" type="search" placeholder="학교 또는 학생 이름 검색" value="${escape(state.search)}"><div class="tool-group"><button class="btn btn--soft btn--small" id="exportCsv">CSV</button><button class="btn btn--soft btn--small" id="exportJson">JSON 백업</button>${seedRecords.length ? '<button class="btn btn--soft btn--small" id="restoreSeedData">1·2·3·4·5회 기존 데이터 다시 불러오기</button>' : ''}<button class="btn btn--soft btn--small" id="importData">가져오기</button><input id="importFile" class="hidden" type="file" accept=".csv,.json,text/csv,application/json"></div></div>
      ${rows ? `<div class="table-wrap"><table><thead><tr><th>학생</th><th>시험</th><th>점수</th><th>문항 결과</th><th>수정 시각</th><th><span class="sr-only">작업</span></th></tr></thead><tbody id="recordBody">${rows}</tbody></table></div>` : `<div class="empty-state"><div class="empty-state__mark">◎</div><strong>${state.search ? '검색 결과가 없습니다.' : '아직 학생 기록이 없습니다.'}</strong><span>${state.search ? '다른 이름이나 학교를 검색해 보세요.' : '첫 학생의 답안을 입력하면 전체 평균과 문항별 정답률이 계산됩니다.'}</span></div>`}
      <div class="notice"><strong>기기 간 저장과 개인정보</strong><br>학생 입력은 Google Sheets에 저장되고, 교사용 화면은 서버 기록을 이 기기로 동기화해 표시합니다. 새 컴퓨터에서는 저장 키를 한 번 입력해야 전체 학생 목록을 볼 수 있습니다. 학생 결과 링크는 비밀번호가 없는 ‘소지자 링크’이므로 공개 게시판에는 올리지 마세요.</div>
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
    const liveScore = document.getElementById('entryLiveScore');
    if (liveScore) liveScore.innerHTML = entryLiveScoreHtml();
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
      state.examId = event.target.value;
      state.answers = Array(core.getExam(catalog, state.examId).answerCount).fill('');
      detachEditingIfIdentityChanged();
      render();
    });
    document.getElementById('schoolInput')?.addEventListener('input', (event) => {
      state.school = event.target.value;
      detachEditingIfIdentityChanged();
    });
    document.getElementById('nameInput')?.addEventListener('input', (event) => {
      state.name = event.target.value;
      detachEditingIfIdentityChanged();
      const label = document.getElementById('entryStudentLabel');
      if (label) label.textContent = core.normalizeText(state.name) || '학생 이름 입력 전';
    });
    document.getElementById('applyBulk')?.addEventListener('click', () => {
      const input = document.getElementById('bulkInput');
      const parsed = core.parseAnswerText(input.value, exam().answerCount);
      if (!parsed.length) { toast('답안을 인식하지 못했습니다.', 'error'); return; }
      state.answers = core.normalizeAnswers(parsed, exam().answerCount);
      updatePreviewOnly(true);
      const appliedCount = Math.min(parsed.length, exam().answerCount);
      const blankCount = state.answers.slice(0, appliedCount).filter((answer) => answer === '').length;
      toast(`${appliedCount}개 문항 위치를 적용했습니다${blankCount ? ` · 미기입 ${blankCount}개` : ''}.`, 'good');
    });
    document.getElementById('sampleData')?.addEventListener('click', () => {
      state.school = '예시고등학교'; state.name = '김물리';
      state.answers = [...exam().answerKey]; state.answers[2] = 2; state.answers[6] = ''; state.answers[9] = 3; state.answers[13] = 4; state.answers[17] = '';
      render(); toast('기능 확인용 예시 답안을 넣었습니다.');
    });
    document.getElementById('storageSettings')?.addEventListener('toggle', (event) => {
      state.storageSettingsOpen = Boolean(event.target.open);
    });
    document.getElementById('storageMode')?.addEventListener('change', (event) => {
      if (config.backendRequiredForSaves && event.target.value === 'local') {
        state.storageMode = 'apps-script';
        event.target.value = 'apps-script';
        toast('모든 기기에서 학생 기록을 확인할 수 있도록 Google Sheets 저장을 사용합니다.', 'good');
      } else {
        state.storageMode = event.target.value;
      }
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
    document.getElementById('backendWriteKey')?.addEventListener('input', (event) => {
      saveWriteKey(event.target.value);
    });
    document.getElementById('backendWriteKey')?.addEventListener('change', async (event) => {
      const saved = saveWriteKey(event.target.value);
      event.target.value = saved;
      if (saved) {
        toast('저장 키를 이 기기에 저장했습니다. Google Sheets 학생 기록을 불러옵니다.', 'good');
        await connectBackend({ force: true, syncRecords: true });
      }
    });
    document.getElementById('pingBackend')?.addEventListener('click', () => connectBackend({ force: true, syncRecords: true }));
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
      saveWriteKey('');
      state.serverSyncStatus = 'needs-key';
      state.serverSyncMessage = '다른 컴퓨터의 학생 기록을 다시 불러오려면 저장 키를 입력해야 합니다.';
      const input = document.getElementById('backendWriteKey');
      if (input) input.value = '';
      renderRecordsArea();
      toast('이 기기에 저장된 Google Sheets 저장 키를 지웠습니다.');
    });
    document.querySelectorAll('.js-generate-report').forEach((button) => button.addEventListener('click', generate));
    document.querySelectorAll('.js-clear-form').forEach((button) => button.addEventListener('click', clearStudentForm));
    bindRecordEvents();
  }

  function clearStudentForm() {
    state.school = '';
    state.name = '';
    state.answers = Array(exam().answerCount).fill('');
    state.editingId = '';
    state.editingIdentity = '';
    render();
    window.setTimeout(() => document.getElementById('nameInput')?.focus(), 0);
  }

  function bindRecordEvents() {
    document.getElementById('syncServerRecords')?.addEventListener('click', () => syncServerRecords({ force: true }));
    document.getElementById('uploadLocalRecords')?.addEventListener('click', uploadLocalRecordsToServer);
    document.getElementById('focusServerKey')?.addEventListener('click', () => focusWriteKeyField('이 컴퓨터에서 저장 키를 한 번 입력하면 Google Sheets 학생 기록을 자동으로 불러옵니다.'));
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
    if (!state.name.trim()) { toast('학생 이름을 입력해 주세요.', 'error'); document.getElementById('nameInput')?.focus(); return false; }
    if (config.backendRequiredForSaves && isValidBackendUrl(state.backendUrl)) state.storageMode = 'apps-script';
    if (state.storageMode === 'apps-script') {
      syncBackendUrlFromField();
      if (!isValidBackendUrl(state.backendUrl)) { toast('Apps Script의 /exec URL을 입력해 주세요.', 'error'); return false; }
      state.writeKey = state.writeKey || readWriteKey();
      if (!state.writeKey) {
        focusWriteKeyField('Google Sheets 저장 키를 누적 저장 방식 설정에 한 번 입력해 주세요. 이후에는 이 기기에서 다시 묻지 않습니다.');
        return false;
      }
    }
    return true;
  }

  function serverPayload(record) {
    return {
      examId: record.examId,
      round: record.round,
      school: normalizeSchool(record.school),
      name: core.normalizeText(record.name),
      answers: record.answers,
      createdAt: record.createdAt,
      clientRecordId: record.id || '',
      identityFingerprint: typeof core.identityFingerprint === 'function' ? core.identityFingerprint(record) : ''
    };
  }

  async function saveRecordToServer(record) {
    const response = await requestWithWriteKey({ action: 'save', payload: JSON.stringify(serverPayload(record)) });
    if (response.report?.record) assertSnapshotMatchesRecord(response.report, record);
    const serverId = response.token || response.id || response.report?.record?.id || record.serverId || '';
    if (!serverId) throw new Error('서버가 학생별 결과 토큰을 반환하지 않았습니다.');
    const savedRecord = upsertRecord({ ...record, id: serverLocalId(serverId), serverId });
    const snapshot = response.report?.record
      ? response.report
      : core.buildSnapshot(catalog, savedRecord, loadRecords());
    assertSnapshotMatchesRecord(snapshot, savedRecord);
    return { record: savedRecord, serverId, snapshot };
  }

  async function ensureRecordLink(record) {
    let current = record;
    let snapshot = core.buildSnapshot(catalog, current, loadRecords());
    let serverId = current.serverId || '';
    let serverWorked = false;

    if (state.storageMode === 'apps-script' && isValidBackendUrl(state.backendUrl)) {
      state.writeKey = state.writeKey || readWriteKey();
      if (!state.writeKey) {
        focusWriteKeyField('Google Sheets 저장 키를 한 번 입력한 뒤 다시 눌러 주세요.');
        throw new Error('Google Sheets 저장 키가 저장되지 않았습니다.');
      }
      const saved = await saveRecordWithFullCohort(current);
      current = saved.record;
      serverId = saved.serverId;
      snapshot = saved.snapshot;
      serverWorked = Boolean(serverId);
    }
    assertSnapshotMatchesRecord(snapshot, current);

    return {
      record: current,
      snapshot,
      serverWorked,
      url: reportUrl(snapshot, serverWorked ? serverId : '')
    };
  }

  async function generate() {
    if (state.busy || !validateStudent()) return;
    state.busy = true; state.busyMessage = '저장·링크 복사 중…'; render();
    try {
      const records = loadRecords();
      const existing = resolveExistingRecord(records, state.editingId, {
        examId: state.examId,
        school: state.school,
        name: state.name
      });
      const draft = {
        id: existing?.id || core.makeId('local'),
        examId: state.examId,
        round: exam().round,
        school: normalizeSchool(state.school),
        name: core.normalizeText(state.name),
        answers: core.normalizeAnswers(state.answers, exam().answerCount),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        serverId: existing?.serverId || ''
      };

      let record;
      let snapshot;
      let serverId = '';
      let serverWorked = false;
      if (state.storageMode === 'apps-script') {
        saveSettings();
        try {
          const saved = await saveRecordWithFullCohort(draft);
          record = saved.record;
          serverId = saved.serverId;
          snapshot = saved.snapshot;
          serverWorked = Boolean(serverId);
          if (!serverWorked) throw new Error('서버가 학생 결과 토큰을 반환하지 않았습니다.');
        } catch (error) {
          if (error.code === 'WRITE_KEY_NOT_SAVED' || error.code === 'INVALID_WRITE_KEY') focusWriteKeyField();
          throw new Error(`Google Sheet 저장에 실패하여 이 기기에도 완료 기록을 남기지 않았습니다. ${error.message}`);
        }
      } else {
        record = upsertRecord(draft);
        snapshot = core.buildSnapshot(catalog, record, loadRecords());
      }

      const url = reportUrl(snapshot, serverWorked ? serverId : '');
      let copied = false;
      try {
        await copyText(url);
        copied = true;
      } catch (copyError) {
        console.warn('생성된 링크 자동 복사 실패', copyError);
      }
      assertSnapshotMatchesRecord(snapshot, record);
      openLinkModal(url, snapshot, serverWorked, copied);
      // Do not carry the previous student's local ID into the next entry.
      // Re-submitting the same identity still updates it by exam + school + name.
      state.editingId = '';
      state.editingIdentity = '';
      const cohortTotal = Number(snapshot?.cohort?.total || 1);
      toast(copied ? `${record.name} 학생 링크를 복사했습니다. 같은 시험 ${cohortTotal}명 기준으로 평균과 석차를 계산했습니다.` : `${record.name} 학생의 성적 분석 링크를 생성했습니다. 같은 시험 ${cohortTotal}명 기준입니다.`, copied ? 'good' : '');
      if (serverWorked) syncServerRecords({ silent: true, force: true });
    } catch (error) {
      console.error(error); toast(`리포트 생성 중 오류: ${error.message}`, 'error');
    } finally {
      state.busy = false; state.busyMessage = ''; render();
    }
  }

  function openLinkModal(url, snapshot, serverWorked, copied = false) {
    const cohort = snapshot.cohort || {};
    const cohortTotal = Math.max(1, Number(cohort.total || 1));
    const cohortRank = cohort.rank ? `${cohort.rank} / ${cohortTotal}` : '—';
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="linkModalTitle"><div class="modal__head"><div><h3 id="linkModalTitle">${copied ? '성적 분석 링크 복사 완료' : `${escape(snapshot.record.name)} 학생 전용 링크`}</h3><p style="margin:5px 0 0;color:var(--muted);font-size:12px">${escape(snapshot.record.school)} · ${escape(snapshot.record.examTitle)}</p></div><button class="close-button" aria-label="닫기">×</button></div><div class="modal__body"><div class="link-copy-alert ${copied ? 'is-copied' : 'is-manual'}"><strong>${copied ? '바로 붙여넣을 수 있게 클립보드에 복사했습니다.' : '브라우저가 자동 복사를 막았습니다.'}</strong><span>${copied ? '카카오톡, 문자, 이메일 등에 그대로 붙여넣어 공유하면 됩니다.' : '아래의 큰 링크 복사 버튼을 한 번 눌러 주세요.'}</span></div><div class="score-preview"><div class="score-preview__row"><div><span class="quick-stat__label">산출 점수</span><div class="score-preview__score">${core.formatScore(snapshot.record.score)}<small>/100</small></div></div><div class="score-preview__counts"><span class="count-pill good">정답 ${snapshot.record.correct}</span><span class="count-pill bad">오답 ${snapshot.record.wrong}</span><span class="count-pill blank">미기입 ${snapshot.record.blank}</span></div></div><div class="score-preview__cohort"><div><span>동일 시험 기준</span><strong>${cohortTotal}명</strong></div><div><span>전체 평균</span><strong>${core.formatScore(cohort.average || 0)}점</strong></div><div><span>석차</span><strong>${cohortRank}</strong></div></div></div><div class="link-box">${escape(url)}</div><div class="button-row link-modal-actions"><button class="btn btn--primary" id="modalCopy"><span class="btn-symbol">↗</span>링크 다시 복사</button><a class="btn btn--secondary" href="${escape(url)}" target="_blank" rel="noopener">성적표 열기</a></div><p style="font-size:11px;color:var(--muted)">${serverWorked ? 'Google Sheet에서 무작위 토큰으로 결과와 최신 누적 통계를 불러옵니다. 링크를 아는 사람은 별도 로그인 없이 학생 리포트를 볼 수 있습니다.' : '링크 안에 현재 성적과 통계 백업이 포함되어 있어 다른 기기에서도 열 수 있습니다.'}</p></div></div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('.close-button')) close(); });
    modal.querySelector('#modalCopy').addEventListener('click', async () => { await copyText(url); toast('학생 성적 분석 링크를 복사했습니다.', 'good'); });
  }

  async function recordAction(event) {
    const button = event.target.closest('button[data-action]');
    const row = button?.closest('tr[data-record-ref]');
    if (!button || !row) return;
    const record = findRecordByRef(loadRecords(), row.dataset.recordRef);
    if (!record) return;
    if (button.dataset.action === 'edit') {
      state.examId=record.examId; state.school=record.school; state.name=record.name; state.answers=core.normalizeAnswers(record.answers, core.getExam(catalog, record.examId).answerCount); state.editingId=record.id; state.editingIdentity=recordIdentity(record); render(); window.scrollTo({top:0,behavior:'smooth'}); toast('학생 기록을 입력 칸에 불러왔습니다.');
    }
    if (button.dataset.action === 'copy') {
      try {
        const linked = await ensureRecordLink(record);
        await copyText(linked.url);
        toast(`${record.name} 학생 성적 분석 링크를 복사했습니다.`, 'good');
        if (linked.record.id !== record.id || linked.record.serverId !== record.serverId) render();
      } catch (error) {
        toast(`링크 복사 실패: ${error.message}`, 'error');
      }
    }
    if (button.dataset.action === 'open') {
      try {
        const linked = await ensureRecordLink(record);
        window.open(linked.url, '_blank', 'noopener');
        if (linked.record.id !== record.id || linked.record.serverId !== record.serverId) render();
      } catch (error) {
        toast(`성적표 열기 실패: ${error.message}`, 'error');
      }
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
      const valid = incoming
        .filter((record) => record?.name && core.getExam(catalog, record.examId))
        .map((record) => ({
          ...record,
          school: normalizeSchool(record.school),
          name: core.normalizeText(record.name),
          answers: core.normalizeAnswers(record.answers, core.getExam(catalog, record.examId).answerCount),
          createdAt: record.createdAt || new Date().toISOString()
        }));

      if (state.storageMode === 'apps-script') {
        state.writeKey = state.writeKey || readWriteKey();
        if (!state.writeKey) { focusWriteKeyField('가져온 학생 기록을 모든 기기에 저장하려면 Google Sheets 저장 키를 입력해 주세요.'); return; }
        const result = await saveManyRecordsToServer(valid);
        await syncServerRecords({ silent: true, force: true });
        if (result.failed) toast(`${result.saved}개 서버 저장, ${result.failed}개 실패했습니다.`, 'error');
        else toast(`${result.saved}개 학생 기록을 Google Sheets에 가져왔습니다.`, 'good');
      } else {
        valid.forEach((record) => upsertRecord(record));
        render();
        toast(`${valid.length}개 학생 기록을 이 브라우저에 가져왔습니다.`, 'good');
      }
    } catch (error) { toast(`파일을 가져오지 못했습니다: ${error.message}`, 'error'); }
  }


  window.YPRecordIntegrity = Object.freeze({
    repairRecords,
    recordIdentity,
    recordRef,
    findRecordByRef,
    resolveExistingRecord
  });

  loadSettings();
  const seedResult = ensureSeedRecords(false);
  if (seedResult.added) console.info(`기본 1·2·3·4·5회 데이터 ${seedResult.added}명을 불러왔습니다.`);
  repairStoredRecords();
  render();
  autoConnectBackend();
  startServerSyncPolling();
})();
