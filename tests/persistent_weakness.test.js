const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const catalog = [
  {
    id: 'tpl-mid-01', round: 1, answerCount: 4,
    answerKey: [1, 2, 3, 4],
    domains: ['역학', '전기·자기', '역학', '파동·광학'],
    units: ['속도-시간 그래프', '합성 저항과 전력', '운동량과 충돌', '굴절과 전반사'],
    questions: [
      { unit: '역학', topic: '속도-시간 그래프' },
      { unit: '전기·자기', topic: '합성 저항과 전력' },
      { unit: '역학', topic: '운동량과 충돌' },
      { unit: '파동·광학', topic: '굴절과 전반사' }
    ]
  },
  {
    id: 'tpl-mid-02', round: 2, answerCount: 4,
    answerKey: [1, 2, 3, 4],
    domains: ['역학', '전기·자기', '역학', '파동·광학'],
    units: ['위치-시간 그래프', '직렬·병렬 회로', '충격량과 운동량', '렌즈와 상'],
    questions: [
      { unit: '역학', topic: '위치-시간 그래프' },
      { unit: '전기·자기', topic: '직렬·병렬 회로' },
      { unit: '역학', topic: '충격량과 운동량' },
      { unit: '파동·광학', topic: '렌즈와 상' }
    ]
  },
  {
    id: 'tpl-mid-03', round: 3, answerCount: 4,
    answerKey: [1, 2, 3, 4],
    domains: ['역학', '전기·자기', '역학', '파동·광학'],
    units: ['가속도-시간 그래프', '저항 회로', '탄성 충돌', '오목 거울의 상'],
    questions: [
      { unit: '역학', topic: '가속도-시간 그래프' },
      { unit: '전기·자기', topic: '저항 회로' },
      { unit: '역학', topic: '탄성 충돌' },
      { unit: '파동·광학', topic: '오목 거울의 상' }
    ]
  }
];

const window = {
  EXAM_CATALOG: catalog,
  TPLCore: {
    normalizeAnswers(values, count) {
      return Array.from({ length: count }, (_, index) => values[index] == null ? '' : values[index]);
    }
  }
};
const context = { window, globalThis: window, console, setTimeout, clearTimeout };
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, '..', 'site', 'assets', 'persistent-weakness.js'), 'utf8');
vm.runInContext(source, context);

const snapshot = {
  record: { examId: 'tpl-mid-03', round: 3, answers: [2, 2, 4, 4] },
  history: [
    { examId: 'tpl-mid-01', round: 1, answers: [2, 2, 3, 4] },
    { examId: 'tpl-mid-02', round: 2, answers: [2, 2, 4, 4] },
    { examId: 'tpl-mid-03', round: 3, answers: [2, 2, 4, 4] }
  ]
};

const result = window.YPPersistentWeakness.analyzeSnapshot(snapshot);
assert.strictEqual(result.historyCount, 3);
assert.ok(result.persistent.some((item) => item.id === 'motion-graphs'), '운동 그래프가 반복 취약으로 분류되어야 합니다.');
assert.ok(result.persistent.some((item) => item.id === 'momentum-collision'), '운동량·충돌이 반복 취약으로 분류되어야 합니다.');
assert.ok(!result.persistent.some((item) => item.id === 'circuits'), '회로는 모두 정답이므로 반복 취약이 아니어야 합니다.');
const motion = result.persistent.find((item) => item.id === 'motion-graphs');
assert.strictEqual(motion.missRounds, 3);
assert.strictEqual(motion.streak, 3);
assert.match(result.summary, /반복 오답/);
console.log('persistent_weakness.test.js: all assertions passed');
