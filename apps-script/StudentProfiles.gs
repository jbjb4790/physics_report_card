/**
 * Young's Physics TPL Student Profiles, v3.13.0 (re-created distribution)
 * Requires the production Code.gs helpers: spreadsheet_, readAll_, grade_,
 * enrich_, getExam_, studentKey_, identityFingerprint_, normalizeSchool_,
 * normalizeText_, apiError_, round_, average_.
 *
 * Students is independent of Reports. Never reissue a profile token as a
 * side effect of saving a new exam. Public GET uses a bearer StudentToken.
 */
var YP_STUDENTS_SHEET_ = 'Students';
var YP_STUDENTS_HEADERS_ = ['StudentToken','CreatedAt','UpdatedAt','StudentKey','School','Name','KeysJSON','Status'];

function ypStudentsSheet_() {
  var ss = spreadsheet_();
  var sheet = ss.getSheetByName(YP_STUDENTS_SHEET_);
  if (!sheet) sheet = ss.insertSheet(YP_STUDENTS_SHEET_);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,YP_STUDENTS_HEADERS_.length).setValues([YP_STUDENTS_HEADERS_]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ypReadStudentProfiles_() {
  var sheet = ypStudentsSheet_();
  var count = sheet.getLastRow() - 1;
  if (count < 1) return [];
  return sheet.getRange(2,1,count,YP_STUDENTS_HEADERS_.length).getValues().map(function(r,i) {
    return {
      studentToken: String(r[0] || '').trim(),
      createdAt: String(r[1] || ''), updatedAt: String(r[2] || ''),
      studentKey: String(r[3] || '').trim(),
      school: normalizeSchool_(r[4]), name: normalizeText_(r[5]),
      keysJson: String(r[6] || '[]'), status: String(r[7] || 'active'), row: i+2
    };
  }).filter(function(p) { return /^[0-9a-f]{32}$/i.test(p.studentToken); });
}

function ypProfileKeys_(p) {
  var keys = [];
  try {
    var parsed = JSON.parse(String(p.keysJson || '[]'));
    if (Array.isArray(parsed)) keys = parsed;
  } catch(e) {}
  keys.unshift(p.studentKey);
  var seen = {};
  return keys.map(function(k) {return String(k || '').trim();}).filter(function(k) {
    if (!k || seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

function ypProfileValues_(p) {
  return [p.studentToken,p.createdAt,p.updatedAt,p.studentKey,
    p.school,p.name,JSON.stringify(ypProfileKeys_(p)),p.status || 'active'];
}

function ypProfileByToken_(profiles,token) {
  var t=String(token || '').trim();
  for(var i=0;i<profiles.length;i++) if(profiles[i].studentToken === t) return profiles[i];
  return null;
}

function ypFollowMergedProfile_(profiles,profile) {
  var p = profile, seen = {};
  while (p && /^merged:/.test(p.status)) {
    if (seen[p.studentToken]) throw apiError_('PROFILE_MERGE_CYCLE','학생 프로필 연결이 순환합니다. 교사 확인이 필요합니다.');
    seen[p.studentToken] = true;
    p = ypProfileByToken_(profiles,p.status.slice(7));
  }
  if (!p) throw apiError_('PROFILE_MERGE_MISSING','병합된 학생 프로필을 찾지 못했습니다.');
  return p;
}

function ypActiveProfileOwners_(profiles) {
  var byKey = {};
  profiles.forEach(function(p) {
    if (/^merged:/.test(p.status)) return;
    ypProfileKeys_(p).forEach(function(k) {
      // Never silently merge two active student profiles with the same name.
      if (!byKey[k]) byKey[k] = p;
    });
  });
  return byKey;
}

/** Run once after installing StudentProfiles.gs; safe to run again. */
function initializeStudentProfiles() {
  var result = ypInitializeStudentProfiles_();
  var message = '학생 통합페이지 준비 완료: 프로필 ' + result.total + '명 / 이번에 추가 ' + result.created + '명 / 시험기록 ' + result.reportCount + '개';
  console.log(message);
  return message;
}

function ypInitializeStudentProfiles_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var records = readAll_();
    var profiles = ypReadStudentProfiles_();
    var byKey = ypActiveProfileOwners_(profiles), pending = {};
    records.forEach(function(item) {
      var r = item.record || {};
      var k = studentKey_(r);
      if (k && r.name && !byKey[k]) pending[k] = {name:r.name, school:r.school};
    });
    var now = new Date().toISOString();
    var rows = Object.keys(pending).map(function(k) {
      var r = pending[k], token = Utilities.getUuid().replace(/-/g,'');
      return [token,now,now,k,normalizeSchool_(r.school),normalizeText_(r.name),JSON.stringify([k]),'active'];
    });
    if (rows.length) {
      var sheet = ypStudentsSheet_();
      sheet.getRange(sheet.getLastRow()+1,1,rows.length,YP_STUDENTS_HEADERS_.length).setValues(rows);
      SpreadsheetApp.flush();
    }
    return {ok:true,version:'3.13.0',created:rows.length,total:profiles.filter(function(p){return !/^merged:/.test(p.status);}).length+rows.length,reportCount:records.length};
  } finally {lock.releaseLock();}
}

function checkStudentProfiles() {
  var profiles = ypReadStudentProfiles_();
  var byKey = ypActiveProfileOwners_(profiles);
  var records = readAll_(), unlinked=0, duplicateKeys=0, seen={};
  profiles.forEach(function(p) {
    if (/^merged:/.test(p.status)) return;
    ypProfileKeys_(p).forEach(function(k) {if(seen[k] && seen[k]!==p.studentToken) duplicateKeys++; seen[k]=p.studentToken;});
  });
  records.forEach(function(item) {if(!byKey[studentKey_(item.record)]) unlinked++;});
  var result = {ok:unlinked===0&&duplicateKeys===0,profiles:profiles.length,
    reports:records.length,unlinkedReports:unlinked,duplicateActiveKeys:duplicateKeys};
  console.log(JSON.stringify(result,null,2));
  return JSON.stringify(result,null,2);
}

/** Public action studentResolve: only somebody holding a report token may resolve it. */
function ypResolveStudentFromReport_(reportToken) {
  var id=String(reportToken||'').trim();
  if(!/^[0-9a-f]{24,64}$/i.test(id)) throw apiError_('INVALID_ID','시험 성적표 토큰이 올바르지 않습니다.');
  // Auto-register students whose first exam was entered since initialization.
  ypInitializeStudentProfiles_();
  var matching=readAll_().filter(function(x){return x.token===id;});
  if(matching.length!==1) throw apiError_('REPORT_NOT_UNIQUE','시험별 성적표를 찾지 못하거나 중복되었습니다. 교사에게 확인해 주세요.');
  var key=studentKey_(matching[0].record);
  var profiles=ypReadStudentProfiles_();
  var p=ypActiveProfileOwners_(profiles)[key];
  if(!p) throw apiError_('PROFILE_NOT_FOUND','학생 통합페이지를 찾지 못했습니다.');
  p=ypFollowMergedProfile_(profiles,p);
  return {ok:true,studentToken:p.studentToken,student:{school:p.school,name:p.name},version:'3.13.0'};
}

function ypProfileConceptFor_(domainValue, topicValue) {
  var domain=String(domainValue||''), text=(domain+' '+String(topicValue||''));
  if (/전기|자기/.test(domain)) {
    if (/전자기\s*유도|렌츠|패러데이|유도\s*(전류|기전력)|자속|운동\s*기전력/.test(text)) return ['induction','전자기 유도·렌츠 법칙'];
    if (/회로|저항|전력|전구|전지|스위치|키르히호프|전압|전류계/.test(text)) return ['circuits','전기 회로·저항·전력'];
    if (/자기장|자기력|솔레노이드|로렌츠|속도\s*선택기/.test(text)) return ['magnetism','자기장·자기력'];
    return ['electrostatics','정전기·전기장·전위'];
  }
  if (/파동|광학/.test(domain)) {
    if (/거울|렌즈|상의\s|초점|근시|원시/.test(text)) return ['mirrors-lenses','거울·렌즈·상의 형성'];
    if (/굴절|전반사|광섬유|굴절률|임계각/.test(text)) return ['refraction-tir','굴절·전반사'];
    if (/광전|양자|분산|색광|삼원색|물체의\s*색/.test(text)) return ['light-color-quantum','빛의 색·분산·양자성'];
    return ['waves-sound','파동·간섭·소리'];
  }
  if (/열|기체/.test(domain)) {
    if (/팽창|바이메탈/.test(text)) return ['thermal-expansion','열팽창·바이메탈'];
    if (/기체|열역학|피스톤|분자운동|단열\s*(변화|과정)/.test(text)) return ['gas-thermodynamics','기체·열역학'];
    if (/전도|대류|복사|열저항|단열/.test(text)) return ['heat-transfer','열의 이동·단열'];
    return ['thermal-balance','열평형·비열·열용량'];
  }
  if (/운동량|충격량|충돌/.test(text)) return ['momentum-collision','운동량·충격량·충돌'];
  if (/원운동|단진동|단진자|진자|구심|주기/.test(text)) return ['circular-oscillation','원운동·단진동'];
  if (/부력|베르누이|유체|수면|아르키메데스/.test(text)) return ['fluid-buoyancy','유체·부력·베르누이'];
  if (/에너지|용수철|탄성|일률/.test(text)) return ['energy-spring','일·에너지·용수철'];
  if (/마찰|장력|도르래|평형|알짜힘|수직항력|돌림힘|연결/.test(text)) return ['forces-equilibrium','힘·마찰·장력·평형'];
  return ['motion-graphs','운동 그래프·등가속도'];
}

var YP_PROFILE_ADVICE_ = {
  'motion-graphs':'속도-시간 그래프의 넓이와 기울기를 분리하여 해석하고 구간별 운동식을 연결하세요.',
  'forces-equilibrium':'물체마다 자유물체도를 그린 뒤 장력·마찰력·수직항력을 연립하세요.',
  'energy-spring':'각 상태의 운동·위치·탄성에너지를 적고 마찰이 한 일을 함께 계산하세요.',
  'momentum-collision':'충돌 순간에는 운동량 보존을 적용하고 에너지 보존 가능 여부를 별도로 판단하세요.',
  'circular-oscillation':'원운동의 구심력과 단진동의 평형점·끝점 조건을 구분하세요.',
  'fluid-buoyancy':'부력은 밀어낸 유체의 무게이고, 유체 흐름에는 연속·베르누이 관계를 함께 사용하세요.',
  'electrostatics':'전기장은 벡터, 전위는 스칼라임을 구분해 부호와 방향을 확인하세요.',
  'circuits':'등가회로를 먼저 그린 뒤 전류 분배·전압·전력을 계산하세요.',
  'magnetism':'자기장과 자기력의 방향을 먼저 결정한 후 크기를 계산하세요.',
  'induction':'자속 변화의 원인과 렌츠 법칙을 먼저 판단한 뒤 유도전류 크기를 구하세요.',
  'waves-sound':'파동의 진동수·파장·경로차와 정상파 경계조건을 연결하세요.',
  'refraction-tir':'모든 각도를 법선 기준으로 표기하고 전반사 가능한 매질 조건을 먼저 확인하세요.',
  'mirrors-lenses':'렌즈/거울 방정식과 배율을 동시에 사용하고 실상·허상을 구분하세요.',
  'light-color-quantum':'광자 한 개의 에너지와 광자 개수를 구분하세요.',
  'thermal-balance':'열량계·상변화 열까지 포함해 열을 잃은 양과 얻은 양을 비교하세요.',
  'heat-transfer':'정상상태에서 직렬 물질을 지나는 열전달률이 같음을 사용하세요.',
  'gas-thermodynamics':'각 과정의 일·열·내부에너지 변화의 부호를 표로 정리하세요.',
  'thermal-expansion':'기준 길이·팽창계수·용기와 액체의 팽창 차이를 함께 고려하세요.'
};

function ypCumulativeAnalysis_(records) {
  var concepts={}, domains={};
  records.forEach(function(r) {
    var exam=getExam_(r.examId), grade=grade_(exam,r.answers), round=Number(r.round||exam.round||0);
    for (var i=0;i<exam.answerCount;i++) {
      var domain=exam.domains[i] || '기타', topic=exam.units[i] || ('문항 '+(i+1));
      var concept=ypProfileConceptFor_(domain,topic), status=grade.questionResults[i].status;
      var id=concept[0];
      if (!concepts[id]) concepts[id]={id:id,name:concept[1],domain:domain,total:0,correct:0,wrong:0,blank:0,rounds:{},refs:[],topTopics:{}};
      if (!domains[domain]) domains[domain]={domain:domain,total:0,correct:0,wrong:0,blank:0};
      [concepts[id],domains[domain]].forEach(function(row) {row.total++;row[status]++;});
      var c=concepts[id];
      if (!c.rounds[round]) c.rounds[round]={total:0,miss:0};
      c.rounds[round].total++;
      if(status!=='correct') {
        c.rounds[round].miss++;
        c.refs.push({round:round,no:i+1,examId:r.examId,topic:topic,status:status});
        c.topTopics[topic]=(c.topTopics[topic]||0)+1;
      }
    }
  });
  var conceptRows=Object.keys(concepts).map(function(k) {
    var r=concepts[k], rounds=Object.keys(r.rounds).map(Number).sort(function(a,b){return a-b;});
    var missRounds=rounds.filter(function(n){return r.rounds[n].miss>0;});
    var streak=0;
    for(var i=rounds.length-1;i>=0;i--) {if(r.rounds[rounds[i]].miss) streak++;else break;}
    var wrong=r.wrong+r.blank;
    var missRate=r.total ? wrong/r.total*100 : 0;
    var persistent=rounds.length>=2 && missRounds.length>=2 && (missRate>=35||streak>=2);
    return {id:r.id,name:r.name,domain:r.domain,total:r.total,correct:r.correct,wrong:r.wrong,blank:r.blank,
      accuracy:round_(r.correct/r.total*100,1),missRounds:missRounds.length,exposureRounds:rounds.length,
      miss:wrong,streak:streak,persistent:persistent,severity:persistent&&(missRounds.length>=3||missRate>=60)?'high':'medium',
      refs:r.refs.slice(-8),topTopics:Object.keys(r.topTopics).sort(function(a,b){return r.topTopics[b]-r.topTopics[a];}).slice(0,3),
      advice:YP_PROFILE_ADVICE_[r.id]||'틀린 문제의 조건과 적용 법칙을 순서대로 검토하세요.'};
  });
  var domainRows=Object.keys(domains).map(function(k){var r=domains[k];return {domain:k,total:r.total,correct:r.correct,wrong:r.wrong,blank:r.blank,accuracy:round_(100*r.correct/r.total,1)};});
  domainRows.sort(function(a,b){return b.accuracy-a.accuracy;});
  var strengths=conceptRows.filter(function(r){return r.total>=2 && r.accuracy>=75;}).sort(function(a,b){return b.accuracy-a.accuracy||b.total-a.total;}).slice(0,4);
  if(!strengths.length) strengths=conceptRows.slice().sort(function(a,b){return b.accuracy-a.accuracy;}).slice(0,3);
  var weaknesses=conceptRows.filter(function(r){return r.total>=2&&(r.accuracy<70||r.missRounds>=2);}).sort(function(a,b){return Number(b.persistent)-Number(a.persistent)||a.accuracy-b.accuracy||b.missRounds-a.missRounds;}).slice(0,6);
  var recurring=conceptRows.filter(function(r){return r.persistent;}).sort(function(a,b){return Number(b.severity==='high')-Number(a.severity==='high')||b.streak-a.streak||a.accuracy-b.accuracy;}).slice(0,5);
  return {domains:domainRows,strengths:strengths,weaknesses:weaknesses,recurringWeaknesses:recurring};
}

/** Public student page request. No WRITE_KEY accepted or emitted. */
function ypGetStudentProfile_(studentToken) {
  var token=String(studentToken||'').trim();
  if(!/^[0-9a-f]{32}$/i.test(token)) throw apiError_('INVALID_STUDENT_ID','학생 통합페이지 ID가 올바르지 않습니다.');
  var profiles=ypReadStudentProfiles_();
  var initial=ypProfileByToken_(profiles,token);
  if(!initial) throw apiError_('STUDENT_NOT_FOUND','학생 통합페이지가 없습니다.');
  var p=ypFollowMergedProfile_(profiles,initial), keys={};
  ypProfileKeys_(p).forEach(function(k){keys[k]=true;});
  var all=readAll_().map(function(item){return item.record;});
  var latest={};
  all.forEach(function(r){
    if(!keys[studentKey_(r)])return;
    var old=latest[r.examId];
    if(!old||String(r.updatedAt||'')>=String(old.updatedAt||'')) latest[r.examId]=r;
  });
  var studentRecords=Object.keys(latest).map(function(k){return latest[k];}).sort(function(a,b){return Number(a.round||0)-Number(b.round||0);});
  var exams=studentRecords.map(function(r){
    var e=enrich_(r), cohort=cohort_(all,r.examId,r);
    return {reportToken:r.serverId||r.id,reportFingerprint:identityFingerprint_(r),examId:e.examId,
      round:e.round,examTitle:e.examTitle,score:e.score,correct:e.correct,wrong:e.wrong,blank:e.blank,
      cohortAverage:cohort.average,cohortTotal:cohort.total,rank:cohort.rank,domainStats:e.domainStats,
      createdAt:e.createdAt,updatedAt:e.updatedAt};
  });
  var values=exams.map(function(r){return r.score;}), mean=values.length?round_(average_(values),2):null;
  var latestExam=exams.length?exams[exams.length-1]:null;
  var prevExam=exams.length>1?exams[exams.length-2]:null;
  var cumulative=ypCumulativeAnalysis_(studentRecords);
  var comments=[];
  if(exams.length) comments.push('총 '+exams.length+'회 시험을 분석한 평균은 '+mean+'점입니다.');
  if(prevExam) comments.push('최근 '+latestExam.round+'회 성적은 직전 회차 대비 '+round_(latestExam.score-prevExam.score,2)+'점 변화했습니다. 회차별 난이도 차이도 함께 고려하세요.');
  if(cumulative.strengths.length) comments.push('누적 강점: '+cumulative.strengths.slice(0,3).map(function(x){return x.name+' '+x.accuracy+'%';}).join(', '));
  if(cumulative.recurringWeaknesses.length){var w=cumulative.recurringWeaknesses[0];comments.push('우선 보완: '+w.name+'은 '+w.missRounds+'개 회차에서 오답·미기입이 반복되었습니다. '+w.advice);}
  if(exams.length===1) comments.push('반복 취약점 판단에는 여러 회차가 필요하므로 현재 점수만으로 확정하지 않습니다.');
  return {ok:true,version:'3.13.0',studentToken:p.studentToken,
    redirectedFrom:p.studentToken!==initial.studentToken?initial.studentToken:'',
    generatedAt:new Date().toISOString(),
    profile:{name:p.name,school:p.school,createdAt:p.createdAt},
    summary:{examCount:exams.length,averageScore:mean,bestScore:values.length?Math.max.apply(null,values):null,
      latestScore:latestExam?latestExam.score:null,latestRound:latestExam?latestExam.round:null,
      latestDelta:prevExam?round_(latestExam.score-prevExam.score,2):null},
    exams:exams,domains:cumulative.domains,strengths:cumulative.strengths,
    weaknesses:cumulative.weaknesses,recurringWeaknesses:cumulative.recurringWeaknesses,comments:comments,
    identityNote:'같은 학교·최종 학생 이름을 기반으로 자동 연결합니다. 실제 동명이인·학교 변경은 교사가 별도로 확인해야 합니다.'};
}

/** Teacher-only action. Must call assertWriteKey_ in Code.gs before invoking. */
function ypStudentDirectory_() {
  ypInitializeStudentProfiles_();
  var profiles=ypReadStudentProfiles_().filter(function(p){return !/^merged:/.test(p.status);});
  var owners=ypActiveProfileOwners_(profiles), buckets={};
  profiles.forEach(function(p){buckets[p.studentToken]={};});
  readAll_().forEach(function(item){
    var p=owners[studentKey_(item.record)];if(!p)return;
    var ex=item.record.examId, old=buckets[p.studentToken][ex];
    if(!old||String(item.record.updatedAt||'')>=String(old.record.updatedAt||'')) buckets[p.studentToken][ex]=item;
  });
  var students=profiles.map(function(p){
    var exams=Object.keys(buckets[p.studentToken]).map(function(x){return buckets[p.studentToken][x].record;}).sort(function(a,b){return Number(a.round||0)-Number(b.round||0);});
    var grades=exams.map(function(r){return enrich_(r);});
    var recent=grades.length?grades[grades.length-1]:null;
    return {studentToken:p.studentToken,name:p.name,school:p.school,examCount:grades.length,
      rounds:grades.map(function(r){return r.round;}),
      averageScore:grades.length?round_(average_(grades.map(function(r){return r.score;})),2):null,
      latestRound:recent?recent.round:null,latestScore:recent?recent.score:null,
      updatedAt:recent?recent.updatedAt:p.updatedAt};
  }).sort(function(a,b){return String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));});
  return {ok:true,version:'3.13.0',total:students.length,students:students};
}

/** Teacher maintenance: do not attach one school/name key to two active profiles. */
function linkStudentReportToProfile(targetStudentToken, sourceReportToken) {
  var reports=readAll_().filter(function(x){return x.token===String(sourceReportToken||'');});
  if(reports.length!==1) throw new Error('연결할 시험 결과 토큰이 정확히 한 개여야 합니다.');
  var profiles=ypReadStudentProfiles_(), target=ypProfileByToken_(profiles,targetStudentToken);
  if(!target||/^merged:/.test(target.status)) throw new Error('활성 대상 학생 프로필을 찾지 못했습니다.');
  var key=studentKey_(reports[0].record), owner=ypActiveProfileOwners_(profiles)[key];
  if(owner&&owner.studentToken!==target.studentToken) throw new Error('이 학교·이름은 다른 학생 프로필에 연결되어 있습니다. 먼저 학생 본인을 확인한 뒤 mergeStudentProfiles를 사용하세요.');
  var keys=ypProfileKeys_(target);if(keys.indexOf(key)<0)keys.push(key);
  target.keysJson=JSON.stringify(keys);target.updatedAt=new Date().toISOString();
  ypStudentsSheet_().getRange(target.row,1,1,YP_STUDENTS_HEADERS_.length).setValues([ypProfileValues_(target)]);
  return '연결 완료: '+target.name;
}

function mergeStudentProfiles(targetStudentToken,sourceStudentToken) {
  if(String(targetStudentToken)===String(sourceStudentToken)) return '동일한 학생 프로필입니다.';
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    var all=ypReadStudentProfiles_();
    var target=ypProfileByToken_(all,targetStudentToken),source=ypProfileByToken_(all,sourceStudentToken);
    if(!target||!source||/^merged:/.test(target.status)) throw new Error('병합할 활성 프로필을 찾지 못했습니다.');
    var keys=ypProfileKeys_(target);
    ypProfileKeys_(source).forEach(function(k){if(keys.indexOf(k)<0)keys.push(k);});
    target.keysJson=JSON.stringify(keys);target.updatedAt=new Date().toISOString();
    source.status='merged:'+target.studentToken;source.updatedAt=new Date().toISOString();
    var sheet=ypStudentsSheet_();
    sheet.getRange(target.row,1,1,YP_STUDENTS_HEADERS_.length).setValues([ypProfileValues_(target)]);
    sheet.getRange(source.row,1,1,YP_STUDENTS_HEADERS_.length).setValues([ypProfileValues_(source)]);
    SpreadsheetApp.flush();
    return '병합 완료: 기존 통합 주소는 '+target.studentToken+'으로 안내됩니다.';
  } finally {lock.releaseLock();}
}
