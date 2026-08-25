const fs = require('fs');
const path = require('path');
const assert = require('assert');

const transport = fs.readFileSync(path.join(__dirname, '..', 'site', 'assets', 'sync-performance.js'), 'utf8');
const fastReport = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'FastReport.gs'), 'utf8');
const config = fs.readFileSync(path.join(__dirname, '..', 'site', 'assets', 'config.js'), 'utf8');
const patcher = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs_통합자동패치.html'), 'utf8');

assert.match(config, /backendTimeoutMs:\s*60000/);
assert.match(config, /fastReportEnabled:\s*true/);
assert.match(transport, /action === 'get'/);
assert.match(transport, /getFast/);
assert.match(transport, /getReportFast_/);
assert.match(fastReport, /function getReportFast_/);
assert.match(fastReport, /function buildSnapshotFast_/);
assert.match(fastReport, /function checkFastReport/);
assert.match(fastReport, /getRange\(2,\s*1,\s*lastRow - 1,\s*9\)/);
assert.match(fastReport, /getRange\(currentIndex \+ 2,\s*10\)/);
assert.doesNotMatch(fastReport, /ensureLegacyRecords_\(/);
assert.doesNotMatch(fastReport, /ensureReportIntegrity_\(/);
assert.doesNotMatch(fastReport, /readAll_\(/);
assert.match(patcher, /action === 'getFast'/);

console.log('fast_report_patch.test.js: all assertions passed');
