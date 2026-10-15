# 검증 안내

- 모든 `site/assets/*.js` 파일과 `.gs` 소스를 `node --check`(코드 문법)로 검사합니다.
- `site/index.html`, `site/report.html`에 기존 스크립트와 v3.13.0 추가 스크립트가 같이 로드되는지 확인합니다.
- v3.14.0 ZIP의 `tests/roster_backend.test.js`는 모의 Google Sheets에서 StudentToken 유지·회차 추가·반 이동을 검사합니다.
- 이 검사는 실제 Apps Script 배포 환경과 학생 데이터에 대한 E2E 검사가 아닙니다.
