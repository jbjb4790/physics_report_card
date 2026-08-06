window.APP_CONFIG = {
  appName: "Young's Physics | TPL 성적 분석",
  storageKey: 'tpl-score-report-records-v1',
  // 모든 교사 기기에서 자동 연결하려면 아래 값에 Apps Script /exec 주소를 넣고 GitHub에 올리세요.
  // WRITE_KEY는 절대로 이 파일에 넣지 않습니다.
  backendUrl: 'https://script.google.com/macros/s/AKfycbx3PkumTW3dFg1nvXpgcp3o0Y3NX7YfrcMyDUtYB_uMVAKsxe6SDPWi0clMBR-SPwkwzA/exec',
  backendAutoConnect: true,
  backendRequiredForSaves: true,
  // 새 학생 저장 전에 같은 시험의 기존 로컬·기본 기록을 Google Sheets에 자동 반영합니다.
  autoSyncSameExamCohortOnSave: true,
  // 서버가 반환한 비교 인원과 이 기기의 같은 시험 기록 수를 대조하고 부족하면 한 번 재동기화합니다.
  verifyServerCohortOnSave: true,
  syncServerRecordsOnLoad: true,
  serverSyncPageSize: 250,
  serverSyncIntervalMs: 120000,
  backendSetupParam: 'appsScript',
  backendTimeoutMs: 15000,
  reportHashKey: 'report',
  serverHashKey: 'id',
  footerNote: '본 분석은 입력된 답안과 등록된 집단 데이터를 이용한 자동 학습 보조 자료입니다.'
};
