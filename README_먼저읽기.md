# Young's Physics v3.14.0 패치 재전달

**반별 학생 선택 · 모의고사 성적 입력 관리**

이 ZIP은 2026-10-15에 앞선 대화의 v3.14.0 기능을 기준으로 다시 제작한 패치입니다. 이전 ZIP과 바이너리까지 동일하다는 뜻은 아닙니다.

**먼저 v3.13.0 패치가 실제 적용되어 있어야 합니다.**

- 목적: 시험 → 반 → 학생 선택, 학생 정보 자동 입력, 기존 성적 수정, 미입력 관리
- GitHub 신규: `site/assets/class-student-entry.js`
- GitHub 교체: `site/index.html` (v3.13.0 관리자 스크립트 유지 + 새 스크립트 1개 추가)
- Apps Script 신규: `apps-script/ClassRoster.gs`
- 운영 `Code.gs`에 `classRoster`, `classRosterSave` 분기를 추가해야 합니다.
- Google Sheets에는 새 `Classes`, `ClassStudents` 탭만 생성합니다.
- `Reports`/`Students`/학생 토큰은 변경하지 않습니다.
- Github/Apps Script 실제 배포는 수행하지 않았습니다.

세부 안내는 `적용방법.md`를 보세요.
