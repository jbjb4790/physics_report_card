window.APP_CONFIG = {
  appName: "Young's Physics | TPL 성적 분석",
  storageKey: 'tpl-score-report-records-v1',
  // 모든 교사 기기에서 자동 연결하려면 아래 값에 Apps Script /exec 주소를 넣고 GitHub에 올리세요.
  // WRITE_KEY는 절대로 이 파일에 넣지 않습니다.
  backendUrl: '',
  backendAutoConnect: true,
  backendSetupParam: 'appsScript',
  backendTimeoutMs: 15000,
  reportHashKey: 'report',
  serverHashKey: 'id',
  footerNote: '본 분석은 입력된 답안과 등록된 집단 데이터를 이용한 자동 학습 보조 자료입니다.'
};
