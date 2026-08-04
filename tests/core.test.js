const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = {};
require('../site/assets/exam-data.js');
require('../site/assets/extra-practice.js');
require('../site/assets/extra-practice-round2.js');
require('../site/assets/extra-practice-round3.js');
require('../site/assets/extra-practice-round4.js');
require('../site/assets/extra-practice-round5.js');
require('../site/assets/extra-practice-round6.js');
require('../site/assets/extra-practice-round7.js');
require('../site/assets/extra-practice-round8.js');
require('../site/assets/extra-practice-round9.js');
require('../site/assets/extra-practice-round10.js');
require('../site/assets/seed-records.js');
const core = require('../site/assets/core.js');

const catalog = window.EXAM_CATALOG;
const exam = catalog[0];
const exam2 = catalog[1];
const exam3 = catalog[2];
const exam4 = catalog[3];
const exam5 = catalog[4];
const exam6 = catalog[5];
const exam7 = catalog[6];
const exam8 = catalog[7];
const exam9 = catalog[8];
const exam10 = catalog[9];

assert.equal(catalog.length, 10);
assert.equal(exam.id, 'tpl-mid-01');
assert.equal(exam2.id, 'tpl-mid-02');
assert.equal(exam3.id, 'tpl-mid-03');
assert.equal(exam4.id, 'tpl-mid-04');
assert.equal(exam5.id, 'tpl-mid-05');
assert.equal(exam6.id, 'tpl-mid-06');
assert.equal(exam7.id, 'tpl-mid-07');
assert.equal(exam8.id, 'tpl-mid-08');
assert.equal(exam9.id, 'tpl-mid-09');
assert.equal(exam10.id, 'tpl-mid-10');
assert.deepEqual(exam.answerKey, [4,5,4,1,3,3,5,5,2,5,4,5,3,5,2,5,2,5,4,1]);
assert.deepEqual(exam2.answerKey, [3,5,2,5,5,2,2,4,5,5,4,1,5,2,3,2,1,2,5,1]);
assert.deepEqual(exam3.answerKey, [4,5,3,4,1,4,3,3,1,2,4,3,4,5,2,2,4,2,2,4]);
assert.deepEqual(exam4.answerKey, [4,3,2,4,1,4,5,5,4,2,1,3,5,3,4,4,3,3,1,5]);
assert.deepEqual(exam5.answerKey, [2,3,5,5,1,3,5,5,3,3,3,1,5,2,3,1,3,3,3,5]);
assert.deepEqual(exam6.answerKey, [4,1,3,5,5,1,2,5,5,5,1,1,4,3,4,5,2,4,3,2]);
assert.deepEqual(exam7.answerKey, [3,2,3,3,5,2,2,3,3,3,5,3,4,3,5,5,4,1,4,1]);
assert.deepEqual(exam8.answerKey, [1,2,4,1,3,3,5,3,4,2,4,3,2,3,4,4,4,3,3,4]);
assert.deepEqual(exam9.answerKey, [2,1,3,3,3,3,5,1,2,3,4,1,5,3,5,3,3,3,4,3]);
assert.deepEqual(exam10.answerKey, [3,2,5,3,3,4,3,1,4,4,3,3,3,5,4,4,5,2,1,2]);
assert.equal(exam.answerCount, 20);
assert.equal(exam2.answerCount, 20);
assert.equal(exam3.answerCount, 20);
assert.equal(exam4.answerCount, 20);
assert.equal(exam5.answerCount, 20);
assert.equal(exam6.answerCount, 20);
assert.equal(exam7.answerCount, 20);
assert.equal(exam8.answerCount, 20);
assert.equal(exam9.answerCount, 20);
assert.equal(exam10.answerCount, 20);

const allCorrect = core.grade(exam, exam.answerKey);
assert.equal(allCorrect.score, 100);
assert.equal(allCorrect.correct, 20);
assert.equal(allCorrect.wrong, 0);
assert.equal(allCorrect.blank, 0);

const allWrongAnswers = exam.answerKey.map((answer) => answer === 5 ? 1 : answer + 1);
const allWrong = core.grade(exam, allWrongAnswers);
assert.equal(allWrong.score, -25);
assert.equal(allWrong.wrong, 20);

const allBlank = core.grade(exam, Array(20).fill(''));
assert.equal(allBlank.score, 0);
assert.equal(allBlank.blank, 20);

const mixed = exam.answerKey.slice();
for (let i = 10; i < 15; i += 1) mixed[i] = mixed[i] === 5 ? 1 : mixed[i] + 1;
for (let i = 15; i < 20; i += 1) mixed[i] = '';
const mixedGrade = core.grade(exam, mixed);
assert.equal(mixedGrade.score, 43.75);
assert.equal(mixedGrade.correct, 10);
assert.equal(mixedGrade.wrong, 5);
assert.equal(mixedGrade.blank, 5);

assert.deepEqual(core.parseAnswerText('4, 5 4/1;3 3 5 5 2 5 4 5 3 5 2 5 2 5 4 1', 20), exam.answerKey);
assert.deepEqual(core.parseAnswerText('① ② ③ ④ ⑤ X', 6), [1,2,3,4,5,'']);
assert.deepEqual(core.parseAnswerText('2 3 5 5 1 1 - 5 3 3 3 1 5 2 3 1 2 3 3 5', 20), [2,3,5,5,1,1,'',5,3,3,3,1,5,2,3,1,2,3,3,5]);

const now = new Date().toISOString();
const records = [
  {id:'a', examId:exam.id, school:'예시고', name:'가학생', answers:exam.answerKey, createdAt:now},
  {id:'b', examId:exam.id, school:'예시고', name:'나학생', answers:allWrongAnswers, createdAt:now},
  {id:'c', examId:exam.id, school:'예시고', name:'다학생', answers:mixed, createdAt:now}
];
const cohort = core.computeCohortStats(catalog, records, exam.id, records[0]);
assert.equal(cohort.total, 3);
assert.equal(cohort.rank, 1);
assert.equal(cohort.questionStats.length, 20);
assert.equal(cohort.domainAverages.length, 4);

const snapshot = core.buildSnapshot(catalog, records[0], records);
assert.equal(snapshot.record.score, 100);
assert.equal(snapshot.cohort.total, 3);
assert.ok(snapshot.analysis.comments.length > 0);
const roundTrip = core.decodePayload(core.encodePayload(snapshot));
assert.equal(roundTrip.record.name, '가학생');
assert.equal(roundTrip.record.score, 100);

assert.equal(exam.answerKey[6], 5);
assert.match(exam.sourceNotice, /7번/);
assert.match(exam.questions[6].sourceNote, /공식 정답표/);
assert.equal(Object.keys(window.TPL_EXTRA_PRACTICE).length, 20);
assert.equal(Object.keys(window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-02']).length, 20);
assert.equal(Object.keys(window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-03']).length, 20);
assert.equal(Object.keys(window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-04']).length, 20);
assert.equal(Object.keys(window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-05']).length, 20);
assert.equal(Object.keys(window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-06']).length, 20);
assert.equal(Object.keys(window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-07']).length, 20);
assert.equal(Object.keys(window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-08']).length, 20);
assert.equal(Object.keys(window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-09']).length, 20);
assert.equal(Object.keys(window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-10']).length, 20);

assert.equal(window.SEED_RECORDS_METADATA.count, 225);
assert.deepEqual(window.SEED_RECORDS_METADATA.byExam, {
  'tpl-mid-01': 41,
  'tpl-mid-02': 48,
  'tpl-mid-03': 47,
  'tpl-mid-04': 46,
  'tpl-mid-05': 43
});
assert.equal(window.SEED_RECORDS.length, 225);
assert.equal(window.SEED_RECORDS[0].name, '정인영');
assert.equal(window.SEED_RECORDS.at(-1).name, '민채원');
assert.equal(window.SEED_RECORDS.filter(item => item.examId === 'tpl-mid-01').length, 41);
assert.equal(window.SEED_RECORDS.filter(item => item.examId === 'tpl-mid-02').length, 48);
assert.equal(window.SEED_RECORDS.filter(item => item.examId === 'tpl-mid-03').length, 47);
assert.equal(window.SEED_RECORDS.filter(item => item.examId === 'tpl-mid-04').length, 46);
assert.equal(window.SEED_RECORDS.filter(item => item.examId === 'tpl-mid-05').length, 43);

const practiceKeys = [3,1,3,4,2,4,2,3,2,4,1,3,4,3,3,2,1,2,4,3];
for (let no = 1; no <= 20; no += 1) {
  const image = path.join(__dirname, '..', 'site', 'assets', 'questions', `q${String(no).padStart(2,'0')}.webp`);
  assert.ok(fs.existsSync(image), `${image} missing`);
  assert.ok(fs.statSync(image).size > 1000, `${image} too small`);
  const practice = window.TPL_EXTRA_PRACTICE[no];
  assert.ok(practice?.title, `practice title ${no} missing`);
  assert.ok(practice?.prompt, `practice prompt ${no} missing`);
  assert.equal(practice.choices?.length, 5, `practice choices ${no} must have five options`);
  assert.equal(new Set(practice.choices).size, 5, `practice choices ${no} must be unique`);
  assert.equal(practice.correct, practiceKeys[no - 1], `practice key ${no} mismatch`);
  assert.ok(practice.choices[practice.correct - 1], `practice correct choice ${no} missing`);
  assert.ok(practice.hint && practice.method && practice.solution, `practice explanation ${no} missing`);
}

const round2AllCorrect = core.grade(exam2, exam2.answerKey);
assert.equal(round2AllCorrect.score, 100);
assert.equal(round2AllCorrect.correct, 20);
assert.match(exam2.questions[2].sourceNote, /표준식/);
const round2PracticeKeys = [3,5,1,5,5,1,2,3,5,5,2,5,2,1,3,2,5,2,5,2];
for (let no = 1; no <= 20; no += 1) {
  const image = path.join(__dirname, '..', 'site', 'assets', 'questions', 'round2', `q${String(no).padStart(2,'0')}.webp`);
  assert.ok(fs.existsSync(image), `${image} missing`);
  assert.ok(fs.statSync(image).size > 1000, `${image} too small`);
  const practice = window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-02'][no];
  assert.ok(practice?.title && practice?.prompt, `round2 practice ${no} missing`);
  assert.equal(practice.choices?.length, 5, `round2 practice choices ${no}`);
  assert.equal(new Set(practice.choices).size, 5, `round2 choices ${no} must be unique`);
  assert.equal(practice.correct, round2PracticeKeys[no - 1], `round2 practice key ${no} mismatch`);
  assert.ok(practice.hint && practice.method && practice.solution, `round2 practice explanation ${no} missing`);
}

const round3AllCorrect = core.grade(exam3, exam3.answerKey);
assert.equal(round3AllCorrect.score, 100);
assert.equal(round3AllCorrect.correct, 20);
assert.match(exam3.sourceNotice, /3회 시험지와 공식 해설/);
const round3PracticeKeys = [3,4,4,2,4,5,2,3,4,2,2,4,3,4,4,3,4,2,2,4];
for (let no = 1; no <= 20; no += 1) {
  const image = path.join(__dirname, '..', 'site', 'assets', 'questions', 'round3', `q${String(no).padStart(2,'0')}.webp`);
  assert.ok(fs.existsSync(image), `${image} missing`);
  assert.ok(fs.statSync(image).size > 1000, `${image} too small`);
  const practice = window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-03'][no];
  assert.ok(practice?.title && practice?.prompt, `round3 practice ${no} missing`);
  assert.equal(practice.choices?.length, 5, `round3 practice choices ${no}`);
  assert.equal(new Set(practice.choices).size, 5, `round3 choices ${no} must be unique`);
  assert.equal(practice.correct, round3PracticeKeys[no - 1], `round3 practice key ${no} mismatch`);
  assert.ok(practice.hint && practice.method && practice.solution, `round3 practice explanation ${no} missing`);
}


const round4AllCorrect = core.grade(exam4, exam4.answerKey);
assert.equal(round4AllCorrect.score, 100);
assert.equal(round4AllCorrect.correct, 20);
assert.match(exam4.sourceNotice, /4회 시험지와 공식 해설/);
const round4PracticeKeys = [2,2,4,1,2,3,3,2,4,3,2,2,3,2,4,3,4,2,3,3];
for (let no = 1; no <= 20; no += 1) {
  const image = path.join(__dirname, '..', 'site', 'assets', 'questions', 'round4', `q${String(no).padStart(2,'0')}.webp`);
  assert.ok(fs.existsSync(image), `${image} missing`);
  assert.ok(fs.statSync(image).size > 1000, `${image} too small`);
  const practice = window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-04'][no];
  assert.ok(practice?.title && practice?.prompt, `round4 practice ${no} missing`);
  assert.equal(practice.choices?.length, 5, `round4 practice choices ${no}`);
  assert.equal(new Set(practice.choices).size, 5, `round4 choices ${no} must be unique`);
  assert.equal(practice.correct, round4PracticeKeys[no - 1], `round4 practice key ${no} mismatch`);
  assert.ok(practice.hint && practice.method && practice.solution, `round4 practice explanation ${no} missing`);
}


const round5AllCorrect = core.grade(exam5, exam5.answerKey);
assert.equal(round5AllCorrect.score, 100);
assert.equal(round5AllCorrect.correct, 20);
assert.match(exam5.sourceNotice, /5회 시험지와 공식 해설/);
assert.match(exam5.questions[15].sourceNote, /0.9 Ω/);
assert.match(exam5.questions[18].sourceNote, /축소된 정립 허상/);
const round5PracticeKeys = [3,2,4,1,5,2,3,4,2,5,1,3,4,2,5,1,3,4,2,5];
for (let no = 1; no <= 20; no += 1) {
  const image = path.join(__dirname, '..', 'site', 'assets', 'questions', 'round5', `q${String(no).padStart(2,'0')}.webp`);
  assert.ok(fs.existsSync(image), `${image} missing`);
  assert.ok(fs.statSync(image).size > 1000, `${image} too small`);
  const item = window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-05'][no];
  assert.ok(item?.title && item?.prompt, `round5 practice ${no} missing`);
  assert.equal(item.choices?.length, 5, `round5 practice choices ${no}`);
  assert.equal(new Set(item.choices).size, 5, `round5 choices ${no} must be unique`);
  assert.equal(item.correct, round5PracticeKeys[no - 1], `round5 practice key ${no} mismatch`);
  assert.ok(item.hint && item.method && item.solution, `round5 practice explanation ${no} missing`);
}


const round6AllCorrect = core.grade(exam6, exam6.answerKey);
assert.equal(round6AllCorrect.score, 100);
assert.equal(round6AllCorrect.correct, 20);
assert.match(exam6.sourceNotice, /6회 시험지와 공식 해설/);
assert.match(exam6.questions[10].sourceNote, /토크/);
assert.match(exam6.questions[13].sourceNote, /고전적 개념/);
const round6PracticeKeys = [3,2,4,3,5,3,4,1,5,4,2,4,3,2,4,3,2,4,2,4];
for (let no = 1; no <= 20; no += 1) {
  const image = path.join(__dirname, '..', 'site', 'assets', 'questions', 'round6', `q${String(no).padStart(2,'0')}.webp`);
  assert.ok(fs.existsSync(image), `${image} missing`);
  assert.ok(fs.statSync(image).size > 1000, `${image} too small`);
  const item = window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-06'][no];
  assert.ok(item?.title && item?.prompt, `round6 practice ${no} missing`);
  assert.equal(item.choices?.length, 5, `round6 practice choices ${no}`);
  assert.equal(new Set(item.choices).size, 5, `round6 choices ${no} must be unique`);
  assert.equal(item.correct, round6PracticeKeys[no - 1], `round6 practice key ${no} mismatch`);
  assert.ok(item.hint && item.method && item.solution, `round6 practice explanation ${no} missing`);
}

const round7AllCorrect = core.grade(exam7, exam7.answerKey);
assert.equal(round7AllCorrect.score, 100);
assert.equal(round7AllCorrect.correct, 20);
assert.match(exam7.sourceNotice, /7회 시험지와 공식 해설/);
assert.match(exam7.questions[6].sourceNote, /공식 정답표/);
assert.match(exam7.questions[8].sourceNote, /mgd/);
const round7PracticeKeys = [3,1,3,3,4,5,2,3,1,4,2,3,4,3,4,5,4,1,4,1];
for (let no = 1; no <= 20; no += 1) {
  const image = path.join(__dirname, '..', 'site', 'assets', 'questions', 'round7', `q${String(no).padStart(2,'0')}.webp`);
  assert.ok(fs.existsSync(image), `${image} missing`);
  assert.ok(fs.statSync(image).size > 1000, `${image} too small`);
  const item = window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-07'][no];
  assert.ok(item?.title && item?.prompt, `round7 practice ${no} missing`);
  assert.equal(item.choices?.length, 5, `round7 practice choices ${no}`);
  assert.equal(new Set(item.choices).size, 5, `round7 choices ${no} must be unique`);
  assert.equal(item.correct, round7PracticeKeys[no - 1], `round7 practice key ${no} mismatch`);
  assert.ok(item.hint && item.method && item.solution, `round7 practice explanation ${no} missing`);
}

const round8AllCorrect = core.grade(exam8, exam8.answerKey);
assert.equal(round8AllCorrect.score, 100);
assert.equal(round8AllCorrect.correct, 20);
assert.match(exam8.sourceNotice, /8회 시험지와 공식 해설/);
assert.match(exam8.questions[11].sourceNote, /정답표와 해설 내부/);
assert.match(exam8.questions[18].sourceNote, /①과 ③/);
const round8PracticeKeys = [4,3,3,3,4,4,5,3,4,4,3,4,4,3,3,3,4,4,4,3];
for (let no = 1; no <= 20; no += 1) {
  const image = path.join(__dirname, '..', 'site', 'assets', 'questions', 'round8', `q${String(no).padStart(2,'0')}.webp`);
  assert.ok(fs.existsSync(image), `${image} missing`);
  assert.ok(fs.statSync(image).size > 1000, `${image} too small`);
  const item = window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-08'][no];
  assert.ok(item?.title && item?.prompt, `round8 practice ${no} missing`);
  assert.equal(item.choices?.length, 5, `round8 practice choices ${no}`);
  assert.equal(new Set(item.choices).size, 5, `round8 choices ${no} must be unique`);
  assert.equal(item.correct, round8PracticeKeys[no - 1], `round8 practice key ${no} mismatch`);
  assert.ok(item.hint && item.method && item.solution, `round8 practice explanation ${no} missing`);
}


const round9AllCorrect = core.grade(exam9, exam9.answerKey);
assert.equal(round9AllCorrect.score, 100);
assert.equal(round9AllCorrect.correct, 20);
assert.match(exam9.sourceNotice, /9회 시험지와 공식 해설/);
assert.match(exam9.questions[6].sourceNote, /공식 정답표/);
const round9PracticeKeys = [3,3,2,3,4,3,4,2,5,3,4,1,3,4,2,2,3,4,5,3];
for (let no = 1; no <= 20; no += 1) {
  const image = path.join(__dirname, '..', 'site', 'assets', 'questions', 'round9', `q${String(no).padStart(2,'0')}.webp`);
  assert.ok(fs.existsSync(image), `${image} missing`);
  assert.ok(fs.statSync(image).size > 1000, `${image} too small`);
  const item = window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-09'][no];
  assert.ok(item?.title && item?.prompt, `round9 practice ${no} missing`);
  assert.equal(item.choices?.length, 5, `round9 practice choices ${no}`);
  assert.equal(new Set(item.choices).size, 5, `round9 choices ${no} must be unique`);
  assert.equal(item.correct, round9PracticeKeys[no - 1], `round9 practice key ${no} mismatch`);
  assert.ok(item.hint && item.method && item.solution, `round9 practice explanation ${no} missing`);
}

const round10AllCorrect = core.grade(exam10, exam10.answerKey);
assert.equal(round10AllCorrect.score, 100);
assert.equal(round10AllCorrect.correct, 20);
assert.match(exam10.sourceNotice, /10회 시험지와 공식 해설/);
assert.match(exam10.questions[0].sourceNote, /포물선 운동/);
assert.match(exam10.questions[4].sourceNote, /정의되지 않은 ㄹ/);
assert.match(exam10.questions[17].sourceNote, /공식 정답표/);
const round10PracticeKeys = [3,3,4,3,2,4,3,5,3,4,5,3,4,5,4,4,5,4,2,4];
for (let no = 1; no <= 20; no += 1) {
  const image = path.join(__dirname, '..', 'site', 'assets', 'questions', 'round10', `q${String(no).padStart(2,'0')}.webp`);
  assert.ok(fs.existsSync(image), `${image} missing`);
  assert.ok(fs.statSync(image).size > 1000, `${image} too small`);
  const item = window.TPL_EXTRA_PRACTICE_BY_EXAM['tpl-mid-10'][no];
  assert.ok(item?.title && item?.prompt, `round10 practice ${no} missing`);
  assert.equal(item.choices?.length, 5, `round10 practice choices ${no}`);
  assert.equal(new Set(item.choices).size, 5, `round10 choices ${no} must be unique`);
  assert.equal(item.correct, round10PracticeKeys[no - 1], `round10 practice key ${no} mismatch`);
  assert.ok(item.hint && item.method && item.solution, `round10 practice explanation ${no} missing`);
}

const seed5 = window.SEED_RECORDS.find(item => item.examId === 'tpl-mid-05' && item.name === '오하름');
assert.ok(seed5, '오하름 5회 기록이 있어야 합니다.');
assert.equal(core.grade(exam5, seed5.answers).score, 82.5);

const seed4 = window.SEED_RECORDS.find(item => item.examId === 'tpl-mid-04' && item.name === '김도엽');
assert.ok(seed4, '김도엽 4회 기록이 있어야 합니다.');
assert.equal(core.grade(exam4, seed4.answers).score, 87.5);

const seed1 = window.SEED_RECORDS.find(item => item.examId === 'tpl-mid-01' && item.name === '주하준');
const seed2 = window.SEED_RECORDS.find(item => item.examId === 'tpl-mid-02' && item.name === '주하준');
const seed3 = window.SEED_RECORDS.find(item => item.examId === 'tpl-mid-03' && item.name === '주하준');
const seed4History = window.SEED_RECORDS.find(item => item.examId === 'tpl-mid-04' && item.name === '주하준');
const seed5History = window.SEED_RECORDS.find(item => item.examId === 'tpl-mid-05' && item.name === '주하준');
assert.ok(seed1 && seed2 && seed3 && seed4History && seed5History, '주하준 1·2·3·4·5회 기록이 모두 있어야 합니다.');
const historySnapshot = core.buildSnapshot(catalog, seed5History, [seed1, seed2, seed3, seed4History, seed5History]);
assert.equal(historySnapshot.history.length, 5);
assert.equal(historySnapshot.analysis.previousRound, 4);
assert.equal(historySnapshot.record.round, 5);

for (const file of [
  'assets/youngs-physics-logo.png',
  'assets/youngs-physics-mark.png',
  'assets/youngs-physics-mark-192.png',
  'assets/youngs-physics-mark-512.png',
  'assets/orbit-light.svg'
]) {
  const target = path.join(__dirname, '..', 'site', file);
  assert.ok(fs.existsSync(target), `${file} missing`);
  assert.ok(fs.statSync(target).size > 500, `${file} too small`);
}

for (const file of [
  'index.html',
  'report.html',
  'assets/app.js',
  'assets/report.js',
  'assets/styles.css',
  'assets/core.js',
  'assets/extra-practice-round2.js',
  'assets/extra-practice-round3.js',
  'assets/extra-practice-round4.js',
  'assets/extra-practice-round5.js',
  'assets/extra-practice-round6.js',
  'assets/extra-practice-round7.js',
  'assets/extra-practice-round8.js',
  'assets/extra-practice-round9.js',
  'assets/extra-practice-round10.js',
  'assets/TPL_중급_모의고사_2회.pdf',
  'assets/TPL_중급_모의고사_2회_해설.pdf',
  'assets/TPL_중급_모의고사_3회.pdf',
  'assets/TPL_중급_모의고사_3회_해설.pdf',
  'assets/TPL_중급_모의고사_4회.pdf',
  'assets/TPL_중급_모의고사_4회_해설.pdf',
  'assets/TPL_중급_모의고사_5회.pdf',
  'assets/TPL_중급_모의고사_5회_해설.pdf',
  'assets/TPL_중급_모의고사_6회.pdf',
  'assets/TPL_중급_모의고사_6회_해설.pdf',
  'assets/TPL_중급_모의고사_7회.pdf',
  'assets/TPL_중급_모의고사_7회_해설.pdf',
  'assets/TPL_중급_모의고사_8회.pdf',
  'assets/TPL_중급_모의고사_8회_해설.pdf',
  'assets/TPL_중급_모의고사_9회.pdf',
  'assets/TPL_중급_모의고사_9회_해설.pdf',
  'assets/TPL_중급_모의고사_10회.pdf',
  'assets/TPL_중급_모의고사_10회_해설.pdf',
  'assets/3회_학생기록_사이트반영.csv',
  'assets/4회_학생기록_사이트반영.csv',
  'assets/5회_학생기록_사이트반영.csv'
]) {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'site', file)), `${file} missing`);
}

console.log('core.test.js: all assertions passed');
