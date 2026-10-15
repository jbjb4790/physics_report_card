'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..');
const base=path.resolve(root,'../v3.13.0/apps-script/StudentProfiles.gs');
const mockReports=[];
const sheetStore=new Map();
class Sheet {
 constructor(name){this.name=name;this.rows=[];}
 getLastRow(){return this.rows.length;}
 setFrozenRows(){return this;}
 getRange(r,c,n,m){
  const sheet=this;
  return {getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sheet.rows[r+i-1]?.[c+j-1]??''));},
   setValues(values){for(let i=0;i<values.length;i++){
    const idx=r+i-1;if(!sheet.rows[idx])sheet.rows[idx]=[];
    for(let j=0;j<values[i].length;j++)sheet.rows[idx][c+j-1]=values[i][j];
   }return this;},setFontWeight(){return this;},setBackground(){return this;}};
 }
 appendRow(row){this.rows.push(row.slice());return this;}
}
const ss={getSheetByName(name){return sheetStore.get(name)||null;},insertSheet(name){const s=new Sheet(name);sheetStore.set(name,s);return s;}};
const exams={
 'tpl-mid-01':{id:'tpl-mid-01',title:'1회',round:1,answerCount:3,answerKey:[1,2,3],domains:['역학','전기·자기','역학'],units:['운동량','회로','마찰']},
 'tpl-mid-02':{id:'tpl-mid-02',title:'2회',round:2,answerCount:3,answerKey:[2,1,5],domains:['역학','전기·자기','역학'],units:['운동량','회로','마찰']},
 'tpl-mid-03':{id:'tpl-mid-03',title:'3회',round:3,answerCount:3,answerKey:[1,4,2],domains:['역학','전기·자기','역학'],units:['운동량','회로','마찰']}
};
let uuid=100;
const norm=x=>String(x??'').trim();
const normalized=x=>norm(x).toLowerCase().replace(/\s+/g,'');
const ctx={console,Date,Math,JSON,Object,Array,String,Number,RegExp,Error,Set,Map,
 spreadsheet_:()=>ss,normalizeText_:norm,normalizeSchool_:(x)=>norm(x)||'미입력',normalizeKey_:normalized,
 studentKey_:(r)=>normalized(r.school||'미입력')+'::'+normalized(r.name),
 identityFingerprint_:(r)=>'test'+r.examId,
 apiError_:(code,msg)=>{const e=new Error(msg);e.code=code;return e;},
 round_:(x,n)=>Number(Number(x).toFixed(n)),average_:(xs)=>xs.reduce((a,b)=>a+b,0)/xs.length,
 getExam_:(id)=>exams[id],
 grade_:(e,ans)=>{
  let cor=0,wrong=0,blank=0;
  const questionResults=e.answerKey.map((key,i)=>{
   const a=ans[i];let status=a===''||a==null?'blank':Number(a)===key?'correct':'wrong';
   if(status==='correct')cor++;else if(status==='wrong')wrong++;else blank++;
   return {no:i+1,status,answer:a,key};
  });return {score:cor*5-wrong*1.25,correct:cor,wrong,blank,questionResults};
 },
 enrich_:(r)=>{const e=exams[r.examId];return {...r,...ctx.grade_(e,r.answers),examTitle:e.title,round:e.round};},
 cohort_:(records,id,r)=>{const current=ctx.enrich_(r);return {total:records.filter(x=>x.examId===id).length,average:55,rank:1,topScore:current.score};},
 readAll_:()=>mockReports.map((r,i)=>({token:r.serverId,record:r,row:i+2})),
 LockService:{getScriptLock(){return {waitLock(){},releaseLock(){}}}},
 Utilities:{getUuid(){uuid++;return `${String(uuid).padStart(8,'0')}-aaaa-bbbb-cccc-000000000001`; }},
 SpreadsheetApp:{flush(){}},
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(base,'utf8'),ctx,{filename:base});
vm.runInContext(fs.readFileSync(path.join(root,'apps-script/ClassRoster.gs'),'utf8'),ctx);
const record=(serverId,examId,name='김물리',school='동고등학교')=>({serverId,id:serverId,examId,round:exams[examId].round,name,school,answers:[1,2,3],createdAt:'2026-01-01',updatedAt:'2026-01-01'});
mockReports.push(record('a'.repeat(32),'tpl-mid-01'),record('b'.repeat(32),'tpl-mid-02'));
let init=ctx.ypInitializeStudentProfiles_();assert.strictEqual(init.total,1);assert.strictEqual(init.created,1);
const sid=ctx.ypReadStudentProfiles_()[0].studentToken;
assert(/^[0-9a-f]{32}$/i.test(sid));
let profile=ctx.ypGetStudentProfile_(sid);assert.strictEqual(profile.exams.length,2);assert.strictEqual(profile.studentToken,sid);
assert.strictEqual(ctx.ypResolveStudentFromReport_('a'.repeat(32)).studentToken,sid);
mockReports.push(record('c'.repeat(32),'tpl-mid-03'));
profile=ctx.ypGetStudentProfile_(sid);assert.strictEqual(profile.exams.length,3);
assert.strictEqual(ctx.ypInitializeStudentProfiles_().created,0);
let directory=ctx.ypStudentDirectory_();assert.strictEqual(directory.total,1);
const c0=ctx.ypGetClassRoster_();assert.strictEqual(c0.students.length,1);assert.strictEqual(c0.unassigned.length,1);
let r=ctx.ypSaveClassRoster_(JSON.stringify({op:'createClass',className:'토요 A반'}));
assert.strictEqual(r.classes.length,1);
let id=r.classes[0].classId;
r=ctx.ypSaveClassRoster_(JSON.stringify({op:'moveStudent',studentToken:sid,classId:id}));
assert.strictEqual(r.classes[0].students[0].studentToken,sid);
r=ctx.ypSaveClassRoster_(JSON.stringify({op:'addStudent',classId:id,name:'이과학',school:'동고등학교'}));
assert.strictEqual(r.classes[0].students.length,2);
r=ctx.ypSaveClassRoster_(JSON.stringify({op:'unassignStudent',studentToken:sid}));
assert.strictEqual(r.unassigned.length,1);
assert.strictEqual(ctx.ypGetStudentProfile_(sid).studentToken,sid);
// Multiple exam reports for the same student never mint another stable sid.
assert.strictEqual(ctx.ypReadStudentProfiles_().filter(p=>p.name==='김물리').length,1);
// A new class member has no exam records yet, without affecting Reports.
assert.strictEqual(mockReports.length,3);
console.log('PASS: stable StudentToken, historical linking, school/name mapping, roster create/move/unassign, no Reports mutation.');
