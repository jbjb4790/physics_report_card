# Young's Physics GitHub 업로드 안내

이 폴더의 **내용 전체**를 GitHub 저장소 최상위에 올리면 됩니다. ZIP 파일 자체를 저장소에 한 파일로 올리는 것이 아니라, 압축을 푼 뒤 `.github`, `site`, `apps-script` 등이 저장소 루트에 보이도록 업로드하세요.

## 반드시 올라가야 하는 항목

- `.github/workflows/pages.yml` — GitHub Pages 자동 배포
- `site/` — 실제 사이트 전체
- `README.md` — 프로젝트 설명

## 함께 보관하면 좋은 항목

- `apps-script/` — Google Sheets 누적 저장을 사용할 때 필요한 코드
- `sample-data/` — CSV 입력 예시 및 기존 학생 데이터 사본
- `brand-assets/` — Young's Physics 로고 원본
- `tests/`, `package.json` — 기능 검증과 유지보수

## 업로드 순서

1. GitHub에서 새 저장소를 만듭니다.
2. 이 폴더 안의 파일과 폴더 전체를 저장소 최상위에 올립니다.
3. 기본 브랜치를 `main`으로 사용합니다.
4. 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정합니다.
5. **Actions** 탭에서 `Deploy TPL Score Report to GitHub Pages` 작업이 완료될 때까지 기다립니다.
6. 배포된 Pages 주소로 접속해 1회~10회 시험 선택, 학생 입력, 결과 링크, PDF·Word 버튼을 확인합니다.

## 중요: 학생 개인정보 포함

이 전체본에는 1회~5회 실제 학생 이름과 답안이 다음 파일에 들어 있습니다.

- `site/assets/seed-records.js`
- `site/assets/1회v3_학생기록_사이트반영.csv`
- `site/assets/2회v2_학생기록_사이트반영.csv`
- `site/assets/3회_학생기록_사이트반영.csv`
- `site/assets/4회_학생기록_사이트반영.csv`
- `site/assets/5회_학생기록_사이트반영.csv`
- `sample-data/`의 같은 회차별 CSV

공개 GitHub 저장소 또는 공개 GitHub Pages에 올리면 누구나 이 데이터를 내려받을 수 있습니다. 기존 학생 데이터를 사이트에서 바로 불러와야 할 때만 내부 운영 환경에서 사용하세요. 공개 배포에는 별도로 제공된 `공개안전본`을 권장합니다.
