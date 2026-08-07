(function () {
  'use strict';

  const core = window.TPLCore;
  const catalog = window.EXAM_CATALOG || [];
  const config = window.APP_CONFIG || {};
  const extraPractice = window.TPL_EXTRA_PRACTICE || {};
  const practiceByExam = window.TPL_EXTRA_PRACTICE_BY_EXAM || {};
  const SETTINGS_KEY = `${config.storageKey || 'tpl-score-report-records-v1'}-settings`;
  const app = document.getElementById('reportApp');
  const circled = ['', '①', '②', '③', '④', '⑤'];
  let currentSnapshot = null;
  let dataSource = 'link';
  let activeLink = null;
  let lastServerLoadAt = 0;
  let serverRefreshInFlight = null;
  let practiceEventsBound = false;

  const esc = core.escapeHtml;
  const fmt = core.formatScore;
  const clamp = (value) => core.clamp(Number(value || 0), 0, 100);

  function jsonp(url, params, timeout = config.backendTimeoutMs || 15000) {
    return new Promise((resolve, reject) => {
      if (!url) { reject(new Error('서버 주소가 없습니다.')); return; }
      const callback = `_tpl_report_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const timer = setTimeout(() => { cleanup(); reject(new Error('서버 응답 시간이 초과되었습니다.')); }, timeout);
      function cleanup() { clearTimeout(timer); script.remove(); try { delete window[callback]; } catch (error) { window[callback] = undefined; } }
      window[callback] = (response) => {
        cleanup();
        if (response && response.ok === false) reject(new Error(response.error || '서버 요청 실패'));
        else resolve(response || {});
      };
      const target = new URL(url);
      Object.entries(params || {}).forEach(([key, value]) => target.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value)));
      target.searchParams.set('callback', callback); target.searchParams.set('_', String(Date.now()));
      script.src = target.href; script.async = true;
      script.onerror = () => { cleanup(); reject(new Error('Apps Script 서버에 연결하지 못했습니다.')); };
      document.head.appendChild(script);
    });
  }

  function savedBackendUrl() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return String(saved.backendUrl || '').trim();
    } catch (error) {
      return '';
    }
  }

  function parseLink() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    let id = params.get(config.serverHashKey || 'id') || '';
    const api = params.get('api') || config.backendUrl || savedBackendUrl() || '';
    const expectedFingerprint = params.get('k') || '';
    const encoded = params.get(config.reportHashKey || 'report') || '';
    let fallback = null;
    let migratedFromFallback = false;
    if (encoded) {
      try { fallback = core.decodePayload(encoded); }
      catch (error) { console.warn('링크 백업을 해석하지 못했습니다.', error); }
    }

    // 예전 #report= 정적 링크 안에 Apps Script 토큰이 남아 있으면
    // 자동으로 서버 조회 링크처럼 처리하여 기존 링크도 최신 이력으로 전환한다.
    if (!id && fallback?.record) {
      const candidate = String(fallback.record.serverId || fallback.record.id || '').trim();
      if (/^[A-Fa-f0-9]{24,64}$/.test(candidate) && api) {
        id = candidate;
        migratedFromFallback = true;
      }
    }
    return { id, api, fallback, migratedFromFallback, expectedFingerprint };
  }

  function assertLinkFingerprint(snapshot, link) {
    const expected = String(link?.expectedFingerprint || '').trim().toLowerCase();
    if (!expected || typeof core.identityFingerprint !== 'function') return;
    const actual = core.identityFingerprint(snapshot?.record || {}).toLowerCase();
    if (actual !== expected) {
      throw new Error('학생 링크와 서버의 학생 정보가 일치하지 않습니다. 다른 학생의 성적표가 표시되지 않도록 열람을 차단했습니다. 교사에게 새 링크를 요청해 주세요.');
    }
  }

  function questionStats(cohort) {
    return cohort?.questionStats || cohort?.questionRates || [];
  }

  function normalizeSnapshot(raw) {
    let source = raw?.report || raw?.snapshot || raw;
    if (!source?.record) throw new Error('성적 데이터가 없습니다.');
    const recordBase = {
      ...source.record,
      school: typeof core.normalizeSchool === 'function'
        ? core.normalizeSchool(source.record.school)
        : (core.normalizeText(source.record.school) || '미입력')
    };
    const exam = core.getExam(catalog, recordBase.examId);
    if (!exam) throw new Error(`등록되지 않은 시험입니다: ${recordBase.examId}`);
    const enriched = core.enrichRecord(catalog, recordBase);
    const cohort = source.cohort || source.stats || core.computeCohortStats(catalog, [recordBase], recordBase.examId, recordBase);
    const history = Array.isArray(source.history) && source.history.length ? source.history : [enriched];
    const analysis = source.analysis || core.generateAnalysis(exam, enriched, cohort, history);
    return {
      version: source.version || 1,
      generatedAt: source.generatedAt || new Date().toISOString(),
      record: { ...recordBase, ...enriched },
      cohort,
      history,
      analysis
    };
  }

  function statusLabel(status) { return status === 'correct' ? '정답' : status === 'wrong' ? '오답' : '미기입'; }
  function answerLabel(answer) { return answer === '' || answer == null ? '—' : (circled[Number(answer)] || String(answer)); }
  function practiceFor(questionNo) {
    const examId = currentSnapshot?.record?.examId || '';
    return practiceByExam[examId]?.[questionNo] || (examId === 'tpl-mid-01' ? extraPractice[questionNo] : null);
  }
  function questionImage(exam, question) {
    return question.image || `assets/questions/${exam.id === 'tpl-mid-01' ? '' : `${exam.id}/`}q${String(question.no).padStart(2,'0')}.webp`;
  }
  function signed(value) { const n = Number(value || 0); return `${n > 0 ? '+' : ''}${fmt(n)}`; }

  function sourceLabel(snapshot) {
    const count = Number(snapshot.cohort?.total || 0);
    if (dataSource === 'server') return `동일 시험 전체 응시 데이터 · ${count}명`;
    return `링크 생성 시점 데이터 · ${count}명`;
  }

  function toolbar(snapshot) {
    return `<header class="report-toolbar no-print"><div class="report-toolbar__inner">
      <a class="brand report-brand" href="./" aria-label="Young's Physics 입력 화면"><img class="brand__logo" src="assets/youngs-physics-logo.png" alt="Young's Physics"><span class="brand__descriptor">${esc(snapshot.record.name)} 학생 리포트</span></a>
      <nav class="report-top-nav" aria-label="리포트 메뉴"><a class="report-top-nav__link is-active" href="#dashboard">대시보드</a><a class="report-top-nav__link" href="#scorecard">성적 분석</a><a class="report-top-nav__link" href="#learning-analysis">강점·취약점</a><a class="report-top-nav__link" href="#question-analysis">문항 분석</a><a class="report-top-nav__link" href="#wrong-answer-learning">오답 학습</a></nav>
      <div class="report-toolbar__buttons">${dataSource === 'server' ? '<button class="btn btn--soft btn--small report-refresh-btn" id="refreshReport" title="Google Sheet에서 최신 분석 다시 불러오기"><span class="btn-symbol">↻</span><span>최신 분석</span></button>' : ''}<button class="btn btn--soft btn--small" id="copyLink" title="링크 복사"><span class="btn-symbol">↗</span><span>링크 복사</span></button><button class="btn btn--secondary report-export-btn" id="wordButton" title="화면 그대로 Word(.docx) 저장"><span class="btn-symbol">W</span><span>Word(.docx) 저장</span></button><button class="btn btn--primary report-export-btn" id="printButton" title="PDF 저장 또는 인쇄"><span class="btn-symbol">PDF</span><span>PDF·인쇄</span></button></div>
    </div></header>`;
  }

  function reportSidebar(snapshot) {
    const r = snapshot.record;
    return `<aside class="report-sidebar no-print" aria-label="학생 리포트 바로가기">
      <div class="report-sidebar__student"><div class="report-sidebar__avatar"><img src="assets/youngs-physics-mark.png" alt=""></div><div><strong>${esc(r.name)} 학생</strong><span>${esc(r.school)}</span></div></div>
      <nav class="side-nav report-side-nav">
        <a class="side-nav__link is-active" href="#dashboard"><span class="side-nav__icon">⌂</span><span>종합 성적표</span></a>
        <a class="side-nav__link" href="#scorecard"><span class="side-nav__icon">▥</span><span>성적 비교</span></a>
        <a class="side-nav__link" href="#learning-analysis"><span class="side-nav__icon">◎</span><span>강점·취약점</span></a>
        <a class="side-nav__link" href="#question-analysis"><span class="side-nav__icon">▤</span><span>문항 분석</span></a>
        <a class="side-nav__link" href="#wrong-answer-learning"><span class="side-nav__icon">✎</span><span>오답 학습</span></a>
      </nav>
      <div class="report-sidebar__divider"></div>
      <p class="report-sidebar__label">학습</p>
      <a class="side-nav__link" href="#wrong-answer-learning"><span class="side-nav__icon">✓</span><span>동형 문제 풀기</span></a>
      <div class="report-sidebar__orbit" aria-hidden="true"></div>
      <p class="teacher-sidebar__foot">YOUNG'S PHYSICS</p>
    </aside>`;
  }

  function cover(snapshot, exam) {
    const r = snapshot.record;
    const c = snapshot.cohort || {};
    const total = Number(c.total || 1);
    const topRate = c.rank && total ? core.round(Number(c.rank) / total * 100, 1) : null;
    const percentile = topRate == null ? '비교 데이터 준비 중' : `상위 ${fmt(topRate)}%`;
    return `<section id="dashboard" class="report-section report-cover anchor-section">
      <div class="report-cover__date">리포트 생성일 ${esc(core.formatDate(snapshot.generatedAt))}</div>
      <div class="report-cover__profile">
        <div class="report-cover__avatar"><img src="assets/youngs-physics-mark.png" alt=""></div>
        <div class="report-cover__identity"><p class="report-kicker">YOUNG'S PHYSICS · PERSONAL SCORE REPORT</p><h1>${esc(r.name)} <span>학생</span></h1><div class="report-cover__tags"><span>${esc(r.school)}</span><span>${esc(exam.title)}</span><span>${esc(sourceLabel(snapshot))}</span></div></div>
      </div>
      <div class="report-cover__metrics">
        <div class="cover-metric"><span>총점</span><strong>${fmt(r.score)}<small>/100</small></strong><em>${percentile}</em></div>
        <div class="cover-metric"><span>정답률</span><strong>${fmt(r.correct / exam.answerCount * 100)}<small>%</small></strong><em>정답 ${r.correct} · 오답 ${r.wrong} · 미기입 ${r.blank}</em></div>
        <div class="cover-metric"><span>전체 평균</span><strong>${fmt(c.average || 0)}<small>점</small></strong><em>${total}명 비교 기준</em></div>
      </div>
      <div class="report-cover__foot">점수 확인부터 오답 해설·필수 공식·같은 풀이 방식의 동형 문제까지 한 페이지에서 학습합니다.</div>
    </section>`;
  }

  function scoreComparisonBars(snapshot) {
    const r = snapshot.record, c = snapshot.cohort || {};
    const rows = [
      ['학생 점수', r.score, 'var(--brand)'],
      ['전체 평균', c.average || 0, '#8da1b6'],
      ['중앙값', c.median || 0, '#b0bdca'],
      ['최고점', c.topScore || r.score, 'var(--brand-2)']
    ];
    return `<div class="domain-list">${rows.map(([label,value,color]) => `<div class="domain-row"><span class="domain-row__name">${label}</span><div class="domain-row__bars"><div class="progress"><div class="progress__bar" style="width:${clamp(value)}%;background:${color}"></div></div></div><span class="domain-row__value">${fmt(value)}</span></div>`).join('')}</div>`;
  }

  function histogramSvg(snapshot) {
    const bins = snapshot.cohort?.distribution || core.distribution(snapshot.cohort?.scores || [snapshot.record.score]);
    const width=500, height=220, left=34, right=12, top=18, bottom=46;
    const plotW=width-left-right, plotH=height-top-bottom, gap=12, barW=(plotW-gap*(bins.length-1))/bins.length;
    const max=Math.max(1,...bins.map((bin)=>Number(bin.count||0)));
    const current=Number(snapshot.record.score);
    let currentIndex=bins.findIndex((bin)=>current>=bin.min&&current<=bin.max);
    if(currentIndex<0)currentIndex=0;
    const bars=bins.map((bin,index)=>{
      const h=plotH*(Number(bin.count||0)/max), x=left+index*(barW+gap), y=top+plotH-h;
      const fill=index===currentIndex?'#063b8f':'#b8c4d1';
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" fill="${fill}"/><text x="${x+barW/2}" y="${Math.max(12,y-6)}" text-anchor="middle" font-size="10" font-weight="800" fill="#405067">${bin.count}</text><text x="${x+barW/2}" y="${height-24}" text-anchor="middle" font-size="9" fill="#6c788a">${esc(bin.label)}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="전체 점수 분포"><line x1="${left}" x2="${width-right}" y1="${top+plotH}" y2="${top+plotH}" stroke="#dce3eb"/>${bars}<text x="${left}" y="${height-5}" font-size="9" fill="#778397">진한 막대는 학생 점수가 속한 구간</text></svg>`;
  }

  function domainRows(snapshot, exam) {
    let rows = snapshot.cohort?.domainAverages || [];
    if (!rows.length) {
      const cohortMap = new Map();
      (snapshot.record.domainStats || []).forEach((item)=>cohortMap.set(item.domain,item.accuracy));
      rows = [...new Set(exam.questions.map(q=>q.domain))].map(domain=>({domain,average:cohortMap.get(domain)||0,student:cohortMap.get(domain)||0}));
    }
    const studentMap=new Map((snapshot.record.domainStats||[]).map(item=>[item.domain,item.accuracy]));
    return `<div class="domain-list">${rows.map((item)=>{
      const student=item.student==null?(studentMap.get(item.domain)||0):item.student;
      return `<div class="domain-row"><span class="domain-row__name">${esc(item.domain)}</span><div class="domain-row__bars"><div class="progress"><div class="progress__bar" style="width:${clamp(student)}%"></div></div><div class="progress progress--cohort"><div class="progress__bar" style="width:${clamp(item.average)}%"></div></div></div><span class="domain-row__value">${fmt(student)}%</span></div>`;
    }).join('')}</div><div class="chart-legend"><span><i class="legend-dot" style="background:var(--brand)"></i>학생 정답률</span><span><i class="legend-dot" style="background:#aab8c8"></i>전체 평균</span></div>`;
  }

  function trendSvg(snapshot) {
    const history=(snapshot.history||[]).slice().sort((a,b)=>Number(a.round||0)-Number(b.round||0));
    if(history.length<2)return `<div class="empty-state" style="padding:45px 10px"><div class="empty-state__mark">↗</div><strong>이전 회차가 아직 없습니다.</strong><span>같은 학교·이름으로 다음 회차를 저장하면 점수 추세가 자동으로 연결됩니다.</span></div>`;
    const width=500,height=220,left=42,right=24,top=24,bottom=38,plotW=width-left-right,plotH=height-top-bottom;
    const x=(i)=>left+(history.length===1?plotW/2:i*plotW/(history.length-1));
    const y=(score)=>top+plotH-(Math.max(-25,Math.min(100,Number(score)) +25)/125)*plotH;
    const points=history.map((item,i)=>`${x(i)},${y(item.score)}`).join(' ');
    const grid=[0,25,50,75,100].map(v=>{const yy=y(v);return `<line x1="${left}" x2="${width-right}" y1="${yy}" y2="${yy}" stroke="#e5eaf0"/><text x="${left-8}" y="${yy+3}" text-anchor="end" font-size="9" fill="#7b8798">${v}</text>`;}).join('');
    const dots=history.map((item,i)=>`<circle cx="${x(i)}" cy="${y(item.score)}" r="5" fill="#063b8f"/><text x="${x(i)}" y="${y(item.score)-11}" text-anchor="middle" font-size="10" font-weight="800" fill="#063b8f">${fmt(item.score)}</text><text x="${x(i)}" y="${height-12}" text-anchor="middle" font-size="9" fill="#6b7789">${item.round}회</text>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="이전 회차 점수 추세">${grid}<polyline points="${points}" fill="none" stroke="#0875ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
  }

  function scoreSection(snapshot, exam) {
    const r=snapshot.record,c=snapshot.cohort||{}, total=Number(c.total||1);
    const rank=c.rank?`${c.rank} / ${total}`:'—';
    const topRate=c.rank&&total?core.round(Number(c.rank)/total*100,1):null;
    const percentile=topRate!=null?`상위 ${fmt(topRate)}%`:'—';
    const comparisonCaution=total<2?'현재 비교 집단이 학생 본인 1명뿐이므로 평균·정답률은 참고용입니다. 다른 학생 기록이 누적되면 자동 갱신됩니다.':`${total}명의 같은 시험 기록을 기준으로 계산했습니다.`;
    return `<section id="scorecard" class="report-section anchor-section"><div class="section-heading"><div><p class="section-kicker">01 · SCORECARD</p><h2 class="section-title">성적표와 전체 성적 비교</h2><p class="section-desc">정답·오답·미기입을 채점 규칙에 따라 분리하고 동일 시험 집단과 비교합니다.</p></div><span class="tag">${esc(sourceLabel(snapshot))}</span></div>
      <div class="score-hero"><div class="score-main"><div class="score-main__label">TOTAL SCORE</div><div class="score-main__value">${fmt(r.score)}<small>/100</small></div><div class="score-main__meta">정답 ${r.correct}개 × 5점 · 오답 ${r.wrong}개 × -1.25점 · 미기입 ${r.blank}개 × 0점</div></div><div class="score-cards"><div class="score-card"><span class="score-card__label">전체 평균</span><strong class="score-card__value">${fmt(c.average)}점</strong><span class="score-card__hint">학생 대비 ${signed(r.score-(c.average||0))}점</span></div><div class="score-card"><span class="score-card__label">석차</span><strong class="score-card__value">${rank}</strong><span class="score-card__hint">동점자는 같은 순위</span></div><div class="score-card"><span class="score-card__label">상위 비율</span><strong class="score-card__value">${percentile}</strong><span class="score-card__hint">누적 집단 기준</span></div><div class="score-card"><span class="score-card__label">정답</span><strong class="score-card__value" style="color:var(--good)">${r.correct}</strong><span class="score-card__hint">획득 ${r.correct*exam.correctScore}점</span></div><div class="score-card"><span class="score-card__label">오답</span><strong class="score-card__value" style="color:var(--bad)">${r.wrong}</strong><span class="score-card__hint">감점 ${fmt(Math.abs(r.wrong*exam.wrongScore))}점</span></div><div class="score-card"><span class="score-card__label">미기입</span><strong class="score-card__value" style="color:var(--blank)">${r.blank}</strong><span class="score-card__hint">감점 없음</span></div></div></div>
      <div class="notice"><strong>비교 기준</strong> ${esc(comparisonCaution)}</div>
      <div class="chart-grid"><div class="chart-card"><h3>점수 기준 비교</h3><p>학생 점수, 평균, 중앙값, 최고점을 100점 척도로 표시합니다.</p>${scoreComparisonBars(snapshot)}</div><div class="chart-card"><h3>전체 점수 분포</h3><p>동일 시험 응시 기록을 점수 구간별로 집계했습니다.</p><div class="chart-box">${histogramSvg(snapshot)}</div></div><div class="chart-card"><h3>대단원별 정답률</h3><p>굵은 막대는 학생, 가는 막대는 전체 평균입니다.</p>${domainRows(snapshot,exam)}</div><div class="chart-card"><h3>이전 회차 점수 추세</h3><p>같은 학교·이름으로 누적된 회차를 연결합니다.</p><div class="chart-box">${trendSvg(snapshot)}</div></div></div>
    </section>`;
  }

  function analysisSection(snapshot, exam) {
    const a=snapshot.analysis||{};
    const stats=questionStats(snapshot.cohort);
    const results=snapshot.record.questionResults||core.grade(exam,snapshot.record.answers).questionResults;
    const easyMisses=results.filter(item=>item.status!=='correct'&&Number(stats[item.no-1]?.accuracy||stats[item.no-1]?.rate||0)>=70).map(item=>item.no);
    const hardWins=results.filter(item=>item.status==='correct'&&Number(stats[item.no-1]?.accuracy||stats[item.no-1]?.rate||100)<=40).map(item=>item.no);
    const comments=[...(a.comments||[])];
    if(easyMisses.length)comments.push(`전체 정답률 70% 이상인데 놓친 ${easyMisses.join(', ')}번은 조건 누락·선택지 검토 부족 가능성이 큽니다. 개념 복습 뒤 풀이 과정을 짧게 기록해 다시 확인하세요.`);
    if(hardWins.length)comments.push(`정답률 40% 이하의 ${hardWins.join(', ')}번을 맞혔습니다. 복합 조건을 끝까지 해석한 점이 강점입니다.`);
    const history=(snapshot.history||[]).slice().sort((x,y)=>Number(x.round||0)-Number(y.round||0));
    return `<section id="learning-analysis" class="report-section page-break-before anchor-section"><div class="section-heading"><div><p class="section-kicker">02 · LEARNING ANALYSIS</p><h2 class="section-title">강점·취약점과 학습 코멘트</h2><p class="section-desc">이번 회차의 단원별 결과와 동일 학생의 이전 회차를 함께 고려했습니다.</p></div></div>
      <div class="analysis-grid"><div class="analysis-card analysis-card--good"><div class="analysis-card__icon">+</div><h3>강점</h3><p>${esc(a.strengthText||'현재 결과에서 상대적으로 높은 단원을 확인하세요.')}</p>${(a.strengths||[]).length?`<div class="tag-list">${a.strengths.map(item=>`<span class="tag">${esc(item.domain)} ${fmt(item.accuracy)}%</span>`).join('')}</div>`:''}</div><div class="analysis-card analysis-card--bad"><div class="analysis-card__icon">!</div><h3>취약점</h3><p>${esc(a.weaknessText||'오답·미기입 문항을 중심으로 기본 개념을 보완하세요.')}</p>${(a.weaknesses||[]).length?`<div class="tag-list">${a.weaknesses.map(item=>`<span class="tag">${esc(item.domain)} ${fmt(item.accuracy)}%</span>`).join('')}</div>`:''}</div><div class="analysis-card"><div class="analysis-card__icon">↗</div><h3>이전 회차 변화</h3><p>${esc(a.trendText||'현재 회차를 기준점으로 삼습니다.')}</p></div><div class="analysis-card"><div class="analysis-card__icon">◎</div><h3>우선 복습 문항</h3><p>${(a.weakestTopics||[]).length?esc(a.weakestTopics.join(' · ')):'오답과 미기입이 없어 전 범위 고난도 변형으로 확장할 수 있습니다.'}</p></div><div class="analysis-card analysis-card--wide"><div class="analysis-card__icon">✎</div><h3>교사형 자동 코멘트</h3><ul class="comment-list">${comments.map(comment=>`<li>${esc(comment)}</li>`).join('')}</ul></div></div>
      <div class="chart-card history-card" style="margin-top:20px"><h3>동일 학생 회차별 기록</h3><p>회차별 점수와 정오·미기입 수를 확인할 수 있습니다.</p>${history.length?`<div class="table-wrap"><table class="history-table"><thead><tr><th>회차</th><th>시험</th><th>점수</th><th>정답</th><th>오답</th><th>미기입</th></tr></thead><tbody>${history.map(item=>`<tr><td>${item.round}회</td><td>${esc(item.examTitle||item.examId)}</td><td><strong>${fmt(item.score)}</strong></td><td>${item.correct}</td><td>${item.wrong}</td><td>${item.blank}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state">이전 회차 데이터가 없습니다.</div>'}</div>
    </section>`;
  }

  function questionSection(snapshot, exam) {
    const results=snapshot.record.questionResults||core.grade(exam,snapshot.record.answers).questionResults;
    const stats=questionStats(snapshot.cohort);
    return `<section id="question-analysis" class="report-section page-break-before anchor-section"><div class="section-heading"><div><p class="section-kicker">03 · QUESTION ANALYSIS</p><h2 class="section-title">문항별 정오표·단원·정답률</h2><p class="section-desc">문항 단원과 학생 답, 공식 답, 배점, 전체 정답률을 한 표로 정리했습니다.</p></div></div><div class="question-summary">${results.map(item=>`<span class="q-chip ${item.status}" title="${item.no}번 ${statusLabel(item.status)}">${item.no}</span>`).join('')}</div><div class="table-wrap"><table class="report-table"><thead><tr><th>문항</th><th>대단원</th><th>세부 단원</th><th>학생 답</th><th>정답</th><th>결과</th><th>배점</th><th>전체 정답률</th></tr></thead><tbody>${results.map((item,index)=>{
      const q=exam.questions[index]; const rate=Number(stats[index]?.accuracy??stats[index]?.rate??0);
      return `<tr><td><strong>${item.no}</strong>${q.sourceNote?'<span title="원문 검토 메모" style="color:var(--accent);margin-left:4px">●</span>':''}</td><td>${esc(q.domain)}</td><td>${esc(q.unit)}</td><td>${answerLabel(item.answer)}</td><td>${answerLabel(item.key)}</td><td><span class="status-badge ${item.status}">${statusLabel(item.status)}</span></td><td style="color:${item.points<0?'var(--bad)':item.points>0?'var(--good)':'var(--blank)'};font-weight:800">${signed(item.points)}</td><td><div class="accuracy-meter"><div class="accuracy-meter__track"><div class="accuracy-meter__bar" style="width:${clamp(rate)}%"></div></div><span>${fmt(rate)}%</span></div></td></tr>`;
    }).join('')}</tbody></table></div><div class="notice question-rate-note"><strong>정답률 해석</strong> Google Sheet 모드에서는 누적 응시자 전체, 브라우저 모드에서는 링크를 만들 때 같은 기기에 저장되어 있던 응시자 기록을 기준으로 합니다.</div></section>`;
  }


  function practiceQuiz(problem, questionNo) {
    if (!problem || !Array.isArray(problem.choices) || problem.choices.length !== 5 || !Number.isInteger(Number(problem.correct))) {
      return '<div class="notice"><strong>동형 문제 준비 중</strong> 이 문항의 연습 문제 데이터를 확인해 주세요.</div>';
    }
    const correct = Number(problem.correct);
    const options = problem.choices.map((choice, index) => {
      const value = index + 1;
      return `<label class="practice-option" data-choice="${value}"><input type="radio" name="practice-${questionNo}" value="${value}"><span class="practice-option__mark">${circled[value]}</span><span class="practice-option__text">${esc(choice)}</span></label>`;
    }).join('');
    return `<section class="practice-quiz" data-question-no="${questionNo}"><div class="practice-quiz__head"><div><p class="practice-quiz__eyebrow">SAME METHOD · ONE MORE</p><h4>같은 풀이로 한 문제 더</h4></div><span class="practice-quiz__status">미풀이</span></div><p class="practice-quiz__title">${esc(problem.title || `${questionNo}번 동형 문제`)}</p><p class="practice-quiz__origin">첨부 문항의 풀이 구조를 바탕으로 새로 만든 학습용 문제입니다. 선택지를 고르면 채점 결과와 해설이 공개됩니다.</p><p class="practice-quiz__prompt">${esc(problem.prompt)}</p><fieldset class="practice-options"><legend class="sr-only">${questionNo}번 동형 문제 선택지</legend>${options}</fieldset><div class="practice-actions no-print"><button type="button" class="btn btn--soft btn--small" data-practice-action="hint">힌트 보기</button><button type="button" class="btn btn--ghost btn--small practice-reset" data-practice-action="reset">다시 풀기</button></div><div class="practice-feedback no-print" aria-live="polite"></div><div class="practice-hint"><strong>힌트</strong><p>${esc(problem.hint)}</p></div><div class="practice-solution"><div class="practice-solution__answer"><strong>정답</strong><span>${circled[correct]} ${esc(problem.choices[correct - 1])}</span></div><p><strong>같은 풀이 방식</strong><br>${esc(problem.method)}</p><p><strong>풀이</strong><br>${esc(problem.solution)}</p></div></section>`;
  }

  function reviewCard(item, question, exam) {
    const practice = practiceFor(question.no);
    const imageSrc = questionImage(exam, question);
    const solutionPdf = exam.solutionPdf || 'assets/TPL_중급_모의고사_1회_해설.pdf';
    return `<article class="review-card ${item.status==='blank'?'is-blank':''}"><div class="review-card__head"><div class="review-card__title"><span class="review-card__no">${question.no}</span><div><strong>${esc(question.unit)}</strong><span>${esc(question.topic)}</span></div></div><div class="review-card__answers">학생 답 <strong>${answerLabel(item.answer)}</strong><br>정답 <b>${answerLabel(item.key)}</b></div></div><div class="review-card__body"><img class="question-image" src="${esc(imageSrc)}" alt="${question.no}번 원문 문제"><div class="review-columns"><div class="review-block"><h4>해설</h4><p>${esc(question.officialSummary)}</p></div><div class="review-block"><h4>필요한 공식</h4><ul class="formula-list">${(question.formulas||[]).map(formula=>`<li>${esc(formula)}</li>`).join('')}</ul></div></div><div class="review-block" style="margin-top:14px"><h4>다시 풀 때 확인할 점</h4><p>${esc(question.checkPoint||'조건과 적용 법칙을 한 줄로 정리한 뒤 계산하세요.')}</p></div>${question.sourceNote?`<div class="source-note"><strong>원문 확인 필요</strong><br>${esc(question.sourceNote)}</div>`:''}${practiceQuiz(practice, question.no)}<div class="review-source-link"><a href="${esc(solutionPdf)}" target="_blank" rel="noopener">${esc(exam.shortTitle || exam.title)} 공식 해설 PDF 열기 ↗</a></div></div></article>`;
  }

  function reviewSection(snapshot, exam) {
    const results=snapshot.record.questionResults||core.grade(exam,snapshot.record.answers).questionResults;
    const needs=results.filter(item=>item.status!=='correct');
    return `<section id="wrong-answer-learning" class="report-section page-break-before anchor-section"><div class="section-heading"><div><p class="section-kicker">04 · WRONG ANSWER CLINIC</p><h2 class="section-title">오답·미기입 해설과 직접 푸는 동형 문제</h2><p class="section-desc">각 학습 대상 문항마다 원문 해설과 공식을 확인한 뒤, 같은 풀이 방식을 사용하는 새 문제를 1문제씩 직접 풀고 즉시 채점할 수 있습니다.</p></div><span class="tag">학습 대상 ${needs.length}문항</span></div>${needs.length?`<div class="review-list">${needs.map(item=>reviewCard(item,exam.questions[item.no-1],exam)).join('')}</div>`:`<div class="analysis-card analysis-card--good" style="text-align:center;padding:45px"><div class="analysis-card__icon" style="margin:auto">✓</div><h3>전 문항 정답입니다.</h3><p>이번 회차의 오답 학습 대상은 없습니다. 다음 회차에서 틀린 문항이 생기면 같은 풀이 방식의 동형 문제가 자동으로 제공됩니다.</p></div>`}</section>`;
  }

  function footer(snapshot, exam) {
    return `<footer class="report-footer"><div class="report-footer__brand"><img src="assets/youngs-physics-mark.png" alt=""><div><strong>Young's Physics</strong><span>Exploring the laws of nature, empowering the future.</span></div></div><p><strong>자료 기준</strong> ${esc(exam.sourceNotice)}<br><br>본 리포트는 입력 답안과 등록된 응시 기록을 이용한 자동 학습 보조 자료입니다. 결과 링크는 암호화된 비밀 문서가 아니므로 학생 개인정보가 외부에 공개되지 않도록 관리하세요. · ${esc(config.footerNote||'')}</p></footer>`;
  }

  function reportDocument(snapshot) {
    const exam=core.getExam(catalog,snapshot.record.examId);
    document.title=`${snapshot.record.name} · ${exam.title} 성적 리포트`;
    return `<main id="reportDocument" class="report-document">${cover(snapshot,exam)}${scoreSection(snapshot,exam)}${analysisSection(snapshot,exam)}${questionSection(snapshot,exam)}${reviewSection(snapshot,exam)}${footer(snapshot,exam)}</main>`;
  }

  function practiceRecordKey() {
    const record = currentSnapshot?.record || {};
    return String(record.id || `${record.examId || 'exam'}|${record.school || ''}|${record.name || ''}`);
  }

  function practiceStorageKey(questionNo) {
    return `tpl-practice-v2:${practiceRecordKey()}:${questionNo}`;
  }

  function emptyPracticeState() {
    return { selected: 0, attempts: 0, solved: false, revealed: false, hintVisible: false, wrongChoices: [] };
  }

  function normalizePracticeState(raw) {
    const base = emptyPracticeState();
    if (!raw || typeof raw !== 'object') return base;
    const selected = Number(raw.selected || 0);
    const wrongChoices = Array.isArray(raw.wrongChoices)
      ? [...new Set(raw.wrongChoices.map(Number).filter((value) => value >= 1 && value <= 5))]
      : [];
    return {
      selected: selected >= 1 && selected <= 5 ? selected : 0,
      attempts: Math.max(0, Number(raw.attempts || 0)),
      solved: Boolean(raw.solved),
      revealed: Boolean(raw.revealed || raw.solved),
      hintVisible: Boolean(raw.hintVisible),
      wrongChoices
    };
  }

  function readPracticeState(questionNo) {
    try {
      return normalizePracticeState(JSON.parse(localStorage.getItem(practiceStorageKey(questionNo)) || 'null'));
    } catch (error) {
      console.warn('동형 문제 풀이 기록을 읽지 못했습니다.', error);
      return emptyPracticeState();
    }
  }

  function writePracticeState(questionNo, state) {
    try { localStorage.setItem(practiceStorageKey(questionNo), JSON.stringify(normalizePracticeState(state))); }
    catch (error) { console.warn('동형 문제 풀이 기록을 저장하지 못했습니다.', error); }
  }

  function clearPracticeState(questionNo) {
    try { localStorage.removeItem(practiceStorageKey(questionNo)); }
    catch (error) { console.warn('동형 문제 풀이 기록을 초기화하지 못했습니다.', error); }
  }

  function setPracticeFeedback(quiz, message, type='info') {
    const feedback = quiz.querySelector('.practice-feedback');
    if (!feedback) return;
    feedback.className = `practice-feedback no-print ${message ? `is-${type}` : ''}`;
    feedback.textContent = message || '';
  }

  function applyPracticeState(quiz, state) {
    const questionNo = Number(quiz.dataset.questionNo);
    const problem = practiceFor(questionNo);
    if (!problem) return;
    const normalized = normalizePracticeState(state);
    quiz.classList.toggle('is-hint-visible', normalized.hintVisible);
    quiz.classList.toggle('is-revealed', normalized.revealed);
    quiz.classList.toggle('is-solved', normalized.solved);
    quiz.classList.toggle('has-progress', normalized.attempts > 0 || normalized.revealed || normalized.hintVisible);

    quiz.querySelectorAll('.practice-option').forEach((label) => {
      const choice = Number(label.dataset.choice);
      const input = label.querySelector('input');
      if (input) {
        input.checked = choice === normalized.selected;
        input.disabled = normalized.revealed || normalized.solved;
      }
      label.classList.toggle('is-selected', choice === normalized.selected);
      label.classList.toggle('is-wrong', normalized.wrongChoices.includes(choice));
      label.classList.toggle('is-correct', (normalized.revealed || normalized.solved) && choice === Number(problem.correct));
    });

    const status = quiz.querySelector('.practice-quiz__status');
    if (status) {
      if (normalized.solved) status.textContent = `정답 · ${normalized.attempts}회 시도`;
      else if (normalized.revealed) status.textContent = '풀이 확인';
      else if (normalized.attempts > 0) status.textContent = `${normalized.attempts}회 시도 중`;
      else status.textContent = '미풀이';
    }

    const hintButton = quiz.querySelector('[data-practice-action="hint"]');
    if (hintButton) hintButton.textContent = normalized.hintVisible ? '힌트 닫기' : '힌트 보기';

    if (normalized.solved) {
      setPracticeFeedback(quiz, '정답입니다. 선택한 답과 풀이를 확인해 보세요.', 'good');
    } else if (normalized.revealed && normalized.selected) {
      setPracticeFeedback(quiz, '오답입니다. 표시된 정답과 해설을 확인한 뒤 다시 풀어보세요.', 'bad');
    } else if (normalized.revealed) {
      setPracticeFeedback(quiz, '정답과 풀이를 확인했습니다.', 'info');
    } else {
      setPracticeFeedback(quiz, '');
    }
  }

  function bindPracticeQuizzes() {
    app.querySelectorAll('.practice-quiz').forEach((quiz) => applyPracticeState(quiz, readPracticeState(Number(quiz.dataset.questionNo))));
    if (practiceEventsBound) return;
    practiceEventsBound = true;

    app.addEventListener('change', (event) => {
      const input = event.target.closest('.practice-option input');
      if (!input) return;
      const quiz = input.closest('.practice-quiz');
      const questionNo = Number(quiz.dataset.questionNo);
      const state = readPracticeState(questionNo);
      if (state.revealed || state.solved) return;
      const selected = Number(input.value);
      const problem = practiceFor(questionNo);
      state.selected = selected;
      state.attempts += 1;
      state.solved = selected === Number(problem.correct);
      state.revealed = true;
      if (!state.solved) state.wrongChoices = [...new Set([...state.wrongChoices, selected])];
      writePracticeState(questionNo, state);
      applyPracticeState(quiz, state);
    });

    app.addEventListener('click', (event) => {
      const button = event.target.closest('[data-practice-action]');
      if (!button) return;
      const quiz = button.closest('.practice-quiz');
      if (!quiz) return;
      const questionNo = Number(quiz.dataset.questionNo);
      const problem = practiceFor(questionNo);
      if (!problem) return;
      let state = readPracticeState(questionNo);
      const action = button.dataset.practiceAction;
      if (action === 'hint') {
        state.hintVisible = !state.hintVisible;
      } else if (action === 'reset') {
        clearPracticeState(questionNo);
        state = emptyPracticeState();
      }

      writePracticeState(questionNo, state);
      applyPracticeState(quiz, state);
    });
  }

  async function fetchLatestServerSnapshot(options = {}) {
    const { silent = false, force = false } = options;
    if (!activeLink?.id || !activeLink?.api) return false;
    if (!force && Date.now() - lastServerLoadAt < 3000) return false;
    if (serverRefreshInFlight) return serverRefreshInFlight;

    const button = document.getElementById('refreshReport');
    const original = button?.innerHTML || '';
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="btn-symbol">↻</span><span>불러오는 중</span>';
    }

    serverRefreshInFlight = jsonp(activeLink.api, { action: 'get', id: activeLink.id })
      .then((response) => {
        const raw = response.report || response;
        const snapshot = normalizeSnapshot(raw);
        assertLinkFingerprint(snapshot, activeLink);
        dataSource = 'server';
        lastServerLoadAt = Date.now();
        render(snapshot);
        if (!silent) notify('Google Sheet에서 최신 성적과 이전 회차 분석을 다시 불러왔습니다.');
        return true;
      })
      .catch((error) => {
        console.warn('최신 성적 다시 불러오기 실패', error);
        if (!silent) alert(`최신 분석을 불러오지 못했습니다: ${error.message}`);
        return false;
      })
      .finally(() => {
        serverRefreshInFlight = null;
        const currentButton = document.getElementById('refreshReport');
        if (currentButton && original) {
          currentButton.disabled = false;
          currentButton.innerHTML = original;
        }
      });
    return serverRefreshInFlight;
  }

  function render(snapshot) {
    currentSnapshot=snapshot;
    app.innerHTML=toolbar(snapshot)+`<div class="report-workspace">${reportSidebar(snapshot)}${reportDocument(snapshot)}</div>`;
    document.getElementById('printButton').addEventListener('click',()=>window.print());
    document.getElementById('copyLink').addEventListener('click',async()=>{await copyText(location.href);notify('리포트 링크를 복사했습니다.');});
    document.getElementById('wordButton').addEventListener('click',downloadWord);
    document.getElementById('refreshReport')?.addEventListener('click',()=>fetchLatestServerSnapshot({ force: true }));
    bindPracticeQuizzes();
  }

  function notify(message) {
    const node=document.createElement('div'); node.className='toast good'; node.textContent=message;
    let stack=document.querySelector('.toast-stack'); if(!stack){stack=document.createElement('div');stack.className='toast-stack no-print';document.body.appendChild(stack);} stack.appendChild(node); setTimeout(()=>node.remove(),3200);
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ''));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  function xmlEscape(value) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function loadRasterImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 해석하지 못했습니다.')); };
      image.src = url;
    });
  }

  function placeholderAsset(message, width = 1400, height = 300) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4f7fb';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, width - 8, height - 8);
    ctx.fillStyle = '#445269';
    ctx.font = '700 32px "Malgun Gothic", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message || '이미지를 불러오지 못했습니다.', width / 2, height / 2);
    return { dataUrl: canvas.toDataURL('image/png'), mime: 'image/png', width, height };
  }

  async function imageToWordAsset(src, options = {}) {
    const absolute = new URL(src, document.baseURI || location.href).href;
    const response = await fetch(absolute, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`이미지 로드 실패 (${response.status})`);
    const image = await loadRasterImage(await response.blob());
    const sourceWidth = Math.max(1, Number(image.naturalWidth || image.width || 1));
    const sourceHeight = Math.max(1, Number(image.naturalHeight || image.height || 1));
    const maxWidth = Number(options.maxWidth || 1800);
    const maxHeight = Number(options.maxHeight || 2400);
    const ratio = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * ratio));
    const height = Math.max(1, Math.round(sourceHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, width, height);
    const useJpeg = options.format === 'jpeg';
    return {
      dataUrl: canvas.toDataURL(useJpeg ? 'image/jpeg' : 'image/png', useJpeg ? Number(options.quality || 0.9) : 1),
      mime: useJpeg ? 'image/jpeg' : 'image/png',
      width,
      height
    };
  }

  function makeChartCanvas(width = 1400, height = 720) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = 'middle';
    return { canvas, ctx };
  }

  function chartAsset(canvas) {
    return { dataUrl: canvas.toDataURL('image/png'), mime: 'image/png', width: canvas.width, height: canvas.height };
  }

  function drawChartTitle(ctx, title, subtitle, width) {
    ctx.fillStyle = '#16345d';
    ctx.font = '800 38px "Malgun Gothic", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 62, 60);
    ctx.fillStyle = '#68778b';
    ctx.font = '500 22px "Malgun Gothic", Arial, sans-serif';
    ctx.fillText(subtitle, 62, 102);
    ctx.strokeStyle = '#dbe4ef';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(62, 132);
    ctx.lineTo(width - 62, 132);
    ctx.stroke();
  }

  function drawRoundedRect(ctx, x, y, width, height, radius, fill) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function scoreComparisonChart(snapshot) {
    const { canvas, ctx } = makeChartCanvas(1400, 760);
    drawChartTitle(ctx, '점수 기준 비교', '학생 점수와 동일 시험 집단의 주요 통계', canvas.width);
    const c = snapshot.cohort || {};
    const rows = [
      ['학생 점수', Number(snapshot.record.score || 0), '#0875ff'],
      ['전체 평균', Number(c.average || 0), '#7fa6d8'],
      ['중앙값', Number(c.median || 0), '#a8b8ca'],
      ['최고점', Number(c.topScore || snapshot.record.score || 0), '#063b8f']
    ];
    const left = 105, right = 70, top = 185, bottom = 110;
    const plotW = canvas.width - left - right;
    const plotH = canvas.height - top - bottom;
    ctx.strokeStyle = '#dbe4ef';
    ctx.lineWidth = 2;
    [0, 25, 50, 75, 100].forEach((value) => {
      const y = top + plotH - (value / 100) * plotH;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(canvas.width - right, y); ctx.stroke();
      ctx.fillStyle = '#718096'; ctx.font = '500 20px Arial, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(String(value), left - 18, y);
    });
    const slot = plotW / rows.length;
    const barW = Math.min(145, slot * 0.48);
    rows.forEach(([label, raw, color], index) => {
      const value = Math.max(0, Math.min(100, raw));
      const x = left + slot * index + (slot - barW) / 2;
      const h = (value / 100) * plotH;
      const y = top + plotH - h;
      drawRoundedRect(ctx, x, y, barW, h, 14, color);
      ctx.fillStyle = '#16345d'; ctx.font = '800 25px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(fmt(raw), x + barW / 2, Math.max(top + 18, y - 25));
      ctx.fillStyle = '#42516a'; ctx.font = '700 23px "Malgun Gothic", Arial, sans-serif'; ctx.fillText(label, x + barW / 2, canvas.height - 62);
    });
    return chartAsset(canvas);
  }

  function histogramChart(snapshot) {
    const { canvas, ctx } = makeChartCanvas(1400, 760);
    drawChartTitle(ctx, '전체 점수 분포', '진한 막대는 학생 점수가 속한 점수 구간', canvas.width);
    const bins = Array.isArray(snapshot.cohort?.distribution) ? snapshot.cohort.distribution : [];
    const data = bins.length ? bins : [{ label: '전체', min: -25, max: 100, count: 1 }];
    const left = 90, right = 65, top = 185, bottom = 125;
    const plotW = canvas.width - left - right;
    const plotH = canvas.height - top - bottom;
    const gap = 22;
    const barW = Math.max(35, (plotW - gap * (data.length - 1)) / data.length);
    const maxCount = Math.max(1, ...data.map((item) => Number(item.count || 0)));
    const score = Number(snapshot.record.score || 0);
    let selected = data.findIndex((item) => score >= Number(item.min) && score <= Number(item.max));
    if (selected < 0) selected = 0;
    ctx.strokeStyle = '#dbe4ef'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(left, top + plotH); ctx.lineTo(canvas.width - right, top + plotH); ctx.stroke();
    data.forEach((item, index) => {
      const count = Number(item.count || 0);
      const h = (count / maxCount) * plotH;
      const x = left + index * (barW + gap);
      const y = top + plotH - h;
      drawRoundedRect(ctx, x, y, barW, Math.max(4, h), 10, index === selected ? '#063b8f' : '#b8c4d1');
      ctx.fillStyle = '#34455f'; ctx.font = '800 23px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(count), x + barW / 2, Math.max(top + 15, y - 24));
      ctx.fillStyle = '#59687b'; ctx.font = '600 18px "Malgun Gothic", Arial, sans-serif'; ctx.fillText(String(item.label || ''), x + barW / 2, canvas.height - 65);
    });
    return chartAsset(canvas);
  }

  function domainChart(snapshot, exam) {
    const rows = Array.isArray(snapshot.cohort?.domainAverages) && snapshot.cohort.domainAverages.length
      ? snapshot.cohort.domainAverages
      : (snapshot.record.domainStats || []).map((item) => ({ domain: item.domain, average: item.accuracy, student: item.accuracy }));
    const height = Math.max(600, 190 + rows.length * 92);
    const { canvas, ctx } = makeChartCanvas(1400, height);
    drawChartTitle(ctx, '대단원별 정답률', '파란색은 학생, 회색은 전체 평균', canvas.width);
    const studentMap = new Map((snapshot.record.domainStats || []).map((item) => [item.domain, Number(item.accuracy || 0)]));
    const labelX = 62, barX = 355, barW = 850, valueX = 1260;
    rows.forEach((item, index) => {
      const y = 190 + index * 92;
      const student = Number(item.student == null ? studentMap.get(item.domain) || 0 : item.student);
      const average = Number(item.average || 0);
      ctx.fillStyle = '#263b5a'; ctx.font = '700 22px "Malgun Gothic", Arial, sans-serif'; ctx.textAlign = 'left';
      const label = String(item.domain || '기타');
      ctx.fillText(label.length > 15 ? `${label.slice(0, 15)}…` : label, labelX, y + 26);
      drawRoundedRect(ctx, barX, y, barW, 25, 12, '#e7edf5');
      drawRoundedRect(ctx, barX, y, barW * Math.max(0, Math.min(100, student)) / 100, 25, 12, '#0875ff');
      drawRoundedRect(ctx, barX, y + 38, barW, 13, 7, '#edf1f5');
      drawRoundedRect(ctx, barX, y + 38, barW * Math.max(0, Math.min(100, average)) / 100, 13, 7, '#aab8c8');
      ctx.fillStyle = '#063b8f'; ctx.font = '800 22px Arial, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${fmt(student)}%`, valueX, y + 13);
      ctx.fillStyle = '#6b7788'; ctx.font = '600 18px Arial, sans-serif'; ctx.fillText(`${fmt(average)}%`, valueX, y + 47);
    });
    return chartAsset(canvas);
  }

  function trendChart(snapshot) {
    const { canvas, ctx } = makeChartCanvas(1400, 720);
    drawChartTitle(ctx, '이전 회차 점수 추세', '현재 성적표 회차까지 동일 학생 기록을 연결', canvas.width);
    const history = (snapshot.history || []).slice().sort((a, b) => Number(a.round || 0) - Number(b.round || 0));
    if (history.length < 2) {
      ctx.fillStyle = '#eef4fb'; drawRoundedRect(ctx, 135, 220, 1130, 280, 22, '#eef4fb');
      ctx.fillStyle = '#2f4767'; ctx.font = '800 34px "Malgun Gothic", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('이전 회차 기록이 아직 없습니다.', 700, 325);
      ctx.fillStyle = '#6a788b'; ctx.font = '500 23px "Malgun Gothic", Arial, sans-serif'; ctx.fillText('같은 학교와 이름으로 다른 회차를 저장하면 자동으로 연결됩니다.', 700, 390);
      return chartAsset(canvas);
    }
    const left = 105, right = 65, top = 190, bottom = 110;
    const plotW = canvas.width - left - right;
    const plotH = canvas.height - top - bottom;
    const minScore = -25, maxScore = 100;
    const x = (index) => left + (history.length === 1 ? plotW / 2 : index * plotW / (history.length - 1));
    const y = (score) => top + plotH - ((Number(score) - minScore) / (maxScore - minScore)) * plotH;
    [0, 25, 50, 75, 100].forEach((value) => {
      const yy = y(value);
      ctx.strokeStyle = '#dbe4ef'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(canvas.width - right, yy); ctx.stroke();
      ctx.fillStyle = '#718096'; ctx.font = '500 20px Arial, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(String(value), left - 18, yy);
    });
    ctx.strokeStyle = '#0875ff'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    history.forEach((item, index) => { if (index === 0) ctx.moveTo(x(index), y(item.score)); else ctx.lineTo(x(index), y(item.score)); });
    ctx.stroke();
    history.forEach((item, index) => {
      ctx.fillStyle = '#063b8f'; ctx.beginPath(); ctx.arc(x(index), y(item.score), 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#063b8f'; ctx.font = '800 23px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(fmt(item.score), x(index), y(item.score) - 32);
      ctx.fillStyle = '#53647a'; ctx.font = '700 21px "Malgun Gothic", Arial, sans-serif'; ctx.fillText(`${item.round}회`, x(index), canvas.height - 62);
    });
    return chartAsset(canvas);
  }

  function crc32(bytes) {
    if (!crc32.table) {
      crc32.table = Array.from({ length: 256 }, (_, index) => {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
        return value >>> 0;
      });
    }
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) crc = crc32.table[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function concatBytes(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    parts.forEach((part) => { output.set(part, offset); offset += part.length; });
    return output;
  }

  function littleEndian(size, value) {
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);
    if (size === 2) view.setUint16(0, value & 0xFFFF, true);
    else view.setUint32(0, value >>> 0, true);
    return bytes;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, date: day };
  }

  function createStoredZip(entries) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    const stamp = dosDateTime();
    entries.forEach((entry) => {
      const name = encoder.encode(entry.name);
      const data = entry.data instanceof Uint8Array ? entry.data : encoder.encode(String(entry.data || ''));
      const crc = crc32(data);
      const local = concatBytes([
        littleEndian(4, 0x04034B50), littleEndian(2, 20), littleEndian(2, 0x0800), littleEndian(2, 0),
        littleEndian(2, stamp.time), littleEndian(2, stamp.date), littleEndian(4, crc), littleEndian(4, data.length), littleEndian(4, data.length),
        littleEndian(2, name.length), littleEndian(2, 0), name, data
      ]);
      locals.push(local);
      const central = concatBytes([
        littleEndian(4, 0x02014B50), littleEndian(2, 20), littleEndian(2, 20), littleEndian(2, 0x0800), littleEndian(2, 0),
        littleEndian(2, stamp.time), littleEndian(2, stamp.date), littleEndian(4, crc), littleEndian(4, data.length), littleEndian(4, data.length),
        littleEndian(2, name.length), littleEndian(2, 0), littleEndian(2, 0), littleEndian(2, 0), littleEndian(2, 0), littleEndian(4, 0), littleEndian(4, offset), name
      ]);
      centrals.push(central);
      offset += local.length;
    });
    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = concatBytes([
      littleEndian(4, 0x06054B50), littleEndian(2, 0), littleEndian(2, 0), littleEndian(2, entries.length), littleEndian(2, entries.length),
      littleEndian(4, centralSize), littleEndian(4, offset), littleEndian(2, 0)
    ]);
    return concatBytes([...locals, ...centrals, end]);
  }

  function runXml(text, options = {}) {
    const props = [];
    if (options.bold) props.push('<w:b/>');
    if (options.italic) props.push('<w:i/>');
    if (options.color) props.push(`<w:color w:val="${xmlEscape(options.color.replace('#', ''))}"/>`);
    if (options.size) props.push(`<w:sz w:val="${Math.round(Number(options.size) * 2)}"/><w:szCs w:val="${Math.round(Number(options.size) * 2)}"/>`);
    if (options.font) props.push(`<w:rFonts w:ascii="${xmlEscape(options.font)}" w:hAnsi="${xmlEscape(options.font)}" w:eastAsia="${xmlEscape(options.font)}"/>`);
    if (options.highlight) props.push(`<w:shd w:fill="${xmlEscape(options.highlight.replace('#', ''))}"/>`);
    props.push('<w:lang w:val="ko-KR" w:eastAsia="ko-KR"/>');
    const chunks = String(text == null ? '' : text).split(/\n/);
    const body = chunks.map((chunk, index) => `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlEscape(chunk)}</w:t>`).join('');
    return `<w:r><w:rPr>${props.join('')}</w:rPr>${body}</w:r>`;
  }

  function paragraphXml(content, options = {}) {
    const runs = Array.isArray(content) ? content.join('') : runXml(content, options.run || options);
    const pPr = [];
    if (options.style) pPr.push(`<w:pStyle w:val="${xmlEscape(options.style)}"/>`);
    if (options.align) pPr.push(`<w:jc w:val="${xmlEscape(options.align)}"/>`);
    if (options.keepNext) pPr.push('<w:keepNext/>');
    if (options.keepLines) pPr.push('<w:keepLines/>');
    if (options.pageBreakBefore) pPr.push('<w:pageBreakBefore/>');
    const before = Math.round(Number(options.before || 0) * 20);
    const after = Math.round(Number(options.after == null ? 6 : options.after) * 20);
    const line = Math.round(Number(options.line || 1.25) * 240);
    pPr.push(`<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>`);
    if (options.indentLeft || options.indentFirst) pPr.push(`<w:ind w:left="${Math.round(Number(options.indentLeft || 0) * 20)}" w:firstLine="${Math.round(Number(options.indentFirst || 0) * 20)}"/>`);
    if (options.shading) pPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${xmlEscape(options.shading.replace('#', ''))}"/>`);
    return `<w:p><w:pPr>${pPr.join('')}</w:pPr>${runs}</w:p>`;
  }

  function pageBreakXml() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  function cellXml(content, options = {}) {
    const tcPr = [];
    if (options.width) tcPr.push(`<w:tcW w:w="${Math.round(options.width)}" w:type="dxa"/>`);
    if (options.shading) tcPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${xmlEscape(options.shading.replace('#', ''))}"/>`);
    if (options.vAlign) tcPr.push(`<w:vAlign w:val="${xmlEscape(options.vAlign)}"/>`);
    if (options.gridSpan) tcPr.push(`<w:gridSpan w:val="${Math.round(options.gridSpan)}"/>`);
    const margins = options.margins || { top: 100, right: 120, bottom: 100, left: 120 };
    tcPr.push(`<w:tcMar><w:top w:w="${margins.top}" w:type="dxa"/><w:right w:w="${margins.right}" w:type="dxa"/><w:bottom w:w="${margins.bottom}" w:type="dxa"/><w:left w:w="${margins.left}" w:type="dxa"/></w:tcMar>`);
    const raw = String(content == null ? '' : content);
    const body = Array.isArray(content) ? content.join('') : (/^\s*<w:/.test(raw) ? raw : paragraphXml(content, options.paragraph || {}));
    return `<w:tc><w:tcPr>${tcPr.join('')}</w:tcPr>${body || paragraphXml('')}</w:tc>`;
  }

  function rowXml(cells, options = {}) {
    return `<w:tr><w:trPr>${options.header ? '<w:tblHeader/>' : ''}${options.cantSplit ? '<w:cantSplit/>' : ''}</w:trPr>${cells.join('')}</w:tr>`;
  }

  function tableXml(rows, widths = [], options = {}) {
    const color = (options.borderColor || 'C9D4E2').replace('#', '');
    const size = Number(options.borderSize || 8);
    const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((side) => `<w:${side} w:val="single" w:sz="${size}" w:space="0" w:color="${color}"/>`).join('');
    const grid = widths.map((width) => `<w:gridCol w:w="${Math.round(width)}"/>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>${grid ? `<w:tblGrid>${grid}</w:tblGrid>` : ''}${rows.join('')}</w:tbl>`;
  }

  function createDocxMediaStore() {
    const items = [];
    return {
      add(asset, preferredName = 'image') {
        const match = String(asset.dataUrl || '').match(/^data:([^;,]+);base64,(.*)$/s);
        if (!match) throw new Error('Word 이미지 데이터 형식이 올바르지 않습니다.');
        const mime = match[1].toLowerCase();
        const extension = mime.includes('jpeg') ? 'jpg' : 'png';
        const index = items.length + 1;
        const safe = String(preferredName || 'image').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 36) || 'image';
        const item = {
          rId: `rId${index + 2}`,
          docPrId: index,
          path: `word/media/${String(index).padStart(3, '0')}-${safe}.${extension}`,
          target: `media/${String(index).padStart(3, '0')}-${safe}.${extension}`,
          mime,
          data: base64ToBytes(match[2]),
          width: Number(asset.width || 1),
          height: Number(asset.height || 1),
          name: `${safe}.${extension}`
        };
        items.push(item);
        return item;
      },
      all() { return items.slice(); }
    };
  }

  function imageParagraphXml(item, options = {}) {
    const maxWidth = Number(options.maxWidth || 650);
    const maxHeight = Number(options.maxHeight || 820);
    const ratio = Math.min(1, maxWidth / item.width, maxHeight / item.height);
    const width = Math.max(1, Math.round(item.width * ratio));
    const height = Math.max(1, Math.round(item.height * ratio));
    const cx = Math.round(width * 9525);
    const cy = Math.round(height * 9525);
    const drawing = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${item.docPrId}" name="${xmlEscape(item.name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${item.docPrId}" name="${xmlEscape(item.name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${item.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    return paragraphXml([drawing], { align: options.align || 'center', after: options.after == null ? 8 : options.after, keepLines: true });
  }

  function headingXml(number, english, title, description) {
    return [
      paragraphXml(`${String(number).padStart(2, '0')} · ${english}`, { bold: true, color: '#0875ff', size: 9, after: 2, keepNext: true }),
      paragraphXml(title, { style: 'Heading1', keepNext: true, after: 4 }),
      paragraphXml(description, { color: '#64748b', size: 9, after: 12 })
    ].join('');
  }

  function metricCell(label, value, note, shading = '#F5F8FC', valueColor = '#063B8F', width = 3260) {
    return cellXml([
      paragraphXml(label, { bold: true, color: '#64748b', size: 8, after: 3 }),
      paragraphXml(value, { bold: true, color: valueColor, size: 18, after: 3 }),
      paragraphXml(note, { color: '#68768a', size: 7.5, after: 0 })
    ], { width, shading, vAlign: 'center' });
  }

  function boxXml(title, body, options = {}) {
    const width = Number(options.width || 9800);
    const shading = options.shading || '#F6F9FD';
    const titleColor = options.titleColor || '#16345D';
    return tableXml([
      rowXml([cellXml([
        paragraphXml(title, { bold: true, color: titleColor, size: 11, after: 5, keepNext: true }),
        paragraphXml(body, { color: '#26364d', size: 9, after: 0 })
      ], { width, shading })], { cantSplit: false })
    ], [width], { borderColor: options.borderColor || '#CBD7E6', borderSize: options.borderSize || 9 });
  }

  function bulletParagraphs(items, options = {}) {
    return (items || []).map((item) => paragraphXml([
      runXml('• ', { bold: true, color: options.color || '#0875ff', size: options.size || 9 }),
      runXml(item, { color: options.textColor || '#26364d', size: options.size || 9 })
    ], { indentLeft: 10, after: 4 })).join('');
  }

  function buildStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:before="180" w:after="180"/></w:pPr><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕"/><w:b/><w:color w:val="063B8F"/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="180" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕"/><w:b/><w:color w:val="063B8F"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="140" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕"/><w:b/><w:color w:val="17335B"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style></w:styles>`;
  }

  function buildSettingsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="90"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('이미지를 데이터로 변환하지 못했습니다.'));
      reader.readAsDataURL(blob);
    });
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async function inlineWordStylesheetAssets(cssText) {
    const stylesheetUrl = new URL('assets/styles.css', document.baseURI || location.href).href;
    const sources = [...new Set([...String(cssText || '').matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)]
      .map((match) => match[2])
      .filter((source) => source && !/^(data:|blob:|#)/i.test(source)))];
    let output = String(cssText || '');
    for (const source of sources) {
      try {
        const response = await fetch(new URL(source, stylesheetUrl).href, { cache: 'force-cache' });
        if (!response.ok) continue;
        const dataUrl = await blobToDataUrl(await response.blob());
        const pattern = new RegExp(`url\\(\\s*(['"]?)${escapeRegExp(source)}\\1\\s*\\)`, 'g');
        output = output.replace(pattern, `url("${dataUrl}")`);
      } catch (error) {
        console.warn('Word 화면 내보내기용 CSS 이미지를 내장하지 못했습니다.', source, error);
      }
    }
    return output;
  }

  function utf8Base64(value) {
    const bytes = new TextEncoder().encode(String(value || ''));
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  async function prepareWordVisualClone(source) {
    const clone = source.cloneNode(true);
    clone.querySelectorAll('script, .no-print, .report-toolbar, .toast-stack, .modal-backdrop, .review-source-link').forEach((node) => node.remove());
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    clone.querySelectorAll('a').forEach((anchor) => {
      const text = document.createElement('span');
      text.className = anchor.className;
      text.textContent = anchor.textContent;
      anchor.replaceWith(text);
    });
    clone.querySelectorAll('.practice-solution').forEach((node) => { node.style.display = 'block'; });
    clone.querySelectorAll('.practice-hint, .practice-feedback, .practice-actions').forEach((node) => { node.style.display = 'none'; });
    clone.querySelectorAll('.practice-option input').forEach((node) => node.remove());
    clone.querySelectorAll('.report-table th').forEach((node) => { node.style.position = 'static'; node.style.top = 'auto'; });
    clone.querySelectorAll('img').forEach((image) => image.removeAttribute('srcset'));

    const images = [...clone.querySelectorAll('img')];
    for (const image of images) {
      const raw = image.getAttribute('src') || '';
      if (!raw || /^data:/i.test(raw)) continue;
      try {
        const response = await fetch(new URL(raw, document.baseURI || location.href).href, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        image.setAttribute('src', await blobToDataUrl(await response.blob()));
      } catch (error) {
        console.warn('Word 화면 내보내기용 이미지를 내장하지 못했습니다.', raw, error);
        image.setAttribute('src', placeholderAsset(`${image.alt || '문제 이미지'}를 불러오지 못했습니다.`, 1400, 420).dataUrl);
      }
    }
    return clone;
  }

  function visualExportOverrides(width) {
    return `
      html, body { margin: 0 !important; padding: 0 !important; width: ${width}px !important; min-width: ${width}px !important; background: #ffffff !important; overflow: visible !important; }
      .word-visual-export { width: ${width}px !important; max-width: none !important; margin: 0 !important; background: #ffffff !important; box-shadow: none !important; --brand:#063b8f; --brand-2:#0875ff; --good:#16815f; --bad:#d94857; --blank:#8391a4; --line:#dce6f3; --muted:#68778b; }
      .word-visual-export, .word-visual-export * { box-sizing: border-box !important; animation: none !important; transition: none !important; caret-color: transparent !important; }
      .word-visual-export .report-toolbar, .word-visual-export .no-print, .word-visual-export .toast-stack, .word-visual-export .modal-backdrop, .word-visual-export .review-source-link { display: none !important; }
      .word-visual-export .practice-solution { display: block !important; }
      .word-visual-export .practice-hint, .word-visual-export .practice-feedback, .word-visual-export .practice-actions { display: none !important; }
      .word-visual-export .practice-option input { display: none !important; }
      .word-visual-export .report-table th { position: static !important; top: auto !important; }
      .word-visual-export svg { display: block !important; max-width: 100% !important; }
      .word-visual-export .report-section, .word-visual-export .review-card, .word-visual-export .chart-card, .word-visual-export .analysis-card { break-inside: auto !important; page-break-inside: auto !important; }
      .word-visual-export .word-review-wrap { padding: 31px !important; background: #ffffff !important; border-bottom: 0 !important; }
      .word-visual-export .word-review-wrap .review-card { margin: 0 !important; }
      .word-visual-export .word-clinic-heading { padding-bottom: 18px !important; }
    `;
  }

  async function renderWordVisualBlock(source, cssText, options = {}) {
    const width = Number(options.width || 1152);
    const renderScale = Number(options.scale || 1.4);
    const clone = await prepareWordVisualClone(source);
    const measure = document.createElement('div');
    measure.className = 'report-document word-visual-export';
    measure.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;max-width:none;margin:0;background:#fff;box-shadow:none;visibility:hidden;pointer-events:none;z-index:-1;`;
    measure.appendChild(clone);
    document.body.appendChild(measure);
    try {
      await Promise.all([...measure.querySelectorAll('img')].map((image) => image.decode ? image.decode().catch(() => {}) : Promise.resolve()));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const height = Math.max(1, Math.ceil(measure.getBoundingClientRect().height));
      const cleanWrapper = document.createElement('div');
      cleanWrapper.className = 'report-document word-visual-export';
      cleanWrapper.setAttribute('style', `width:${width}px;max-width:none;margin:0;background:#fff;box-shadow:none;`);
      cleanWrapper.appendChild(clone.cloneNode(true));
      const serialized = new XMLSerializer().serializeToString(cleanWrapper);
      const safeCss = `${cssText}\n${visualExportOverrides(width)}`.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${safeCss}</style>${serialized}</div></foreignObject></svg>`;
      const image = new Image();
      image.decoding = 'async';
      image.src = `data:image/svg+xml;base64,${utf8Base64(svg)}`;
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('성적 리포트 화면을 이미지로 변환하지 못했습니다.')); });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * renderScale));
      canvas.height = Math.max(1, Math.round(height * renderScale));
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(renderScale, renderScale);
      ctx.drawImage(image, 0, 0, width, height);
      return { dataUrl: canvas.toDataURL('image/png'), mime: 'image/png', width: canvas.width, height: canvas.height };
    } finally {
      measure.remove();
    }
  }

  function buildWordVisualBlockSources() {
    const blocks = [];
    const dashboard = document.querySelector('#dashboard');
    const scorecard = document.querySelector('#scorecard');
    const learning = document.querySelector('#learning-analysis');
    const questions = document.querySelector('#question-analysis');
    const clinic = document.querySelector('#wrong-answer-learning');
    if (dashboard) blocks.push({ source: dashboard, label: '표지', forceNewPage: false });
    if (scorecard) blocks.push({ source: scorecard, label: '성적표와 그래프', forceNewPage: false });
    if (learning) blocks.push({ source: learning, label: '강점·취약점', forceNewPage: true });
    if (questions) blocks.push({ source: questions, label: '문항별 정오표', forceNewPage: true });

    if (clinic) {
      const reviews = [...clinic.querySelectorAll('.review-card')];
      const heading = clinic.querySelector('.section-heading');
      if (reviews.length) {
        const first = document.createElement('section');
        first.className = 'report-section word-review-wrap';
        if (heading) {
          const headingWrap = document.createElement('div');
          headingWrap.className = 'word-clinic-heading';
          headingWrap.appendChild(heading.cloneNode(true));
          first.appendChild(headingWrap);
        }
        first.appendChild(reviews[0].cloneNode(true));
        blocks.push({ source: first, label: '오답 학습 1', forceNewPage: true });
        reviews.slice(1).forEach((review, index) => {
          const wrapper = document.createElement('section');
          wrapper.className = 'report-section word-review-wrap';
          wrapper.appendChild(review.cloneNode(true));
          blocks.push({ source: wrapper, label: `오답 학습 ${index + 2}`, forceNewPage: true });
        });
      } else {
        blocks.push({ source: clinic, label: '오답 학습', forceNewPage: true });
      }
    }
    return blocks;
  }

  function canvasImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Word 페이지 이미지를 불러오지 못했습니다.'));
      image.src = dataUrl;
    });
  }

  async function composeWordVisualPages(renderedBlocks, snapshot, exam, updateProgress) {
    const pageWidth = 1654;
    const pageHeight = 2339;
    const side = 70;
    const top = 64;
    const footerHeight = 86;
    const gap = 30;
    const contentWidth = pageWidth - side * 2;
    const contentBottom = pageHeight - footerHeight;
    const pages = [];
    let canvas;
    let ctx;
    let cursorY;
    let pageNo = 0;

    const openPage = () => {
      pageNo += 1;
      canvas = document.createElement('canvas');
      canvas.width = pageWidth;
      canvas.height = pageHeight;
      ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageWidth, pageHeight);
      cursorY = top;
    };
    const closePage = () => {
      if (!canvas) return;
      const lineY = pageHeight - 58;
      ctx.strokeStyle = '#d8e3f0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(side, lineY); ctx.lineTo(pageWidth - side, lineY); ctx.stroke();
      ctx.fillStyle = '#063b8f';
      ctx.font = '700 20px "Malgun Gothic", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText("Young's Physics", side, pageHeight - 26);
      ctx.fillStyle = '#7b889a';
      ctx.font = '500 16px "Malgun Gothic", Arial, sans-serif';
      const subtitle = `${snapshot.record.name} · ${exam.shortTitle || exam.title}`;
      ctx.fillText(subtitle.length > 42 ? `${subtitle.slice(0, 42)}…` : subtitle, side + 185, pageHeight - 26);
      ctx.textAlign = 'right';
      ctx.fillText(`${pageNo}`, pageWidth - side, pageHeight - 26);
      pages.push({ dataUrl: canvas.toDataURL('image/png'), mime: 'image/png', width: pageWidth, height: pageHeight });
      canvas = null; ctx = null;
    };

    openPage();
    for (let index = 0; index < renderedBlocks.length; index += 1) {
      const block = renderedBlocks[index];
      updateProgress(`Word 페이지 구성 ${index + 1}/${renderedBlocks.length}`);
      const image = await canvasImage(block.asset.dataUrl);
      let scale = contentWidth / image.width;
      let drawWidth = image.width * scale;
      let drawHeight = image.height * scale;
      const maxHeight = contentBottom - top - gap;
      if (drawHeight > maxHeight) {
        scale = maxHeight / image.height;
        drawWidth = image.width * scale;
        drawHeight = image.height * scale;
      }
      if (block.forceNewPage && cursorY > top + 2) closePage(), openPage();
      if (cursorY + drawHeight > contentBottom && cursorY > top + 2) closePage(), openPage();
      const x = side + (contentWidth - drawWidth) / 2;
      ctx.drawImage(image, x, cursorY, drawWidth, drawHeight);
      cursorY += drawHeight + gap;
    }
    closePage();
    return pages;
  }

  async function buildVisualWordDocx(snapshot, exam, updateProgress) {
    updateProgress('화면 스타일 준비 중');
    const cssResponse = await fetch(new URL('assets/styles.css', document.baseURI || location.href).href, { cache: 'force-cache' });
    if (!cssResponse.ok) throw new Error('성적 리포트 디자인 파일을 불러오지 못했습니다.');
    const cssText = await inlineWordStylesheetAssets(await cssResponse.text());
    const sources = buildWordVisualBlockSources();
    if (!sources.length) throw new Error('Word로 내보낼 성적 리포트 화면이 없습니다.');
    const rendered = [];
    for (let index = 0; index < sources.length; index += 1) {
      updateProgress(`화면 캡처 ${index + 1}/${sources.length}`);
      rendered.push({
        ...sources[index],
        asset: await renderWordVisualBlock(sources[index].source, cssText, { width: 1152, scale: 1.4 })
      });
    }
    const pages = await composeWordVisualPages(rendered, snapshot, exam, updateProgress);
    updateProgress('Word 문서 조립 중');
    const media = createDocxMediaStore();
    const documentParts = [];
    pages.forEach((page, index) => {
      const item = media.add(page, `report-page-${index + 1}`);
      documentParts.push(imageParagraphXml(item, { maxWidth: 746, maxHeight: 1055, after: 0 }));
      if (index < pages.length - 1) documentParts.push(pageBreakXml());
    });
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${documentParts.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="360" w:right="360" w:bottom="360" w:left="360" w:header="180" w:footer="180" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="312"/></w:sectPr></w:body></w:document>`;
    const mediaItems = media.all();
    const relationshipRows = [
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
      ...mediaItems.map((item) => `<Relationship Id="${item.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${xmlEscape(item.target)}"/>`)
    ].join('');
    const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationshipRows}</Relationships>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    const now = new Date().toISOString();
    const title = `${snapshot.record.name} · ${exam.title} 화면형 성적 리포트`;
    const coreProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title)}</dc:title><dc:subject>Young's Physics 화면형 학생 성적 분석</dc:subject><dc:creator>Young's Physics</dc:creator><cp:lastModifiedBy>Young's Physics</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    const appProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Young's Physics</Application><AppVersion>3.0.0</AppVersion><Company>Young's Physics</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged></Properties>`;
    return createStoredZip([
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: packageRels },
      { name: 'docProps/core.xml', data: coreProps },
      { name: 'docProps/app.xml', data: appProps },
      { name: 'word/document.xml', data: documentXml },
      { name: 'word/_rels/document.xml.rels', data: documentRels },
      { name: 'word/styles.xml', data: buildStylesXml() },
      { name: 'word/settings.xml', data: buildSettingsXml() },
      ...mediaItems.map((item) => ({ name: item.path, data: item.data }))
    ]);
  }


  async function buildWordDocx(snapshot, exam, updateProgress) {
    const media = createDocxMediaStore();
    const documentParts = [];
    let stage = 0;
    const setStage = (text) => { stage += 1; updateProgress?.(text, stage); };

    setStage('로고 준비');
    let logoAsset;
    let markAsset;
    try { logoAsset = await imageToWordAsset('assets/youngs-physics-logo.png', { maxWidth: 900, maxHeight: 360 }); }
    catch (error) { console.warn(error); logoAsset = placeholderAsset("Young's Physics", 900, 260); }
    try { markAsset = await imageToWordAsset('assets/youngs-physics-mark.png', { maxWidth: 500, maxHeight: 500 }); }
    catch (error) { console.warn(error); markAsset = placeholderAsset('YP', 360, 360); }
    const logo = media.add(logoAsset, 'youngs-physics-logo');
    const mark = media.add(markAsset, 'youngs-physics-mark');

    const c = snapshot.cohort || {};
    const r = snapshot.record;
    const total = Number(c.total || 0);
    const topRate = c.rank && total ? core.round(Number(c.rank) / total * 100, 1) : null;
    const sourceText = sourceLabel(snapshot);

    documentParts.push(imageParagraphXml(logo, { maxWidth: 290, maxHeight: 110, after: 10 }));
    documentParts.push(paragraphXml("YOUNG'S PHYSICS · PERSONAL SCORE REPORT", { bold: true, color: '#0875ff', size: 9, align: 'center', after: 6 }));
    documentParts.push(paragraphXml(`${r.name} 학생`, { style: 'Title', after: 8 }));
    documentParts.push(paragraphXml(`${r.school}  |  ${exam.title}`, { bold: true, color: '#44556c', size: 11, align: 'center', after: 4 }));
    documentParts.push(paragraphXml(`${sourceText}  |  리포트 생성일 ${core.formatDate(snapshot.generatedAt)}`, { color: '#718096', size: 8, align: 'center', after: 22 }));
    documentParts.push(tableXml([
      rowXml([
        metricCell('총점', `${fmt(r.score)} / 100`, topRate == null ? '비교 데이터 준비 중' : `상위 ${fmt(topRate)}%`, '#EEF5FF', '#063B8F'),
        metricCell('정답률', `${fmt(r.correct / exam.answerCount * 100)}%`, `정답 ${r.correct} · 오답 ${r.wrong} · 미기입 ${r.blank}`, '#F2FBF7', '#167A58'),
        metricCell('전체 평균', `${fmt(c.average || 0)}점`, `${total}명 비교 기준`, '#F7F8FA', '#44556C')
      ], { cantSplit: true })
    ], [3260, 3260, 3260], { borderColor: '#B9CBEA', borderSize: 10 }));
    documentParts.push(paragraphXml('점수 확인부터 오답 해설, 필요한 공식, 같은 풀이 방식의 동형 문제까지 한 파일에서 확인할 수 있습니다.', { color: '#5e6d80', size: 9, align: 'center', before: 18, after: 4 }));
    documentParts.push(imageParagraphXml(mark, { maxWidth: 72, maxHeight: 72, after: 0 }));
    documentParts.push(pageBreakXml());

    documentParts.push(headingXml(1, 'SCORECARD', '성적표와 전체 성적 비교', '정답·오답·미기입을 채점 규칙에 따라 분리하고 동일 시험 집단과 비교합니다.'));
    documentParts.push(tableXml([
      rowXml([
        cellXml([
          paragraphXml('TOTAL SCORE', { bold: true, color: '#D7E7FF', size: 8, after: 4 }),
          paragraphXml(`${fmt(r.score)} / 100`, { bold: true, color: '#FFFFFF', size: 31, after: 5 }),
          paragraphXml(`정답 ${r.correct}개 × ${fmt(exam.correctScore)}점 · 오답 ${r.wrong}개 × ${fmt(exam.wrongScore)}점 · 미기입 ${r.blank}개 × 0점`, { color: '#E6F0FF', size: 8, after: 0 })
        ], { width: 9800, shading: '#063B8F', margins: { top: 180, right: 200, bottom: 180, left: 200 } })
      ], { cantSplit: true })
    ], [9800], { borderColor: '#063B8F', borderSize: 12 }));
    const rank = c.rank ? `${c.rank} / ${Math.max(total, 1)}` : '—';
    const percentile = topRate == null ? '—' : `상위 ${fmt(topRate)}%`;
    documentParts.push(tableXml([
      rowXml([
        metricCell('전체 평균', `${fmt(c.average || 0)}점`, `학생 대비 ${signed(r.score - Number(c.average || 0))}점`),
        metricCell('석차', rank, '동점자는 같은 순위'),
        metricCell('상위 비율', percentile, '누적 집단 기준')
      ], { cantSplit: true }),
      rowXml([
        metricCell('정답', String(r.correct), `획득 ${fmt(r.correct * exam.correctScore)}점`, '#F3FBF7', '#167A58'),
        metricCell('오답', String(r.wrong), `감점 ${fmt(Math.abs(r.wrong * exam.wrongScore))}점`, '#FFF5F6', '#B23A48'),
        metricCell('미기입', String(r.blank), '감점 없음', '#F6F7F9', '#6F7D8E')
      ], { cantSplit: true })
    ], [3260, 3260, 3260], { borderColor: '#D4DCE6', borderSize: 8 }));
    documentParts.push(paragraphXml(total < 2 ? '비교 집단이 학생 본인 1명뿐이므로 평균과 정답률은 참고용입니다.' : `${total}명의 같은 시험 기록을 기준으로 계산했습니다.`, { shading: '#F6F9FD', color: '#42516a', size: 8.5, before: 10, after: 12 }));

    setStage('성적 그래프 생성');
    const scoreChart = media.add(scoreComparisonChart(snapshot), 'score-comparison');
    const distribution = media.add(histogramChart(snapshot), 'score-distribution');
    const domains = media.add(domainChart(snapshot, exam), 'domain-comparison');
    const trend = media.add(trendChart(snapshot), 'score-trend');
    [
      ['점수 기준 비교', scoreChart],
      ['전체 점수 분포', distribution],
      ['대단원별 정답률', domains],
      ['이전 회차 점수 추세', trend]
    ].forEach(([title, asset]) => {
      documentParts.push(paragraphXml(title, { style: 'Heading2', after: 5 }));
      documentParts.push(imageParagraphXml(asset, { maxWidth: 660, maxHeight: 390, after: 10 }));
    });
    documentParts.push(pageBreakXml());

    documentParts.push(headingXml(2, 'LEARNING ANALYSIS', '강점·취약점과 학습 코멘트', '이번 회차의 단원별 결과와 동일 학생의 이전 회차를 함께 고려했습니다.'));
    const a = snapshot.analysis || {};
    documentParts.push(tableXml([
      rowXml([
        cellXml([
          paragraphXml('강점', { bold: true, color: '#167A58', size: 13, after: 5 }),
          paragraphXml(a.strengthText || '현재 결과에서 상대적으로 높은 단원을 확인하세요.', { size: 9, after: 6 }),
          bulletParagraphs((a.strengths || []).map((item) => `${item.domain} ${fmt(item.accuracy)}%`), { color: '#167A58', size: 8 })
        ], { width: 4900, shading: '#F2FBF7' }),
        cellXml([
          paragraphXml('취약점', { bold: true, color: '#B23A48', size: 13, after: 5 }),
          paragraphXml(a.weaknessText || '오답·미기입 문항을 중심으로 기본 개념을 보완하세요.', { size: 9, after: 6 }),
          bulletParagraphs((a.weaknesses || []).map((item) => `${item.domain} ${fmt(item.accuracy)}%`), { color: '#B23A48', size: 8 })
        ], { width: 4900, shading: '#FFF5F6' })
      ], { cantSplit: false })
    ], [4900, 4900], { borderColor: '#CBD7E6', borderSize: 9 }));
    documentParts.push(boxXml('이전 회차 변화', a.trendText || '현재 회차를 기준점으로 삼습니다.', { shading: '#F6F9FD' }));
    documentParts.push(boxXml('우선 복습 문항', (a.weakestTopics || []).length ? a.weakestTopics.join(' · ') : '오답과 미기입이 없어 전 범위 고난도 변형으로 확장할 수 있습니다.', { shading: '#F6F9FD' }));
    documentParts.push(paragraphXml('교사형 자동 코멘트', { style: 'Heading2', after: 6 }));
    documentParts.push(bulletParagraphs(a.comments || [], { size: 9 }));
    const history = (snapshot.history || []).slice().sort((x, y) => Number(x.round || 0) - Number(y.round || 0));
    documentParts.push(paragraphXml('동일 학생 회차별 기록', { style: 'Heading2', after: 6 }));
    if (history.length) {
      const header = rowXml(['회차', '시험', '점수', '정답', '오답', '미기입'].map((value, index) => cellXml(paragraphXml(value, { bold: true, color: '#17335B', size: 8, align: 'center', after: 0 }), { width: [750, 3900, 1000, 900, 900, 900][index], shading: '#EAF1FB' })), { header: true, cantSplit: true });
      const rows = history.map((item) => rowXml([
        cellXml(paragraphXml(`${item.round}회`, { align: 'center', size: 8, after: 0 }), { width: 750 }),
        cellXml(paragraphXml(item.examTitle || item.examId, { size: 8, after: 0 }), { width: 3900 }),
        cellXml(paragraphXml(fmt(item.score), { bold: true, color: '#063B8F', align: 'center', size: 8.5, after: 0 }), { width: 1000 }),
        cellXml(paragraphXml(String(item.correct), { align: 'center', size: 8, after: 0 }), { width: 900 }),
        cellXml(paragraphXml(String(item.wrong), { align: 'center', size: 8, after: 0 }), { width: 900 }),
        cellXml(paragraphXml(String(item.blank), { align: 'center', size: 8, after: 0 }), { width: 900 })
      ], { cantSplit: true }));
      documentParts.push(tableXml([header, ...rows], [750, 3900, 1000, 900, 900, 900], { borderColor: '#C8D4E3', borderSize: 7 }));
    } else documentParts.push(paragraphXml('이전 회차 데이터가 없습니다.', { color: '#64748B', size: 9 }));
    documentParts.push(pageBreakXml());

    documentParts.push(headingXml(3, 'QUESTION ANALYSIS', '문항별 정오표·단원·정답률', '문항 단원과 학생 답, 공식 답, 배점, 전체 정답률을 한 표로 정리했습니다.'));
    const results = r.questionResults || core.grade(exam, r.answers).questionResults;
    const stats = questionStats(c);
    const qWidths = [480, 1050, 2180, 760, 760, 820, 650, 1050];
    const qHeader = rowXml(['문항', '대단원', '세부 단원', '학생 답', '정답', '결과', '배점', '정답률'].map((value, index) => cellXml(paragraphXml(value, { bold: true, color: '#17335B', size: 7.5, align: 'center', after: 0 }), { width: qWidths[index], shading: '#EAF1FB' })), { header: true, cantSplit: true });
    const qRows = results.map((item, index) => {
      const question = exam.questions[index];
      const rate = Number(stats[index]?.accuracy ?? stats[index]?.rate ?? 0);
      const statusColor = item.status === 'correct' ? '#167A58' : item.status === 'wrong' ? '#B23A48' : '#6F7D8E';
      const statusShade = item.status === 'correct' ? '#F2FBF7' : item.status === 'wrong' ? '#FFF5F6' : '#F3F5F7';
      return rowXml([
        cellXml(paragraphXml(String(item.no), { bold: true, align: 'center', size: 7.5, after: 0 }), { width: qWidths[0] }),
        cellXml(paragraphXml(question.domain, { size: 7.2, after: 0 }), { width: qWidths[1] }),
        cellXml(paragraphXml(question.unit, { size: 7.2, after: 0 }), { width: qWidths[2] }),
        cellXml(paragraphXml(answerLabel(item.answer), { align: 'center', size: 8, after: 0 }), { width: qWidths[3] }),
        cellXml(paragraphXml(answerLabel(item.key), { bold: true, align: 'center', size: 8, after: 0 }), { width: qWidths[4] }),
        cellXml(paragraphXml(statusLabel(item.status), { bold: true, color: statusColor, align: 'center', size: 7.5, after: 0 }), { width: qWidths[5], shading: statusShade }),
        cellXml(paragraphXml(signed(item.points), { bold: true, color: item.points < 0 ? '#B23A48' : item.points > 0 ? '#167A58' : '#6F7D8E', align: 'center', size: 7.5, after: 0 }), { width: qWidths[6] }),
        cellXml(paragraphXml(`${fmt(rate)}%`, { align: 'center', size: 7.5, after: 0 }), { width: qWidths[7] })
      ], { cantSplit: true });
    });
    documentParts.push(tableXml([qHeader, ...qRows], qWidths, { borderColor: '#C9D4E2', borderSize: 7 }));
    documentParts.push(paragraphXml('정답률은 Google Sheet 모드에서는 누적 응시자 전체, 브라우저 모드에서는 링크 생성 시점에 저장되어 있던 응시자 기록을 기준으로 합니다.', { shading: '#F6F9FD', color: '#526278', size: 8, before: 8 }));
    documentParts.push(pageBreakXml());

    const needs = results.filter((item) => item.status !== 'correct');
    documentParts.push(headingXml(4, 'WRONG ANSWER CLINIC', '오답·미기입 해설과 동형 문제', `학습 대상 ${needs.length}문항의 원문, 해설, 공식과 같은 풀이 방식의 새 문제를 정리했습니다.`));
    if (!needs.length) {
      documentParts.push(boxXml('전 문항 정답입니다.', '이번 회차의 오답 학습 대상은 없습니다. 다음 회차에서는 고난도 변형 문제로 학습을 확장할 수 있습니다.', { shading: '#F2FBF7', borderColor: '#8BC9AE', titleColor: '#167A58' }));
    } else {
      for (let index = 0; index < needs.length; index += 1) {
        const item = needs[index];
        const question = exam.questions[item.no - 1];
        if (index > 0) documentParts.push(pageBreakXml());
        setStage(`오답 ${index + 1}/${needs.length} 이미지`);
        let questionAsset;
        try {
          questionAsset = await imageToWordAsset(questionImage(exam, question), { maxWidth: 1700, maxHeight: 2300, format: 'jpeg', quality: 0.9 });
        } catch (error) {
          console.warn(error);
          questionAsset = placeholderAsset(`${question.no}번 원문 문제 이미지를 불러오지 못했습니다.`);
        }
        const questionMedia = media.add(questionAsset, `question-${question.no}`);
        const statusColor = item.status === 'wrong' ? '#B23A48' : '#6F7D8E';
        const statusShade = item.status === 'wrong' ? '#FFF5F6' : '#F3F5F7';
        documentParts.push(tableXml([
          rowXml([
            cellXml([
              paragraphXml(`${question.no}번 · ${question.unit}`, { bold: true, color: '#063B8F', size: 15, after: 4 }),
              paragraphXml(question.topic, { color: '#526278', size: 8.5, after: 0 })
            ], { width: 7200, shading: '#EDF3FB' }),
            cellXml([
              paragraphXml(statusLabel(item.status), { bold: true, color: statusColor, size: 10, align: 'center', after: 4 }),
              paragraphXml(`학생 답 ${answerLabel(item.answer)}  |  정답 ${answerLabel(item.key)}`, { bold: true, color: '#26364d', size: 8, align: 'center', after: 0 })
            ], { width: 2600, shading: statusShade, vAlign: 'center' })
          ], { cantSplit: true })
        ], [7200, 2600], { borderColor: '#B9C6D6', borderSize: 10 }));
        documentParts.push(imageParagraphXml(questionMedia, { maxWidth: 650, maxHeight: 720, after: 10 }));
        documentParts.push(tableXml([
          rowXml([
            cellXml([
              paragraphXml('해설', { bold: true, color: '#17335B', size: 11, after: 5 }),
              paragraphXml(question.officialSummary || '공식 해설을 확인하세요.', { size: 9, after: 0 })
            ], { width: 4900, shading: '#F6F9FD' }),
            cellXml([
              paragraphXml('필요한 공식', { bold: true, color: '#17335B', size: 11, after: 5 }),
              bulletParagraphs(question.formulas || [], { size: 8.5 })
            ], { width: 4900, shading: '#F8FAFC' })
          ], { cantSplit: false })
        ], [4900, 4900], { borderColor: '#CBD7E6', borderSize: 8 }));
        documentParts.push(boxXml('다시 풀 때 확인할 점', question.checkPoint || '조건과 적용 법칙을 한 줄로 정리한 뒤 계산하세요.', { shading: '#F6F9FD' }));
        if (question.sourceNote) documentParts.push(boxXml('원문 확인 필요', question.sourceNote, { shading: '#FFF8E7', borderColor: '#E8B454', titleColor: '#9A6500' }));
        const practice = practiceFor(question.no);
        if (practice && Array.isArray(practice.choices) && practice.choices.length === 5) {
          const choiceText = practice.choices.map((choice, choiceIndex) => `${circled[choiceIndex + 1]} ${choice}`);
          // 동형 문제는 새 페이지에서 시작하여 문제·선택지·정답·해설이
          // 앞 페이지와 어색하게 갈라지지 않도록 한다.
          documentParts.push(pageBreakXml());
          documentParts.push(tableXml([
            rowXml([cellXml([
              paragraphXml('SAME METHOD · ONE MORE', { bold: true, color: '#0875FF', size: 8, after: 3 }),
              paragraphXml('같은 풀이로 한 문제 더', { bold: true, color: '#063B8F', size: 14, after: 6 }),
              paragraphXml(practice.title || `${question.no}번 동형 문제`, { bold: true, color: '#26364d', size: 10, after: 4 }),
              paragraphXml(practice.prompt || '', { size: 9, after: 6 }),
              bulletParagraphs(choiceText, { color: '#063B8F', size: 8.5 }),
              paragraphXml(`정답  ${circled[Number(practice.correct)]} ${practice.choices[Number(practice.correct) - 1] || ''}`, { bold: true, color: '#063B8F', size: 10, shading: '#EAF3FF', before: 7, after: 6 }),
              paragraphXml(`같은 풀이 방식\n${practice.method || ''}`, { bold: false, color: '#26364d', size: 9, after: 6 }),
              paragraphXml(`풀이\n${practice.solution || ''}`, { color: '#26364d', size: 9, after: 0 })
            ], { width: 9800, shading: '#F5F9FF', margins: { top: 150, right: 180, bottom: 150, left: 180 } })], { cantSplit: false })
          ], [9800], { borderColor: '#5C91CF', borderSize: 12 }));
        }
      }
    }

    documentParts.push(pageBreakXml());
    documentParts.push(imageParagraphXml(mark, { maxWidth: 80, maxHeight: 80, after: 7 }));
    documentParts.push(paragraphXml("Young's Physics", { bold: true, color: '#063B8F', size: 16, align: 'center', after: 4 }));
    documentParts.push(paragraphXml('Exploring the laws of nature, empowering the future.', { color: '#68778b', size: 9, align: 'center', after: 12 }));
    documentParts.push(paragraphXml(`자료 기준  ${exam.sourceNotice || ''}`, { color: '#53647a', size: 8, after: 8 }));
    documentParts.push(paragraphXml(`본 리포트는 입력 답안과 등록된 응시 기록을 이용한 자동 학습 보조 자료입니다. ${config.footerNote || ''}`, { color: '#718096', size: 7.5, after: 0 }));

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${documentParts.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="312"/></w:sectPr></w:body></w:document>`;

    const mediaItems = media.all();
    const relationshipRows = [
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
      ...mediaItems.map((item) => `<Relationship Id="${item.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${xmlEscape(item.target)}"/>`)
    ].join('');
    const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationshipRows}</Relationships>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    const now = new Date().toISOString();
    const coreProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(`${r.name} · ${exam.title} 성적 리포트`)}</dc:title><dc:subject>Young's Physics 학생 성적 분석</dc:subject><dc:creator>Young's Physics</dc:creator><cp:lastModifiedBy>Young's Physics</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    const appProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Young's Physics</Application><AppVersion>3.0.0</AppVersion><Company>Young's Physics</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged></Properties>`;
    const entries = [
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: packageRels },
      { name: 'docProps/core.xml', data: coreProps },
      { name: 'docProps/app.xml', data: appProps },
      { name: 'word/document.xml', data: documentXml },
      { name: 'word/_rels/document.xml.rels', data: documentRels },
      { name: 'word/styles.xml', data: buildStylesXml() },
      { name: 'word/settings.xml', data: buildSettingsXml() },
      ...mediaItems.map((item) => ({ name: item.path, data: item.data }))
    ];
    return createStoredZip(entries);
  }

  async function downloadWord() {
    const button = document.getElementById('wordButton');
    button.disabled = true;
    const old = button.innerHTML;
    const updateButton = (label) => { button.innerHTML = `<span class="btn-symbol">W</span><span>${esc(label)}</span>`; };
    updateButton('Word 준비 중');
    try {
      if (!currentSnapshot) throw new Error('성적 리포트가 아직 준비되지 않았습니다.');
      const exam = core.getExam(catalog, currentSnapshot.record.examId);
      if (!exam) throw new Error('시험 정보를 찾지 못했습니다.');
      let bytes;
      let visualExport = true;
      try {
        bytes = await buildVisualWordDocx(currentSnapshot, exam, (label) => updateButton(label));
      } catch (visualError) {
        visualExport = false;
        console.warn('화면형 Word 생성에 실패하여 구조형 Word로 전환합니다.', visualError);
        updateButton('호환 문서 생성 중');
        bytes = await buildWordDocx(currentSnapshot, exam, (label) => updateButton(label));
      }
      updateButton('다운로드 중');
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `${core.safeFilename(currentSnapshot.record.examTitle)}_${core.safeFilename(currentSnapshot.record.name)}_성적리포트.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 3000);
      notify(visualExport
        ? '현재 성적 리포트 화면을 고화질 페이지 이미지로 내장한 Word(.docx)를 저장했습니다.'
        : '호환 모드로 그래프와 오답 문제 이미지를 내장한 Word(.docx)를 저장했습니다.');
    } catch (error) {
      console.error(error);
      alert(`Word 파일을 만들지 못했습니다: ${error.message}`);
    } finally {
      button.disabled = false;
      button.innerHTML = old;
    }
  }

  async function copyText(text) {
    if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(text);
    const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
  }

  function showError(error, fallbackAvailable=false) {
    app.innerHTML=`<div class="error-panel"><div class="boot-mark" style="margin:auto">!</div><h1>성적 리포트를 열 수 없습니다.</h1><p>${esc(error.message||String(error))}</p>${fallbackAvailable?'<p>링크 백업도 함께 확인했지만 올바른 성적 데이터를 찾지 못했습니다.</p>':''}<a class="btn btn--primary" href="./">입력 화면으로 이동</a></div>`;
  }

  async function init() {
    activeLink = parseLink();
    const link = activeLink;
    let raw=null;
    let loadError=null;
    if(link.id&&link.api){
      try{
        const response=await jsonp(link.api,{action:'get',id:link.id});
        raw=response.report||response;
        dataSource='server';
        lastServerLoadAt=Date.now();
        if (link.migratedFromFallback) {
          const canonical = new URL(location.href);
          const hash = new URLSearchParams();
          hash.set(config.serverHashKey || 'id', link.id);
          hash.set('api', link.api);
          if (link.expectedFingerprint) hash.set('k', link.expectedFingerprint);
          canonical.hash = hash.toString();
          history.replaceState(null, '', canonical.href);
          activeLink = { id: link.id, api: link.api, fallback: null, migratedFromFallback: false, expectedFingerprint: link.expectedFingerprint || '' };
        }
      }
      catch(error){console.warn('서버 데이터 로드 실패',error);loadError=error;raw=link.fallback;dataSource='link';}
    }else raw=link.fallback;
    if(!raw){showError(loadError||new Error('유효한 학생 결과가 링크에 포함되어 있지 않습니다.'));return;}
    try{
      const snapshot=normalizeSnapshot(raw);
      assertLinkFingerprint(snapshot,link);
      render(snapshot);
    }
    catch(error){console.error(error);showError(error,Boolean(link.fallback));}
  }

  let printDetailState=[];
  window.addEventListener('beforeprint',()=>{
    printDetailState=Array.from(document.querySelectorAll('details.similar-problem')).map(node=>({node,open:node.open}));
    printDetailState.forEach(({node})=>{node.open=true;});
  });
  window.addEventListener('afterprint',()=>{
    printDetailState.forEach(({node,open})=>{node.open=open;});
    printDetailState=[];
  });

  window.addEventListener('focus', () => {
    if (dataSource === 'server') fetchLatestServerSnapshot({ silent: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && dataSource === 'server') fetchLatestServerSnapshot({ silent: true });
  });

  init();
})();
