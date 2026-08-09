/**
 * Young's Physics · TPL Score Lab
 * Google Sheets + Apps Script JSONP backend
 *
 * Script Properties
 * - WRITE_KEY (required): teacher write password
 * - SPREADSHEET_ID (recommended): 현재 저장 대상 Google Sheet ID
 *
 * Optional private companion file
 * - LegacySeed.gs: defines LEGACY_SEED_VERSION and LEGACY_SEED_RECORDS.
 *   Keep it in Apps Script only; never upload student data to GitHub.
 */

var SERVER_VERSION = '3.6.0';
var SHEET_NAME = 'Reports';
var HEADERS = ['Token','CreatedAt','UpdatedAt','ExamId','Round','StudentKey','School','Name','AnswersJSON','RecordJSON'];

// 기본 저장 대상. 스크립트 속성 SPREADSHEET_ID가 있으면 그 값을 우선 사용합니다.
var DEFAULT_SPREADSHEET_ID = '1RydC5kkQyVaZezX8ZwMP37gE1hdbKV3hMGlcuNVTVVg';

var LEGACY_SEED_PROPERTY = 'LEGACY_SEED_IMPORTED_VERSION';
var REPORT_INTEGRITY_PROPERTY = 'REPORT_INTEGRITY_REPAIR_VERSION';
var REPORT_INTEGRITY_VERSION = '3.5.0';

function legacySeedAvailable_() {
  return typeof LEGACY_SEED_VERSION !== 'undefined' &&
    typeof LEGACY_SEED_RECORDS !== 'undefined' &&
    Array.isArray(LEGACY_SEED_RECORDS) &&
    LEGACY_SEED_RECORDS.length > 0;
}

function legacySeedStatus_() {
  var props = PropertiesService.getScriptProperties();
  var importedVersion = props.getProperty(LEGACY_SEED_PROPERTY) || '';
  return {
    available: legacySeedAvailable_(),
    version: legacySeedAvailable_() ? String(LEGACY_SEED_VERSION || '') : '',
    importedVersion: importedVersion,
    imported: legacySeedAvailable_() && importedVersion === String(LEGACY_SEED_VERSION || ''),
    expected: legacySeedAvailable_() ? LEGACY_SEED_RECORDS.length : 0
  };
}

function initializeLegacyRecords() {
  var location = storageLocation_();
  var result = importLegacyRecords_(true);
  SpreadsheetApp.flush();
  var message =
    '기존 1~5회 학생 데이터 초기화 완료: 추가 ' + result.inserted +
    '명, 기존 유지 ' + result.skipped +
    '명, Reports 전체 ' + result.total +
    '명 / 저장 위치: ' + location.spreadsheetName +
    ' / ' + location.spreadsheetUrl;
  console.log(message);
  return message;
}

/**
 * 현재 Apps Script가 실제로 어느 스프레드시트에 연결되어 있는지 확인합니다.
 * 실행 로그와 반환값에 스프레드시트 URL, Reports 시트 존재 여부, 학생 수를 표시합니다.
 */
function checkStorageLocation() {
  var result = storageLocation_();
  console.log(JSON.stringify(result, null, 2));
  return JSON.stringify(result, null, 2);
}

/**
 * 2026-08-09 수정된 6회 해설의 반영 상태를 확인합니다.
 * 9번 정답은 ④, 11번 정답은 ①이어야 합니다.
 * 기존 학생 기록은 답안 원문을 기준으로 성적표를 열 때마다 자동 재채점됩니다.
 */
function checkRound6Revision() {
  var exam = getExam_('tpl-mid-06');
  var records = readAll_().filter(function (item) {
    return item.record && item.record.examId === 'tpl-mid-06';
  });
  var result = {
    ok: Number(exam.answerKey[8]) === 4 && Number(exam.answerKey[10]) === 1,
    serverVersion: SERVER_VERSION,
    examId: exam.id,
    question9Answer: exam.answerKey[8],
    question11Answer: exam.answerKey[10],
    round6StudentCount: records.length,
    note: '기존 6회 학생 성적은 저장된 답안을 현재 정답표로 동적 재채점합니다.'
  };
  console.log(JSON.stringify(result, null, 2));
  return JSON.stringify(result, null, 2);
}

/**
 * 이 프로젝트의 기본 스프레드시트 ID를 스크립트 속성에 저장하고,
 * Reports 시트를 만든 뒤 기존 1~5회 학생 데이터를 한 번에 가져옵니다.
 *
 * Google Sheet가 비어 있을 때 가장 먼저 이 함수를 실행하세요.
 */
function setupStorageAndImportLegacyRecords() {
  var props = PropertiesService.getScriptProperties();
  var configuredId = String(props.getProperty('SPREADSHEET_ID') || '').trim();

  // 기존 설정값을 임의로 DEFAULT_SPREADSHEET_ID로 덮어쓰지 않습니다.
  // 스크립트 속성이 비어 있을 때만 현재 바인딩된 스프레드시트를 우선 사용합니다.
  if (!configuredId) {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      props.setProperty('SPREADSHEET_ID', active.getId());
    } else if (DEFAULT_SPREADSHEET_ID) {
      props.setProperty('SPREADSHEET_ID', DEFAULT_SPREADSHEET_ID);
    }
  }

  props.deleteProperty(LEGACY_SEED_PROPERTY);
  props.deleteProperty(REPORT_INTEGRITY_PROPERTY);

  var preparedMessage = initializeSheet();
  var imported = importLegacyRecords_(true);
  SpreadsheetApp.flush();

  var integrity = repairReportIntegrity_(true);
  SpreadsheetApp.flush();

  var counts = {};
  readAll_().forEach(function (item) {
    var examId = item.record.examId;
    counts[examId] = (counts[examId] || 0) + 1;
  });

  var location = storageLocation_();
  var result = {
    ok: true,
    serverVersion: SERVER_VERSION,
    prepared: preparedMessage,
    spreadsheetId: location.actualSpreadsheetId,
    spreadsheetName: location.spreadsheetName,
    spreadsheetUrl: location.spreadsheetUrl,
    reportsSheetExists: location.reportsSheetExists,
    reportsStudentCount: location.reportsStudentCount,
    legacySeedAvailable: location.legacySeed.available,
    legacySeedExpected: location.legacySeed.expected,
    inserted: imported.inserted,
    skipped: imported.skipped,
    integrity: integrity,
    byExam: counts
  };

  console.log(JSON.stringify(result, null, 2));
  return JSON.stringify(result, null, 2);
}

/**
 * 스크립트 속성의 SPREADSHEET_ID를 이 프로젝트의 기본 ID로 다시 맞춥니다.
 * 학생 데이터는 삭제하지 않습니다.
 */
function resetSpreadsheetIdToDefault() {
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', DEFAULT_SPREADSHEET_ID);
  var result = storageLocation_();
  console.log(JSON.stringify(result, null, 2));
  return JSON.stringify(result, null, 2);
}


/**
 * 이 Apps Script를 열어 둔 현재 Google Sheet를 저장 대상으로 연결합니다.
 * 반드시 대상 스프레드시트에서 '확장 프로그램 → Apps Script'로 연 프로젝트에서 실행하세요.
 */
function connectThisSpreadsheet() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw apiError_(
      'ACTIVE_SHEET_NOT_FOUND',
      '현재 바인딩된 스프레드시트를 찾지 못했습니다. 저장하려는 Google Sheet에서 확장 프로그램 → Apps Script로 열어 실행해 주세요.'
    );
  }

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', active.getId());
  var sheet = active.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = active.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#dce8f5');
  }

  SpreadsheetApp.flush();
  var result = storageLocation_();
  console.log(JSON.stringify(result, null, 2));
  return JSON.stringify(result, null, 2);
}

/**
 * 현재 Google Sheet를 저장 대상으로 연결한 뒤 기존 1~5회 학생 데이터를 가져옵니다.
 * 대상 Sheet가 비어 있고 기존 기본 학생 자료를 처음 넣을 때 사용하세요.
 */
function connectThisSpreadsheetAndImportLegacyRecords() {
  connectThisSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(LEGACY_SEED_PROPERTY);
  props.deleteProperty(REPORT_INTEGRITY_PROPERTY);
  return setupStorageAndImportLegacyRecords();
}

/**
 * 현재까지 다른 Google Sheet에 저장된 Reports 데이터를
 * 지금 열어 둔 Google Sheet로 그대로 복사하고 저장 대상을 전환합니다.
 *
 * 안전을 위해 대상 Reports 시트에 학생 행이 이미 있으면 중단합니다.
 * 기존 학생 링크가 계속 작동하도록 Token과 RecordJSON을 그대로 보존합니다.
 */
function migrateCurrentReportsToThisSpreadsheet() {
  var target = SpreadsheetApp.getActiveSpreadsheet();
  if (!target) {
    throw apiError_(
      'ACTIVE_SHEET_NOT_FOUND',
      '이전할 대상 Google Sheet에서 확장 프로그램 → Apps Script로 연 뒤 실행해 주세요.'
    );
  }

  var props = PropertiesService.getScriptProperties();
  var configuredId = String(props.getProperty('SPREADSHEET_ID') || '').trim();
  var sourceId = configuredId || DEFAULT_SPREADSHEET_ID;

  if (!sourceId) {
    throw apiError_('SOURCE_SHEET_NOT_FOUND', '현재 저장 중인 원본 SPREADSHEET_ID를 찾지 못했습니다.');
  }

  if (sourceId === target.getId()) {
    var sameResult = storageLocation_();
    sameResult.migrated = false;
    sameResult.message = '현재 저장 대상과 이 Google Sheet가 이미 같습니다.';
    console.log(JSON.stringify(sameResult, null, 2));
    return JSON.stringify(sameResult, null, 2);
  }

  var source;
  try {
    source = SpreadsheetApp.openById(sourceId);
  } catch (error) {
    throw apiError_(
      'SOURCE_SHEET_OPEN_FAILED',
      '기존 저장 스프레드시트를 열지 못했습니다. 원본 ID=' + sourceId + ' / 원인: ' + error.message
    );
  }

  var sourceSheet = source.getSheetByName(SHEET_NAME);
  if (!sourceSheet) {
    throw apiError_(
      'SOURCE_REPORTS_NOT_FOUND',
      '기존 저장 스프레드시트에 Reports 시트가 없습니다: ' + source.getUrl()
    );
  }

  var sourceLastRow = sourceSheet.getLastRow();
  if (sourceLastRow < 2) {
    throw apiError_(
      'SOURCE_REPORTS_EMPTY',
      '기존 저장 스프레드시트의 Reports 시트에 학생 데이터가 없습니다: ' + source.getUrl()
    );
  }

  var sourceHeader = sourceSheet
    .getRange(1, 1, 1, HEADERS.length)
    .getDisplayValues()[0];

  if (sourceHeader.join('|') !== HEADERS.join('|')) {
    throw apiError_(
      'SOURCE_HEADER_MISMATCH',
      '기존 Reports 시트의 열 구성이 예상 형식과 다릅니다.'
    );
  }

  var targetSheet = target.getSheetByName(SHEET_NAME);
  if (!targetSheet) {
    targetSheet = target.insertSheet(SHEET_NAME);
  }

  if (targetSheet.getLastRow() > 1) {
    throw apiError_(
      'TARGET_REPORTS_NOT_EMPTY',
      '이전 대상 Reports 시트에 이미 학생 데이터가 있습니다. 중복 방지를 위해 자동 이전을 중단했습니다.'
    );
  }

  // 대상 시트에 헤더와 원본 데이터를 그대로 복사합니다.
  var sourceValues = sourceSheet
    .getRange(1, 1, sourceLastRow, HEADERS.length)
    .getValues();

  targetSheet.clearContents();
  targetSheet
    .getRange(1, 1, sourceValues.length, HEADERS.length)
    .setValues(sourceValues);
  targetSheet.setFrozenRows(1);
  targetSheet
    .getRange(1, 1, 1, HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#dce8f5');

  props.setProperty('SPREADSHEET_ID', target.getId());
  SpreadsheetApp.flush();

  var result = storageLocation_();
  result.migrated = true;
  result.sourceSpreadsheetId = source.getId();
  result.sourceSpreadsheetName = source.getName();
  result.sourceSpreadsheetUrl = source.getUrl();
  result.targetSpreadsheetId = target.getId();
  result.targetSpreadsheetName = target.getName();
  result.targetSpreadsheetUrl = target.getUrl();
  result.copiedStudentCount = sourceLastRow - 1;

  console.log(JSON.stringify(result, null, 2));
  return JSON.stringify(result, null, 2);
}

function storageLocation_() {
  var props = PropertiesService.getScriptProperties();
  var configuredId = String(props.getProperty('SPREADSHEET_ID') || '').trim();
  var effectiveId = configuredId || DEFAULT_SPREADSHEET_ID;
  var spreadsheet;

  try {
    spreadsheet = SpreadsheetApp.openById(effectiveId);
  } catch (error) {
    throw apiError_(
      'SHEET_OPEN_FAILED',
      '스프레드시트를 열지 못했습니다. SPREADSHEET_ID=' + effectiveId +
      ' / 원인: ' + error.message
    );
  }

  var reports = spreadsheet.getSheetByName(SHEET_NAME);
  return {
    serverVersion: SERVER_VERSION,
    configuredSpreadsheetId: configuredId || '미설정(기본값 사용)',
    defaultSpreadsheetId: DEFAULT_SPREADSHEET_ID,
    actualSpreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    spreadsheetUrl: spreadsheet.getUrl(),
    reportsSheetExists: Boolean(reports),
    reportsStudentCount: reports ? Math.max(0, reports.getLastRow() - 1) : 0,
    reportsLastRow: reports ? reports.getLastRow() : 0,
    legacySeed: legacySeedStatus_()
  };
}


function checkCohortCounts() {
  ensureLegacyRecords_();
  ensureReportIntegrity_();
  var counts = {};
  readAll_().forEach(function (item) {
    var examId = item.record.examId;
    counts[examId] = (counts[examId] || 0) + 1;
  });
  var result = {
    total: Object.keys(counts).reduce(function (sum, key) { return sum + counts[key]; }, 0),
    byExam: counts,
    legacySeed: legacySeedStatus_()
  };
  console.log(JSON.stringify(result));
  return JSON.stringify(result);
}

function resetLegacyImportFlag() {
  PropertiesService.getScriptProperties().deleteProperty(LEGACY_SEED_PROPERTY);
  return '기존 데이터 초기화 표시를 지웠습니다. initializeLegacyRecords를 다시 실행하세요.';
}

function initializeReportIntegrity() {
  ensureLegacyRecords_();
  var result = repairReportIntegrity_(true);
  return '학생 링크 무결성 복구 완료: 기존 ' + result.before + '행, 정리 후 ' + result.after + '행, 동명이인 이름 번호 부여 ' + result.duplicateStudentRowsRenamed + '개, 중복·잘못된 토큰 재발급 ' + result.tokensReissued + '개';
}

function renumberDuplicateStudentNames() {
  ensureLegacyRecords_();
  var result = repairReportIntegrity_(true);
  return '동명이인 이름 정리 완료: ' + result.duplicateStudentRowsRenamed + '개 기록에 이름2, 이름3 ... 형식으로 번호를 부여했습니다. 백업 시트: ' + (result.backupSheet || '생성 안 됨');
}

function checkReportIntegrity() {
  var result = inspectReportIntegrity_();
  console.log(JSON.stringify(result));
  return JSON.stringify(result);
}

function ensureReportIntegrity_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(REPORT_INTEGRITY_PROPERTY) === REPORT_INTEGRITY_VERSION) return { repaired: false, version: REPORT_INTEGRITY_VERSION };
  return repairReportIntegrity_(false);
}

function parseIntegrityRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { records: [], malformed: 0 };
  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var records = [];
  var malformed = 0;
  values.forEach(function (row, index) {
    try {
      var rawRecord = JSON.parse(String(row[9] || '{}'));
      var examId = String(row[3] || rawRecord.examId || '').trim();
      var exam = getExam_(examId);
      var school = normalizeSchool_(row[6] || rawRecord.school);
      var name = normalizeText_(row[7] || rawRecord.name);
      if (!name) throw new Error('이름 없음');
      var answers;
      try { answers = JSON.parse(String(row[8] || '[]')); }
      catch (answerError) { answers = rawRecord.answers || []; }
      answers = normalizeAnswers_(answers, exam.answerCount);
      var createdAt = String(row[1] || rawRecord.createdAt || new Date().toISOString());
      var updatedAt = String(row[2] || rawRecord.updatedAt || createdAt);
      records.push({
        originalRow: index + 2,
        token: String(row[0] || '').trim(),
        identity: exam.id + '|' + studentKey_({ school: school, name: name }),
        exam: exam,
        record: {
          id: String(rawRecord.id || ''),
          serverId: String(rawRecord.serverId || ''),
          examId: exam.id,
          round: Number(rawRecord.round || row[4] || exam.round || 0),
          school: school,
          name: name,
          answers: answers,
          createdAt: createdAt,
          updatedAt: updatedAt,
          source: rawRecord.source || '',
          requestedName: rawRecord.requestedName || '',
          duplicateNameIndex: Number(rawRecord.duplicateNameIndex || studentNameParts_(name).index || 1),
          nameAliases: Array.isArray(rawRecord.nameAliases) ? rawRecord.nameAliases.slice() : [],
          identityFingerprintAliases: identityAliases_(rawRecord)
        }
      });
    } catch (error) {
      malformed += 1;
      console.warn('Reports ' + (index + 2) + '행 무결성 확인 실패: ' + error.message);
    }
  });
  return { records: records, malformed: malformed };
}


function inspectReportIntegrity_() {
  var parsed = parseIntegrityRows_(sheet_());
  var tokenOwners = {};
  var identities = {};
  var duplicateTokens = 0;
  var invalidTokens = 0;
  var duplicateStudentRows = 0;
  parsed.records.forEach(function (item) {
    if (!/^[A-Fa-f0-9]{24,64}$/.test(item.token)) invalidTokens += 1;
    else if (tokenOwners[item.token] && tokenOwners[item.token] !== item.identity) duplicateTokens += 1;
    else tokenOwners[item.token] = item.identity;
    if (identities[item.identity]) duplicateStudentRows += 1;
    identities[item.identity] = true;
  });
  return {
    serverVersion: SERVER_VERSION,
    rows: parsed.records.length,
    malformedRows: parsed.malformed,
    duplicateTokens: duplicateTokens,
    invalidTokens: invalidTokens,
    duplicateStudentRows: duplicateStudentRows,
    repairVersion: PropertiesService.getScriptProperties().getProperty(REPORT_INTEGRITY_PROPERTY) || ''
  };
}

function repairReportIntegrity_(force) {
  var props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty(REPORT_INTEGRITY_PROPERTY) === REPORT_INTEGRITY_VERSION) {
    var currentCount = readAll_().length;
    return { repaired: false, version: REPORT_INTEGRITY_VERSION, before: currentCount, after: currentCount, duplicateStudentRowsRemoved: 0, duplicateStudentRowsRenamed: 0, tokensReissued: 0, malformedRowsRemoved: 0 };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = sheet_();
    var parsed = parseIntegrityRows_(sheet);
    var retained = parsed.records.slice().sort(function (a, b) { return a.originalRow - b.originalRow; });
    var usedTokens = {};
    var tokensReissued = 0;
    var duplicateStudentRowsRenamed = 0;
    var assignedItems = [];

    var rows = retained.map(function (item) {
      var token = item.token;
      if (!/^[A-Fa-f0-9]{24,64}$/.test(token) || usedTokens[token]) {
        token = Utilities.getUuid().replace(/-/g, '');
        tokensReissued += 1;
      }
      usedTokens[token] = true;

      var record = item.record;
      var oldName = normalizeText_(record.name);
      var assignedName = nextAvailableStudentName_(assignedItems, record.examId, record.school, oldName, '');
      if (assignedName !== oldName) {
        addIdentityAlias_(record, record.examId, record.school, oldName);
        duplicateStudentRowsRenamed += 1;
      }

      record.id = token;
      record.serverId = token;
      record.school = normalizeSchool_(record.school);
      record.name = assignedName;
      record.answers = normalizeAnswers_(record.answers, item.exam.answerCount);
      record.duplicateNameIndex = studentNameParts_(assignedName).index;
      var key = studentKey_(record);
      assignedItems.push({ token: token, record: record, row: item.originalRow });
      return [
        token,
        record.createdAt,
        record.updatedAt,
        record.examId,
        record.round,
        key,
        record.school,
        record.name,
        JSON.stringify(record.answers),
        JSON.stringify(record)
      ];
    });

    var backupName = '';
    if (sheet.copyTo) {
      try {
        var stamp = Utilities.formatDate ? Utilities.formatDate(new Date(), Session.getScriptTimeZone ? Session.getScriptTimeZone() : 'Asia/Seoul', 'yyyyMMdd_HHmmss') : String(Date.now());
        backupName = SHEET_NAME + '_backup_' + stamp;
        sheet.copyTo(spreadsheet_()).setName(backupName);
      } catch (backupError) {
        console.warn('Reports 백업 시트를 만들지 못했습니다: ' + backupError.message);
        backupName = '';
      }
    }

    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
    if (rows.length) sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    SpreadsheetApp.flush();
    props.setProperty(REPORT_INTEGRITY_PROPERTY, REPORT_INTEGRITY_VERSION);
    return {
      repaired: true,
      version: REPORT_INTEGRITY_VERSION,
      before: parsed.records.length,
      after: rows.length,
      duplicateStudentRowsRemoved: 0,
      duplicateStudentRowsRenamed: duplicateStudentRowsRenamed,
      tokensReissued: tokensReissued,
      malformedRowsRemoved: parsed.malformed,
      backupSheet: backupName
    };
  } finally {
    lock.releaseLock();
  }
}


function ensureLegacyRecords_() {
  if (!legacySeedAvailable_()) return { available: false, inserted: 0, skipped: 0, total: readAll_().length };
  var status = legacySeedStatus_();
  if (status.imported) return { available: true, imported: true, inserted: 0, skipped: status.expected, total: readAll_().length, version: status.version };
  return importLegacyRecords_(false);
}

function importLegacyRecords_(force) {
  if (!legacySeedAvailable_()) {
    throw apiError_('LEGACY_SEED_MISSING', '기존 1~5회 학생 데이터 파일(LegacySeed.gs)이 Apps Script 프로젝트에 없습니다.');
  }

  var props = PropertiesService.getScriptProperties();
  var version = String(LEGACY_SEED_VERSION || '');
  if (!force && props.getProperty(LEGACY_SEED_PROPERTY) === version) {
    return { available: true, imported: true, version: version, inserted: 0, skipped: LEGACY_SEED_RECORDS.length, total: readAll_().length };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = sheet_();
    var existing = readAll_(sheet);
    var allItems = existing.slice();
    var byContent = {};
    existing.forEach(function (item) {
      var record = item.record;
      byContent[seedContentKey_(record.examId, record.school, record.name, record.answers)] = true;
    });

    var rows = [];
    var skipped = 0;
    var now = new Date().toISOString();
    LEGACY_SEED_RECORDS.forEach(function (input) {
      var exam = getExam_(input.examId);
      var school = normalizeSchool_(input.school);
      var requestedName = normalizeText_(input.name);
      if (!requestedName) return;
      var answers = normalizeAnswers_(input.answers, exam.answerCount);
      var contentKey = seedContentKey_(exam.id, school, requestedName, answers);
      if (byContent[contentKey]) {
        skipped += 1;
        return;
      }

      var assignedName = nextAvailableStudentName_(allItems, exam.id, school, requestedName, '');
      var token = Utilities.getUuid().replace(/-/g, '');
      var createdAt = input.createdAt || now;
      var record = {
        id: token,
        serverId: token,
        examId: exam.id,
        round: exam.round,
        school: school,
        name: assignedName,
        requestedName: requestedName,
        duplicateNameIndex: studentNameParts_(assignedName).index,
        answers: answers,
        createdAt: createdAt,
        updatedAt: createdAt,
        source: 'legacy-excel-seed'
      };
      var key = studentKey_(record);
      rows.push([
        token, createdAt, createdAt, exam.id, exam.round, key, school, assignedName,
        JSON.stringify(answers), JSON.stringify(record)
      ]);
      allItems.push({ token: token, record: record, row: sheet.getLastRow() + rows.length });
      byContent[contentKey] = true;
    });

    if (rows.length) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
      SpreadsheetApp.flush();
    }
    props.setProperty(LEGACY_SEED_PROPERTY, version);
    props.deleteProperty(REPORT_INTEGRITY_PROPERTY);
    return {
      available: true,
      imported: true,
      version: version,
      inserted: rows.length,
      skipped: skipped,
      total: sheet.getLastRow() > 1 ? sheet.getLastRow() - 1 : 0
    };
  } finally {
    lock.releaseLock();
  }
}


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
    answerKey: [4,1,3,5,5,1,2,5,4,5,1,1,4,3,4,5,2,4,3,2],
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
      response = { ok: true, message: 'TPL 성적 서버 연결에 성공했습니다.', serverVersion: SERVER_VERSION, cohortScope: 'same-exam-google-sheet', legacySeed: legacySeedStatus_(), reportIntegrity: inspectReportIntegrity_(), serverTime: new Date().toISOString() };
    } else if (action === 'save') {
      assertWriteKey_(e.parameter.writeKey);
      response = saveReport_(e.parameter.payload);
    } else if (action === 'saveBatch') {
      assertWriteKey_(e.parameter.writeKey);
      response = saveReportsBatch_(e.parameter.payload);
    } else if (action === 'get') {
      response = getReport_(e.parameter.id);
    } else if (action === 'list') {
      assertWriteKey_(e.parameter.writeKey);
      response = listReports_(e.parameter.limit, e.parameter.offset);
    } else if (action === 'delete') {
      assertWriteKey_(e.parameter.writeKey);
      response = deleteReport_(e.parameter.id);
    } else if (action === 'repair') {
      assertWriteKey_(e.parameter.writeKey);
      response = { ok: true, serverVersion: SERVER_VERSION, repair: repairReportIntegrity_(true) };
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
  var configuredId = String(
    PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || ''
  ).trim();
  var id = configuredId || DEFAULT_SPREADSHEET_ID;

  if (!id) {
    throw apiError_(
      'SHEET_NOT_FOUND',
      'SPREADSHEET_ID가 설정되어 있지 않습니다.'
    );
  }

  try {
    return SpreadsheetApp.openById(id);
  } catch (error) {
    throw apiError_(
      'SHEET_OPEN_FAILED',
      '지정한 스프레드시트를 열지 못했습니다. SPREADSHEET_ID=' + id +
      ' / 원인: ' + error.message
    );
  }
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
  ensureLegacyRecords_();
  ensureReportIntegrity_();
  var input;
  try {
    input = JSON.parse(String(payloadText || '{}'));
  } catch (error) {
    throw apiError_('INVALID_PAYLOAD', '학생 데이터 JSON을 읽지 못했습니다.');
  }

  var exam = getExam_(input.examId);
  var school = normalizeSchool_(input.school);
  var requestedName = normalizeText_(input.name);
  if (!requestedName) throw apiError_('NAME_REQUIRED', '학생 이름을 입력해 주세요.');
  var answers = normalizeAnswers_(input.answers, exam.answerCount);
  var requestedFingerprint = identityFingerprint_({ examId: exam.id, school: school, name: requestedName });
  if (input.identityFingerprint && String(input.identityFingerprint).toLowerCase() !== requestedFingerprint) {
    throw apiError_('IDENTITY_FINGERPRINT_MISMATCH', '학생 이름·학교·시험 식별값이 요청과 일치하지 않습니다.');
  }

  var intent = normalizeSaveIntent_(input.saveIntent);
  var explicitToken = extractServerToken_(input);
  var now = new Date().toISOString();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var token;
  var record;
  var assignedName;
  var nameAdjusted = false;
  try {
    var sheet = sheet_();
    var items = readAll_(sheet);
    var found = explicitToken ? findItemByTokenInItems_(items, explicitToken) : null;

    if (intent === 'update' && explicitToken && !found) {
      throw apiError_('EDIT_TARGET_NOT_FOUND', '수정할 학생 기록을 찾지 못했습니다. 학생 기록을 새로고침한 뒤 다시 시도해 주세요.');
    }
    if (!found && intent !== 'create') {
      found = findItemByExactIdentity_(items, exam.id, school, requestedName);
    }

    if (found) {
      assignedName = nextAvailableStudentName_(items, exam.id, school, requestedName, found.token);
      token = found.token;
    } else {
      assignedName = intent === 'create'
        ? nextAvailableStudentName_(items, exam.id, school, requestedName, '')
        : requestedName;
      token = Utilities.getUuid().replace(/-/g, '');
    }
    nameAdjusted = assignedName !== requestedName;

    var createdAt = found ? found.record.createdAt : (input.createdAt || now);
    record = found ? Object.assign({}, found.record) : {};
    if (found && normalizeText_(found.record.name) !== assignedName) {
      addIdentityAlias_(record, exam.id, found.record.school, found.record.name);
    }
    record.id = token;
    record.serverId = token;
    record.examId = exam.id;
    record.round = exam.round;
    record.school = school;
    record.name = assignedName;
    record.answers = answers;
    record.createdAt = createdAt;
    record.updatedAt = now;
    record.requestedName = requestedName;
    record.duplicateNameIndex = studentNameParts_(assignedName).index;

    var key = studentKey_(record);
    var row = [
      token, createdAt, now, exam.id, exam.round, key, school, assignedName,
      JSON.stringify(answers), JSON.stringify(record)
    ];
    if (found) sheet.getRange(found.row, 1, 1, HEADERS.length).setValues([row]);
    else sheet.appendRow(row);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    token: token,
    id: token,
    serverVersion: SERVER_VERSION,
    requestedName: requestedName,
    assignedName: assignedName,
    nameAdjusted: nameAdjusted,
    duplicateNameIndex: studentNameParts_(assignedName).index,
    report: buildSnapshot_(record)
  };
}


function saveReportsBatch_(payloadText) {
  ensureLegacyRecords_();
  ensureReportIntegrity_();
  var inputs;
  try {
    inputs = JSON.parse(String(payloadText || '[]'));
  } catch (error) {
    throw apiError_('INVALID_PAYLOAD', '학생 일괄 데이터 JSON을 읽지 못했습니다.');
  }
  if (!Array.isArray(inputs)) throw apiError_('INVALID_PAYLOAD', '학생 일괄 데이터는 배열이어야 합니다.');
  if (!inputs.length) return { ok: true, count: 0, saved: [] };
  if (inputs.length > 10) throw apiError_('BATCH_TOO_LARGE', '한 번에 최대 10명까지 저장할 수 있습니다.');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var saved = [];
  try {
    var sheet = sheet_();
    var items = readAll_(sheet);

    inputs.forEach(function (input) {
      var exam = getExam_(input.examId);
      var school = normalizeSchool_(input.school);
      var requestedName = normalizeText_(input.name);
      if (!requestedName) throw apiError_('NAME_REQUIRED', '학생 이름을 입력해 주세요.');
      var answers = normalizeAnswers_(input.answers, exam.answerCount);
      var requestedFingerprint = identityFingerprint_({ examId: exam.id, school: school, name: requestedName });
      if (input.identityFingerprint && String(input.identityFingerprint).toLowerCase() !== requestedFingerprint) {
        throw apiError_('IDENTITY_FINGERPRINT_MISMATCH', requestedName + ' 학생의 이름·학교·시험 식별값이 요청과 일치하지 않습니다.');
      }

      var intent = normalizeSaveIntent_(input.saveIntent);
      var explicitToken = extractServerToken_(input);
      var found = explicitToken ? findItemByTokenInItems_(items, explicitToken) : null;
      if (intent === 'update' && explicitToken && !found) {
        throw apiError_('EDIT_TARGET_NOT_FOUND', requestedName + ' 학생의 수정 대상 기록을 찾지 못했습니다.');
      }
      if (!found && intent !== 'create') {
        found = findItemByExactIdentity_(items, exam.id, school, requestedName);
      }

      var assignedName;
      var token;
      if (found) {
        assignedName = nextAvailableStudentName_(items, exam.id, school, requestedName, found.token);
        token = found.token;
      } else {
        assignedName = intent === 'create'
          ? nextAvailableStudentName_(items, exam.id, school, requestedName, '')
          : requestedName;
        token = Utilities.getUuid().replace(/-/g, '');
      }

      var now = new Date().toISOString();
      var createdAt = found ? found.record.createdAt : (input.createdAt || now);
      var record = found ? Object.assign({}, found.record) : {};
      if (found && normalizeText_(found.record.name) !== assignedName) {
        addIdentityAlias_(record, exam.id, found.record.school, found.record.name);
      }
      record.id = token;
      record.serverId = token;
      record.examId = exam.id;
      record.round = exam.round;
      record.school = school;
      record.name = assignedName;
      record.answers = answers;
      record.createdAt = createdAt;
      record.updatedAt = now;
      record.requestedName = requestedName;
      record.duplicateNameIndex = studentNameParts_(assignedName).index;

      var key = studentKey_(record);
      var row = [
        token, createdAt, now, exam.id, exam.round, key, school, assignedName,
        JSON.stringify(answers), JSON.stringify(record)
      ];

      if (found) {
        sheet.getRange(found.row, 1, 1, HEADERS.length).setValues([row]);
        found.record = record;
        found.token = token;
      } else {
        sheet.appendRow(row);
        found = { token: token, record: record, row: sheet.getLastRow() };
        items.push(found);
      }

      saved.push({
        token: token,
        id: token,
        clientRecordId: input.clientRecordId || '',
        examId: exam.id,
        round: exam.round,
        school: school,
        name: assignedName,
        requestedName: requestedName,
        nameAdjusted: assignedName !== requestedName,
        duplicateNameIndex: studentNameParts_(assignedName).index,
        createdAt: createdAt,
        updatedAt: now
      });
    });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return { ok: true, count: saved.length, saved: saved };
}


function getReport_(id) {
  ensureLegacyRecords_();
  ensureReportIntegrity_();
  var token = String(id || '').trim();
  if (!/^[A-Fa-f0-9]{24,64}$/.test(token)) throw apiError_('INVALID_ID', '학생 결과 링크의 ID가 올바르지 않습니다.');
  var item = findByToken_(sheet_(), token);
  if (!item) throw apiError_('NOT_FOUND', '삭제되었거나 존재하지 않는 학생 결과입니다.');
  return { ok: true, token: token, dynamic: true, serverVersion: SERVER_VERSION, recordFingerprint: identityFingerprint_(item.record), report: buildSnapshot_(item.record) };
}

function listReports_(limitValue, offsetValue) {
  ensureLegacyRecords_();
  ensureReportIntegrity_();
  var limit = Math.max(1, Math.min(500, Number(limitValue || 100)));
  var offset = Math.max(0, Number(offsetValue || 0));
  var all = readAll_().sort(function (a, b) {
    return String(b.record.updatedAt || b.record.createdAt).localeCompare(String(a.record.updatedAt || a.record.createdAt));
  });
  var items = all.slice(offset, offset + limit);
  var nextOffset = offset + items.length;
  return {
    ok: true,
    serverVersion: SERVER_VERSION,
    total: all.length,
    offset: offset,
    limit: limit,
    nextOffset: nextOffset,
    hasMore: nextOffset < all.length,
    reports: items.map(function (item) { return { token: item.token, record: enrich_(item.record) }; })
  };
}

function deleteReport_(id) {
  ensureLegacyRecords_();
  ensureReportIntegrity_();
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
  var matches = items.filter(function (item) { return item.token === token; });
  if (matches.length > 1) throw apiError_('DUPLICATE_TOKEN', '같은 학생 링크 토큰이 여러 기록에 연결되어 있습니다. 교사가 initializeReportIntegrity를 실행해야 합니다.');
  return matches.length ? matches[0] : null;
}

function readAll_(providedSheet) {
  var sheet = providedSheet || sheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var items = [];
  values.forEach(function (row, index) {
    try {
      var token = String(row[0] || '').trim();
      var record = JSON.parse(String(row[9] || '{}'));
      var examId = String(row[3] || record.examId || '').trim();
      var exam = getExam_(examId);
      var school = normalizeSchool_(row[6] || record.school);
      var name = normalizeText_(row[7] || record.name);
      var answers;
      try { answers = JSON.parse(String(row[8] || '[]')); }
      catch (answerError) { answers = record.answers || []; }
      if (token && name) {
        record.id = token;
        record.serverId = token;
        record.examId = exam.id;
        record.round = Number(row[4] || record.round || exam.round || 0);
        record.school = school;
        record.name = name;
        record.answers = normalizeAnswers_(answers, exam.answerCount);
        record.createdAt = String(row[1] || record.createdAt || new Date().toISOString());
        record.updatedAt = String(row[2] || record.updatedAt || record.createdAt);
        items.push({ token: token, record: record, row: index + 2 });
      }
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
    version: 3,
    serverVersion: SERVER_VERSION,
    cohortScope: 'same-exam-google-sheet',
    generatedAt: new Date().toISOString(),
    dynamicHistory: true,
    legacySeed: legacySeedStatus_(),
    recordFingerprint: identityFingerprint_(enriched),
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
      requestedName: enriched.requestedName || '',
      duplicateNameIndex: Number(enriched.duplicateNameIndex || studentNameParts_(enriched.name).index || 1),
      nameAliases: Array.isArray(enriched.nameAliases) ? enriched.nameAliases : [],
      identityFingerprintAliases: identityAliases_(enriched),
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
    source: 'google-sheets-same-exam',
    legacySeedImported: legacySeedStatus_().imported,
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
  var currentRound = Number(currentRecord.round || getExam_(currentRecord.examId).round || 0);
  var latest = {};
  records.forEach(function (record) {
    if (studentKey_(record) !== key) return;
    var recordRound = Number(record.round || getExam_(record.examId).round || 0);
    // 현재 성적표보다 뒤 회차는 제외하고, 현재 회차까지의 기록은 입력 순서와
    // 관계없이 매번 다시 모은다. 따라서 5회를 먼저 저장한 뒤 4회를 추가해도
    // 기존 5회 링크를 다시 열면 4회 결과가 자동으로 포함된다.
    if (currentRound && recordRound > currentRound) return;
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

function normalizeSchool_(value) {
  return normalizeText_(value) || '미입력';
}

function studentKey_(record) {
  return normalizeKey_(normalizeSchool_(record && record.school)) + '::' + normalizeKey_(record && record.name);
}

function identityFingerprint_(record) {
  var text = normalizeKey_(record && record.examId) + '::' + studentKey_(record);
  var hash = 0x811c9dc5;
  for (var i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  var hex = (hash >>> 0).toString(16);
  while (hex.length < 8) hex = '0' + hex;
  return hex;
}


function normalizeSaveIntent_(value) {
  var intent = normalizeKey_(value);
  if (intent === 'create' || intent === 'update' || intent === 'sync') return intent;
  return 'sync';
}

function extractServerToken_(input) {
  var candidates = [input && input.serverId, input && input.token, input && input.id];
  var clientRecordId = String((input && input.clientRecordId) || '').trim();
  if (/^server-[A-Fa-f0-9]{24,64}$/.test(clientRecordId)) candidates.push(clientRecordId.slice(7));
  for (var i = 0; i < candidates.length; i += 1) {
    var token = String(candidates[i] || '').trim();
    if (/^[A-Fa-f0-9]{24,64}$/.test(token)) return token;
  }
  return '';
}

function studentNameParts_(value) {
  var name = normalizeText_(value);
  if (!name) return { name: '', base: '', index: 1 };
  var match = name.match(/^(.*?)(\d+)$/);
  if (!match) return { name: name, base: name, index: 1 };
  var base = normalizeText_(match[1]);
  var index = Number(match[2]);
  if (!base || !isFinite(index) || Math.floor(index) !== index || index < 2) {
    return { name: name, base: name, index: 1 };
  }
  return { name: name, base: base, index: index };
}

function studentNameFamilyKey_(value) {
  return normalizeKey_(studentNameParts_(value).base);
}

function sameExamSchool_(record, examId, school) {
  return String(record && record.examId || '') === String(examId || '') &&
    normalizeKey_(normalizeSchool_(record && record.school)) === normalizeKey_(normalizeSchool_(school));
}

function findItemByTokenInItems_(items, token) {
  var value = String(token || '').trim();
  if (!value) return null;
  for (var i = 0; i < items.length; i += 1) if (String(items[i].token || '') === value) return items[i];
  return null;
}

function findItemByExactIdentity_(items, examId, school, name) {
  var key = studentKey_({ school: school, name: name });
  for (var i = 0; i < items.length; i += 1) {
    if (items[i].record.examId === examId && studentKey_(items[i].record) === key) return items[i];
  }
  return null;
}

function nextAvailableStudentName_(items, examId, school, requestedName, excludeToken) {
  var requested = studentNameParts_(requestedName);
  if (!requested.name) return '';
  var familyKey = studentNameFamilyKey_(requested.base);
  var used = {};
  (items || []).forEach(function (item) {
    if (!item || !item.record) return;
    if (excludeToken && String(item.token || '') === String(excludeToken)) return;
    if (!sameExamSchool_(item.record, examId, school)) return;
    var parts = studentNameParts_(item.record.name);
    if (studentNameFamilyKey_(parts.base) !== familyKey) return;
    used[parts.index] = true;
  });

  if (!used[requested.index]) return requested.name;
  var max = 1;
  Object.keys(used).forEach(function (key) { max = Math.max(max, Number(key) || 1); });
  return requested.base + String(Math.max(2, max + 1));
}

function identityAliases_(record) {
  var source = record && record.identityFingerprintAliases;
  return Array.isArray(source) ? source.map(function (value) { return String(value || '').toLowerCase(); }).filter(Boolean) : [];
}

function addIdentityAlias_(record, examId, school, oldName) {
  var alias = identityFingerprint_({ examId: examId, school: school, name: oldName });
  var aliases = identityAliases_(record);
  if (aliases.indexOf(alias) < 0) aliases.push(alias);
  record.identityFingerprintAliases = aliases;
  var names = Array.isArray(record.nameAliases) ? record.nameAliases.slice() : [];
  var normalizedOld = normalizeText_(oldName);
  if (normalizedOld && names.indexOf(normalizedOld) < 0) names.push(normalizedOld);
  record.nameAliases = names;
  return record;
}

function seedContentKey_(examId, school, name, answers) {
  return String(examId || '') + '|' + normalizeKey_(normalizeSchool_(school)) + '|' +
    studentNameFamilyKey_(name) + '|' + JSON.stringify(answers || []);
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

// Public-safe build: existing student seed data is intentionally excluded.
var LEGACY_SEED_VERSION = '';
var LEGACY_SEED_RECORDS = [];
