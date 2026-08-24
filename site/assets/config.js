window.APP_CONFIG = {
  appName: "Young's Physics | TPL 성적 분석",
  storageKey: 'tpl-score-report-records-v1',
  // 모든 교사 기기에서 자동 연결하려면 아래 값에 Apps Script /exec 주소를 넣고 GitHub에 올리세요.
  // WRITE_KEY는 절대로 이 파일에 넣지 않습니다.
  backendUrl: 'https://script.google.com/macros/s/AKfycbx3PkumTW3dFg1nvXpgcp3o0Y3NX7YfrcMyDUtYB_uMVAKsxe6SDPWi0clMBR-SPwkwzA/exec',
  backendAutoConnect: true,
  backendRequiredForSaves: true,
  autoSyncSameExamCohortOnSave: true,
  verifyServerCohortOnSave: true,
  syncServerRecordsOnLoad: true,

  // v3.9.1: 학생 목록은 가벼운 listLite API로 최대 500명씩 가져옵니다.
  serverSyncPageSize: 500,

  // Apps Script 콜드 스타트와 네트워크 지연을 고려한 타임아웃입니다.
  backendTimeoutMs: 45000,

  serverSyncIntervalMs: 120000,
  backendSetupParam: 'appsScript',
  reportHashKey: 'report',
  serverHashKey: 'id',
  fastSyncEnabled: true,
  fastSyncVersion: '3.9.1',
  footerNote: '본 분석은 입력된 답안과 등록된 집단 데이터를 이용한 자동 학습 보조 자료입니다.'
};
