const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Range {
  constructor(sheet, row, col, rows, cols) {
    this.sheet = sheet; this.row = row; this.col = col; this.rows = rows; this.cols = cols;
  }
  getValues() {
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.cols }, (_, c) => this.sheet.cell(this.row + r, this.col + c)));
  }
  getDisplayValues() { return this.getValues().map(row => row.map(value => String(value ?? ''))); }
  setValues(values) {
    values.forEach((row, r) => row.forEach((value, c) => this.sheet.setCell(this.row + r, this.col + c, value)));
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  cell(row, col) { return this.rows[row - 1]?.[col - 1] ?? ''; }
  setCell(row, col, value) {
    while (this.rows.length < row) this.rows.push([]);
    while (this.rows[row - 1].length < col) this.rows[row - 1].push('');
    this.rows[row - 1][col - 1] = value;
  }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i -= 1) if (this.rows[i].some(value => value !== '' && value != null)) return i + 1;
    return 0;
  }
  getRange(row, col, rows, cols) { return new Range(this, row, col, rows, cols); }
  setFrozenRows() {}
  appendRow(row) { this.rows.push([...row]); }
  deleteRow(row) { this.rows.splice(row - 1, 1); }
}

class Spreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { const sheet = new Sheet(name); this.sheets.set(name, sheet); return sheet; }
}

const spreadsheet = new Spreadsheet();
const properties = new Map([['WRITE_KEY', 'teacher-secret']]);
let uuidCounter = 1;
const context = {
  console,
  Date,
  JSON,
  Math,
  Infinity,
  Error,
  String,
  Number,
  Object,
  Array,
  RegExp,
  PropertiesService: {
    getScriptProperties() {
      return { getProperty: key => properties.get(key) || null };
    }
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => spreadsheet,
    openById: () => spreadsheet
  },
  LockService: {
    getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
  },
  Utilities: {
    getUuid() {
      const suffix = String(uuidCounter++).padStart(12, '0');
      return `aaaaaaaa-bbbb-4ccc-8ddd-${suffix}`;
    }
  },
  ContentService: {
    MimeType: { JAVASCRIPT: 'application/javascript', JSON: 'application/json' },
    createTextOutput(text) {
      return { text, mimeType: '', setMimeType(type) { this.mimeType = type; return this; } };
    }
  }
};
vm.createContext(context);
const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
vm.runInContext(code, context, { filename: 'Code.gs' });

function jsonp(action, params = {}) {
  const callback = 'cb';
  const output = context.doGet({ parameter: { action, callback, ...params } });
  assert.equal(output.mimeType, 'application/javascript');
  assert.match(output.text, /^cb\(/);
  return JSON.parse(output.text.slice(3, -2));
}

assert.equal(context.initializeSheet(), 'Reports 시트를 준비했습니다.');
assert.deepEqual(spreadsheet.getSheetByName('Reports').rows[0], Array.from(context.HEADERS));

const key = context.EXAMS['tpl-mid-01'].answerKey;
assert.equal(key[6], 5);
assert.equal(context.EXAMS['tpl-mid-01'].domains[12], '열·기체');
assert.deepEqual(Array.from(context.EXAMS['tpl-mid-02'].answerKey), [3,5,2,5,5,2,2,4,5,5,4,1,5,2,3,2,1,2,5,1]);
assert.deepEqual(Array.from(context.EXAMS['tpl-mid-03'].answerKey), [4,5,3,4,1,4,3,3,1,2,4,3,4,5,2,2,4,2,2,4]);
assert.equal(context.EXAMS['tpl-mid-03'].round, 3);
assert.deepEqual(Array.from(context.EXAMS['tpl-mid-04'].answerKey), [4,3,2,4,1,4,5,5,4,2,1,3,5,3,4,4,3,3,1,5]);
assert.equal(context.EXAMS['tpl-mid-04'].round, 4);
assert.deepEqual(Array.from(context.EXAMS['tpl-mid-05'].answerKey), [2,3,5,5,1,3,5,5,3,3,3,1,5,2,3,1,3,3,3,5]);
assert.equal(context.EXAMS['tpl-mid-05'].round, 5);
assert.deepEqual(Array.from(context.EXAMS['tpl-mid-06'].answerKey), [4,1,3,5,5,1,2,5,5,5,1,1,4,3,4,5,2,4,3,2]);
assert.equal(context.EXAMS['tpl-mid-06'].round, 6);
assert.deepEqual(Array.from(context.EXAMS['tpl-mid-07'].answerKey), [3,2,3,3,5,2,2,3,3,3,5,3,4,3,5,5,4,1,4,1]);
assert.equal(context.EXAMS['tpl-mid-07'].round, 7);
assert.deepEqual(Array.from(context.EXAMS['tpl-mid-08'].answerKey), [1,2,4,1,3,3,5,3,4,2,4,3,2,3,4,4,4,3,3,4]);
assert.equal(context.EXAMS['tpl-mid-08'].round, 8);
assert.deepEqual(Array.from(context.EXAMS['tpl-mid-09'].answerKey), [2,1,3,3,3,3,5,1,2,3,4,1,5,3,5,3,3,3,4,3]);
assert.equal(context.EXAMS['tpl-mid-09'].round, 9);
assert.deepEqual(Array.from(context.EXAMS['tpl-mid-10'].answerKey), [3,2,5,3,3,4,3,1,4,4,3,3,3,5,4,4,5,2,1,2]);
assert.equal(context.EXAMS['tpl-mid-10'].round, 10);

const ping = jsonp('ping');
assert.equal(ping.ok, true);

const missingKey = jsonp('save', { payload: '{}' });
assert.equal(missingKey.ok, false);
assert.equal(missingKey.code, 'WRITE_KEY_REQUIRED');

const aPayload = JSON.stringify({ examId: 'tpl-mid-01', school: '예시고', name: '가학생', answers: key });
const savedA = jsonp('save', { payload: aPayload, writeKey: 'teacher-secret' });
assert.equal(savedA.ok, true);
assert.match(savedA.token, /^[a-f0-9]{32}$/);
assert.equal(savedA.report.record.score, 100);
assert.equal(savedA.report.cohort.total, 1);
const tokenA = savedA.token;

const bPayload = JSON.stringify({ examId: 'tpl-mid-01', school: '예시고', name: '나학생', answers: Array(20).fill('') });
const savedB = jsonp('save', { payload: bPayload, writeKey: 'teacher-secret' });
assert.equal(savedB.report.record.score, 0);
assert.equal(savedB.report.cohort.total, 2);
assert.equal(savedB.report.cohort.average, 50);

const fetchedA = jsonp('get', { id: tokenA });
assert.equal(fetchedA.report.cohort.total, 2);
assert.equal(fetchedA.report.cohort.average, 50);
assert.equal(fetchedA.report.record.name, '가학생');

const oneWrong = [...key];
oneWrong[0] = 1;
const updatedA = jsonp('save', {
  payload: JSON.stringify({ examId: 'tpl-mid-01', school: '예시고', name: '가학생', answers: oneWrong }),
  writeKey: 'teacher-secret'
});
assert.equal(updatedA.token, tokenA, 'same school + name + exam must retain token');
assert.equal(updatedA.report.record.score, 93.75);
assert.equal(spreadsheet.getSheetByName('Reports').getLastRow(), 3, 'header + two students');

const key2 = context.EXAMS['tpl-mid-02'].answerKey;
const savedRound2 = jsonp('save', {
  payload: JSON.stringify({ examId: 'tpl-mid-02', school: '예시고', name: '가학생', answers: key2 }),
  writeKey: 'teacher-secret'
});
assert.equal(savedRound2.report.record.score, 100);
assert.equal(savedRound2.report.history.length, 2);
assert.equal(savedRound2.report.analysis.previousRound, 1);
assert.equal(spreadsheet.getSheetByName('Reports').getLastRow(), 4, 'header + three exam records');

const key3 = context.EXAMS['tpl-mid-03'].answerKey;
const savedRound3 = jsonp('save', {
  payload: JSON.stringify({ examId: 'tpl-mid-03', school: '예시고', name: '가학생', answers: key3 }),
  writeKey: 'teacher-secret'
});
assert.equal(savedRound3.report.record.score, 100);
assert.equal(savedRound3.report.history.length, 3);
assert.equal(savedRound3.report.analysis.previousRound, 2);
assert.equal(spreadsheet.getSheetByName('Reports').getLastRow(), 5, 'header + four exam records');

const key4 = context.EXAMS['tpl-mid-04'].answerKey;
const savedRound4 = jsonp('save', {
  payload: JSON.stringify({ examId: 'tpl-mid-04', school: '예시고', name: '가학생', answers: key4 }),
  writeKey: 'teacher-secret'
});
assert.equal(savedRound4.report.record.score, 100);
assert.equal(savedRound4.report.history.length, 4);
assert.equal(savedRound4.report.analysis.previousRound, 3);
assert.equal(spreadsheet.getSheetByName('Reports').getLastRow(), 6, 'header + five exam records');



const key5 = context.EXAMS['tpl-mid-05'].answerKey;
const savedRound5 = jsonp('save', {
  payload: JSON.stringify({ examId: 'tpl-mid-05', school: '예시고', name: '가학생', answers: key5 }),
  writeKey: 'teacher-secret'
});
assert.equal(savedRound5.report.record.score, 100);
assert.equal(savedRound5.report.history.length, 5);
assert.equal(savedRound5.report.analysis.previousRound, 4);
assert.equal(spreadsheet.getSheetByName('Reports').getLastRow(), 7, 'header + six exam records');



const key6 = context.EXAMS['tpl-mid-06'].answerKey;
const savedRound6 = jsonp('save', {
  payload: JSON.stringify({ examId: 'tpl-mid-06', school: '예시고', name: '가학생', answers: key6 }),
  writeKey: 'teacher-secret'
});
assert.equal(savedRound6.report.record.score, 100);
assert.equal(savedRound6.report.history.length, 6);
assert.equal(savedRound6.report.analysis.previousRound, 5);
assert.equal(spreadsheet.getSheetByName('Reports').getLastRow(), 8, 'header + seven exam records');

const key7 = context.EXAMS['tpl-mid-07'].answerKey;
const savedRound7 = jsonp('save', {
  payload: JSON.stringify({ examId: 'tpl-mid-07', school: '예시고', name: '가학생', answers: key7 }),
  writeKey: 'teacher-secret'
});
assert.equal(savedRound7.report.record.score, 100);
assert.equal(savedRound7.report.history.length, 7);
assert.equal(savedRound7.report.analysis.previousRound, 6);
assert.equal(spreadsheet.getSheetByName('Reports').getLastRow(), 9, 'header + eight exam records');

const key8 = context.EXAMS['tpl-mid-08'].answerKey;
const savedRound8 = jsonp('save', {
  payload: JSON.stringify({ examId: 'tpl-mid-08', school: '예시고', name: '가학생', answers: key8 }),
  writeKey: 'teacher-secret'
});
assert.equal(savedRound8.report.record.score, 100);
assert.equal(savedRound8.report.history.length, 8);
assert.equal(savedRound8.report.analysis.previousRound, 7);
assert.equal(spreadsheet.getSheetByName('Reports').getLastRow(), 10, 'header + nine exam records');


const key9 = context.EXAMS['tpl-mid-09'].answerKey;
const savedRound9 = jsonp('save', {
  payload: JSON.stringify({ examId: 'tpl-mid-09', school: '예시고', name: '가학생', answers: key9 }),
  writeKey: 'teacher-secret'
});
assert.equal(savedRound9.report.record.score, 100);
assert.equal(savedRound9.report.history.length, 9);
assert.equal(savedRound9.report.analysis.previousRound, 8);
assert.equal(spreadsheet.getSheetByName('Reports').getLastRow(), 11, 'header + ten exam records');

const key10 = context.EXAMS['tpl-mid-10'].answerKey;
const savedRound10 = jsonp('save', {
  payload: JSON.stringify({ examId: 'tpl-mid-10', school: '예시고', name: '가학생', answers: key10 }),
  writeKey: 'teacher-secret'
});
assert.equal(savedRound10.report.record.score, 100);
assert.equal(savedRound10.report.history.length, 10);
assert.equal(savedRound10.report.analysis.previousRound, 9);
assert.equal(spreadsheet.getSheetByName('Reports').getLastRow(), 12, 'header + eleven exam records');

const listed = jsonp('list', { limit: '20', writeKey: 'teacher-secret' });
assert.equal(listed.reports.length, 11);

const deleted = jsonp('delete', { id: savedB.token, writeKey: 'teacher-secret' });
assert.equal(deleted.deleted, true);
assert.equal(spreadsheet.getSheetByName('Reports').getLastRow(), 11);
const missing = jsonp('get', { id: savedB.token });
assert.equal(missing.ok, false);
assert.equal(missing.code, 'NOT_FOUND');

console.log('apps-script.test.cjs: all assertions passed');
