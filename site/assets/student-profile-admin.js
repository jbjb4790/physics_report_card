(function(){
  'use strict';
  if(window.YPStudentProfileAdmin)return;
  const config=window.APP_CONFIG||{}, storageKey=config.storageKey||'tpl-score-report-records-v1';
  const state={directory:null,loading:false,lastSync:0,observer:null};
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'{}');}catch(e){return {}}};
  const backend=()=>String(read(`${storageKey}-settings`).backendUrl||config.backendUrl||'').trim();
  const writeKey=()=>String(localStorage.getItem(`${storageKey}-backend-write-key`)||sessionStorage.getItem('tpl-backend-write-key')||'').trim();
  function studentUrl(token){const u=new URL('student.html',document.baseURI||location.href),h=new URLSearchParams();h.set('sid',token);h.set('api',backend());u.hash=h.toString();return u.href;}
  function jsonp(params){return new Promise((resolve,reject)=>{
    const api=backend();if(!api)return reject(new Error('Apps Script 주소가 없습니다.'));
    const u=new URL(api),cb=`_yp_teacher_${Date.now()}_${Math.floor(Math.random()*1e7)}`,s=document.createElement('script');
    Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
    u.searchParams.set('callback',cb);u.searchParams.set('_',String(Date.now()));
    const timer=setTimeout(()=>{clean();reject(new Error('응답 시간 초과'));},60000);
    function clean(){clearTimeout(timer);s.remove();try{delete window[cb];}catch(e){window[cb]=undefined;}}
    window[cb]=r=>{clean();r?.ok===false?reject(new Error(r.error||'서버 오류')):resolve(r||{})};
    s.onerror=()=>{clean();reject(new Error('서버 연결 실패'));};s.src=u.href;s.async=true;document.head.appendChild(s);
  });}
  function style(){if(document.getElementById('ypProfileTeacherStyle'))return;
    const s=document.createElement('style');s.id='ypProfileTeacherStyle';s.textContent=`
    .yp-directory{margin-bottom:18px}.yp-dir-meta{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.yp-dir-meta input{max-width:360px}.yp-dir-row{display:flex;gap:10px;align-items:center}.yp-dir-badges{display:flex;gap:4px;flex-wrap:wrap}.yp-dir-badges span{font-size:9px;padding:4px 7px;background:#edf5ff;color:#285f9e;border-radius:9px}.yp-profile-inline{border:1px solid #c0d8f7;background:#eff6ff;color:#0a57b7;border-radius:9px;min-height:30px;padding:4px 9px;font-weight:850;font-size:11px;cursor:pointer}@media(max-width:720px){.yp-dir-meta{display:block}.yp-dir-meta input{max-width:none}}
    `;document.head.appendChild(s);}
  function mountDirectory(){
    const records=document.getElementById('student-records');
    if(!records||!state.directory)return;
    if(document.getElementById('student-profile-directory'))return;
    const section=document.createElement('section');section.className='card yp-directory';section.id='student-profile-directory';
    section.innerHTML=`<div class="card__head"><div><h2>학생별 통합 학습 페이지</h2><p>학생마다 하나의 고정 주소로 모든 회차의 성적·강점·취약점을 확인합니다.</p></div></div>
      <div class="card__body"><div class="yp-dir-meta"><input class="input" id="ypProfileQuery" type="search" placeholder="학교·학생 이름 검색"><button type="button" class="btn btn--soft btn--small" id="ypProfileRefresh">학생 통합 목록 새로고침</button></div>
      <div class="table-wrap"><table><thead><tr><th>학교·학생</th><th>시험</th><th>최근</th><th>평균</th><th>회차</th><th>학생 통합페이지</th></tr></thead><tbody id="ypProfileRows">${(state.directory.students||[]).map(p=>`<tr data-yp-token="${esc(p.studentToken)}"><td><span class="student-name">${esc(p.name)}</span><span class="student-school">${esc(p.school)}</span></td><td>${p.examCount||0}회</td><td>${p.latestRound||'—'}회 · ${p.latestScore??'—'}점</td><td>${p.averageScore??'—'}점</td><td><div class="yp-dir-badges">${(p.rounds||[]).map(n=>`<span>${n}회</span>`).join('')}</div></td><td><div class="row-actions"><button class="btn btn--primary btn--small" data-yp-action="copy">링크 복사</button><button class="btn btn--secondary btn--small" data-yp-action="open">열기</button></div></td></tr>`).join('')}</tbody></table></div></div>`;
    records.parentNode.insertBefore(section,records);
    section.querySelector('#ypProfileQuery').addEventListener('input',e=>{
      const q=e.target.value.trim().toLowerCase();
      section.querySelectorAll('tbody tr').forEach(row=>{row.hidden=!!q&&!row.textContent.toLowerCase().includes(q);});
    });
    section.querySelector('#ypProfileRefresh').addEventListener('click',()=>loadDirectory(true));
    section.addEventListener('click',async e=>{
      const btn=e.target.closest('[data-yp-action]');if(!btn)return;
      const t=btn.closest('tr')?.dataset.ypToken;if(!t)return;
      const url=studentUrl(t);
      if(btn.dataset.ypAction==='open')window.open(url,'_blank','noopener');
      else {try{await navigator.clipboard.writeText(url);btn.textContent='복사 완료';setTimeout(()=>btn.textContent='링크 복사',1200);}catch(err){prompt('아래 주소를 복사하세요.',url);}}
    });
  }
  function inlineButtons(){document.querySelectorAll('#recordBody tr[data-record-ref]').forEach(row=>{
    if(row.querySelector('[data-action="student-profile"]'))return;
    const id=String(row.dataset.recordRef||'');if(!id.startsWith('server:'))return;
    const actions=row.querySelector('.row-actions');if(!actions)return;
    const b=document.createElement('button');b.type='button';b.dataset.action='student-profile';b.className='yp-profile-inline';b.textContent='통합페이지';actions.insertBefore(b,actions.firstChild);
  });}
  async function loadDirectory(force){
    if(state.loading||!writeKey()||!backend())return;
    if(!force&&state.directory&&Date.now()-state.lastSync<60000){mountDirectory();return;}
    state.loading=true;
    try{state.directory=await jsonp({action:'studentDirectory',writeKey:writeKey()});state.lastSync=Date.now();document.getElementById('student-profile-directory')?.remove();mountDirectory();}
    catch(err){console.warn('학생 통합 목록을 불러오지 못했습니다:',err.message);}
    finally{state.loading=false;}
  }
  document.addEventListener('click',async e=>{
    const b=e.target.closest('#recordBody button[data-action="student-profile"]');if(!b)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const ref=b.closest('tr[data-record-ref]')?.dataset.recordRef||'',id=ref.startsWith('server:')?ref.slice(7):'';
    if(!id)return;
    // Open the tab during user activation to avoid popup blocking after async request.
    const popup=window.open('','_blank');
    const old=b.textContent;b.disabled=true;b.textContent='연결 중…';
    try{const response=await jsonp({action:'studentResolve',id});const url=studentUrl(response.studentToken);if(popup)popup.location.href=url;else window.prompt('학생 통합페이지 주소',url);}
    catch(err){if(popup)popup.close();alert('학생 통합페이지를 열지 못했습니다: '+err.message);}
    finally{b.disabled=false;b.textContent=old;}
  },true);
  style();
  let pending=false;
  const observer=new MutationObserver(()=>{
    if(pending)return;pending=true;
    setTimeout(()=>{pending=false;inlineButtons();mountDirectory();if(!state.directory)loadDirectory(false);},120);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('load',()=>{inlineButtons();loadDirectory(false);});
  window.YPStudentProfileAdmin={version:'3.13.0',refresh:()=>loadDirectory(true),studentUrl};
})();
