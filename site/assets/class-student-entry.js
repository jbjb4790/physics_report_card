(function(){
  'use strict';
  if(window.YPClassStudentEntry)return;
  const config=window.APP_CONFIG||{},core=window.TPLCore,catalog=window.EXAM_CATALOG||[];
  const store=config.storageKey||'tpl-score-report-records-v1';
  const state={roster:null,selectedClass:'',selectedToken:'',filter:'all',loading:false,saving:false,lastError:'',activeExam:'',busySelecting:false};
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v==null?'':v).normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  const get=selector=>document.querySelector(selector);
  function configSettings(){try{return JSON.parse(localStorage.getItem(`${store}-settings`)||'{}');}catch(e){return {};}}
  function api(){return String(configSettings().backendUrl||config.backendUrl||'').trim();}
  function writeKey(){try{return localStorage.getItem(`${store}-backend-write-key`)||sessionStorage.getItem('tpl-backend-write-key')||'';}catch(e){return '';}}
  function records(){try{const r=JSON.parse(localStorage.getItem(store)||'[]');return Array.isArray(r)?r:[];}catch(e){return [];}}
  function examId(){return get('#examSelect')?.value||'';}
  function matchingRecord(s){return records().filter(r=>r.examId===examId()&&norm(r.school||'미입력')===norm(s.school||'미입력')&&norm(r.name)===norm(s.name)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0]||null;}
  function student(token){return (state.roster?.students||[]).find(s=>s.studentToken===token)||null;}
  function activeStudents(){if(!state.roster)return [];if(state.selectedClass==='__none__')return state.roster.unassigned||[];return (state.roster.classes||[]).find(c=>c.classId===state.selectedClass)?.students||[];}
  function grade(r){if(!r||!core)return null;try{return core.grade(core.getExam(catalog,r.examId),r.answers).score;}catch(e){return null;}}
  function status(s){const r=matchingRecord(s);return {done:!!r,score:grade(r)};}
  function progress(){const ss=activeStudents(),done=ss.filter(s=>status(s).done).length;return {done,total:ss.length,pending:ss.length-done};}
  function jsonp(q){return new Promise((resolve,reject)=>{
    if(!api())return reject(new Error('Apps Script 주소가 없습니다.'));
    const cb=`_yp_class_${Date.now()}_${Math.floor(Math.random()*1e7)}`,u=new URL(api()),s=document.createElement('script');
    Object.entries(q).forEach(([k,v])=>u.searchParams.set(k,String(v)));
    u.searchParams.set('callback',cb);u.searchParams.set('_',Date.now().toString());
    const timer=setTimeout(()=>{clear();reject(new Error('서버 응답 시간이 초과되었습니다.'));},60000);
    function clear(){clearTimeout(timer);s.remove();try{delete window[cb];}catch(e){window[cb]=undefined;}}
    window[cb]=r=>{clear();r&&r.ok===false?reject(new Error(r.error||'서버 오류')):resolve(r||{})};
    s.onerror=()=>{clear();reject(new Error('Apps Script 서버 연결 실패'));};s.src=u.href;document.head.appendChild(s);
  });}
  function style(){if(get('#ypClassStyle'))return;const s=document.createElement('style');s.id='ypClassStyle';s.textContent=`
    .yp-class-panel{margin:16px 0 20px;padding:17px 18px;border:1px solid #c8defa;border-radius:19px;background:linear-gradient(150deg,#f1f7ff,#fff)}.yp-class-panel h3{font-size:17px;color:#0b3577;margin:0}.yp-class-panel p{font-size:11px;color:#637d9b;margin:4px 0 12px}.yp-class-controls{display:grid;grid-template-columns:minmax(160px,.8fr) minmax(170px,1.2fr) auto;gap:9px;align-items:end}.yp-class-controls label{display:block;font-size:11px;font-weight:850;color:#355b8e;margin-bottom:5px}.yp-class-controls select{min-height:40px}.yp-class-filter{display:flex;gap:5px;flex-wrap:wrap}.yp-class-filter button{padding:8px 11px;border-radius:10px;border:1px solid #c1d4f1;background:#fff;color:#315e97;cursor:pointer;font-weight:800}.yp-class-filter .active{color:white;background:#0a68ec;border-color:#0a68ec}.yp-class-students{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:14px}.yp-class-person{display:grid;gap:2px;text-align:left;min-height:72px;background:#fff;border:1px solid #d7e4f6;border-radius:14px;padding:11px;cursor:pointer}.yp-class-person strong{font-size:13px;color:#123e7e}.yp-class-person small{font-size:10px;color:#8194aa}.yp-class-person.done{background:#f6fcf8;border-color:#bee5d2}.yp-class-person.selected{border-color:#075df1;box-shadow:0 0 0 2px #0875ff28}.yp-class-person em{font-style:normal;font-size:10px;font-weight:850;color:#207458}.yp-class-person:not(.done) em{color:#ad6523}.yp-class-summary{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:12px 0;color:#375f98;font-size:11px;font-weight:800}.yp-class-summary strong{background:#e5f1ff;border-radius:999px;padding:4px 9px}.yp-class-manager{border-top:1px solid #dbe7f7;padding-top:12px;margin-top:12px}.yp-class-manager summary{cursor:pointer;color:#0a5cb9;font-weight:900;font-size:12px}.yp-class-manager-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:13px}.yp-class-manage-card{padding:12px;border:1px solid #dbe7f7;border-radius:14px;background:white}.yp-class-manage-card h4{font-size:12px;color:#133f7b;margin:0 0 9px}.yp-class-manage-card input,.yp-class-manage-card select,.yp-class-manage-card textarea{display:block;width:100%;margin:7px 0;min-height:39px}.yp-class-manage-card textarea{min-height:88px}.yp-class-manage-card button{margin:5px 5px 5px 0}.yp-class-empty{margin-top:10px;padding:15px;border:1px dashed #c6d8f2;background:#fff;border-radius:12px;text-align:center;font-size:11px;color:#7388a3}.yp-class-notice{padding:8px 10px;border-radius:10px;background:#fff;color:#617995;font-size:10px;margin-top:10px}.yp-class-lock{background:#f1f5fa!important;color:#405a75!important}@media(max-width:980px){.yp-class-students{grid-template-columns:repeat(3,minmax(0,1fr))}.yp-class-controls{grid-template-columns:1fr 1fr}.yp-class-controls>.btn{grid-column:1/3}}@media(max-width:700px){.yp-class-controls,.yp-class-manager-grid{grid-template-columns:1fr}.yp-class-controls>.btn{grid-column:auto}.yp-class-students{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:430px){.yp-class-students{grid-template-columns:1fr}}
  `;document.head.appendChild(s);}
  function setIdentity(s){
    if(!s)return;
    const a=get('#schoolInput'),b=get('#nameInput');if(!a||!b)return;
    a.value=s.school==='미입력'?'':s.school;b.value=s.name;
    a.dispatchEvent(new Event('input',{bubbles:true}));b.dispatchEvent(new Event('input',{bubbles:true}));
    lockIdentity();
  }
  function lockIdentity(){
    const selected=!!student(state.selectedToken);
    [get('#schoolInput'),get('#nameInput')].forEach(node=>{if(node){node.readOnly=selected;node.classList.toggle('yp-class-lock',selected);}});
  }
  function classList(){return (state.roster?.classes||[]).map(c=>`<option value="${esc(c.classId)}" ${state.selectedClass===c.classId?'selected':''}>${esc(c.className)} · ${c.students?.length||0}명</option>`).join('')+`<option value="__none__" ${state.selectedClass==='__none__'?'selected':''}>미분류 · ${state.roster?.unassigned?.length||0}명</option>`;}
  function studentList(){
    const list=activeStudents().filter(s=>state.filter==='all'||(state.filter==='done')===status(s).done);
    if(!list.length)return '<div class="yp-class-empty">해당하는 학생이 없습니다. 반·학생 관리에서 명단을 배정해 주세요.</div>';
    return `<div class="yp-class-students">${list.map(s=>{const st=status(s);return `<button type="button" class="yp-class-person${st.done?' done':''}${state.selectedToken===s.studentToken?' selected':''}" data-student="${esc(s.studentToken)}"><strong>${esc(s.name)}</strong><small>${esc(s.school)}</small><em>${st.done?'입력 완료 · '+st.score+'점':'미입력'}</em></button>`;}).join('')}</div>`;
  }
  function manage(){
    const cls=(state.roster?.classes||[]),clsId=state.selectedClass==='__none__'?'':state.selectedClass;
    const classOpts=cls.map(c=>`<option value="${esc(c.classId)}" ${clsId===c.classId?'selected':''}>${esc(c.className)}</option>`).join('');
    const studentOpts=(state.roster?.students||[]).map(s=>`<option value="${esc(s.studentToken)}">${esc(s.name)} · ${esc(s.school)} · ${esc(s.className||'미분류')}</option>`).join('');
    return `<details class="yp-class-manager"><summary>반·학생 관리 열기</summary><div class="yp-class-manager-grid">
      <div class="yp-class-manage-card"><h4>반 생성 / 이름 변경</h4><input class="input" id="ypNewClass" placeholder="예: 토요 A반"><button class="btn btn--primary btn--small" data-do="createClass">새 반 만들기</button><input class="input" id="ypRenameClass" placeholder="변경할 반 이름"><button class="btn btn--soft btn--small" data-do="renameClass">현재 반 이름 변경</button></div>
      <div class="yp-class-manage-card"><h4>기존 학생 반 이동</h4><select class="select" id="ypMoveStudent">${studentOpts}</select><select class="select" id="ypMoveClass">${classOpts}</select><button class="btn btn--primary btn--small" data-do="moveStudent">반 배정·이동</button><button class="btn btn--soft btn--small" data-do="unassignStudent">미분류로 이동</button></div>
      <div class="yp-class-manage-card"><h4>새 학생 한 명 등록</h4><input class="input" id="ypNewSchool" placeholder="학교 (미입력 가능)"><input class="input" id="ypNewStudent" placeholder="학생 이름"><button class="btn btn--primary btn--small" data-do="addStudent">현재 반에 등록</button></div>
      <div class="yp-class-manage-card"><h4>명단 여러 명 등록</h4><input class="input" id="ypDefaultSchool" placeholder="기본 학교"><textarea class="textarea" id="ypBulkList" placeholder="김물리&#10;이과학&#10;또는 학교명 [탭] 학생이름"></textarea><button class="btn btn--primary btn--small" data-do="bulkAssign">현재 반에 일괄 등록</button><p>1~30명씩 서버에 나누어 등록합니다.</p></div>
    </div></details>`;
  }
  function html(){
    if(!state.roster)return `<section class="yp-class-panel" id="ypClassPanel"><h3>반별 학생 선택·성적 입력</h3><p>${esc(state.lastError||'Apps Script 저장 키를 입력한 뒤 반과 학생 명단을 불러옵니다.')}</p><button class="btn btn--soft btn--small" id="ypReloadRoster">반 목록 불러오기</button></section>`;
    const p=progress(),selected=student(state.selectedToken);
    return `<section class="yp-class-panel" id="ypClassPanel"><h3>반별 학생 선택·성적 입력</h3><p>시험 선택 → 반 선택 → 학생 선택 → 답안 입력·저장. 기존 성적은 자동으로 수정 모드로 불러옵니다.</p>
      <div class="yp-class-summary"><span>${esc((state.roster.classes||[]).find(c=>c.classId===state.selectedClass)?.className||'미분류')}</span><strong>완료 ${p.done}/${p.total}</strong><strong>미입력 ${p.pending}명</strong></div>
      <div class="yp-class-controls"><div><label for="ypClassChoice">반</label><select class="select" id="ypClassChoice">${classList()}</select></div>
      <div><label>입력 상태</label><div class="yp-class-filter">${[['all','전체'],['pending','미입력만'],['done','입력완료']].map(([k,n])=>`<button type="button" data-filter="${k}" class="${state.filter===k?'active':''}">${n}</button>`).join('')}</div></div>
      <button class="btn btn--soft btn--small" id="ypNextStudent" type="button">다음 미입력 학생</button></div>
      <div id="ypClassCards">${studentList()}</div><div class="yp-class-notice">${selected?'선택 학생: '+esc(selected.name)+' ('+esc(selected.school)+') · 학교와 이름은 자동 입력됩니다.':'학생을 선택하거나 직접 입력 모드로 전환하세요.'} <button class="btn btn--soft btn--small" id="ypManual">선택 해제·직접 입력</button></div>
      ${manage()}</section>`;
  }
  function mount(){
    const body=get('#student-entry .card__body');if(!body)return;
    style();const old=get('#ypClassPanel'),opened=!!old?.querySelector('details.yp-class-manager')?.open;
    old?.remove();const wrapper=document.createElement('div');wrapper.innerHTML=html();
    const panel=wrapper.firstElementChild,exam=get('#examSelect')?.closest('.field');
    if(exam&&exam.parentNode===body)exam.insertAdjacentElement('afterend',panel);else body.prepend(panel);
    if(opened)panel.querySelector('details.yp-class-manager')?.setAttribute('open','');
    bind(panel);lockIdentity();
  }
  async function selectStudent(token){
    const s=student(token);if(!s||state.busySelecting)return;
    state.busySelecting=true;state.selectedToken=token;
    try{
      const existing=matchingRecord(s);
      if(existing){
        let row=[...document.querySelectorAll('#recordBody tr[data-record-ref]')].find(r=>String(r.dataset.recordRef||'')===(existing.serverId?'server:'+existing.serverId:'local:'+existing.id));
        if(!row){const search=get('#recordSearch');if(search&&search.value){search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));row=[...document.querySelectorAll('#recordBody tr[data-record-ref]')].find(r=>String(r.dataset.recordRef||'')===(existing.serverId?'server:'+existing.serverId:'local:'+existing.id));}}
        const edit=row?.querySelector('[data-action="edit"]');
        if(edit){edit.click();setIdentity(s);}
        else {alert('기존 학생 기록을 수정 모드로 불러올 수 없습니다. 서버 기록 새로고침 후 다시 시도해 주세요.');return;}
      }else{
        const clear=get('#clearFormTop')||get('#clearForm');
        if(clear)clear.click();
        setIdentity(s);
      }
      mount();get('.answer-input[data-index="0"]')?.focus();
    }finally{state.busySelecting=false;}
  }
  function nextPending(){const pending=activeStudents().filter(s=>!status(s).done);if(!pending.length){alert('이 반의 현재 시험 성적 입력이 모두 완료되었습니다.');return;}
    const index=pending.findIndex(s=>s.studentToken===state.selectedToken);selectStudent(pending[(index+1+pending.length)%pending.length].studentToken);
  }
  async function rosterWrite(op,input){
    if(state.saving)return null;if(!writeKey()){alert('누적 저장 방식 설정에서 저장 키를 먼저 입력하세요.');return null;}
    state.saving=true;
    try{const data=await jsonp({action:'classRosterSave',writeKey:writeKey(),payload:JSON.stringify({op,...input})});
      state.roster=data;return data;
    }catch(e){alert('반/학생 관리 실패: '+e.message);return null;}
    finally{state.saving=false;mount();}
  }
  async function doManage(op,panel){
    const chosen=state.selectedClass==='__none__'?'':state.selectedClass;
    if(op==='createClass'){
      const name=panel.querySelector('#ypNewClass')?.value.trim();if(!name)return alert('반 이름을 입력하세요.');
      const data=await rosterWrite(op,{className:name});const newRow=data?.classes?.find(c=>norm(c.className)===norm(name));if(newRow){state.selectedClass=newRow.classId;mount();}
    }else if(op==='renameClass'){
      if(!chosen)return alert('반을 선택하세요.');const className=panel.querySelector('#ypRenameClass')?.value.trim();if(!className)return alert('변경할 이름을 입력하세요.');
      await rosterWrite(op,{classId:chosen,className});
    }else if(op==='moveStudent'||op==='unassignStudent'){
      const token=panel.querySelector('#ypMoveStudent')?.value,classId=panel.querySelector('#ypMoveClass')?.value;
      if(!token)return alert('학생을 선택하세요.');
      await rosterWrite(op,{studentToken:token,classId});
    }else if(op==='addStudent'){
      if(!chosen)return alert('등록할 반을 선택하세요.');
      const school=panel.querySelector('#ypNewSchool')?.value,name=panel.querySelector('#ypNewStudent')?.value;
      if(!name?.trim())return alert('학생 이름이 필요합니다.');
      await rosterWrite(op,{classId:chosen,school,name});
    }else if(op==='bulkAssign'){
      if(!chosen)return alert('등록할 반을 선택하세요.');
      const defaultSchool=panel.querySelector('#ypDefaultSchool')?.value||'';
      const raw=panel.querySelector('#ypBulkList')?.value||'';
      const students=raw.replace(/\r\n?/g,'\n').split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{
        const p=l.includes('\t')?l.split('\t'):l.includes(',')?l.split(','):[l];
        return p.length>=2?{school:p[0].trim(),name:p[1].trim()}:{school:defaultSchool,name:p[0].trim()};
      }).filter(s=>s.name);
      if(!students.length)return alert('명단을 입력하세요.');
      // Batch size limits JSONP URL length; 15 records per action is safe.
      for(let i=0;i<students.length;i+=15){const data=await rosterWrite(op,{classId:chosen,students:students.slice(i,i+15)});if(!data)break;}
    }
  }
  function bind(panel){
    panel.querySelector('#ypReloadRoster')?.addEventListener('click',()=>load(true));
    panel.querySelector('#ypClassChoice')?.addEventListener('change',e=>{state.selectedClass=e.target.value;state.selectedToken='';mount();});
    panel.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.filter;mount();}));
    panel.querySelectorAll('[data-student]').forEach(b=>b.addEventListener('click',()=>selectStudent(b.dataset.student)));
    panel.querySelector('#ypNextStudent')?.addEventListener('click',nextPending);
    panel.querySelector('#ypManual')?.addEventListener('click',()=>{state.selectedToken='';mount();get('#nameInput')?.focus();});
    panel.querySelectorAll('[data-do]').forEach(b=>b.addEventListener('click',()=>doManage(b.dataset.do,panel)));
  }
  async function load(force){
    if(state.loading)return;
    if(!api()||!writeKey()){state.lastError='Google Sheets 저장 키가 필요합니다.';mount();return;}
    if(!force&&state.roster){mount();return;}
    state.loading=true;
    try{state.roster=await jsonp({action:'classRoster',writeKey:writeKey()});state.lastError='';
      if(!state.selectedClass||state.selectedClass!=='__none__'&&!(state.roster.classes||[]).some(c=>c.classId===state.selectedClass))state.selectedClass=state.roster.classes?.[0]?.classId||'__none__';
    }catch(e){state.lastError='반 목록 연결 실패: '+e.message;console.warn(state.lastError);}
    finally{state.loading=false;mount();}
  }
  let mutationPending=false;
  const observer=new MutationObserver(()=>{
    if(mutationPending)return;mutationPending=true;
    setTimeout(()=>{mutationPending=false;if(get('#student-entry .card__body')&&!get('#ypClassPanel')){
      mount();if(state.selectedToken){const selected=student(state.selectedToken);if(selected)setIdentity(selected);}
    }},100);
  });observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('change',e=>{if(e.target?.id!=='examSelect')return;
    const token=state.selectedToken;
    setTimeout(()=>{mount();if(token)selectStudent(token);},60);
  },true);
  window.addEventListener('load',()=>{mount();load(true);});
  window.addEventListener('focus',()=>{if(state.roster){const cards=get('#ypClassCards');if(cards)cards.innerHTML=studentList();}});
  window.YPClassStudentEntry={version:'3.14.0',refresh:()=>load(true),selectStudent};
})();
