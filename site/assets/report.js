(function () {
  'use strict';

  const core = window.TPLCore;
  const catalog = window.EXAM_CATALOG || [];
  const config = window.APP_CONFIG || {};
  const extraPractice = window.TPL_EXTRA_PRACTICE || {};
  const practiceByExam = window.TPL_EXTRA_PRACTICE_BY_EXAM || {};
  const app = document.getElementById('reportApp');
  const circled = ['', '①', '②', '③', '④', '⑤'];
  let currentSnapshot = null;
  let dataSource = 'link';

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

  function parseLink() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const id = params.get(config.serverHashKey || 'id') || '';
    const api = params.get('api') || '';
    const encoded = params.get(config.reportHashKey || 'report') || '';
    let fallback = null;
    if (encoded) {
      try { fallback = core.decodePayload(encoded); }
      catch (error) { console.warn('링크 백업을 해석하지 못했습니다.', error); }
    }
    return { id, api, fallback };
  }

  function questionStats(cohort) {
    return cohort?.questionStats || cohort?.questionRates || [];
  }

  function normalizeSnapshot(raw) {
    let source = raw?.report || raw?.snapshot || raw;
    if (!source?.record) throw new Error('성적 데이터가 없습니다.');
    const recordBase = source.record;
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
    if (dataSource === 'server') return `Google Sheet 누적 데이터 · ${count}명`;
    return `링크 생성 시점 데이터 · ${count}명`;
  }

  function toolbar(snapshot) {
    return `<header class="report-toolbar no-print"><div class="report-toolbar__inner">
      <a class="brand report-brand" href="./" aria-label="Young's Physics 입력 화면"><img class="brand__logo" src="assets/youngs-physics-logo.png" alt="Young's Physics"><span class="brand__descriptor">${esc(snapshot.record.name)} 학생 리포트</span></a>
      <nav class="report-top-nav" aria-label="리포트 메뉴"><a class="report-top-nav__link is-active" href="#dashboard">대시보드</a><a class="report-top-nav__link" href="#scorecard">성적 분석</a><a class="report-top-nav__link" href="#learning-analysis">강점·취약점</a><a class="report-top-nav__link" href="#question-analysis">문항 분석</a><a class="report-top-nav__link" href="#wrong-answer-learning">오답 학습</a></nav>
      <div class="report-toolbar__buttons"><button class="btn btn--soft btn--small" id="copyLink" title="링크 복사"><span class="btn-symbol">↗</span><span>링크 복사</span></button><button class="btn btn--secondary btn--small" id="wordButton" title="Word 저장"><span class="btn-symbol">W</span><span>Word 저장</span></button><button class="btn btn--primary btn--small" id="printButton" title="PDF 저장 또는 인쇄"><span class="btn-symbol">PDF</span><span>PDF·인쇄</span></button></div>
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

  function render(snapshot) {
    currentSnapshot=snapshot;
    app.innerHTML=toolbar(snapshot)+`<div class="report-workspace">${reportSidebar(snapshot)}${reportDocument(snapshot)}</div>`;
    document.getElementById('printButton').addEventListener('click',()=>window.print());
    document.getElementById('copyLink').addEventListener('click',async()=>{await copyText(location.href);notify('리포트 링크를 복사했습니다.');});
    document.getElementById('wordButton').addEventListener('click',downloadWord);
    bindPracticeQuizzes();
  }

  function notify(message) {
    const node=document.createElement('div'); node.className='toast good'; node.textContent=message;
    let stack=document.querySelector('.toast-stack'); if(!stack){stack=document.createElement('div');stack.className='toast-stack no-print';document.body.appendChild(stack);} stack.appendChild(node); setTimeout(()=>node.remove(),3200);
  }

  async function imageToDataUrl(src) {
    const response=await fetch(src); if(!response.ok)throw new Error('이미지 로드 실패');
    const blob=await response.blob();
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  }

  async function downloadWord() {
    const button=document.getElementById('wordButton'); button.disabled=true; const old=button.innerHTML; button.innerHTML='준비 중…';
    try {
      const source=document.getElementById('reportDocument');
      const clone=source.cloneNode(true);
      clone.querySelectorAll('.practice-quiz').forEach((node)=>node.classList.add('is-revealed'));
      clone.querySelectorAll('.practice-feedback,.practice-actions').forEach((node)=>node.remove());
      const images=Array.from(clone.querySelectorAll('img'));
      await Promise.all(images.map(async(img)=>{try{img.src=await imageToDataUrl(new URL(img.getAttribute('src'),document.baseURI||location.href).href);}catch(error){console.warn(error);}}));
      const css=`body{font-family:'Malgun Gothic',Arial,sans-serif;color:#172033;line-height:1.55;font-size:10.5pt}h1{font-size:28pt;color:#063b8f}h2{font-size:19pt;color:#063b8f;border-bottom:2px solid #063b8f;padding-bottom:6pt}h3{font-size:13pt}table{border-collapse:collapse;width:100%;margin:8pt 0}th,td{border:1px solid #cfd7e1;padding:5pt;font-size:9pt}th{background:#eef3f7}.report-section{page-break-inside:auto;margin-bottom:22pt}.report-cover{page-break-after:always;border:8pt solid #063b8f;padding:28pt;background:#f6f9ff}.report-cover__date{font-size:8pt;color:#667;text-align:right}.report-cover__profile{display:block;min-height:72pt;margin-top:16pt}.report-cover__avatar{float:left;width:60pt;height:60pt;border:1pt solid #cddbf0;border-radius:30pt;padding:2pt}.report-cover__avatar img{width:56pt;height:56pt}.report-cover__identity{margin-left:76pt}.report-cover__identity h1{margin:3pt 0;color:#063b8f}.report-cover__tags span{display:inline-block;border:1pt solid #cad9ee;padding:3pt 5pt;margin:2pt;border-radius:8pt;font-size:8pt}.report-cover__metrics{clear:both;display:table;width:100%;margin-top:22pt}.cover-metric{display:table-cell;width:33%;border-top:1pt solid #b9cbe4;padding:8pt}.cover-metric>span,.cover-metric em{display:block;font-size:8pt;color:#667}.cover-metric strong{display:block;font-size:20pt;color:#063b8f}.cover-metric strong small{font-size:9pt}.report-cover__foot{margin-top:22pt;font-size:8pt;color:#667}.score-hero,.score-cards,.chart-grid,.analysis-grid,.review-columns{display:block}.score-main,.score-card,.chart-card,.analysis-card,.review-block{border:1px solid #ccd5df;padding:10pt;margin:7pt 0}.score-main__value{font-size:36pt;color:#063b8f}.progress{height:8pt;background:#e5e9ee}.progress__bar{height:8pt;background:#063b8f}.question-summary{margin:8pt 0}.q-chip{display:inline-block;color:white;background:#777;padding:4pt;margin:2pt}.q-chip.correct{background:#1d7a59}.q-chip.wrong{background:#b23a48}.review-card{page-break-before:always;border:1px solid #cfd7e1;margin:12pt 0}.review-card__head{background:#f1f4f7;padding:9pt}.review-card__body{padding:10pt}.question-image{max-width:100%;max-height:520pt}.formula-list{font-family:Consolas,monospace}.practice-quiz{border:1px solid #bdd4df;padding:10pt;margin-top:10pt;background:#f7fafc}.practice-quiz__head{display:block}.practice-quiz__status,.practice-quiz__eyebrow{font-size:8pt}.practice-quiz__title{font-weight:bold}.practice-options{border:0;padding:0;margin:7pt 0}.practice-option{display:block;border:1px solid #d4dde6;padding:5pt;margin:3pt 0}.practice-option input{display:none}.practice-option__mark{font-weight:bold;margin-right:5pt}.practice-hint{display:none}.practice-solution{display:block;border:1px solid #d4dde6;padding:8pt;margin-top:7pt}.practice-solution__answer{font-weight:bold;border-bottom:1px solid #d4dde6;padding-bottom:5pt;margin-bottom:5pt}.report-footer{font-size:8pt;color:#667;padding:10pt}.no-print,svg{display:none}`;
      const html=`<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(currentSnapshot.record.name)} 성적 리포트</title><style>${css}</style></head><body>${clone.outerHTML}</body></html>`;
      const blob=new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'}); const href=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=href; link.download=`${core.safeFilename(currentSnapshot.record.examTitle)}_${core.safeFilename(currentSnapshot.record.name)}_성적리포트.doc`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(href),1000); notify('Word 파일을 저장했습니다.');
    } catch(error){console.error(error);alert(`Word 파일을 만들지 못했습니다: ${error.message}`);} finally{button.disabled=false;button.innerHTML=old;}
  }

  async function copyText(text) {
    if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(text);
    const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
  }

  function showError(error, fallbackAvailable=false) {
    app.innerHTML=`<div class="error-panel"><div class="boot-mark" style="margin:auto">!</div><h1>성적 리포트를 열 수 없습니다.</h1><p>${esc(error.message||String(error))}</p>${fallbackAvailable?'<p>링크 백업도 함께 확인했지만 올바른 성적 데이터를 찾지 못했습니다.</p>':''}<a class="btn btn--primary" href="./">입력 화면으로 이동</a></div>`;
  }

  async function init() {
    const link=parseLink();
    let raw=null;
    let loadError=null;
    if(link.id&&link.api){
      try{const response=await jsonp(link.api,{action:'get',id:link.id});raw=response.report||response;dataSource='server';}
      catch(error){console.warn('서버 데이터 로드 실패',error);loadError=error;raw=link.fallback;dataSource='link';}
    }else raw=link.fallback;
    if(!raw){showError(loadError||new Error('유효한 학생 결과가 링크에 포함되어 있지 않습니다.'));return;}
    try{render(normalizeSnapshot(raw));}
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

  init();
})();
