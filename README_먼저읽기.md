# Young's Physics v3.13.0 패치 재전달

**학생 통합페이지 · 고정 링크 · 누적분석**

이 ZIP은 2026-10-15에 앞선 대화의 v3.13.0 기능을 기준으로 다시 제작한 패치입니다. 과거에 제공되었던 ZIP 원본이 이 세션에 보존되지 않아 완전히 동일한 바이너리라고 할 수 없습니다.

- 목적: 학생별 고정 StudentToken 링크 하나로 여러 회차 결과 확인, 누적 강점/약점 분석
- GitHub 신규: `site/student.html`, `site/assets/student-profile*.js/css`
- GitHub 교체: `site/index.html`, `site/report.html`
- Apps Script 신규: `apps-script/StudentProfiles.gs`
- 실제 운영 중인 `Code.gs`에 `studentResolve`, `studentProfile`, `studentDirectory` 분기를 추가해야 합니다.
- Google Sheets `Reports`는 수정하지 않으며 새 `Students` 탭을 사용합니다.
- GitHub/Apps Script에는 **아무 것도 자동 업로드·커밋·배포하지 않았습니다.**

실제 적용 전 `적용방법.md`와 `검증결과.md`를 읽으세요. 특히 현행 Apps Script 전체 코드를 반드시 먼저 백업하세요.
