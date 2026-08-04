/**
 * Young's Physics · TPL Score Lab
 * Google Sheets + Apps Script JSONP backend
 *
 * Script Properties
 * - WRITE_KEY (required): teacher write password
 * - SPREADSHEET_ID (optional): required only for a standalone script
 */

var SHEET_NAME = 'Reports';
var HEADERS = ['Token','CreatedAt','UpdatedAt','ExamId','Round','StudentKey','School','Name','AnswersJSON','RecordJSON'];

var EXAMS = {
  'tpl-mid-01': {
    id: 'tpl-mid-01',
    title: 'TPL 중급 모의고사 1회',
    round: 1,
    answerCount: 20,
    maxScore: 100,
    correctScore: 5,
    wrongScore: -1.25,
    blankScore: 0,
    answerKey: [4,5,4,1,3,3,5,5,2,5,4,5,3,5,2,5,2,5,4,1],
    domains: [
      '역학','역학','파동·광학','역학','역학','역학','전기·자기','전기·자기','파동·광학','역학',
      '역학','역학','열·기체','전기·자기','전기·자기','역학','역학','열·기체','역학','역학'
    ],
    units: [
      '경사면 운동과 역학적 에너지','힘의 평형과 수직항력','굴절과 전반사','충격량과 운동량','속도-시간 그래프와 에너지',
      '세 힘의 평형','전자기 유도와 종단 속도','정전기 유도와 검전기','거울과 상','속도-시간 그래프 해석',
      '유체의 연속성과 낙하 운동','타점 기록과 가속도','기체 분자 운동','전기 회로와 전력','솔레노이드의 자기장',
      '상대 속도','연결 물체와 마찰력','비열과 온도 변화','도르래와 장력','수평 투사와 자유 낙하'
    ]
  },
  'tpl-mid-02': {
    id: 'tpl-mid-02',
    title: 'TPL 중급 모의고사 2회',
    round: 2,
    answerCount: 20,
    maxScore: 100,
    correctScore: 5,
    wrongScore: -1.25,
    blankScore: 0,
    answerKey: [3,5,2,5,5,2,2,4,5,5,4,1,5,2,3,2,1,2,5,1],
    domains: ['역학','역학','역학','역학','파동·광학','전기·자기','파동·광학','파동·광학','역학','전기·자기','전기·자기','전기·자기','파동·광학','열·기체','전기·자기','전기·자기','역학','파동·광학','역학','열·기체'],
    units: ['일-에너지와 연직 운동','가속도-시간 그래프','연결 물체와 장력','마찰, 일과 일률','물결파 간섭','전자기 유도와 렌츠 법칙','굴절과 겉보기 깊이','눈과 렌즈','용수철과 등속 원운동','쿨롱 법칙과 정전기 유도','검전기와 유도 대전','사이클로트론과 자기력','굴절·반사·전반사','바이메탈과 열팽창','전지의 직렬·병렬 연결','합성 저항과 스위치 회로','포물선 운동','소리의 진동수와 음높이','충격량과 운동량 보존','열용량과 온도 변화']
  },
  'tpl-mid-03': {
    id: 'tpl-mid-03',
    title: 'TPL 중급 모의고사 3회',
    round: 3,
    answerCount: 20,
    maxScore: 100,
    correctScore: 5,
    wrongScore: -1.25,
    blankScore: 0,
    answerKey: [4,5,3,4,1,4,3,3,1,2,4,3,4,5,2,2,4,2,2,4],
    domains: ['역학','역학','역학','역학','전기·자기','역학','역학','역학','전기·자기','전기·자기','파동·광학','파동·광학','역학','열·기체','역학','파동·광학','전기·자기','전기·자기','전기·자기','파동·광학'],
    units: ['변질량계와 운동량 보존','원운동의 에너지와 수평 투사','연속 방정식과 베르누이 법칙','용수철 단진동','전류계와 전압계','연직 운동과 상대 운동','단진동의 에너지','연결 물체와 도르래','운동 기전력과 자기력','렌츠 법칙과 도선의 전위','평면거울의 최소 크기','평면거울 상의 상대속도','단진자와 용수철 진자의 주기','정상 열전도','부력과 힘의 평형','볼록렌즈와 상','전력과 줄열','전기력선과 전기장','합성 저항과 전류비','공명과 음높이']
  },
  'tpl-mid-04': {
    id: 'tpl-mid-04',
    title: 'TPL 중급 모의고사 4회',
    round: 4,
    answerCount: 20,
    maxScore: 100,
    correctScore: 5,
    wrongScore: -1.25,
    blankScore: 0,
    answerKey: [4,3,2,4,1,4,5,5,4,2,1,3,5,3,4,4,3,3,1,5],
    domains: ['역학','역학','역학','전기·자기','파동·광학','역학','역학','전기·자기','열·기체','파동·광학','열·기체','역학','전기·자기','전기·자기','파동·광학','전기·자기','역학','전기·자기','역학','역학'],
    units: ['이동거리-시간 그래프와 평균 속력','용수철 에너지와 연직 운동','원운동의 속도와 가속도','직렬·병렬 회로와 전구 밝기','볼록거울의 상','힘의 평형과 탄성력','고정·움직 도르래와 운동에너지','전류가 받는 자기력과 전동기','단열과 대류','소리의 3요소와 파형','열의 이동과 복사','등가속도 운동의 위치 기록','전자기 유도와 렌츠 법칙','송전선 손실 전력','빛의 합성과 물체의 색','저항선 도형과 합성 저항','부력과 밀도','직선 도선의 자기장과 자기력','마찰력과 힘의 성분','진자 운동과 역학적 에너지']
  },
  'tpl-mid-05': {
    id: 'tpl-mid-05',
    title: 'TPL 중급 모의고사 5회',
    round: 5,
    answerCount: 20,
    maxScore: 100,
    correctScore: 5,
    wrongScore: -1.25,
    blankScore: 0,
    answerKey: [2,3,5,5,1,3,5,5,3,3,3,1,5,2,3,1,3,3,3,5],
    domains: ['역학','역학','역학','역학','전기·자기','전기·자기','파동·광학','역학','역학','역학','역학','역학','역학','역학','열·기체','전기·자기','파동·광학','파동·광학','파동·광학','열·기체'],
    units: ['속도-시간 그래프와 추월 운동','곡면 운동과 가속도','일·운동에너지와 충격량','질량중심과 중력 퍼텐셜 에너지','직렬 회로의 전압 분배와 전구 밝기','전자기 유도와 렌츠 법칙','광섬유와 전반사','시간 기록계와 위치-시간 그래프','정지·운동 마찰 계수','스키드 마크와 운동 마찰','등가속도 운동 방정식','힘-시간 그래프와 충격량','애트우드 장치와 도르래 지지력','연결 물체의 가속도와 장력','정상 열전도와 열전도율','고리형 저항 회로의 합성저항','백색광의 분산','파동 그래프의 파장·진폭·진동수','볼록거울과 시야','열평형과 비열']
  },
  'tpl-mid-06': {
    id: 'tpl-mid-06',
    title: 'TPL 중급 모의고사 6회',
    round: 6,
    answerCount: 20,
    maxScore: 100,
    correctScore: 5,
    wrongScore: -1.25,
    blankScore: 0,
    answerKey: [4,1,3,5,5,1,2,5,5,5,1,1,4,3,4,5,2,4,3,2],
    domains: ['역학','역학','역학','역학','역학','역학','전기·자기','전기·자기','역학','역학','역학','파동·광학','전기·자기','파동·광학','역학','역학','역학','파동·광학','전기·자기','파동·광학'],
    units: ['연결 물체의 가속도와 에너지','속력-시간 그래프의 정성적 해석','마찰력과 일-에너지 정리','마찰과 용수철 에너지','에너지 비례와 완전비탄성 충돌','돌림힘의 평형','직선 도선 자기장의 중첩','전구 밝기와 가변저항 회로','등가속도 운동 자료 분석','상대 속도와 강물 속 보트','지레와 돌림힘','빛의 분산과 무지개','초전도체의 성질','광전효과와 빛의 양자성','곡면 마찰과 충격량','두 줄에 매달린 물체의 힘 평형','부력과 뜨고 가라앉기','굴절과 겉보기 깊이','유전체의 정전기 유도','빛의 합성과 물체의 색']
  },
  'tpl-mid-07': {
    id: 'tpl-mid-07',
    title: 'TPL 중급 모의고사 7회',
    round: 7,
    answerCount: 20,
    maxScore: 100,
    correctScore: 5,
    wrongScore: -1.25,
    blankScore: 0,
    answerKey: [3,2,3,3,5,2,2,3,3,3,5,3,4,3,5,5,4,1,4,1],
    domains: ['역학','역학','역학','역학','역학','역학','전기·자기','전기·자기','전기·자기','전기·자기','전기·자기','파동·광학','역학','역학','역학','파동·광학','열·기체','파동·광학','전기·자기','전기·자기'],
    units: ['속도-시간 그래프 해석','충돌과 위치-시간 그래프','포물선 운동','연결 물체와 마찰력','용수철 단진동','부력과 비중','전기장과 전위','키르히호프 법칙','밀리컨 기름방울 실험','직선 도선 자기장의 중첩','가변저항과 전류가 받는 자기력','두 파원의 간섭','수평 투사 운동','용수철 분할과 병렬 연결','외력이 작용하는 연결 물체','빛의 분산과 부분 반사','기체 압력과 피스톤 평형','종파와 횡파의 분류','전자기 유도의 세기','렌츠 법칙과 유도 전류 방향']
  },
  'tpl-mid-08': {
    id: 'tpl-mid-08',
    title: 'TPL 중급 모의고사 8회',
    round: 8,
    answerCount: 20,
    maxScore: 100,
    correctScore: 5,
    wrongScore: -1.25,
    blankScore: 0,
    answerKey: [1,2,4,1,3,3,5,3,4,2,4,3,2,3,4,4,4,3,3,4],
    domains: ['역학','역학','역학','역학','역학','역학','전기·자기','열·기체','역학','전기·자기','전기·자기','역학','전기·자기','파동·광학','파동·광학','전기·자기','전기·자기','파동·광학','전기·자기','열·기체'],
    units: ['속력-시간 그래프와 곡선 운동','2차원 운동량 보존과 완전비탄성 충돌','힘의 평형과 마찰력','연결 물체와 도르래의 평형','가속 운동과 겉보기 무게','빗면 운동과 역학적 에너지','검전기와 정전기 유도','열평형과 열용량·비열','부력과 힘의 평형','저항 절단과 합성저항·전력','스위치 회로와 전압·전류','등속 원운동과 단진동의 대응','운동 기전력과 렌츠 법칙','전반사와 굴절률','오목거울의 상','전기장·전위와 전기적 에너지','전자기 유도와 LED','다층 매질의 굴절','속도 선택기와 로렌츠 힘','정상 열전도와 열저항']
  },
  'tpl-mid-09': {
    id: 'tpl-mid-09',
    title: 'TPL 중급 모의고사 9회',
    round: 9,
    answerCount: 20,
    maxScore: 100,
    correctScore: 5,
    wrongScore: -1.25,
    blankScore: 0,
    answerKey: [2,1,3,3,3,3,5,1,2,3,4,1,5,3,5,3,3,3,4,3],
    domains: ["역학","역학","역학","역학","역학","역학","파동·광학","파동·광학","역학","전기·자기","전기·자기","전기·자기","전기·자기","역학","역학","열·기체","열·기체","열·기체","열·기체","파동·광학"],
    units: ["포물선 운동의 연직 성분","수평 투사와 자유낙하","연결 물체와 마찰력","탄성 충돌과 용수철 에너지","힘의 합성과 뉴턴 법칙","애트우드 장치와 역학적 에너지","빛의 3원색과 가법혼합","근시와 오목렌즈","충격량과 속도-시간 그래프","균일 전기장 속 힘의 평형과 에너지","전지의 내부저항","패러데이 법칙과 전구 밝기","균일 전기장 속 하전입자 운동","연직 원운동과 장력","베르누이 법칙과 양력","물의 이상 팽창","바이메탈과 자동 온도조절","해풍과 열의 이동","단열 변화와 열역학 제1법칙","오목거울의 상"]
  },
  'tpl-mid-10': {
    id: 'tpl-mid-10',
    title: 'TPL 중급 모의고사 10회',
    round: 10,
    answerCount: 20,
    maxScore: 100,
    correctScore: 5,
    wrongScore: -1.25,
    blankScore: 0,
    answerKey: [3,2,5,3,3,4,3,1,4,4,3,3,3,5,4,4,5,2,1,2],
    domains: ["역학","역학","역학","역학","역학","역학","역학","역학","역학","열·기체","열·기체","열·기체","전기·자기","전기·자기","전기·자기","전기·자기","파동·광학","파동·광학","역학","역학"],
    units: ["포물선 운동과 에너지","속력-시간 그래프","일과 일률","상대속도와 강 건너기","연직 용수철과 역학적 에너지","등속 원운동과 마찰","부력과 수면 높이","엘리베이터와 겉보기 무게","아르키메데스 원리와 기구 부력","단열과 열전달","이상기체 분자운동론","열팽창","정전기 유도와 유도 대전","병렬 가정용 회로와 소비전력","패러데이·렌츠 법칙","정격 전력과 저항·전류","소리의 높이·크기·음색","볼록거울의 상","가속하는 차량 위 정지마찰","완전비탄성 충돌의 에너지 손실"]
  }
};

function doGet(e) {
  var callback = sanitizeCallback_(e && e.parameter && e.parameter.callback);
  var response;
  try {
    var action = String((e && e.parameter && e.parameter.action) || 'ping');
    if (action === 'ping') {
      response = { ok: true, message: 'TPL 성적 서버 연결에 성공했습니다.', serverTime: new Date().toISOString() };
    } else if (action === 'save') {
      assertWriteKey_(e.parameter.writeKey);
      response = saveReport_(e.parameter.payload);
    } else if (action === 'get') {
      response = getReport_(e.parameter.id);
    } else if (action === 'list') {
      assertWriteKey_(e.parameter.writeKey);
      response = listReports_(e.parameter.limit);
    } else if (action === 'delete') {
      assertWriteKey_(e.parameter.writeKey);
      response = deleteReport_(e.parameter.id);
    } else {
      throw apiError_('UNKNOWN_ACTION', '지원하지 않는 작업입니다: ' + action);
    }
  } catch (error) {
    response = {
      ok: false,
      error: error && error.message ? error.message : String(error),
      code: error && error.code ? error.code : 'SERVER_ERROR'
    };
  }
  return output_(callback, response);
}

function doPost(e) {
  // Optional status endpoint. The website itself uses JSONP GET requests.
  return doGet(e);
}

function output_(callback, value) {
  var json = JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/</g, '\\u003c');
  var text = callback ? callback + '(' + json + ');' : json;
  return ContentService.createTextOutput(text)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function sanitizeCallback_(value) {
  var callback = String(value || '');
  if (!callback) return '';
  if (!/^[A-Za-z_$][0-9A-Za-z_$\.]{0,120}$/.test(callback)) {
    throw apiError_('INVALID_CALLBACK', 'JSONP callback 이름이 올바르지 않습니다.');
  }
  return callback;
}

function apiError_(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function assertWriteKey_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty('WRITE_KEY');
  if (!expected) throw apiError_('WRITE_KEY_REQUIRED', 'Apps Script의 WRITE_KEY 스크립트 속성을 먼저 설정해 주세요.');
  if (!provided) throw apiError_('WRITE_KEY_REQUIRED', 'Google Sheets 저장 키가 필요합니다.');
  if (String(provided) !== String(expected)) throw apiError_('INVALID_WRITE_KEY', 'Google Sheets 저장 키가 올바르지 않습니다.');
}

function spreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw apiError_('SHEET_NOT_FOUND', '연결된 스프레드시트를 찾지 못했습니다. SPREADSHEET_ID를 설정해 주세요.');
  return spreadsheet;
}

function sheet_() {
  var spreadsheet = spreadsheet_();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#dce8f5');
  } else {
    var existing = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
    if (existing.join('|') !== HEADERS.join('|')) {
      throw apiError_('HEADER_MISMATCH', 'Reports 시트의 열 구성이 예상 형식과 다릅니다. 기존 시트 이름을 바꾸고 다시 실행해 주세요.');
    }
  }
  return sheet;
}

function initializeSheet() {
  sheet_();
  return 'Reports 시트를 준비했습니다.';
}

function saveReport_(payloadText) {
  var input;
  try {
    input = JSON.parse(String(payloadText || '{}'));
  } catch (error) {
    throw apiError_('INVALID_PAYLOAD', '학생 데이터 JSON을 읽지 못했습니다.');
  }

  var exam = getExam_(input.examId);
  var school = normalizeText_(input.school);
  var name = normalizeText_(input.name);
  if (!school) throw apiError_('SCHOOL_REQUIRED', '학교를 입력해 주세요.');
  if (!name) throw apiError_('NAME_REQUIRED', '학생 이름을 입력해 주세요.');
  var answers = normalizeAnswers_(input.answers, exam.answerCount);
  var key = studentKey_({ school: school, name: name });
  var now = new Date().toISOString();

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var token;
  var record;
  try {
    var sheet = sheet_();
    var found = findByStudentExam_(sheet, key, exam.id);
    token = found ? found.token : Utilities.getUuid().replace(/-/g, '');
    var createdAt = found ? found.record.createdAt : (input.createdAt || now);
    record = {
      id: token,
      serverId: token,
      examId: exam.id,
      round: exam.round,
      school: school,
      name: name,
      answers: answers,
      createdAt: createdAt,
      updatedAt: now
    };
    var row = [
      token, createdAt, now, exam.id, exam.round, key, school, name,
      JSON.stringify(answers), JSON.stringify(record)
    ];
    if (found) sheet.getRange(found.row, 1, 1, HEADERS.length).setValues([row]);
    else sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, token: token, id: token, report: buildSnapshot_(record) };
}

function getReport_(id) {
  var token = String(id || '').trim();
  if (!/^[A-Fa-f0-9]{24,64}$/.test(token)) throw apiError_('INVALID_ID', '학생 결과 링크의 ID가 올바르지 않습니다.');
  var item = findByToken_(sheet_(), token);
  if (!item) throw apiError_('NOT_FOUND', '삭제되었거나 존재하지 않는 학생 결과입니다.');
  return { ok: true, token: token, report: buildSnapshot_(item.record) };
}

function listReports_(limitValue) {
  var limit = Math.max(1, Math.min(500, Number(limitValue || 100)));
  var items = readAll_().sort(function (a, b) {
    return String(b.record.updatedAt || b.record.createdAt).localeCompare(String(a.record.updatedAt || a.record.createdAt));
  }).slice(0, limit);
  return { ok: true, reports: items.map(function (item) { return { token: item.token, record: enrich_(item.record) }; }) };
}

function deleteReport_(id) {
  var token = String(id || '').trim();
  var sheet = sheet_();
  var item = findByToken_(sheet, token);
  if (!item) throw apiError_('NOT_FOUND', '삭제할 학생 결과를 찾지 못했습니다.');
  sheet.deleteRow(item.row);
  return { ok: true, deleted: true, token: token };
}

function findByStudentExam_(sheet, studentKey, examId) {
  var items = readAll_(sheet);
  for (var i = 0; i < items.length; i += 1) {
    if (items[i].record.examId === examId && studentKey_(items[i].record) === studentKey) return items[i];
  }
  return null;
}

function findByToken_(sheet, token) {
  var items = readAll_(sheet);
  for (var i = 0; i < items.length; i += 1) if (items[i].token === token) return items[i];
  return null;
}

function readAll_(providedSheet) {
  var sheet = providedSheet || sheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var items = [];
  values.forEach(function (row, index) {
    try {
      var token = String(row[0] || '');
      var record = JSON.parse(String(row[9] || '{}'));
      if (token && record && record.examId) items.push({ token: token, record: record, row: index + 2 });
    } catch (error) {
      console.warn('Reports ' + (index + 2) + '행을 읽지 못했습니다: ' + error.message);
    }
  });
  return items;
}

function getExam_(examId) {
  var exam = EXAMS[String(examId || '')];
  if (!exam) throw apiError_('UNKNOWN_EXAM', '등록되지 않은 시험입니다: ' + examId);
  return exam;
}

function grade_(exam, answers) {
  var normalized = normalizeAnswers_(answers, exam.answerCount);
  var correct = 0;
  var wrong = 0;
  var blank = 0;
  var results = [];
  var domainMap = {};

  for (var i = 0; i < exam.answerCount; i += 1) {
    var answer = normalized[i];
    var status;
    if (answer === '') { status = 'blank'; blank += 1; }
    else if (Number(answer) === Number(exam.answerKey[i])) { status = 'correct'; correct += 1; }
    else { status = 'wrong'; wrong += 1; }
    var points = status === 'correct' ? exam.correctScore : status === 'wrong' ? exam.wrongScore : exam.blankScore;
    results.push({ no: i + 1, answer: answer, key: exam.answerKey[i], status: status, points: round_(points, 2) });

    var domain = exam.domains[i] || '기타';
    if (!domainMap[domain]) domainMap[domain] = { domain: domain, total: 0, correct: 0, wrong: 0, blank: 0, points: 0, maxPoints: 0, questionNos: [] };
    var item = domainMap[domain];
    item.total += 1;
    item[status] += 1;
    item.points += points;
    item.maxPoints += exam.correctScore;
    item.questionNos.push(i + 1);
  }

  var domainStats = Object.keys(domainMap).map(function (domain) {
    var item = domainMap[domain];
    return {
      domain: item.domain,
      total: item.total,
      correct: item.correct,
      wrong: item.wrong,
      blank: item.blank,
      points: round_(item.points, 2),
      maxPoints: item.maxPoints,
      questionNos: item.questionNos,
      accuracy: round_(item.total ? item.correct / item.total * 100 : 0, 1),
      scoreRate: round_(item.maxPoints ? item.points / item.maxPoints * 100 : 0, 1)
    };
  });

  return {
    score: round_(correct * exam.correctScore + wrong * exam.wrongScore + blank * exam.blankScore, 2),
    correct: correct,
    wrong: wrong,
    blank: blank,
    answers: normalized,
    questionResults: results,
    domainStats: domainStats
  };
}

function enrich_(record) {
  var exam = getExam_(record.examId);
  var grade = grade_(exam, record.answers);
  var output = {};
  Object.keys(record).forEach(function (key) { output[key] = record[key]; });
  Object.keys(grade).forEach(function (key) { output[key] = grade[key]; });
  output.round = Number(record.round || exam.round || 0);
  output.examTitle = exam.title;
  return output;
}

function buildSnapshot_(currentRecord) {
  var exam = getExam_(currentRecord.examId);
  var records = readAll_().map(function (item) { return item.record; });
  if (!records.some(function (record) { return record.id === currentRecord.id; })) records.push(currentRecord);
  var enriched = enrich_(currentRecord);
  var cohort = cohort_(records, exam.id, currentRecord);
  var history = history_(records, currentRecord);
  var analysis = analysis_(exam, enriched, cohort, history);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    record: {
      id: enriched.id,
      serverId: enriched.serverId || enriched.id,
      examId: enriched.examId,
      round: enriched.round,
      examTitle: enriched.examTitle,
      name: enriched.name,
      school: enriched.school,
      answers: enriched.answers,
      score: enriched.score,
      correct: enriched.correct,
      wrong: enriched.wrong,
      blank: enriched.blank,
      questionResults: enriched.questionResults,
      domainStats: enriched.domainStats,
      createdAt: enriched.createdAt,
      updatedAt: enriched.updatedAt
    },
    cohort: cohort,
    history: history,
    analysis: analysis
  };
}

function cohort_(records, examId, currentRecord) {
  var latest = {};
  records.forEach(function (record) {
    if (!record || record.examId !== examId) return;
    var key = studentKey_(record);
    var previous = latest[key];
    if (!previous || String(record.updatedAt || record.createdAt) >= String(previous.updatedAt || previous.createdAt)) latest[key] = record;
  });
  latest[studentKey_(currentRecord)] = currentRecord;
  var cohort = Object.keys(latest).map(function (key) { return enrich_(latest[key]); });
  var scores = cohort.map(function (record) { return Number(record.score); });
  var total = cohort.length;
  var current = enrich_(currentRecord);
  var exam = getExam_(examId);

  var questionStats = [];
  for (var i = 0; i < exam.answerCount; i += 1) {
    var correct = 0, wrong = 0, blank = 0;
    cohort.forEach(function (record) {
      var status = record.questionResults[i].status;
      if (status === 'correct') correct += 1;
      else if (status === 'wrong') wrong += 1;
      else blank += 1;
    });
    questionStats.push({
      no: i + 1,
      correct: correct,
      wrong: wrong,
      blank: blank,
      total: total,
      answered: correct + wrong,
      accuracy: round_(total ? correct / total * 100 : 0, 1),
      attemptedAccuracy: round_(correct + wrong ? correct / (correct + wrong) * 100 : 0, 1)
    });
  }

  var domains = [];
  exam.domains.forEach(function (domain) { if (domains.indexOf(domain) < 0) domains.push(domain); });
  var domainAverages = domains.map(function (domain) {
    var values = cohort.map(function (record) {
      var stat = record.domainStats.filter(function (item) { return item.domain === domain; })[0];
      return stat ? stat.accuracy : 0;
    });
    var studentStat = current.domainStats.filter(function (item) { return item.domain === domain; })[0];
    return { domain: domain, average: round_(average_(values), 1), student: studentStat ? studentStat.accuracy : 0 };
  });

  var sorted = scores.slice().sort(function (a, b) { return b - a; });
  var topCount = total ? Math.max(1, Math.ceil(total * 0.25)) : 0;
  return {
    total: total,
    average: round_(average_(scores), 2),
    median: round_(median_(scores), 2),
    topScore: total ? Math.max.apply(null, scores) : 0,
    bottomScore: total ? Math.min.apply(null, scores) : 0,
    top25Average: topCount ? round_(average_(sorted.slice(0, topCount)), 2) : 0,
    rank: total ? 1 + scores.filter(function (score) { return score > current.score; }).length : null,
    percentile: total ? round_(scores.filter(function (score) { return score <= current.score; }).length / total * 100, 1) : null,
    scores: scores,
    distribution: distribution_(scores),
    questionStats: questionStats,
    domainAverages: domainAverages
  };
}

function history_(records, currentRecord) {
  var key = studentKey_(currentRecord);
  var latest = {};
  records.forEach(function (record) {
    if (studentKey_(record) !== key) return;
    var previous = latest[record.examId];
    if (!previous || String(record.updatedAt || record.createdAt) >= String(previous.updatedAt || previous.createdAt)) latest[record.examId] = record;
  });
  latest[currentRecord.examId] = currentRecord;
  return Object.keys(latest).map(function (examId) { return enrich_(latest[examId]); })
    .sort(function (a, b) { return Number(a.round || 0) - Number(b.round || 0) || String(a.updatedAt || a.createdAt).localeCompare(String(b.updatedAt || b.createdAt)); })
    .map(function (record) {
      return {
        id: record.id,
        examId: record.examId,
        examTitle: record.examTitle,
        round: record.round,
        score: record.score,
        correct: record.correct,
        wrong: record.wrong,
        blank: record.blank,
        answers: record.answers,
        domainStats: record.domainStats,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      };
    });
}

function analysis_(exam, record, cohort, history) {
  var cohortMap = {};
  (cohort.domainAverages || []).forEach(function (item) { cohortMap[item.domain] = item.average; });
  var ranked = (record.domainStats || []).map(function (item) {
    var copy = {};
    Object.keys(item).forEach(function (key) { copy[key] = item[key]; });
    copy.cohort = cohortMap[item.domain] || 0;
    copy.gap = round_(item.accuracy - copy.cohort, 1);
    return copy;
  }).sort(function (a, b) { return b.accuracy - a.accuracy || b.gap - a.gap; });

  var strengths = ranked.filter(function (item) { return item.accuracy >= 70 || item.gap >= 12; }).slice(0, 2);
  var weaknesses = ranked.slice().sort(function (a, b) { return a.accuracy - b.accuracy || a.gap - b.gap; })
    .filter(function (item) { return item.accuracy < 70 || item.gap <= -10; }).slice(0, 2);
  var previousCandidates = history.filter(function (item) { return item.id !== record.id && Number(item.round) < Number(record.round); });
  var previous = previousCandidates.length ? previousCandidates[previousCandidates.length - 1] : null;
  var delta = previous ? round_(record.score - previous.score, 2) : null;

  var wrongItems = record.questionResults.filter(function (item) { return item.status === 'wrong'; });
  var blankItems = record.questionResults.filter(function (item) { return item.status === 'blank'; });
  var weakestTopics = wrongItems.concat(blankItems).slice(0, 4).map(function (item) { return item.no + '번 ' + exam.units[item.no - 1]; });

  var strengthText = strengths.length
    ? strengths.map(function (item) { return item.domain + ' ' + item.accuracy + '%' + (Math.abs(item.gap) >= 5 ? ' (전체 대비 ' + (item.gap > 0 ? '+' : '') + item.gap + '%p)' : ''); }).join(', ')
    : '뚜렷한 우세 단원보다 전 단원의 기본 정확도를 함께 끌어올리는 단계입니다.';
  var weaknessText = weaknesses.length
    ? weaknesses.map(function (item) { return item.domain + ' ' + item.accuracy + '%' + (Math.abs(item.gap) >= 5 ? ' (전체 대비 ' + (item.gap > 0 ? '+' : '') + item.gap + '%p)' : ''); }).join(', ')
    : '특정 단원에 편중된 큰 취약점은 확인되지 않았습니다.';

  var trendText = '현재 등록된 이전 회차가 없어 이번 결과를 기준점으로 삼습니다.';
  if (previous) {
    if (delta > 0) trendText = previous.round + '회 대비 ' + delta + '점 상승했습니다. 오른 점수를 유지하면서 오답 단원의 재현성을 확인하는 것이 좋습니다.';
    else if (delta < 0) trendText = previous.round + '회 대비 ' + Math.abs(delta) + '점 낮아졌습니다. 회차 난이도 차이를 감안하되, 반복해서 틀린 단원을 우선 복습해야 합니다.';
    else trendText = previous.round + '회와 같은 점수입니다. 총점보다 단원별 정답 이동과 오답 유형의 변화를 확인하는 것이 중요합니다.';
  }

  var comments = [];
  if (record.correct >= 16) comments.push('핵심 개념과 계산의 전반적 완성도가 높습니다. 남은 오답은 조건 해석과 선택지 검증 과정을 기록하며 정교하게 다듬으세요.');
  else if (record.correct >= 11) comments.push('기본 개념은 형성되어 있습니다. 틀린 문제를 공식 암기보다 “어떤 조건에서 어떤 법칙을 적용하는가”의 형태로 다시 정리하면 점수 상승 폭이 큽니다.');
  else comments.push('단원별 핵심 공식을 짧게 복습한 뒤, 해설을 덮고 같은 문제를 다시 푸는 2회독이 필요합니다. 한 번에 많은 문제보다 오답의 완전한 재풀이를 우선하세요.');
  if (wrongItems.length) comments.push('오답 ' + wrongItems.length + '문항으로 ' + round_(Math.abs(wrongItems.length * exam.wrongScore), 2) + '점이 감점되었습니다. 확신 없이 고른 문항은 근거를 한 줄로 쓰고 답을 결정하는 습관을 권합니다.');
  if (blankItems.length) comments.push('미기입 ' + blankItems.length + '문항은 감점은 없었지만 학습 공백으로 남습니다. 아래 해설과 동형 문제로 개념을 보완하세요.');
  if (!wrongItems.length && !blankItems.length) comments.push('전 문항 정답입니다. 풀이 시간을 줄이고 다른 표현의 동형 문제에서도 같은 판단을 재현하는 연습으로 확장하세요.');

  return {
    strengths: strengths.map(slimDomain_),
    weaknesses: weaknesses.map(slimDomain_),
    strengthText: strengthText,
    weaknessText: weaknessText,
    trendText: trendText,
    previousRound: previous ? previous.round : null,
    previousScore: previous ? previous.score : null,
    scoreDelta: delta,
    weakestTopics: weakestTopics,
    comments: comments
  };
}

function slimDomain_(item) {
  return { domain: item.domain, accuracy: item.accuracy, cohort: item.cohort, gap: item.gap, questionNos: item.questionNos };
}

function distribution_(scores) {
  var bins = [
    { label: '0점 미만', min: -Infinity, max: -0.000001, count: 0 },
    { label: '0-19', min: 0, max: 19.9999, count: 0 },
    { label: '20-39', min: 20, max: 39.9999, count: 0 },
    { label: '40-59', min: 40, max: 59.9999, count: 0 },
    { label: '60-79', min: 60, max: 79.9999, count: 0 },
    { label: '80-100', min: 80, max: Infinity, count: 0 }
  ];
  scores.forEach(function (score) {
    for (var i = 0; i < bins.length; i += 1) {
      if (Number(score) >= bins[i].min && Number(score) <= bins[i].max) { bins[i].count += 1; break; }
    }
  });
  return bins;
}

function normalizeText_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeKey_(value) {
  return normalizeText_(value).replace(/\s+/g, '').toLowerCase();
}

function studentKey_(record) {
  return normalizeKey_(record && record.school) + '::' + normalizeKey_(record && record.name);
}

function normalizeAnswer_(value) {
  var text = normalizeText_(value);
  if (!text || /^(0|x|×|-|_|미기입|무응답|빈칸|blank|none)$/i.test(text)) return '';
  var number = Number(text);
  return Math.floor(number) === number && number >= 1 && number <= 5 ? number : '';
}

function normalizeAnswers_(values, count) {
  var source = Array.isArray(values) ? values : [];
  var answers = [];
  for (var i = 0; i < count; i += 1) answers.push(normalizeAnswer_(source[i]));
  return answers;
}

function round_(value, digits) {
  var factor = Math.pow(10, digits == null ? 1 : digits);
  return Math.round((Number(value) + 1e-10) * factor) / factor;
}

function average_(values) {
  if (!values.length) return 0;
  return values.reduce(function (sum, value) { return sum + Number(value || 0); }, 0) / values.length;
}

function median_(values) {
  if (!values.length) return 0;
  var sorted = values.slice().map(Number).sort(function (a, b) { return a - b; });
  var middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
