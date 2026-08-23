# Young’s Physics 물리1 역학 총괄평가 1번 정답 원복 v3.3.2

## 정답

물리1 역학 총괄평가 1번의 정답은 **⑤ 하나**이다.

시간기록계는 고정되어 있고 종이테이프가 움직인다. 최종 테이프에서 A가 첫 점이며 A-B-C-D가 왼쪽에서 오른쪽으로 배열되어 있으면, 테이프와 자동차의 실제 운동 방향은 그 반대인 **왼쪽**이다. 따라서 ①은 옳은 설명이다.

연속한 5타점 구간의 시간은 0.1 s이고, 구간 이동거리 차는 2 cm이므로

```text
a = 0.02 / (0.1)^2 = 2 m/s²
```

따라서 `0.2 m/s²`라고 한 ⑤가 잘못된 설명이므로 정답은 ⑤이다.

## 적용

이 ZIP의 내부 파일을 GitHub 저장소 최상위에 경로 그대로 덮어쓴다.

```text
site/index.html
site/report.html
site/assets/data/catalog.js
site/assets/data/catalog.json
site/assets/data/questions/physics1-basic-total-mechanics.json
tests/run-tests.mjs
package.json
```

이 패치는 다음 파일을 포함하지 않는다.

```text
.github/workflows/pages.yml
site/assets/runtime-config.js
apps-script/Code.gs
appsscript.json
```

따라서 현재 Apps Script 주소, GitHub Pages 배포 방식, 교사 PIN, 학생 기록은 변경되지 않는다.

## 배포 후

1. 새 커밋으로 GitHub Pages를 배포한다.
2. 사이트에서 `Ctrl+Shift+R`로 강력 새로고침한다.
3. 교사용 화면에서 `시험 설정 서버 동기화`를 한 번 실행한다.
4. `역학진단고사 v3.xlsx`를 다시 첨부한다.
5. 1번은 ⑤만 정답 처리되고 Excel 원본 총점과 일치하는지 확인한다.

v3.3.1 복수정답 패치를 이미 적용했더라도 이 패치를 덮어쓰면 ⑤ 단일 정답으로 복구된다.
