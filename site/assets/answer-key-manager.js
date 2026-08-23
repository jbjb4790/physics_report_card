(function () {
  'use strict';

  const config = window.APP_CONFIG || {};
  const catalog = Array.isArray(window.EXAM_CATALOG) ? window.EXAM_CATALOG : [];
  const currentScript = typeof document !== 'undefined' ? document.currentScript : null;
  const entryScript = currentScript?.dataset?.entry || '';
  const STORAGE_PREFIX = config.storageKey || 'tpl-score-report-records-v1';
  const CACHE_KEY = `${STORAGE_PREFIX}-answer-key-overrides-v1`;
  const WRITE_KEY_STORAGE_KEY = `${STORAGE_PREFIX}-backend-write-key`;
  const CALLBACK_PREFIX = '__ypAnswerKeyCallback';
  const SERVER_TIMEOUT_MS = Math.max(1200, Math.min(5000, Number(config.backendTimeoutMs || 4500)));

  const BUILTIN_OVERRIDES = {
    'tpl-mid-07': {
      examId: 'tpl-mid-07',
      answerKey: [3, 2, 3, 3, 5, 2, 1, 3, 3, 3, 5, 3, 4, 3, 5, 5, 4, 1, 4, 1],
      note: '7회 7번은 ㄱ만 옳으므로 정답 ①을 적용합니다. 기존 해설의 개별 판정과 정답표가 서로 일치하지 않아 교정했습니다.',
      updatedAt: '2026-08-21T00:00:00+09:00',
      source: 'built-in-correction'
    }
  };

  const BUILTIN_QUESTION_PATCHES = {
    'tpl-mid-07': {
      7: {
        expectedAnswer: 1,
        officialSummary: 'A와 C는 x축에 대하여 대칭인 점이므로 전기장 세기가 같다. B에서는 양전하가 만드는 전기장과 음전하가 만드는 전기장이 모두 +x 방향이므로 ㄴ은 틀리다. 또한 전기 쌍극자의 수직이등분선 위에서는 두 전하에 의한 전위가 서로 상쇄되므로 B와 C의 전위가 같아 ㄷ도 틀리다. 따라서 ㄱ만 옳아 정답은 ①이다.',
        checkPoint: '전기장은 벡터이므로 방향까지 합성하고, 전위는 스칼라이므로 부호를 포함해 대수적으로 합한다.',
        sourceNote: '기존 7회 해설은 ㄱ을 참, ㄴ·ㄷ을 거짓으로 판정하면서 정답을 ②로 제시해 서로 모순되었습니다. 교사 수정에 따라 정답 ①을 적용합니다.'
      }
    }
  };

  const baseState = new Map();
  catalog.forEach((exam) => {
    baseState.set(exam.id, {
      answerKey: Array.isArray(exam.answerKey) ? exam.answerKey.slice() : [],
      questions: Array.isArray(exam.questions)
        ? exam.questions.map((question) => ({
            answer: question.answer,
            officialSummary: question.officialSummary,
            checkPoint: question.checkPoint,
            sourceNote: question.sourceNote
          }))
        : []
    });
  });

  let effectiveOverrides = {};

  function normalizeKeyArray(examId, values) {
    const exam = catalog.find((item) => item.id === examId);
    const count = Number(exam?.answerCount || exam?.questions?.length || exam?.answerKey?.length || 0);
    if (!exam || !Array.isArray(values) || values.length !== count) return null;
    const normalized = values.map((value) => Number(value));
    if (normalized.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) return null;
    return normalized;
  }

  function normalizeOverride(item, fallbackExamId) {
    if (!item || typeof item !== 'object') return null;
    const examId = String(item.examId || fallbackExamId || '').trim();
    const answerKey = normalizeKeyArray(examId, item.answerKey);
    if (!answerKey) return null;
    return {
      examId,
      answerKey,
      note: String(item.note || '').trim(),
      updatedAt: String(item.updatedAt || '').trim(),
      source: String(item.source || '').trim()
    };
  }

  function normalizeOverrideMap(input) {
    const output = {};
    if (Array.isArray(input)) {
      input.forEach((item) => {
        const normalized = normalizeOverride(item);
        if (normalized) output[normalized.examId] = normalized;
      });
      return output;
    }
    if (!input || typeof input !== 'object') return output;
    Object.entries(input).forEach(([examId, item]) => {
      const normalized = normalizeOverride(item, examId);
      if (normalized) output[examId] = normalized;
    });
    return output;
  }

  function mergeOverrides(...maps) {
    const merged = {};
    maps.forEach((map) => {
      Object.assign(merged, normalizeOverrideMap(map));
    });
    return merged;
  }

  function readCachedOverrides() {
    try {
      return normalizeOverrideMap(JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'));
    } catch (error) {
      console.warn('정답표 캐시를 읽지 못했습니다.', error);
      return {};
    }
  }

  function saveCachedOverrides(overrides) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(normalizeOverrideMap(overrides)));
    } catch (error) {
      console.warn('정답표 캐시를 저장하지 못했습니다.', error);
    }
  }

  function answerLabel(value) {
    return ['', '①', '②', '③', '④', '⑤'][Number(value)] || String(value || '—');
  }

  function applyOverrides(overrides) {
    effectiveOverrides = normalizeOverrideMap(overrides);

    catalog.forEach((exam) => {
      const base = baseState.get(exam.id);
      if (!base) return;

      exam.answerKey = base.answerKey.slice();
      if (Array.isArray(exam.questions)) {
        exam.questions.forEach((question, index) => {
          const original = base.questions[index] || {};
          question.answer = original.answer;
          question.officialSummary = original.officialSummary;
          question.checkPoint = original.checkPoint;
          question.sourceNote = original.sourceNote;
        });
      }

      const override = effectiveOverrides[exam.id];
      if (override) {
        exam.answerKey = override.answerKey.slice();
        exam.questions?.forEach((question, index) => {
          question.answer = override.answerKey[index];
          const baseAnswer = Number(base.answerKey[index]);
          const currentAnswer = Number(override.answerKey[index]);
          if (baseAnswer !== currentAnswer) {
            const correctionText = `정답 수정: 원본 ${answerLabel(baseAnswer)} → 현재 ${answerLabel(currentAnswer)}${override.note ? ` · ${override.note}` : ''}`;
            question.sourceNote = [question.sourceNote, correctionText].filter(Boolean).join('\n');
          }
        });
      }

      const patches = BUILTIN_QUESTION_PATCHES[exam.id] || {};
      Object.entries(patches).forEach(([questionNo, patch]) => {
        const questionIndex = Number(questionNo) - 1;
        const question = exam.questions?.[questionIndex];
        if (!question) return;
        if (patch.expectedAnswer && Number(exam.answerKey[questionIndex]) !== Number(patch.expectedAnswer)) return;
        const { expectedAnswer, ...contentPatch } = patch;
        Object.assign(question, contentPatch);
        question.answer = exam.answerKey[questionIndex];
      });
    });

    window.YP_EFFECTIVE_ANSWER_KEYS = effectiveOverrides;
  }

  function isValidBackendUrl(value) {
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/i.test(String(value || '').trim());
  }

  function jsonp(action, params = {}, timeoutMs = SERVER_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const backendUrl = String(config.backendUrl || '').trim();
      if (!isValidBackendUrl(backendUrl)) {
        reject(new Error('Apps Script 주소가 설정되어 있지 않습니다.'));
        return;
      }

      const callbackName = `${CALLBACK_PREFIX}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const url = new URL(backendUrl);
      url.searchParams.set('action', action);
      url.searchParams.set('callback', callbackName);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
      });

      const script = document.createElement('script');
      let finished = false;
      const timer = window.setTimeout(() => finish(new Error('정답표 서버 응답 시간이 초과되었습니다.')), timeoutMs);

      function cleanup() {
        window.clearTimeout(timer);
        try { delete window[callbackName]; } catch (error) { window[callbackName] = undefined; }
        script.remove();
      }

      function finish(error, value) {
        if (finished) return;
        finished = true;
        cleanup();
        if (error) reject(error);
        else resolve(value);
      }

      window[callbackName] = (response) => {
        if (!response || response.ok === false) {
          finish(new Error(response?.error || response?.message || '정답표 서버 요청에 실패했습니다.'));
          return;
        }
        finish(null, response);
      };
      script.onerror = () => finish(new Error('정답표 서버에 연결하지 못했습니다.'));
      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  async function fetchRemoteOverrides() {
    if (typeof document === 'undefined' || !isValidBackendUrl(config.backendUrl)) return null;
    const response = await jsonp('answerKeys');
    return normalizeOverrideMap(response.answerKeys || []);
  }

  function stableString(value) {
    const normalized = normalizeOverrideMap(value);
    const ordered = {};
    Object.keys(normalized).sort().forEach((key) => { ordered[key] = normalized[key]; });
    return JSON.stringify(ordered);
  }

  function loadEntryScript() {
    if (!entryScript || typeof document === 'undefined') return;
    if ([...document.scripts].some((script) => script.dataset.ypEntry === entryScript)) return;
    const script = document.createElement('script');
    script.src = entryScript;
    script.dataset.ypEntry = entryScript;
    script.onload = () => scheduleTeacherUi();
    script.onerror = () => {
      const target = document.getElementById('app') || document.getElementById('reportApp');
      if (target) target.innerHTML = '<div class="error-panel"><h2>사이트 실행 파일을 불러오지 못했습니다.</h2><p>브라우저를 강력 새로고침한 뒤 다시 시도하세요.</p></div>';
    };
    document.body.appendChild(script);
  }

  async function bootstrap() {
    const cached = readCachedOverrides();
    applyOverrides(mergeOverrides(BUILTIN_OVERRIDES, cached));

    try {
      const remote = await fetchRemoteOverrides();
      if (remote) {
        const next = mergeOverrides(BUILTIN_OVERRIDES, remote);
        saveCachedOverrides(remote);
        applyOverrides(next);
      }
    } catch (error) {
      console.warn('중앙 정답표를 불러오지 못해 기본·캐시 정답표를 사용합니다.', error);
    } finally {
      loadEntryScript();
    }
  }

  function parseAnswerSequence(text, count) {
    let raw = String(text || '').trim();
    if (!raw) return [];
    const circled = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5' };
    Object.entries(circled).forEach(([from, to]) => { raw = raw.split(from).join(to); });
    const tokens = raw.split(/[\s,;/|]+/).filter(Boolean);
    if (tokens.length === 1 && new RegExp(`^[1-5]{${count}}$`).test(tokens[0])) {
      return tokens[0].split('').map(Number);
    }
    return tokens.slice(0, count).map(Number);
  }

  function readWriteKey() {
    try {
      return String(localStorage.getItem(WRITE_KEY_STORAGE_KEY) || sessionStorage.getItem('tpl-backend-write-key') || '').trim();
    } catch (error) {
      return '';
    }
  }

  function saveWriteKey(value) {
    const key = String(value || '').trim();
    if (!key) return '';
    try {
      localStorage.setItem(WRITE_KEY_STORAGE_KEY, key);
      sessionStorage.setItem('tpl-backend-write-key', key);
    } catch (error) {
      console.warn('저장 키를 보관하지 못했습니다.', error);
    }
    return key;
  }

  function injectUiStyles() {
    if (document.getElementById('yp-answer-key-style')) return;
    const style = document.createElement('style');
    style.id = 'yp-answer-key-style';
    style.textContent = `
      .yp-answer-key-fab{position:fixed;right:22px;bottom:22px;z-index:95;min-height:48px;padding:0 18px;border:0;border-radius:999px;color:#fff;background:linear-gradient(135deg,#082f76,#0a67f5);box-shadow:0 16px 38px rgba(5,60,160,.28);font-weight:900;cursor:pointer}
      .yp-answer-key-fab:hover{transform:translateY(-1px)}
      .yp-answer-key-overlay{position:fixed;inset:0;z-index:300;display:grid;place-items:center;padding:18px;background:rgba(2,18,47,.62);backdrop-filter:blur(8px)}
      .yp-answer-key-modal{width:min(850px,100%);max-height:calc(100vh - 36px);overflow:auto;border-radius:24px;background:#fff;box-shadow:0 30px 90px rgba(0,0,0,.30)}
      .yp-answer-key-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:18px;padding:22px 24px 16px;border-bottom:1px solid #dce6f3;background:rgba(255,255,255,.96);backdrop-filter:blur(10px)}
      .yp-answer-key-head h2{margin:0;color:#0b2858;font-size:22px;letter-spacing:-.04em}
      .yp-answer-key-head p{margin:5px 0 0;color:#6a7890;font-size:12px}
      .yp-answer-key-close{width:38px;height:38px;border:0;border-radius:12px;background:#eef3f9;font-size:22px;cursor:pointer}
      .yp-answer-key-body{padding:22px 24px 26px}
      .yp-answer-key-row{display:grid;grid-template-columns:1fr 1fr;gap:13px}
      .yp-answer-key-field{display:grid;gap:7px;margin-bottom:14px}
      .yp-answer-key-field label{color:#334968;font-size:12px;font-weight:900}
      .yp-answer-key-field select,.yp-answer-key-field input,.yp-answer-key-field textarea{width:100%;border:1px solid #ccd9e9;border-radius:12px;background:#fff;color:#172033;outline:none}
      .yp-answer-key-field select,.yp-answer-key-field input{height:44px;padding:0 12px}
      .yp-answer-key-field textarea{min-height:78px;padding:11px 12px;resize:vertical}
      .yp-answer-key-status{margin:4px 0 16px;padding:12px 14px;border:1px solid #cfe0fa;border-radius:13px;color:#274b82;background:#f3f8ff;font-size:12px}
      .yp-answer-key-grid{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:8px;margin:12px 0 18px}
      .yp-answer-key-cell{display:grid;gap:5px;padding:8px;border:1px solid #dbe5f2;border-radius:12px;background:#f8fbff;text-align:center}
      .yp-answer-key-cell span{color:#62728a;font-size:10px;font-weight:900}
      .yp-answer-key-cell select{width:100%;height:36px;border:1px solid #cbd8e9;border-radius:9px;background:#fff;text-align:center;font-weight:900}
      .yp-answer-key-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
      .yp-answer-key-btn{min-height:43px;padding:0 15px;border:1px solid #cdd9e8;border-radius:12px;background:#f7f9fc;color:#34506f;font-weight:900;cursor:pointer}
      .yp-answer-key-btn.primary{border-color:#0a5ff0;color:#fff;background:linear-gradient(135deg,#083b91,#0a67f5)}
      .yp-answer-key-btn.danger{border-color:#efc9cf;color:#b13545;background:#fff7f8}
      .yp-answer-key-message{min-height:22px;margin-top:10px;color:#2d5e9e;font-size:12px;font-weight:800;text-align:right}
      @media(max-width:720px){.yp-answer-key-fab{right:14px;bottom:14px}.yp-answer-key-row{grid-template-columns:1fr}.yp-answer-key-grid{grid-template-columns:repeat(5,minmax(0,1fr))}.yp-answer-key-body{padding:18px 15px 22px}.yp-answer-key-head{padding:18px 16px 14px}}
    `;
    document.head.appendChild(style);
  }

  function createTeacherUi() {
    if (document.getElementById('ypAnswerKeyButton') || document.getElementById('reportApp')) return;
    injectUiStyles();

    const button = document.createElement('button');
    button.id = 'ypAnswerKeyButton';
    button.type = 'button';
    button.className = 'yp-answer-key-fab';
    button.textContent = '정답 수정';
    button.title = '시험별 정답표를 확인하고 수정합니다.';
    document.body.appendChild(button);

    button.addEventListener('click', openModal);
  }

  function scheduleTeacherUi() {
    if (typeof document === 'undefined') return;
    const run = () => window.setTimeout(createTeacherUi, 250);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
  }

  function openModal() {
    if (document.getElementById('ypAnswerKeyOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'ypAnswerKeyOverlay';
    overlay.className = 'yp-answer-key-overlay';
    overlay.innerHTML = `
      <section class="yp-answer-key-modal" role="dialog" aria-modal="true" aria-labelledby="ypAnswerKeyTitle">
        <header class="yp-answer-key-head">
          <div><h2 id="ypAnswerKeyTitle">시험별 정답표 수정</h2><p>저장한 정답표는 Google Sheets의 AnswerKeys 시트에 보관되고 기존 학생 링크에도 즉시 적용됩니다.</p></div>
          <button type="button" class="yp-answer-key-close" aria-label="닫기">×</button>
        </header>
        <div class="yp-answer-key-body">
          <div class="yp-answer-key-row">
            <div class="yp-answer-key-field"><label for="ypAnswerKeyExam">시험</label><select id="ypAnswerKeyExam"></select></div>
            <div class="yp-answer-key-field"><label for="ypAnswerKeyPaste">정답표 한 줄 붙여넣기</label><input id="ypAnswerKeyPaste" placeholder="예: 3 2 3 3 5 2 1 ..."></div>
          </div>
          <div id="ypAnswerKeyStatus" class="yp-answer-key-status"></div>
          <div id="ypAnswerKeyGrid" class="yp-answer-key-grid"></div>
          <div class="yp-answer-key-field"><label for="ypAnswerKeyNote">수정 사유·메모</label><textarea id="ypAnswerKeyNote" placeholder="예: 7번 해설의 ㄱ·ㄴ·ㄷ 판정에 따라 정답을 ①로 교정"></textarea></div>
          <div class="yp-answer-key-actions">
            <button type="button" class="yp-answer-key-btn danger" data-action="reset">기본 정답표로 되돌리기</button>
            <button type="button" class="yp-answer-key-btn" data-action="apply-paste">붙여넣기 적용</button>
            <button type="button" class="yp-answer-key-btn primary" data-action="save">Google Sheets에 저장</button>
          </div>
          <div id="ypAnswerKeyMessage" class="yp-answer-key-message" aria-live="polite"></div>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);

    const examSelect = overlay.querySelector('#ypAnswerKeyExam');
    examSelect.innerHTML = catalog.map((exam) => `<option value="${escapeHtml(exam.id)}">${escapeHtml(exam.title)}</option>`).join('');
    const pageExam = new URLSearchParams(location.search).get('exam');
    if (catalog.some((exam) => exam.id === pageExam)) examSelect.value = pageExam;

    overlay.querySelector('.yp-answer-key-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
    examSelect.addEventListener('change', () => renderModalExam(overlay));
    overlay.querySelector('[data-action="apply-paste"]').addEventListener('click', () => applyPasteToModal(overlay));
    overlay.querySelector('[data-action="save"]').addEventListener('click', () => saveModalAnswerKey(overlay));
    overlay.querySelector('[data-action="reset"]').addEventListener('click', () => resetModalAnswerKey(overlay));
    renderModalExam(overlay);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function currentExamKey(examId) {
    const exam = catalog.find((item) => item.id === examId);
    return exam?.answerKey?.slice() || [];
  }

  function renderModalExam(overlay) {
    const examId = overlay.querySelector('#ypAnswerKeyExam').value;
    const exam = catalog.find((item) => item.id === examId);
    if (!exam) return;

    const override = effectiveOverrides[examId];
    const base = baseState.get(examId)?.answerKey || [];
    const current = currentExamKey(examId);
    const changed = current.reduce((count, value, index) => count + (Number(value) !== Number(base[index]) ? 1 : 0), 0);
    const sourceText = override?.source === 'sheet'
      ? 'Google Sheets 사용자 수정'
      : override
        ? '사이트 기본 교정 또는 캐시'
        : '프로젝트 원본 정답표';

    overlay.querySelector('#ypAnswerKeyStatus').innerHTML =
      `<strong>${escapeHtml(exam.title)}</strong> · ${sourceText} · 원본 대비 ${changed}문항 수정` +
      (override?.updatedAt ? ` · ${escapeHtml(override.updatedAt)}` : '');

    overlay.querySelector('#ypAnswerKeyNote').value = override?.note || '';
    overlay.querySelector('#ypAnswerKeyPaste').value = current.join('\t');
    overlay.querySelector('#ypAnswerKeyGrid').innerHTML = current.map((value, index) => `
      <label class="yp-answer-key-cell">
        <span>${index + 1}번</span>
        <select data-question-index="${index}">
          ${[1,2,3,4,5].map((choice) => `<option value="${choice}" ${Number(value) === choice ? 'selected' : ''}>${answerLabel(choice)}</option>`).join('')}
        </select>
      </label>
    `).join('');
  }

  function applyPasteToModal(overlay) {
    const examId = overlay.querySelector('#ypAnswerKeyExam').value;
    const exam = catalog.find((item) => item.id === examId);
    const message = overlay.querySelector('#ypAnswerKeyMessage');
    const values = parseAnswerSequence(overlay.querySelector('#ypAnswerKeyPaste').value, exam?.answerCount || 0);
    if (!exam || values.length !== Number(exam.answerCount) || values.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) {
      message.textContent = `${exam?.answerCount || 20}개 정답을 1~5 사이 숫자로 입력해 주세요.`;
      return;
    }
    overlay.querySelectorAll('[data-question-index]').forEach((select, index) => { select.value = String(values[index]); });
    message.textContent = '붙여넣은 정답표를 입력칸에 적용했습니다. 저장 버튼을 눌러 확정하세요.';
  }

  function collectModalKey(overlay) {
    return [...overlay.querySelectorAll('[data-question-index]')].map((select) => Number(select.value));
  }

  async function requireWriteKey() {
    let key = readWriteKey();
    if (key) return key;
    key = window.prompt('Google Sheets 저장 키(WRITE_KEY)를 입력하세요.') || '';
    if (!String(key).trim()) throw new Error('정답표를 저장하려면 Google Sheets 저장 키가 필요합니다.');
    return saveWriteKey(key);
  }

  async function saveModalAnswerKey(overlay) {
    const message = overlay.querySelector('#ypAnswerKeyMessage');
    const examId = overlay.querySelector('#ypAnswerKeyExam').value;
    const exam = catalog.find((item) => item.id === examId);
    const answerKey = collectModalKey(overlay);
    const note = overlay.querySelector('#ypAnswerKeyNote').value.trim();

    if (!exam || !normalizeKeyArray(examId, answerKey)) {
      message.textContent = '정답표 입력값을 확인해 주세요.';
      return;
    }

    try {
      message.textContent = 'Google Sheets에 정답표를 저장하는 중입니다…';
      const writeKey = await requireWriteKey();
      const response = await jsonp('saveAnswerKey', {
        writeKey,
        payload: JSON.stringify({ examId, answerKey, note })
      }, Math.max(SERVER_TIMEOUT_MS, 8000));

      const remote = normalizeOverrideMap(response.answerKeys || (response.answerKey ? [response.answerKey] : []));
      saveCachedOverrides(remote);
      applyOverrides(mergeOverrides(BUILTIN_OVERRIDES, remote));
      message.textContent = '정답표 저장을 완료했습니다. 최신 채점 결과로 페이지를 다시 엽니다.';
      window.setTimeout(() => location.reload(), 550);
    } catch (error) {
      message.textContent = error.message;
    }
  }

  async function resetModalAnswerKey(overlay) {
    const examId = overlay.querySelector('#ypAnswerKeyExam').value;
    const exam = catalog.find((item) => item.id === examId);
    const message = overlay.querySelector('#ypAnswerKeyMessage');
    if (!exam || !window.confirm(`${exam.title}의 사용자 수정 정답표를 삭제하고 프로젝트 기본 정답표로 되돌릴까요?`)) return;

    try {
      message.textContent = '사용자 수정 정답표를 삭제하는 중입니다…';
      const writeKey = await requireWriteKey();
      const response = await jsonp('deleteAnswerKey', { writeKey, examId }, Math.max(SERVER_TIMEOUT_MS, 8000));
      const remote = normalizeOverrideMap(response.answerKeys || []);
      saveCachedOverrides(remote);
      applyOverrides(mergeOverrides(BUILTIN_OVERRIDES, remote));
      message.textContent = '기본 정답표로 되돌렸습니다. 페이지를 다시 엽니다.';
      window.setTimeout(() => location.reload(), 550);
    } catch (error) {
      message.textContent = error.message;
    }
  }

  window.AnswerKeyManager = {
    version: '3.9.0',
    applyOverrides,
    getEffectiveOverrides: () => JSON.parse(JSON.stringify(effectiveOverrides)),
    fetchRemoteOverrides,
    builtinOverrides: JSON.parse(JSON.stringify(BUILTIN_OVERRIDES))
  };

  bootstrap();
})();
