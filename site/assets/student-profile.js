(function () {
  'use strict';
  const config=window.APP_CONFIG||{}, app=document.getElementById('studentProfileApp');
  let activeApi='';
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>v==null?'—':(Number.isFinite(Number(v))?String(Math.round(Number(v)*100)/100):'—');
  const params=()=>new URLSearchParams(location.hash.replace(/^#/,''));
  function apiUrl(){
    let stored='';try{stored=JSON.parse(localStorage.getItem(`${config.storageKey||'tpl-score-report-records-v1'}-settings`)||'{}').backendUrl||'';}catch(e){}
    return params().get('api')||config.backendUrl||stored||'';
  }
  function jsonp(url,query){
    return new Promise((resolve,reject)=>{
      if(!/^https:\/\/script\.google\.com\/macros\/s\//.test(url)) return reject(new Error('서버 주소가 올바르지 않습니다.'));
      const cb=`_yp_st_${Date.now()}_${Math.floor(Math.random()*1e7)}`;
      const u=new URL(url),s=document.createElement('script');
      Object.entries(query).forEach(([k,v])=>u.searchParams.set(k,String(v)));
      u.searchParams.set('callback',cb);u.searchParams.set('_',String(Date.now()));
      const timer=setTimeout(()=>{clear();reject(new Error('학생 데이터 응답 시간이 초과되었습니다.'));},60000);
      function clear(){clearTimeout(timer);s.remove();try{delete window[cb];}catch(e){window[cb]=undefined;}}
      window[cb]=r=>{clear();r&&r.ok===false?reject(new Error(r.error||'서버 오류')):resolve(r)};
      s.onerror=()=>{clear();reject(new Error('Apps Script 연결 실패'));};
      s.src=u.href;s.async=true;document.head.appendChild(s);
    });
  }
  function examLink(e){
    const url=new URL('report.html',location.href),hash=new URLSearchParams();
    hash.set(config.serverHashKey||'id',e.reportToken);hash.set('api',activeApi);
    if(e.reportFingerprint)hash.set('k',e.reportFingerprint);
    url.hash=hash.toString();return url.href;
  }
  function chart(exams){
    if(exams.length<2)return '<div class="sp-empty">시험 결과가 두 개 이상 모이면 점수 변화 그래프가 표시됩니다.</div>';
    const w=700,h=250,left=45,right=20,top=20,bottom=40,x=i=>left+i*(w-left-right)/(exams.length-1),y=v=>top+(100-Number(v))*(h-top-bottom)/125;
    const p=exams.map((e,i)=>`${x(i)},${y(e.score)}`).join(' ');
    const ticks=[0,25,50,75,100].map(v=>`<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}" stroke="#e4edfa"/><text x="${left-9}" y="${y(v)+3}" text-anchor="end" font-size="10" fill="#667e9e">${v}</text>`).join('');
    const circles=exams.map((e,i)=>`<circle cx="${x(i)}" cy="${y(e.score)}" r="5.5" fill="#0a62e7"/><text x="${x(i)}" y="${y(e.score)-12}" text-anchor="middle" font-size="11" fill="#0a397d">${fmt(e.score)}</text><text x="${x(i)}" y="${h-12}" text-anchor="middle" font-size="11" fill="#667e9e">${e.round}회</text>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="회차별 성적 그래프">${ticks}<polyline points="${p}" fill="none" stroke="#0a62e7" stroke-width="3.5"/>${circles}</svg>`;
  }
  function conceptCards(items,cls){
    return items&&items.length?`<div class="sp-concept-grid">${items.map(e=>`<article class="sp-concept-card ${cls}"><h3>${esc(e.name)}</h3><span class="sp-tag">정답률 ${fmt(e.accuracy)}%</span><span class="sp-tag">${e.exposureRounds}개 회차 출제</span>${e.missRounds?`<p>${e.missRounds}개 회차에서 실수</p>`:''}<p>${esc(e.advice||'')}</p></article>`).join('')}</div>`:'<div class="sp-empty">현재 충분한 분석 자료가 없습니다.</div>';
  }
  function render(data){
    if(data.redirectedFrom&&data.studentToken){const h=params();h.set('sid',data.studentToken);history.replaceState({},'',`${location.pathname}#${h}`);}
    const s=data.summary||{},p=data.profile||{},exams=data.exams||[],domains=data.domains||[];
    document.title=`${p.name||'학생'} 통합페이지 | Young's Physics`;
    app.innerHTML=`<header class="sp-topbar"><div class="sp-topbar-inner"><a class="sp-brand" href="./">YOUNG'S PHYSICS <small>학생 통합 학습페이지</small></a><div class="sp-actions"><button class="sp-btn" id="spCopy">고정 링크 복사</button><button class="sp-btn primary" onclick="window.print()">PDF·인쇄</button></div></div></header>
      <main class="sp-container"><section class="sp-hero"><div class="sp-kicker">CUMULATIVE STUDENT REPORT</div><h1>${esc(p.name||'학생')} <small>학생</small></h1><div>${esc(p.school||'미입력')}</div><p class="sp-hero-desc">이 학생의 모든 TPL 모의고사 기록이 하나의 주소에 자동으로 누적됩니다. 다음 시험 결과가 등록되어도 이 주소는 유지됩니다.</p>
      <div class="sp-stats"><div class="sp-stat"><span>누적 시험</span><strong>${s.examCount||0}회</strong></div><div class="sp-stat"><span>누적 평균</span><strong>${fmt(s.averageScore)}점</strong></div><div class="sp-stat"><span>최근 점수</span><strong>${fmt(s.latestScore)}점</strong></div><div class="sp-stat"><span>최고 점수</span><strong>${fmt(s.bestScore)}점</strong></div></div></section>
      <div class="sp-two-col"><section class="sp-section"><h2>회차별 성적 추세</h2><p class="sp-caption">시험이 입력된 순서와 무관하게 회차 순으로 정렬합니다.</p><div class="sp-chart">${chart(exams)}</div></section><section class="sp-section"><h2>누적 학습 코멘트</h2>${(data.comments||[]).map(c=>`<div class="sp-comment">${esc(c)}</div>`).join('')||'<div class="sp-empty">데이터가 누적되면 표시됩니다.</div>'}</section></div>
      <section class="sp-section"><h2>누적 대단원 성취</h2><p class="sp-caption">모든 연결된 시험의 문항 수를 기준으로 계산한 정답률</p><div class="sp-bars">${domains.map(d=>`<div class="sp-barline"><strong>${esc(d.domain)}</strong><div class="sp-bar"><i style="width:${Math.min(100,Math.max(0,Number(d.accuracy)||0))}%"></i></div><b>${fmt(d.accuracy)}%</b></div>`).join('')||'<div class="sp-empty">아직 분석할 문항이 없습니다.</div>'}</div></section>
      <div class="sp-two-col"><section class="sp-section"><h2>강점 개념</h2>${conceptCards(data.strengths,'good')}</section><section class="sp-section"><h2>취약 개념</h2>${conceptCards(data.weaknesses,'weak')}</section></div>
      <section class="sp-section"><div class="sp-section-head"><h2>지속적으로 틀리는 단원</h2><span class="sp-tag">${(data.recurringWeaknesses||[]).length}개</span></div>
      ${(data.recurringWeaknesses||[]).map((c,i)=>`<article class="sp-concept-card weak" style="margin:10px 0"><span class="sp-tag">복습 ${i+1}순위</span><h3 style="margin-top:8px">${esc(c.name)}</h3><p>누적 ${c.missRounds}개 회차 실수 · 정답률 ${fmt(c.accuracy)}%</p>${(c.refs||[]).map(r=>`<span class="sp-ref">${r.round}회 ${r.no}번${r.status==='blank'?' · 미기입':''}</span>`).join('')}<p>${esc(c.advice||'')}</p></article>`).join('')||'<div class="sp-empty">반복된 취약 개념이 아직 확인되지 않았습니다.</div>'}</section>
      <section class="sp-section"><div class="sp-section-head"><h2>시험 결과 모아보기</h2><span class="sp-tag">${exams.length}개 시험</span></div>${exams.slice().reverse().map(e=>`<article class="sp-exam-card"><div class="sp-round">${e.round}회</div><div><h3>${esc(e.examTitle||e.examId)}</h3><p>정답 ${e.correct} · 오답 ${e.wrong} · 미기입 ${e.blank} · 동일 시험 평균 ${fmt(e.cohortAverage)}점 · ${e.rank||'—'}/${e.cohortTotal||'—'}등</p></div><div class="sp-exam-score"><strong>${fmt(e.score)}점</strong><a class="sp-btn" href="${esc(examLink(e))}">상세 성적표</a></div></article>`).join('')||'<div class="sp-empty">연결된 시험 결과가 없습니다.</div>'}</section><div class="sp-warning">${esc(data.identityNote||'학생 고정 링크는 소지자만 볼 수 있도록 비공개로 전달하세요.')}</div></main>`;
    document.getElementById('spCopy').addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(location.href);document.getElementById('spCopy').textContent='복사 완료';}
      catch(e){window.prompt('주소를 전체 선택하여 복사하세요.',location.href);}
    });
  }
  async function start(){
    const sid=params().get('sid');activeApi=apiUrl();
    if(!sid||!activeApi){app.innerHTML='<div class="sp-error"><h2>학생 링크를 확인해 주세요.</h2><p>학생 통합페이지 ID 또는 서버 주소가 없습니다.</p></div>';return;}
    try{render(await jsonp(activeApi,{action:'studentProfile',sid}));}
    catch(e){app.innerHTML=`<div class="sp-error"><h2>통합페이지를 불러오지 못했습니다.</h2><p>${esc(e.message)}</p><p>교사에게 링크 또는 서버 연결 상태를 확인해 달라고 요청하세요.</p></div>`;}
  }
  start();
})();
