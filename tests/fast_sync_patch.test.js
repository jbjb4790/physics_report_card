const fs = require('fs');
const path = require('path');
const assert = require('assert');

const transport = fs.readFileSync(path.join(__dirname, '..', 'site', 'assets', 'sync-performance.js'), 'utf8');
const config = fs.readFileSync(path.join(__dirname, '..', 'site', 'assets', 'config.js'), 'utf8');
const fastSync = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'FastSync.gs'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const report = fs.readFileSync(path.join(__dirname, '..', 'site', 'report.html'), 'utf8');

assert.match(config, /backendTimeoutMs:\s*60000/);
assert.match(config, /serverSyncPageSize:\s*500/);
assert.match(transport, /pingLite/);
assert.match(transport, /listLite/);
assert.match(transport, /FAST_API_FALLBACK_FAILED/);
assert.match(fastSync, /function pingLite_/);
assert.match(fastSync, /function listReportsLite_/);
assert.match(fastSync, /function checkFastSync/);
assert.doesNotMatch(fastSync, /enrich_\(/);
assert.doesNotMatch(fastSync, /ensureReportIntegrity_\(/);
assert.match(index, /sync-performance\.js\?v=3\.9\.2/);
assert.match(report, /sync-performance\.js\?v=3\.9\.2/);

console.log('fast_sync_patch.test.js: all assertions passed');
