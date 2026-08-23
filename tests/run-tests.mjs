import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const catalog=JSON.parse(read("site/assets/data/catalog.json"));
const context={window:{YP_CATALOG:catalog,YP_CONFIG:{}},console,TextEncoder,TextDecoder,URL,Blob,crypto:globalThis.crypto,navigator:{},document:{},setTimeout,clearTimeout};
vm.createContext(context);
vm.runInContext(read("site/assets/core.js"),context);
const YP=context.window.YP;

const xlsxContext={console,TextEncoder,TextDecoder,URL,Blob,Response,DecompressionStream,globalThis:null};
xlsxContext.globalThis=xlsxContext;
vm.createContext(xlsxContext);
vm.runInContext(read("site/assets/xlsx-import.js"),xlsxContext);
const YP_XLSX=xlsxContext.YP_XLSX;
const mech=YP.getExam("physics1-basic-total-mechanics");
const em=YP.getExam("physics1-basic-total-electromagnetism");
const comprehensive=catalog.exams.filter(e=>e.assessmentType==="comprehensive");
const weekly=catalog.exams.filter(e=>e.assessmentType!=="comprehensive");

function pngSize(rel){
  const b=fs.readFileSync(path.join(root,"site",rel));
  assert.equal(b.subarray(1,4).toString(),"PNG");
  return [b.readUInt32BE(16),b.readUInt32BE(20)];
}
function scoreRecord(exam,school,name,values){
  const inputs=exam.questions.map((q,i)=>String(values?.[i]??(q.inputMode==="points"?q.maxPoints:1)));
  return YP.normalizeRecord({examId:exam.examId,courseId:exam.courseId,school,name,resultInputs:inputs,partialModes:Array(inputs.length).fill(false)});
}

// Catalog and operating policy

test("카탈로그 스키마 2.0과 총 39개 시험",()=>{assert.equal(catalog.schemaVersion,"2.0.0");assert.equal(catalog.exams.length,39)});
test("주간 34개와 총괄 5개로 분리",()=>{assert.equal(weekly.length,34);assert.equal(comprehensive.length,5)});
test("물리1 주간 회차는 2~8, 10~16",()=>assert.deepEqual(weekly.filter(e=>e.courseId==="physics1-basic").map(e=>e.round),[2,3,4,5,6,7,8,10,11,12,13,14,15,16]));
test("물리1심화 주간 회차는 2~7",()=>assert.deepEqual(weekly.filter(e=>e.courseId==="physics1-advanced").map(e=>e.round),[2,3,4,5,6,7]));
test("물리2 주간 회차는 1~9, 11~15",()=>assert.deepEqual(weekly.filter(e=>e.courseId==="physics2-basic").map(e=>e.round),[1,2,3,4,5,6,7,8,9,11,12,13,14,15]));
test("의도적 제외 회차는 물리1 1·9회, 물리2 10회",()=>{assert.deepEqual(catalog.operatingPolicy.excludedRounds["physics1-basic"],[1,9]);assert.deepEqual(catalog.operatingPolicy.excludedRounds["physics2-basic"],[10]);assert.equal(catalog.exams.some(e=>e.examId==="physics1-basic-r01"),false);assert.equal(catalog.exams.some(e=>e.examId==="physics1-basic-r09"),false);assert.equal(catalog.exams.some(e=>e.examId==="physics2-basic-r10"),false)});
test("총괄평가 연결 범위가 요구사항과 일치",()=>{
  const expected={
    "physics1-basic-total-mechanics":["physics1-basic-r02","physics1-basic-r03","physics1-basic-r04","physics1-basic-r05","physics1-basic-r06","physics1-basic-r07","physics1-basic-r08"],
    "physics1-basic-total-electromagnetism":["physics1-basic-r10","physics1-basic-r11","physics1-basic-r12","physics1-basic-r13","physics1-basic-r14","physics1-basic-r15","physics1-basic-r16"],
    "physics2-basic-total-mechanics":["physics2-basic-r02","physics2-basic-r03","physics2-basic-r04","physics2-basic-r05","physics2-basic-r06","physics2-basic-r07","physics2-basic-r08","physics2-basic-r09"],
    "physics2-basic-total-electromagnetism":["physics2-basic-r11","physics2-basic-r12","physics2-basic-r13","physics2-basic-r14","physics2-basic-r15"],
    "physics1-advanced-total":["physics1-advanced-r02","physics1-advanced-r03","physics1-advanced-r04","physics1-advanced-r05","physics1-advanced-r06","physics1-advanced-r07"]
  };
  for(const [id,ids] of Object.entries(expected))assert.deepEqual(YP.getExam(id).historyExamIds,ids,id);
});
test("현재 자료가 있는 물리1 역학·전자기 총괄만 준비 완료",()=>assert.deepEqual(comprehensive.filter(e=>e.status==="ready").map(e=>e.examId),["physics1-basic-total-mechanics","physics1-basic-total-electromagnetism"]));

// Comprehensive assessment scoring

test("각 물리1 총괄은 25문항·100점",()=>[mech,em].forEach(e=>{assert.equal(e.questionCount,25);assert.equal(e.maxScore,100);assert.equal(e.questions.reduce((a,q)=>a+q.maxPoints,0),100)}));
test("총괄 객관식 40문항은 binary, 서술형 10문항은 points",()=>{const qs=[...mech.questions,...em.questions];assert.equal(qs.filter(q=>q.inputMode==="binary").length,40);assert.equal(qs.filter(q=>q.inputMode==="points").length,10)});
test("총괄 객관식 0은 0점, 1은 4점",()=>{assert.deepEqual({...YP.parseQuestionInput("0",mech.questions[0])},{raw:"0",status:"wrong",score:0,valid:true,message:"오답·0점"});const r=YP.parseQuestionInput("1",mech.questions[0]);assert.equal(r.status,"full");assert.equal(r.score,4)});
test("총괄 객관식은 0·1 외 값을 차단",()=>{assert.equal(YP.parseQuestionInput("2",mech.questions[0]).valid,false);assert.equal(YP.parseQuestionInput("P1",mech.questions[0]).valid,false)});
test("총괄 서술형의 1은 만점이 아니라 실제 1점",()=>{const q=mech.questions[20],r=YP.parseQuestionInput("1",q);assert.equal(r.status,"partial");assert.equal(r.score,1)});
test("총괄 서술형 4점은 만점, 4.5점은 차단",()=>{const q=mech.questions[20];assert.equal(YP.parseQuestionInput("4",q).status,"full");assert.equal(YP.parseQuestionInput("4.5",q).valid,false)});
test("총괄 예시 정오표·서술형 점수 계산",()=>{const inputs=[...Array(15).fill("1"),...Array(5).fill("0"),"4","3","2","1","0"],r=YP.calculateResult(mech,inputs,Array(25).fill(false));assert.equal(r.score,70);assert.equal(r.counts.full,16);assert.equal(r.counts.partial,3);assert.equal(r.counts.wrong,6)});
test("기존 주간 입력의 1·P1 규칙은 유지",()=>{const q={maxPoints:7,inputMode:"achievement"};assert.equal(YP.parseQuestionInput("1",q).score,7);assert.equal(YP.parseQuestionInput("P1",q).score,1);assert.equal(YP.parseQuestionInput("1",q,true).score,1)});
test("탭 붙여넣기에서 빈 셀 위치 보존",()=>assert.deepEqual(Array.from(YP.parseDelimited("1\t\t0\t4")),["1","","0","4"]));

// History linkage and analysis

test("총괄은 같은 과정·학교·이름의 지정 회차만 연결",()=>{
  const current=scoreRecord(mech,"영스고","김물리");
  const r2=scoreRecord(YP.getExam("physics1-basic-r02"),"영스고","김물리");
  const r3=scoreRecord(YP.getExam("physics1-basic-r03"),"영스고","김물리");
  const otherSchool=scoreRecord(YP.getExam("physics1-basic-r04"),"다른고","김물리");
  const otherName=scoreRecord(YP.getExam("physics1-basic-r05"),"영스고","이물리");
  const emRound=scoreRecord(em,"영스고","김물리");
  const linked=YP.getLinkedHistory(mech,current,[r2,r3,otherSchool,otherName,emRound,current]);
  assert.deepEqual(linked.map(r=>r.examId),["physics1-basic-r02","physics1-basic-r03"]);
});
test("학교·이름 정규화는 공백·대소문자·기호 차이를 흡수",()=>assert.equal(YP.studentKey("physics1-basic"," Young-S 고 ","김 물리"),YP.studentKey("physics1-basic","youngs고","김물리")));
test("복습 누적 성취율은 회차 만점으로 가중 계산",()=>{
  const current=scoreRecord(mech,"영스고","김물리");
  const e2=YP.getExam("physics1-basic-r02"),e3=YP.getExam("physics1-basic-r03");
  const r2=scoreRecord(e2,"영스고","김물리",e2.questions.map(()=>1));
  const vals=e3.questions.map((q,i)=>i===0?0:1),r3=scoreRecord(e3,"영스고","김물리",vals);
  const h=YP.computeHistorySummary(mech,current,[r2,r3]);
  assert.equal(h.count,2);assert.equal(h.maxScore,200);assert.equal(h.score,200-e3.questions[0].maxPoints);assert.equal(h.expectedCount,7);
});
test("통합 코멘트에 복습 연결 회차와 총괄-복습 비교가 포함",()=>{const record=scoreRecord(mech,"영스고","김물리"),stats=YP.computeStats(mech,[record]),history={count:3,percent:80};const c=YP.buildComment(mech,record,stats,history);assert.match(c,/연결된 복습 테스트 3회/);assert.match(c,/총괄평가/)});

// Question data and review quality

test("50개 총괄 문항에 답·풀이·공식·실수·루브릭·재도전·동형 문제가 있음",()=>[...mech.questions,...em.questions].forEach(q=>{assert.ok(q.answer);assert.ok(q.explanation.length);assert.ok(q.formulas.length);assert.ok(q.commonMistakes.length);assert.ok(q.rubric.length);assert.ok(q.originalRetry);assert.ok(q.similarProblem?.prompt);assert.ok(q.similarProblem?.answer);assert.ok(q.similarProblem?.explanation)}));
test("모든 총괄 문항 루브릭 합은 4점",()=>[...mech.questions,...em.questions].forEach(q=>assert.equal(q.rubric.reduce((a,r)=>a+Number(r.points),0),4,`Q${q.no} ${q.topic}`)));
test("객관식 정답키는 1~5 중 하나",()=>[...mech.questions.slice(0,20),...em.questions.slice(0,20)].forEach(q=>assert.ok([1,2,3,4,5].includes(q.answerKey),`${q.no}`)));
test("역학 1번은 시간기록계의 실제 이동 방향이 왼쪽이고 정답은 ⑤",()=>{const q=mech.questions[0];assert.equal(q.reviewStatus,"verified");assert.equal(q.answerKey,5);assert.equal(q.answer,"⑤");assert.equal(q.answerKeys,undefined);assert.match(q.explanation.join(" "),/실제 운동 방향.*왼쪽/);assert.match(q.explanation.join(" "),/2 m\/s²/)});
test("역학 19번 단열 팽창의 내부에너지 감소를 교정",()=>{const q=mech.questions[18];assert.equal(q.answerKey,2);assert.equal(q.reviewStatus,"corrected");assert.match(q.explanation.join(" "),/내부 에너지.*감소/)});
test("전자기 5번은 금속 격자 이온 열진동으로 교정",()=>{const q=em.questions[4];assert.equal(q.reviewStatus,"corrected");assert.match(q.correctionNote,/격자 이온/)});
test("전자기 9번 승압 송전은 공식 해설과 일치하여 verified",()=>{const q=em.questions[8];assert.equal(q.reviewStatus,"verified");assert.match(q.explanation.join(" "),/전류는 1\/2배/);assert.match(q.explanation.join(" "),/1\/4배/)});
test("전자기 15번은 진행파 입자속도와 a=-ω²y를 적용",()=>{const q=em.questions[14];assert.equal(q.answerKey,2);assert.match(q.formulas.join(" "),/a_y=-ω²y/)});
test("전자기 서술 21번은 렌즈2 중간상 방향 표현을 교정",()=>{const q=em.questions[20];assert.equal(q.reviewStatus,"corrected");assert.match(q.correctionNote,/m₂=\+2\/3/);assert.match(q.answer,/도립 실상/)});

// Image/document assets

test("총괄 문항 원문 crop은 실제 페이지 이미지 범위 안",()=>[mech,em].forEach(e=>e.questions.forEach(q=>{const rel=e.pages[q.image.page-1];assert.ok(rel,`${e.examId} Q${q.no}`);const [W,H]=pngSize(rel),[x,y,w,h]=q.image.crop;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=W&&y+h<=H,`${e.examId} Q${q.no}: ${x},${y},${w},${h} / ${W},${H}`)})));
test("원문 시험지·해설지 PDF 4개가 프로젝트에 포함",()=>[mech.pdf,mech.solutionPdf,em.pdf,em.solutionPdf].forEach(rel=>assert.ok(fs.statSync(path.join(root,"site",rel)).size>10000,rel)));

// Physics recalculation spot checks

test("물리 재계산: 역학 7번 예시 가속도 2.5, 장력 22.5",()=>{const M=5,m=3,mu=.2,g=10,a=(m-mu*M)*g/(M+m),T=m*(g-a);assert.equal(a,2.5);assert.equal(T,22.5)});
test("물리 재계산: 역학 23번 v=1, e=5/16, Q=154",()=>{const v=(-4+8)/4,e=(v-(-4))/(10-(-6)),Q=(.5*2*10**2+.5*4*6**2)-(.5*2*4**2+.5*4*v**2);assert.equal(v,1);assert.equal(e,5/16);assert.equal(Q,154)});
test("물리 재계산: 전자기 21번 최종 위치 20/3 cm, 크기 4 cm",()=>{const v1=1/(1/10-1/15),u2=20-v1,v2=1/(1/20-1/u2),m1=-v1/15,m2=-v2/u2;assert.ok(Math.abs(v2-20/3)<1e-10);assert.ok(Math.abs(3*Math.abs(m1*m2)-4)<1e-10)});
test("물리 재계산: 전자기 24번 R=3Ω, 10Ω 전류 0.6A",()=>{const R=3,left=6*R/(6+R),topRight=15*10/(15+10),topI=10/(4+topRight),I10=topI*15/(10+15);assert.equal(left,2);assert.equal(topRight,6);assert.equal(I10,.6)});

// Frontend security and interaction semantics

test("학생 리포트는 원문 답 제출 전 정답·해설을 hidden 처리",()=>{const src=read("site/assets/report.js");assert.match(src,/solution-reveal hidden/);assert.match(src,/답 제출 후 해설 보기/);assert.match(src,/reveal\.classList\.remove\("hidden"\)/)});
test("동형 문제는 원문 제출 전 locked, 동형 제출 후 정답·해설 공개",()=>{const src=read("site/assets/report.js");assert.match(src,/similar-card locked/);assert.match(src,/원문 답을 먼저 제출하면 활성화/);assert.match(src,/동형 답 제출/);assert.match(src,/<b>정답<\/b>/)});
test("확인 필요 문항은 정답 자동 공개를 차단",()=>assert.match(read("site/assets/report.js"),/\["ambiguous","needs-review"\]\.includes\(q\.reviewStatus\)/));
test("학교 미기입은 '미기입'으로 저장하고 한 버튼으로 링크 복사",()=>{const src=read("site/assets/app.js"),html=read("site/index.html"),core=read("site/assets/core.js");assert.doesNotMatch(src,/학교를 반드시 입력/);assert.match(src,/YP\.normalizeSchool\(\$\("school"\)\.value\)/);assert.match(core,/v==="미입력"\|\|v==="미기입"\?"미기입"/);assert.match(html,/미기입 시 자동으로 ‘미기입’/);assert.match(html,/저장·성적 분석·링크 복사/);assert.match(src,/await YP\.copyText\(url\)/)});
test("빈 학교와 구버전 '미입력' 기록은 '미기입'으로 정규화",()=>{for(const school of ["","미입력","미기입"]){const r=YP.normalizeRecord({examId:mech.examId,name:"학생",school,resultInputs:Array(25).fill("1"),partialModes:Array(25).fill(false)});assert.equal(r.school,"미기입");assert.equal(r.studentKey,YP.studentKey(mech.courseId,"미기입","학생"))}});
test("'미입력'과 '미기입'은 같은 학생 학교 식별값으로 처리",()=>{assert.equal(YP.studentKey(mech.courseId,"미입력","학생"),YP.studentKey(mech.courseId,"미기입","학생"));assert.equal(YP.studentKey(mech.courseId,"","학생"),YP.studentKey(mech.courseId,"미기입","학생"))});
test("교사용 화면은 xlsx·csv 첨부와 Excel 자동 가져오기 모듈을 로드",()=>{const html=read("site/index.html"),app=read("site/assets/app.js");assert.match(html,/accept="[^"]*\.xlsx[^"]*\.csv/);assert.ok(html.indexOf("assets/xlsx-import.js")<html.indexOf("assets/app.js"));assert.match(app,/YP_XLSX\.importAssessment/);assert.match(app,/객관식 선택번호 → 검수 정오표/);assert.match(app,/importMode:"upsert"/)});
test("Excel 레거시 결과표는 공식행을 학생으로 중복 수집하지 않음",()=>{const cell=(value,formula="")=>({value,formula});const rows=[];rows[0]=[cell("이름"),cell("총점"),cell(1),cell(2),cell(3)];rows[1]=[cell("학생A"),cell(12),cell(1),cell(2),cell(3)];rows[2]=[cell("=A2"),cell(12),cell(1),cell(2),cell(3)];rows[2][0].formula="A2";for(let i=3;i<8;i++)rows[i]=[];const sheet={name:"1회",rows,maxRow:7,maxCol:4};const layout=YP_XLSX._test.findLegacyLayout(sheet,{questionCount:3,round:0,shortTitle:"역학 총괄평가"});assert.ok(layout);assert.deepEqual(Array.from(layout.studentRows),[1])});
const uploadedMechanicsExcel="/mnt/data/역학진단고사 v3.xlsx";
(fs.existsSync(uploadedMechanicsExcel)?test:test.skip)("첨부 역학 Excel 179명 자동 해석·학교 미기입·총점 0건 불일치",async()=>{const b=fs.readFileSync(uploadedMechanicsExcel),file={name:"역학진단고사 v3.xlsx",arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)},result=await YP_XLSX.importAssessment(file,mech);assert.equal(result.sheetName,"1회");assert.equal(result.inputMode,"raw-choice");assert.equal(result.students.length,179);assert.equal(result.missingSchool,179);assert.deepEqual(Array.from(result.answerKeyMismatchQuestions),[]);assert.ok(result.students.every(s=>s.school==="미기입"));let mismatch=0;for(const student of result.students){const calc=YP.calculateResult(mech,student.inputs,student.partialModes);if(Number.isFinite(student.sourceTotal)&&Math.abs(calc.score-student.sourceTotal)>1e-9)mismatch++}assert.equal(mismatch,0);assert.equal(result.students.at(-1).sourceRow,201)});
test("실제 학생 Excel 원본은 공개 GitHub 프로젝트에 포함하지 않음",()=>{const all=[];function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else all.push(path.relative(root,p))}}walk(root);assert.equal(all.some(p=>/역학진단고사 v3\.xlsx$/i.test(p)),false)});
test("데모 데이터는 동일 학생의 7개 복습+역학 총괄을 포함",()=>{const data=JSON.parse(read("site/assets/data/demo-data.js").replace(/^window\.YP_DEMO_DATA\s*=\s*/,"").replace(/;\s*$/,"")).reports;assert.equal(data.filter(r=>r.school==="영스고"&&r.name==="김물리").length,8);assert.equal(new Set(data.map(r=>r.token)).size,data.length);assert.equal(new Set(data.map(r=>r.fingerprint)).size,data.length)});
test("데모 API도 historyRecords를 반환",()=>{const src=read("site/assets/api.js");assert.match(src,/historyRecords=YP\.getLinkedHistory/);assert.match(src,/studentKey=YP\.studentKey/)});
test("교사용 API는 form POST 브리지와 공개 GET 진단을 지원",()=>{const src=read("site/assets/api.js");assert.match(src,/YP_API_FORM_RESPONSE/);assert.match(src,/_formPostRequest/);assert.match(src,/_probePublicGet/);assert.match(src,/_probeBridgeCheck/);assert.match(src,/DEPLOYMENT_ACCESS/);assert.match(src,/FORM_BRIDGE_TIMEOUT/)});

// Apps Script schema/migration/security

test("Apps Script에 총괄 메타·InputMode·OriginalRetry·StudentKey 열이 있음",()=>{const src=read("apps-script/Code.gs");for(const term of ["AssessmentType","InputProfileJSON","HistoryExamIdsJSON","HistoryLabel","InputMode","OriginalRetryJSON","StudentKey"])assert.match(src,new RegExp(term))});
test("Apps Script는 기존 헤더 이름으로 행을 재배치해 스키마를 안전 마이그레이션",()=>{const src=read("apps-script/Code.gs");assert.match(src,/function ensureSheetSchema_/);assert.match(src,/currentIndex\[h\]/);assert.match(src,/const remapped = sourceRows\.map/);assert.match(src,/sh\.clearContents\(\)/)});
test("Apps Script 총괄 점수 파서는 binary와 points를 구분",()=>{const src=read("apps-script/Code.gs");assert.match(src,/mode==="binary"/);assert.match(src,/mode==="points"/);assert.match(src,/객관식은 0 또는 1만 입력/);assert.match(src,/서술형 점수는 0~/)});
test("Apps Script는 JSON POST·form POST·레거시 HtmlService 브리지에 공통 API 디스패처를 사용",()=>{const src=read("apps-script/Code.gs");assert.match(src,/function dispatchApiRequest_/);assert.match(src,/function apiBridge\(request\)/);assert.match(src,/function handleFormPostBridge_/);assert.match(src,/return jsonOutput_\(dispatchApiRequest_\(parseBody_\(e\)\)\)/);assert.match(src,/function apiErrorObject_/)});
test("Apps Script 일괄 저장은 단일 시트 쓰기와 동일 학생 upsert를 사용",()=>{const src=read("apps-script/Code.gs");assert.match(src,/API_VERSION = "3\.3\.0-hosted-parent-bridge"/);assert.match(src,/function calculateScoringFromQuestions_/);assert.match(src,/function reportIdentityKey_/);assert.match(src,/String\(input\.importMode\|\|"upsert"\)==="upsert"/);assert.match(src,/sh\.getRange\(2,1,data\.length,headers\.length\)\.setValues\(data\)/);assert.match(src,/savedCount:saved\.length/);assert.doesNotMatch(src,/saved\.push\(saveReport_\(r\)\.record\)/)});
test("Apps Script는 학교 빈칸·구버전 표기를 '미기입'으로 정규화",()=>{const src=read("apps-script/Code.gs");assert.match(src,/function normalizeSchool_/);assert.match(src,/school==="미입력"\|\|school==="미기입" \? "미기입"/);assert.match(src,/const school=normalizeSchool_\(input\.school\)/);assert.match(src,/const rawSchool=String\(row\.School\|\|""\)\.trim\(\),school=normalizeSchool_\(rawSchool\)/);assert.match(src,/function migrateSchoolLabels_/);assert.match(src,/학교 미기입 표기 정리/)});
test("Apps Script 학생 연결키는 과정·학교·이름 SHA-256",()=>{const src=read("apps-script/Code.gs");assert.match(src,/function makeStudentKey_/);assert.match(src,/DigestAlgorithm\.SHA_256/);assert.match(src,/normalizeIdentity_\(school/)});
test("Apps Script 결과 링크는 토큰·지문·학생 식별 다이제스트를 모두 검증",()=>{const src=read("apps-script/Code.gs");assert.match(src,/constantTimeEqual_\(String\(row\.Fingerprint\|\|""\),String\(fp\)\)/);assert.match(src,/makeFingerprint_/);assert.match(src,/makeIdentityDigest_/);assert.match(src,/학생 식별 정보 무결성 검증/)});
test("Apps Script 재계산 열 번호는 새 Reports 17열 스키마와 일치",()=>{const src=read("apps-script/Code.gs");assert.match(src,/getRange\(i\+2,14\).*calc\.scoring/);assert.match(src,/getRange\(i\+2,15\).*record/);assert.match(src,/getRange\(i\+2,17\).*new Date/)});

// Actual OOXML Word generation

test("Word 모듈은 통합 분석·내부 media·실제 OOXML DOCX를 생성",()=>{const src=read("site/assets/vendor/docx-export.bundle.js");assert.match(src,/application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);assert.match(src,/word\/media\//);assert.match(src,/기존 복습 테스트와 총괄평가 통합 분석/);assert.match(src,/historyTrendChart/);assert.match(src,/w:pgSz w:w="11906" w:h="16838"/);assert.doesNotMatch(src,/TargetMode="External"/);assert.doesNotMatch(src,/\.doc["']/)});
test("Word 모듈 실제 생성 smoke: ZIP·통합 표·내장 로고",async()=>{
  const source=read("site/assets/vendor/docx-export.bundle.js"),logo=fs.readFileSync(path.join(root,"site/assets/images/logo.png"));let captured=null;
  const exam={title:"물리1 역학 총괄평가",shortTitle:"역학 총괄평가",assessmentType:"comprehensive",historyLabel:"물리1 2~8회 복습 테스트",courseId:"physics1-basic",round:0,reviewStatus:"corrected",maxScore:100,
    coreNote:{summary:"역학 통합",concepts:["개념"],formulas:["ΣF=ma"],mistakes:["부호"],checklist:["단위"]},questions:[{no:1,maxPoints:100,type:"objective",unit:"힘과 운동",topic:"뉴턴 법칙",reviewStatus:"verified",rubric:[{criterion:"정답",points:100}],explanation:["알짜힘을 구한다."],formulas:["ΣF=ma"],commonMistakes:["방향"],answer:"③",similarProblem:{prompt:"동형 문제"},image:{page:1,crop:[0,0,1,1]}}],pages:["x.png"]};
  const record={name:"테스트학생",school:"테스트고",grade:"2",classNo:"1",score:100,maxScore:100,percent:100,scoring:[{status:"full",score:100}]};
  const stats={average:80,averagePercent:80,count:2,median:80,highest:100,perQuestion:[{average:80}],units:[{unit:"힘과 운동",averagePercent:80}],scoreList:[80,100]};
  const history={count:2,expectedCount:7,score:170,maxScore:200,percent:85,trend:[{label:"2회",score:80,maxScore:100,percent:80},{label:"3회",score:90,maxScore:100,percent:90}],units:[{unit:"힘과 운동",score:85,maxPoints:100,percent:85,level:"강점"}]};
  const YP2={loadImage:async()=>({naturalWidth:256,naturalHeight:160}),dataURLToUint8:()=>new Uint8Array(),roundLabel:()=>"물리1 · 역학 총괄평가",formatNumber:n=>String(n),isComprehensive:e=>e.assessmentType==="comprehensive",buildComment:()=>"통합 분석 코멘트",computeStudentUnits:()=>[{unit:"힘과 운동",percent:100,score:100,maxPoints:100,averagePercent:80,level:"강점"}],statusLabel:s=>s==="full"?"만점":s,reviewLabel:()=>"교정 적용",cropDataURL:async()=>"data:image/png;base64,",downloadBlob:(blob,name)=>{captured={blob,name}}};
  const ctx={console,TextEncoder,TextDecoder,Blob,Uint8Array,Date,Math,window:{},YP:YP2,document:{getElementById:()=>null},fetch:async()=>({ok:true,arrayBuffer:async()=>logo.buffer.slice(logo.byteOffset,logo.byteOffset+logo.byteLength)})};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
  await ctx.YoungsDocx.exportReport({exam,record,stats,history});assert.ok(captured);const buf=Buffer.from(await captured.blob.arrayBuffer()),txt=buf.toString("utf8");assert.equal(buf.subarray(0,4).toString("hex"),"504b0304");assert.match(txt,/word\/media\/image1\.png/);assert.match(txt,/복습·총괄 통합 성적 리포트/);assert.match(txt,/물리1 2~8회 복습 테스트/);assert.match(txt,/테스트학생/);assert.doesNotMatch(txt,/TargetMode="External"/);
});

// Secure automatic cross-device connection and deployment

test("GitHub Pages workflow uses current official Pages actions",()=>{
  const src=read(".github/workflows/pages.yml");
  assert.match(src,/actions\/checkout@v6/);
  assert.match(src,/actions\/configure-pages@v6/);
  assert.match(src,/actions\/upload-pages-artifact@v5/);
  assert.match(src,/actions\/deploy-pages@v5/);
});

test("GitHub Pages workflow injects YP_API_URL and accepts legacy variable",()=>{
  const src=read(".github/workflows/pages.yml");
  assert.match(src,/vars\.YP_API_URL/);
  assert.match(src,/vars\.APPS_SCRIPT_URL/);
  assert.match(src,/runtime-config\.js/);
  assert.match(src,/script\.google\.com\/macros\/s\//);
  assert.match(src,/PIN·세션·WRITE_KEY는 포함하지 않습니다/);
});

test("GitHub Pages workflow는 Apps Script 공개 ping을 배포 전에 검증",()=>{
  const src=read(".github/workflows/pages.yml");
  assert.match(src,/Verify Apps Script public deployment/);
  assert.match(src,/action=ping/);
  assert.match(src,/curl -sS -L/);
  assert.match(src,/로그인 없이 모든 사용자/);
});

test("GitHub Pages workflow는 Apps Script v3.3.0 상위 보안 브리지 배포까지 검증",()=>{
  const src=read(".github/workflows/pages.yml");
  assert.match(src,/3\.3\.0-hosted-parent-bridge/);
  assert.match(src,/__ypTransport=form-post/);
  assert.match(src,/YP_API_FORM_RESPONSE/);
  assert.match(src,/Apps Script POST 응답 브리지 미배포/);
  assert.match(src,/YP_SITE_ORIGIN/);
});

test("GitHub Pages workflow diagnoses disabled Pages and supports optional admin token",()=>{
  const src=read(".github/workflows/pages.yml");
  assert.match(src,/Settings → Pages → Build and deployment → Source/);
  assert.match(src,/PAGES_ADMIN_TOKEN/);
  assert.match(src,/\{\"build_type\":\"workflow\"\}/);
});

test("index와 report가 runtime config를 config보다 먼저 로드",()=>{
  for(const rel of ["site/index.html","site/report.html"]){
    const src=read(rel),runtime=src.indexOf('assets/runtime-config.js'),config=src.indexOf('assets/config.js');
    assert.ok(runtime>=0&&config>runtime,rel);
  }
});

test("공개 runtime config에는 URL 자리만 있고 인증 비밀값은 없음",()=>{
  const src=read("site/assets/runtime-config.js");
  assert.match(src,/apiUrl:\s*""/);
  assert.doesNotMatch(src,/teacherPin\s*:/i);
  assert.doesNotMatch(src,/sessionToken\s*:/i);
  assert.doesNotMatch(src,/writeKey\s*:/i);
});

test("교사용 프론트엔드는 PIN 로그인·90일 세션·1회용 새 컴퓨터 링크를 사용",()=>{
  const api=read("site/assets/api.js"),app=read("site/assets/app.js"),html=read("site/index.html");
  assert.match(api,/teacherLogin/);
  assert.match(api,/claimDevice/);
  assert.match(api,/sessionStatus/);
  assert.match(api,/createDeviceSetupToken/);
  assert.match(app,/teacher-setup=/);
  assert.match(app,/새 컴퓨터 연결 링크/);
  assert.match(html,/교사 PIN/);
  assert.match(html,/10분 동안 한 번만/);
  assert.doesNotMatch(html,/id="writeKeyInput"/);
});

test("교사용 API는 CORS fetch 대신 hidden form POST 응답 브리지를 사용",()=>{
  const api=read("site/assets/api.js"),server=read("apps-script/Code.gs");
  assert.match(api,/__ypTransport/);
  assert.match(api,/_formPostRequest/);
  assert.match(api,/YP_API_FORM_RESPONSE/);
  assert.match(api,/form\.submit\(\)/);
  assert.match(server,/function handleFormPostBridge_/);
  assert.match(server,/function formPostBridgeHtml_/);
  assert.match(server,/window\.top/);
  assert.match(server,/setXFrameOptionsMode\(HtmlService\.XFrameOptionsMode\.ALLOWALL\)/);
  assert.match(server,/function apiBridge\(request\)/); // 구버전 호환
});

test("hidden form POST 브리지 런타임 smoke: 응답 postMessage를 받아 bootstrap 완료",async()=>{
  const listeners={};
  const store=new Map();
  const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  const body={appendChild() {}};
  const document={body,createElement(tag){
    const el={tagName:String(tag).toUpperCase(),children:[],style:{},setAttribute(){},appendChild(child){this.children.push(child)},remove(){this.removed=true}};
    if(tag==="form")el.submit=function(){
      const fields=Object.fromEntries(this.children.map(x=>[x.name,x.value]));
      setTimeout(()=>listeners.message({
        origin:new URL(this.action).origin,
        data:{type:"YP_API_FORM_RESPONSE",channel:fields.channel,id:fields.id,result:{ok:true,apiVersion:"mock",teacherPinConfigured:true}}
      }),0);
    };
    return el;
  }};
  const YP0={config:{apiUrl:"http://127.0.0.1:9876/exec",demoMode:false,sessionStorage:"s",sessionMetaStorage:"m",cachePrefix:"t_",buildVersion:"test"}};
  const window0={YP:YP0,addEventListener:(name,fn)=>{listeners[name]=fn}};
  const ctx={window:window0,YP:YP0,document,localStorage,navigator:{platform:"test",userAgent:"test"},location:{origin:"http://127.0.0.1:8080"},URL,crypto:globalThis.crypto,setTimeout,clearTimeout,TextEncoder,Blob,console};
  vm.createContext(ctx);vm.runInContext(read("site/assets/api.js"),ctx);
  const result=await ctx.window.YP_API.bootstrap();
  assert.equal(result.ok,true);assert.equal(result.teacherPinConfigured,true);
});




test("form POST 브리지는 origin·채널·요청 ID를 검증하고 허용 origin 오류를 상세 반환",()=>{
  const api=read("site/assets/api.js"),server=read("apps-script/Code.gs");
  assert.match(server,/function normalizeBridgeOriginInput_/);
  assert.match(server,/function validateBridgeRequestId_/);
  assert.match(server,/BRIDGE_ORIGIN_DENIED/);
  assert.match(server,/allowedOrigins/);
  assert.match(api,/bridgeCheck/);
  assert.match(api,/setSiteOrigins\(\)/);
  assert.match(api,/_trustedAppsScriptMessageOrigin/);
});


test("직접 연 GitHub Pages는 Apps Script 상위 보안 페이지로 자동 전환",()=>{
  const launch=read("site/assets/launch.js"),index=read("site/index.html"),report=read("site/report.html");
  assert.match(launch,/view","host"/);
  assert.match(launch,/site\.toString\(\)/);
  assert.match(launch,/ypEmbedded/);
  assert.match(index,/assets\/launch\.js/);
  assert.match(report,/assets\/launch\.js/);
});

test("Apps Script 상위 보안 페이지가 GitHub 자식 앱 요청을 google.script.run으로 중계",()=>{
  const api=read("site/assets/api.js"),server=read("apps-script/Code.gs");
  assert.match(api,/YP_HOST_BRIDGE_HELLO/);
  assert.match(api,/YP_HOST_BRIDGE_REQUEST/);
  assert.match(api,/YP_HOST_BRIDGE_RESPONSE/);
  assert.match(api,/_hostRequest/);
  assert.match(server,/function hostedBridgeShell_/);
  assert.match(server,/view === "host"/);
  assert.match(server,/google\.script\.run/);
  assert.match(server,/YP_HOST_BRIDGE_READY/);
});


test("Apps Script 상위 보안 브리지 런타임 smoke: bootstrap 응답",async()=>{
  const listeners={};
  const store=new Map();
  const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  let parent;
  const window0={
    YP_HOSTED_BRIDGE:{enabled:true,channel:"hostchannel1234567890"},
    addEventListener:(name,fn)=>{listeners[name]=fn}
  };
  parent={postMessage(message){
    if(message.type==="YP_HOST_BRIDGE_HELLO")setTimeout(()=>listeners.message({origin:"https://script.googleusercontent.com",source:parent,data:{type:"YP_HOST_BRIDGE_READY",channel:message.channel,apiVersion:"3.3.0-hosted-parent-bridge"}}),0);
    if(message.type==="YP_HOST_BRIDGE_REQUEST")setTimeout(()=>listeners.message({origin:"https://script.googleusercontent.com",source:parent,data:{type:"YP_HOST_BRIDGE_RESPONSE",channel:message.channel,id:message.id,result:{ok:true,apiVersion:"3.3.0-hosted-parent-bridge",teacherPinConfigured:true}}}),0);
  }};
  window0.parent=parent;
  const YP0={config:{apiUrl:"https://script.google.com/macros/s/testDeployment123/exec",demoMode:false,sessionStorage:"s",sessionMetaStorage:"m",cachePrefix:"t_",buildVersion:"3.3.0-hosted-parent-bridge"}};
  window0.YP=YP0;
  const ctx={window:window0,YP:YP0,document:{},localStorage,navigator:{platform:"test",userAgent:"test"},location:{origin:"https://teacher.github.io",protocol:"https:",hostname:"teacher.github.io",search:"?ypEmbedded=1&ypBridgeChannel=hostchannel1234567890"},URL,crypto:globalThis.crypto,setTimeout,clearTimeout,setInterval,clearInterval,TextEncoder,Blob,console};
  vm.createContext(ctx);vm.runInContext(read("site/assets/api.js"),ctx);
  const result=await ctx.window.YP_API.bootstrap();
  assert.equal(result.ok,true);assert.equal(result.teacherPinConfigured,true);
});

test("Apps Script는 설치·PIN·서명 세션·1회용 토큰 API를 제공",()=>{
  const src=read("apps-script/Code.gs");
  for(const term of ["installYoungsPhysics","teacherLogin","claimDevice","sessionStatus","createDeviceSetupToken","TEACHER_PIN_HASH","SESSION_SECRET","AUTH_EPOCH"])assert.match(src,new RegExp(term));
  assert.match(src,/DEFAULT_SESSION_TTL_DAYS = 90/);
  assert.match(src,/DEFAULT_SETUP_TOKEN_TTL_MINUTES = 10/);
  assert.match(src,/clearDeviceSetupToken_\(\);\s*return createSessionResponse_/);
});

test("Apps Script Spreadsheet 메뉴에서 설치·PIN·세션 관리 가능",()=>{
  const src=read("apps-script/Code.gs");
  assert.match(src,/function onOpen\(\)/);
  assert.match(src,/설치·시트 초기화/);
  assert.match(src,/무작위 교사 PIN 재발급/);
  assert.match(src,/모든 교사 기기 세션 해제/);
});

test("Apps Script manifest는 Sheets와 container UI 최소 권한을 선언",()=>{
  const manifest=JSON.parse(read("apps-script/appsscript.json"));
  assert.deepEqual(manifest.oauthScopes,[
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.container.ui"
  ]);
});

test("설치 문서는 Pages 404 해결과 YP_API_URL 자동 연결 절차를 포함",()=>{
  const src=read("INSTALL_KO.md");
  assert.match(src,/Get Pages site failed: Not Found/);
  assert.match(src,/Source[\s\S]*GitHub Actions/);
  assert.match(src,/YP_API_URL/);
  assert.match(src,/installYoungsPhysics/);
  assert.match(src,/새 컴퓨터 연결 링크/);
  assert.doesNotMatch(src,/Apps Script `\/exec` URL과 WRITE_KEY를 입력/);
});


test("교사용 화면은 탭·창 복귀와 네트워크 재연결 시 학생 기록을 자동 갱신",()=>{
  const app=read("site/assets/app.js");
  assert.match(app,/function refreshWhenActive/);
  assert.match(app,/addEventListener\(\"focus\"/);
  assert.match(app,/addEventListener\(\"pageshow\"/);
  assert.match(app,/addEventListener\(\"online\"/);
  assert.match(app,/visibilitychange/);
  assert.match(app,/refreshReports\(\)/);
});


test("성적표 링크는 토큰·지문과 함께 생성 당시 Apps Script /exec 주소·서버 식별자를 고정",()=>{
  const app=read("site/assets/app.js");
  assert.match(app,/params\.set\("api",api\)/);
  assert.match(app,/params\.set\("sid",String\(serverInstanceId\)\)/);
  assert.match(app,/serverInstanceId=state\.serverInstanceId/);
});

test("성적표 페이지는 링크의 /exec 주소를 배포 runtime 주소보다 우선 사용",()=>{
  const config=read("site/assets/config.js");
  assert.match(config,/const apiUrl=linkUrl\|\|runtimeUrl/);
  assert.match(config,/isReportPage/);
  assert.match(config,/report-link/);
  assert.match(config,/script\\\.google\\\.com/);
});

test("Apps Script는 토큰 열·A열·RecordJSON을 조회하고 저장소 진단·복구 함수를 제공",()=>{
  const src=read("apps-script/Code.gs");
  assert.match(src,/function findReportRowByToken_/);
  assert.match(src,/mode:"column-a"/);
  assert.match(src,/mode:"record-json"/);
  assert.match(src,/function diagnoseReportStorage/);
  assert.match(src,/function repairReportStorage/);
  assert.match(src,/serverInstanceId:getServerInstanceId_\(\)/);
});

test("form POST 응답은 Apps Script의 중첩 IFRAME source와 무관하게 채널·origin으로 안전하게 완료",async()=>{
  const listeners={};
  const store=new Map();
  const localStorageMock={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  const ypConfig={apiUrl:"https://script.google.com/macros/s/testDeployment123/exec",demoMode:false,sessionStorage:"s",sessionMetaStorage:"m",cachePrefix:"t_"};
  const apiCtx={
    console,URL,TextEncoder,crypto:globalThis.crypto,setTimeout,clearTimeout,
    navigator:{platform:"test",userAgent:"test"},location:{origin:"https://teacher.github.io",protocol:"https:",hostname:"teacher.github.io"},
    localStorage:localStorageMock,
    window:{YP:{config:ypConfig},addEventListener:(type,fn)=>{listeners[type]=fn}},
    YP:{config:ypConfig},
    document:{}
  };
  apiCtx.window.window=apiCtx.window;
  vm.createContext(apiCtx);
  vm.runInContext(read("site/assets/api.js"),apiCtx);
  const api=apiCtx.window.YP_API;
  let cleaned=0;
  const resultPromise=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("timeout")),1000);
    api.bridgePending.set("req1",{resolve,reject,timer,action:"ping",channel:"channel1234567890",frame:{remove(){cleaned++}},form:{remove(){cleaned++}}});
  });
  listeners.message({
    origin:"https://script.googleusercontent.com",
    source:{nested:true},
    data:{type:"YP_API_FORM_RESPONSE",id:"req1",channel:"channel1234567890",result:{ok:true,apiVersion:"3.3.0-hosted-parent-bridge"}}
  });
  const result=await resultPromise;
  assert.equal(result.ok,true);
  assert.equal(result.apiVersion,"3.3.0-hosted-parent-bridge");
  assert.equal(cleaned,2);
  assert.equal(api.bridgePending.size,0);
});

test("Apps Script form POST handler는 정의되지 않은 origin helper를 참조하지 않음",()=>{
  const src=read("apps-script/Code.gs");
  assert.doesNotMatch(src,/normalizeBridgeOrigin_\(/);
  assert.match(src,/normalizeBridgeOriginInput_\(rawOrigin\)/);
});
