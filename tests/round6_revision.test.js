const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root, 'site/assets/exam-data.js'), 'utf8'),
  context,
  { filename: 'exam-data.js' }
);

const exam = context.window.EXAM_CATALOG.find((item) => item.id === 'tpl-mid-06');
assert(exam, '6회 시험 데이터가 없습니다.');
assert.strictEqual(exam.answerKey.length, 20, '6회 정답표는 20문항이어야 합니다.');
assert.strictEqual(exam.answerKey[8], 4, '수정된 6회 9번 정답은 ④여야 합니다.');
assert.strictEqual(exam.answerKey[10], 1, '수정된 6회 11번 정답은 ①이어야 합니다.');

const q9 = exam.questions.find((q) => q.no === 9);
const q11 = exam.questions.find((q) => q.no === 11);
assert(q9 && q11, '6회 9번 또는 11번 데이터가 없습니다.');
assert.strictEqual(q9.answer, 4, '6회 9번 문항 정답 데이터가 ④가 아닙니다.');
assert.strictEqual(q11.answer, 1, '6회 11번 문항 정답 데이터가 ①이 아닙니다.');
assert(/10\s*N·m/.test(q11.officialSummary), '6회 11번 해설에 10 N·m가 반영되지 않았습니다.');
assert(!q11.sourceNote, '해결된 6회 11번 원문 불일치 메모가 남아 있습니다.');
assert(/9번 정답은 ④/.test(exam.sourceNotice), '6회 수정 정답 안내가 sourceNotice에 없습니다.');
assert(/11번 선택지/.test(exam.sourceNotice), '6회 11번 선택지 교정 안내가 sourceNotice에 없습니다.');

for (const rel of [
  'site/assets/TPL_중급_모의고사_6회.pdf',
  'site/assets/TPL_중급_모의고사_6회_해설.pdf',
  'site/assets/questions/round6/q11.webp'
]) {
  const file = path.join(root, rel);
  assert(fs.existsSync(file), `${rel} 파일이 없습니다.`);
  assert(fs.statSync(file).size > 1000, `${rel} 파일 크기가 비정상입니다.`);
}

const appScript = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
assert(/SERVER_VERSION\s*=\s*'3\.6\.0'/.test(appScript), 'Apps Script 서버 버전이 3.6.0이 아닙니다.');
assert(/answerKey:\s*\[4,1,3,5,5,1,2,5,4,5,1,1,4,3,4,5,2,4,3,2\]/.test(appScript), 'Apps Script의 6회 정답표가 수정되지 않았습니다.');
assert(/function\s+checkRound6Revision\s*\(/.test(appScript), 'checkRound6Revision 함수가 없습니다.');

console.log('round6_revision.test.js: all assertions passed');
