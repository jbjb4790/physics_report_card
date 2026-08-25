(function () {
  'use strict';

  if (window.YPInstantReportLinks?.version) return;

  const VERSION = '3.10.2';
  const config = window.APP_CONFIG || {};
  const core = window.TPLCore || {};
  const STORAGE_KEY = config.storageKey || 'tpl-score-report-records-v1';
  const SETTINGS_KEY = `${STORAGE_KEY}-settings`;
  const SERVER_HASH_KEY = config.serverHashKey || 'id';

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '');
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function records() {
    const value = readJson(STORAGE_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function backendUrl() {
    const settings = readJson(SETTINGS_KEY, {});
    return String(settings?.backendUrl || config.backendUrl || '').trim();
  }

  function isValidBackendUrl(value) {
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/i.test(String(value || '').trim());
  }

  function findRecord(token) {
    const target = String(token || '').trim();
    return records().find((record) => String(record?.serverId || '') === target) || null;
  }

  function reportUrl(record, token) {
    const api = backendUrl();
    if (!record || !token || !isValidBackendUrl(api)) return '';

    const url = new URL('report.html', document.baseURI || location.href);
    const hash = new URLSearchParams();
    hash.set(SERVER_HASH_KEY, token);
    hash.set('api', api);

    if (typeof core.identityFingerprint === 'function') {
      const fingerprint = String(core.identityFingerprint(record) || '').trim();
      if (fingerprint) hash.set('k', fingerprint);
    }

    url.hash = hash.toString();
    return url.href;
  }

  function toast(message, type = 'good') {
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
    window.setTimeout(() => node.remove(), 4200);
  }

  async function copyText(value) {
    const text = String(value || '');
    if (!text) return false;

    if (window.YPClipboard?.directCopy) {
      return Boolean(await window.YPClipboard.directCopy(text));
    }

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        console.warn('Clipboard API 복사 실패', error);
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let copied = false;
    try {
      copied = Boolean(document.execCommand('copy'));
    } catch (error) {
      copied = false;
    } finally {
      textarea.remove();
    }
    return copied;
  }

  function showManualCopy(url) {
    if (window.YPClipboard?.openManualDialog) {
      window.YPClipboard.openManualDialog(url, {
        status: '서버 재계산 없이 기존 학생 링크를 즉시 만들었습니다.'
      });
      return;
    }

    window.prompt(
      '브라우저가 자동 복사를 막았습니다. 아래 링크를 전체 선택해 복사하세요.',
      url
    );
  }

  function serverTokenFromRow(row) {
    const ref = String(row?.dataset?.recordRef || '');
    return ref.startsWith('server:') ? ref.slice(7).trim() : '';
  }

  async function handleRecordAction(event) {
    const button = event.target.closest('#recordBody button[data-action="copy"], #recordBody button[data-action="open"]');
    if (!button) return;

    const row = button.closest('tr[data-record-ref]');
    const token = serverTokenFromRow(row);
    if (!token) return;

    const record = findRecord(token);
    const url = reportUrl(record, token);

    // 로컬 캐시에 해당 학생 또는 서버 주소가 없으면 기존 앱의 안전한 저장 경로를 사용합니다.
    if (!record || !url) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const action = String(button.dataset.action || '');

    if (action === 'copy') {
      const original = button.innerHTML;
      button.disabled = true;
      button.textContent = '복사 중…';

      try {
        const copied = await copyText(url);
        if (copied) {
          toast(`${record.name || '학생'} 성적 분석 링크를 즉시 복사했습니다.`, 'good');
        } else {
          showManualCopy(url);
        }
      } catch (error) {
        console.warn(error);
        showManualCopy(url);
      } finally {
        button.disabled = false;
        button.innerHTML = original;
      }
      return;
    }

    if (action === 'open') {
      const popup = window.open('', '_blank');
      if (!popup) {
        toast('팝업이 차단되었습니다. 링크 복사를 이용해 새 탭에서 열어 주세요.', 'error');
        return;
      }

      try {
        popup.opener = null;
      } catch (error) {
        // 일부 브라우저에서는 opener 설정이 제한될 수 있습니다.
      }
      popup.location.href = url;
      toast(`${record.name || '학생'} 성적표를 즉시 열었습니다. 최신 통계는 성적표 서버에서 계산됩니다.`, 'good');
    }
  }

  document.addEventListener('click', handleRecordAction, true);

  window.YPInstantReportLinks = {
    version: VERSION,
    buildUrlForToken(token) {
      const record = findRecord(token);
      return reportUrl(record, token);
    }
  };
})();
