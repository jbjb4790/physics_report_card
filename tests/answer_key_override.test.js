const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'site', 'assets', 'answer-key-manager.js'), 'utf8');
const storage = new Map();
const catalog = [{
  id: 'tpl-mid-07',
  title: 'TPL 중급 모의고사 7회',
  answerCount: 20,
  answerKey: [3,2,3,3,5,2,2,3,3,3,5,3,4,3,5,5,4,1,4,1],
  questions: Array.from({length:20}, (_, index) => ({
    no: index + 1,
    answer: [3,2,3,3,5,2,2,3,3,3,5,3,4,3,5,5,4,1,4,1][index],
    officialSummary: 'original',
    checkPoint: 'original',
    sourceNote: ''
  }))
}];

const context = {
  window: {
    APP_CONFIG: { storageKey: 'test', backendUrl: '' },
    EXAM_CATALOG: catalog,
    setTimeout,
    clearTimeout,
    prompt: () => ''
  },
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  console,
  URL,
  setTimeout,
  clearTimeout
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context);

assert.strictEqual(catalog[0].answerKey[6], 1, '7회 7번 정답은 ①이어야 합니다.');
assert.strictEqual(catalog[0].questions[6].answer, 1, '7회 7번 문항 객체도 ①이어야 합니다.');
assert.ok(catalog[0].questions[6].officialSummary.includes('ㄱ만 옳아'), '교정 해설이 적용되어야 합니다.');
console.log('answer_key_override.test.js: all assertions passed');
