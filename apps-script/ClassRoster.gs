/**
 * Young's Physics Class Roster v3.14.0 (re-created distribution)
 * Depends on StudentProfiles.gs v3.13.0 and production Code.gs.
 * No modifications to Reports, Students IDs, or StudentToken links.
 */
var YP_CLASSES_SHEET_='Classes';
var YP_CLASS_MEMBERS_SHEET_='ClassStudents';
var YP_CLASS_HEADERS_=['ClassId','ClassName','SortOrder','Active','UpdatedAt'];
var YP_MEMBERS_HEADERS_=['StudentToken','ClassId','SortOrder','Active','UpdatedAt'];

function ypRosterSheet_(name, headers) {
  var ss=spreadsheet_(), sheet=ss.getSheetByName(name);
  if(!sheet)sheet=ss.insertSheet(name);
  if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);}
  return sheet;
}
function ypClassesSheet_(){return ypRosterSheet_(YP_CLASSES_SHEET_,YP_CLASS_HEADERS_);}
function ypClassMembersSheet_(){return ypRosterSheet_(YP_CLASS_MEMBERS_SHEET_,YP_MEMBERS_HEADERS_);}
function ypReadClasses_(){
  var s=ypClassesSheet_(),n=s.getLastRow()-1;
  if(n<=0)return [];
  return s.getRange(2,1,n,YP_CLASS_HEADERS_.length).getValues().map(function(r,i){return {
    classId:String(r[0]||'').trim(),className:normalizeText_(r[1]),sortOrder:Number(r[2]||0),
    active:String(r[3]).toLowerCase()!=='false'&&String(r[3])!=='0',updatedAt:String(r[4]||''),row:i+2
  };}).filter(function(c){return c.classId&&c.className;});
}
function ypReadClassMembers_(){
  var s=ypClassMembersSheet_(),n=s.getLastRow()-1;
  if(n<=0)return [];
  return s.getRange(2,1,n,YP_MEMBERS_HEADERS_.length).getValues().map(function(r,i){return {
    studentToken:String(r[0]||'').trim(),classId:String(r[1]||'').trim(),sortOrder:Number(r[2]||0),
    active:String(r[3]).toLowerCase()!=='false'&&String(r[3])!=='0',updatedAt:String(r[4]||''),row:i+2
  };}).filter(function(m){return m.studentToken;});
}
function ypRosterClass_(classes,id){for(var i=0;i<classes.length;i++)if(classes[i].classId===String(id||''))return classes[i];return null;}
function ypRosterProfileByIdentity_(profiles, school, name) {
  var key=studentKey_({school:school,name:name});
  for(var i=0;i<profiles.length;i++)if(ypProfileKeys_(profiles[i]).indexOf(key)>=0)return profiles[i];
  return null;
}
function ypRosterCreateStudent_(profiles, school, name) {
  var s=normalizeSchool_(school),n=normalizeText_(name);
  if(!n) throw apiError_('NAME_REQUIRED','학생 이름이 필요합니다.');
  var prior=ypRosterProfileByIdentity_(profiles,s,n);
  if(prior)return prior;
  var token=Utilities.getUuid().replace(/-/g,''),now=new Date().toISOString(),key=studentKey_({school:s,name:n});
  var p={studentToken:token,createdAt:now,updatedAt:now,studentKey:key,school:s,name:n,keysJson:JSON.stringify([key]),status:'active'};
  ypStudentsSheet_().appendRow(ypProfileValues_(p));
  profiles.push(p);return p;
}
function ypSetMembership_(token,classId,sortOrder){
  // Preserve history (inactive prior memberships); exactly one active group.
  var sheet=ypClassMembersSheet_(),now=new Date().toISOString();
  ypReadClassMembers_().forEach(function(m){
    if(m.studentToken===token&&m.active)sheet.getRange(m.row,4,1,2).setValues([[false,now]]);
  });
  if(classId)sheet.appendRow([token,classId,Number(sortOrder||0),true,now]);
}
/** Teacher-only list: Code.gs doGet must require assertWriteKey_. */
function ypGetClassRoster_() {
  ypInitializeStudentProfiles_();
  var profiles=ypReadStudentProfiles_().filter(function(p){return !/^merged:/.test(p.status);});
  var classes=ypReadClasses_().filter(function(c){return c.active;}).sort(function(a,b){return a.sortOrder-b.sortOrder||a.className.localeCompare(b.className);});
  var members=ypReadClassMembers_(),classMap={};classes.forEach(function(c){classMap[c.classId]=c;});
  var membership={};members.sort(function(a,b){return a.row-b.row;}).forEach(function(m){
    if(m.active&&classMap[m.classId])membership[m.studentToken]=m;
  });
  var students=profiles.map(function(p){
    var m=membership[p.studentToken],c=m?classMap[m.classId]:null;
    return {studentToken:p.studentToken,school:p.school,name:p.name,
      classId:c?c.classId:'',className:c?c.className:'',sortOrder:m?m.sortOrder:0};
  }).sort(function(a,b){return a.sortOrder-b.sortOrder||a.name.localeCompare(b.name)||a.school.localeCompare(b.school);});
  return {ok:true,version:'3.14.0',students:students,
    classes:classes.map(function(c){return {classId:c.classId,className:c.className,
      sortOrder:c.sortOrder,students:students.filter(function(s){return s.classId===c.classId;})};}),
    unassigned:students.filter(function(s){return !s.classId;})};
}

/** Teacher-only writes: Code.gs doGet must require assertWriteKey_. */
function ypSaveClassRoster_(payload) {
  var input;
  try{input=JSON.parse(String(payload||'{}'));}catch(e){throw apiError_('INVALID_PAYLOAD','반 관리 데이터가 올바르지 않습니다.');}
  var op=String(input.op||'');
  if(!op)throw apiError_('OP_REQUIRED','작업 종류가 누락되었습니다.');
  ypInitializeStudentProfiles_();
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var classes=ypReadClasses_(),profiles=ypReadStudentProfiles_().filter(function(p){return !/^merged:/.test(p.status);});
    var now=new Date().toISOString();
    if(op==='createClass'){
      var name=normalizeText_(input.className);
      if(!name)throw apiError_('CLASS_NAME_REQUIRED','반 이름을 입력하세요.');
      if(classes.some(function(c){return c.active&&normalizeKey_(c.className)===normalizeKey_(name);}))throw apiError_('DUPLICATE_CLASS','같은 이름의 반이 있습니다.');
      ypClassesSheet_().appendRow([Utilities.getUuid().replace(/-/g,''),name,classes.filter(function(c){return c.active;}).length+1,true,now]);
    }else if(op==='renameClass'){
      var existing=ypRosterClass_(classes,input.classId),newName=normalizeText_(input.className);
      if(!existing||!existing.active)throw apiError_('CLASS_NOT_FOUND','반을 찾지 못했습니다.');
      if(!newName)throw apiError_('CLASS_NAME_REQUIRED','반 이름을 입력하세요.');
      if(classes.some(function(c){return c.active&&c.classId!==existing.classId&&normalizeKey_(c.className)===normalizeKey_(newName);}))throw apiError_('DUPLICATE_CLASS','같은 이름의 반이 있습니다.');
      ypClassesSheet_().getRange(existing.row,2,1,4).setValues([[newName,existing.sortOrder,true,now]]);
    }else if(op==='archiveClass'){
      var arch=ypRosterClass_(classes,input.classId);
      if(!arch||!arch.active)throw apiError_('CLASS_NOT_FOUND','반을 찾지 못했습니다.');
      ypClassesSheet_().getRange(arch.row,4,1,2).setValues([[false,now]]);
    }else if(op==='moveStudent'||op==='unassignStudent'){
      var student=ypProfileByToken_(profiles,input.studentToken);
      if(!student)throw apiError_('STUDENT_NOT_FOUND','학생을 찾지 못했습니다.');
      var classId=op==='unassignStudent'?'':String(input.classId||'');
      if(classId){var destination=ypRosterClass_(classes,classId);if(!destination||!destination.active)throw apiError_('CLASS_NOT_FOUND','반을 찾지 못했습니다.');}
      ypSetMembership_(student.studentToken,classId,input.sortOrder||0);
    }else if(op==='addStudent'||op==='bulkAssign'){
      var c=ypRosterClass_(classes,input.classId);
      if(!c||!c.active)throw apiError_('CLASS_NOT_FOUND','반을 찾지 못했습니다.');
      var students=op==='addStudent'?[{school:input.school,name:input.name}]:(Array.isArray(input.students)?input.students:[]);
      if(!students.length||students.length>30)throw apiError_('BULK_SIZE','명단은 1~30명 단위로 등록해 주세요.');
      students.forEach(function(s,i){
        var p=ypRosterCreateStudent_(profiles,s.school,s.name);
        ypSetMembership_(p.studentToken,c.classId,i+1);
      });
    }else throw apiError_('UNKNOWN_OPERATION','지원하지 않는 반 관리 기능입니다.');
    SpreadsheetApp.flush();
  }finally{lock.releaseLock();}
  return ypGetClassRoster_();
}
function initializeClassRoster(){ypInitializeStudentProfiles_();ypClassesSheet_();ypClassMembersSheet_();var r=ypGetClassRoster_();var msg='반 관리 초기화 완료: 반 '+r.classes.length+'개 / 학생 '+r.students.length+'명 / 미분류 '+r.unassigned.length+'명';console.log(msg);return msg;}
function checkClassRoster(){var r=ypGetClassRoster_(),unique={};var duplicates=0;r.students.forEach(function(s){if(unique[s.studentToken])duplicates++;unique[s.studentToken]=true;});var report={ok:duplicates===0,classes:r.classes.length,students:r.students.length,unassigned:r.unassigned.length,duplicateStudents:duplicates};console.log(JSON.stringify(report,null,2));return JSON.stringify(report,null,2);}
