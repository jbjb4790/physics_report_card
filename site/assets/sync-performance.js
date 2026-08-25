(function () {
  'use strict';

  const config = window.APP_CONFIG = window.APP_CONFIG || {};
  config.backendTimeoutMs = Math.max(60000, Number(config.backendTimeoutMs || 0));
  config.serverSyncPageSize = Math.max(500, Number(config.serverSyncPageSize || 0));
  config.fastSyncEnabled = true;
  config.fastSyncVersion = '3.9.2';
  config.fastReportEnabled = true;
  config.fastReportVersion = '3.9.2';

  if (window.__YP_FAST_SERVER_TRANSPORT__) return;

  const originalAppendChild = Node.prototype.appendChild;
  const normalizedBackend = String(config.backendUrl || '').trim().replace(/\/+$/, '');

  function isBackendScript(url) {
    return Boolean(normalizedBackend && String(url || '').startsWith(normalizedBackend));
  }

  function missingFastApi(response, functionName) {
    if (!response || response.ok !== false) return false;
    const code = String(response.code || '');
    const message = String(response.error || response.message || '');
    return code === 'UNKNOWN_ACTION' ||
      (code === 'SERVER_ERROR' && (
        message.includes(functionName) ||
        /is not defined|지원하지 않는 작업/.test(message)
      ));
  }

  function installFallback(callbackName, originalCallback, rewrittenUrl, legacyAction, functionName) {
    if (!callbackName || typeof originalCallback !== 'function') return;

    let fallbackStarted = false;
    window[callbackName] = function (response) {
      if (!fallbackStarted && missingFastApi(response, functionName)) {
        fallbackStarted = true;

        const fallbackUrl = new URL(rewrittenUrl);
        fallbackUrl.searchParams.set('action', legacyAction);
        fallbackUrl.searchParams.set('fastFallback', '1');

        const fallbackScript = document.createElement('script');
        fallbackScript.async = true;
        fallbackScript.dataset.ypFastTransportBypass = '1';
        fallbackScript.src = fallbackUrl.href;
        fallbackScript.onload = () => fallbackScript.remove();
        fallbackScript.onerror = () => {
          fallbackScript.remove();
          originalCallback({
            ok: false,
            code: 'FAST_API_FALLBACK_FAILED',
            error: '고속 API와 기존 API에 모두 연결하지 못했습니다.'
          });
        };
        return originalAppendChild.call(document.head, fallbackScript);
      }
      return originalCallback(response);
    };
  }

  Node.prototype.appendChild = function (child) {
    try {
      if (
        child &&
        child.tagName === 'SCRIPT' &&
        child.src &&
        child.dataset?.ypFastTransportBypass !== '1' &&
        isBackendScript(child.src)
      ) {
        const url = new URL(child.src);
        const action = String(url.searchParams.get('action') || '');
        const callbackName = String(url.searchParams.get('callback') || '');
        const originalCallback = callbackName ? window[callbackName] : null;

        if (action === 'ping') {
          url.searchParams.set('action', 'pingLite');
          installFallback(callbackName, originalCallback, url.href, 'ping', 'pingLite_');
          child.src = url.href;
        } else if (action === 'list') {
          url.searchParams.set('action', 'listLite');
          url.searchParams.set('limit', String(config.serverSyncPageSize || 500));
          installFallback(callbackName, originalCallback, url.href, 'list', 'listReportsLite_');
          child.src = url.href;
        } else if (action === 'get') {
          url.searchParams.set('action', 'getFast');
          installFallback(callbackName, originalCallback, url.href, 'get', 'getReportFast_');
          child.src = url.href;
        }
      }
    } catch (error) {
      console.warn('고속 서버 전송 패치를 적용하지 못했습니다.', error);
    }
    return originalAppendChild.apply(this, arguments);
  };

  window.__YP_FAST_SERVER_TRANSPORT__ = {
    version: '3.9.2',
    backendUrl: normalizedBackend,
    timeoutMs: config.backendTimeoutMs,
    pageSize: config.serverSyncPageSize,
    actions: {
      ping: 'pingLite',
      list: 'listLite',
      get: 'getFast'
    }
  };
})();
