(function (root) {
  'use strict';

  if (root.YPWeakUnitPractice?.version) return;

  const VERSION = '3.11.1';
  const factory = root.YPWeakQuestionFactory;
  if (!factory) {
    console.warn('취약 단원 문제 생성기를 찾지 못했습니다.');
    return;
  }

  const state = {
    analysis: root.__YP_PERSISTENT_WEAKNESS__ || null,
    observer: null,
    mounting: false,
    timer: null,
    modal: null,
    activeSet: null,
    activeConcept: null,
    setSize: 10
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function injectStyles() {
    if (document.getElementById('ypWeakPracticeStyles')) return;
    const style = document.createElement('style');
    style.id = 'ypWeakPracticeStyles';
    style.textContent = `
      .weak-practice-card-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
      .weak-practice-launch,.weak-practice-size-btn,.weak-practice-action{
        min-height:42px;padding:0 14px;border:0;border-radius:12px;
        color:#fff;background:linear-gradient(135deg,#083d96,#0a70ff);
        font-weight:900;cursor:pointer;box-shadow:0 8px 22px rgba(10,94,220,.18)
      }
      .weak-practice-launch--secondary,.weak-practice-size-btn.secondary,.weak-practice-action.secondary{
        color:#174e96;background:#fff;border:1px solid #bad1ef;box-shadow:none
      }
      .weak-practice-section{
        position:relative;overflow:hidden;margin-top:22px;padding:25px;
        border:1px solid #d4e4fa;border-radius:24px;
        background:
          radial-gradient(circle at 100% 0,rgba(75,155,255,.16),transparent 28%),
          linear-gradient(180deg,#f8fbff,#eef5ff);
        box-shadow:0 18px 48px rgba(8,50,125,.08)
      }
      .weak-practice-section::after{
        content:"";position:absolute;right:-60px;bottom:-80px;width:220px;height:220px;
        border:30px solid rgba(13,104,242,.06);border-radius:50%;pointer-events:none
      }
      .weak-practice-heading{position:relative;z-index:1;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
      .weak-practice-heading p{margin:0;color:#2563c2;font-size:11px;font-weight:900;letter-spacing:.12em}
      .weak-practice-heading h2{margin:7px 0 0;color:#082f76;font-size:26px;letter-spacing:-.045em}
      .weak-practice-heading .desc{margin:9px 0 0;color:#5d708d;font-size:14px;line-height:1.7;letter-spacing:0;font-weight:500}
      .weak-practice-badge{flex:0 0 auto;padding:8px 11px;border-radius:999px;background:#0a67f5;color:#fff;font-size:12px;font-weight:900}
      .weak-practice-target-grid{position:relative;z-index:1;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:13px;margin-top:18px}
      .weak-practice-target{
        padding:18px;border:1px solid #dce7f5;border-radius:19px;background:rgba(255,255,255,.94);
        box-shadow:0 10px 28px rgba(11,58,130,.06)
      }
      .weak-practice-target__top{display:flex;justify-content:space-between;gap:10px;align-items:center}
      .weak-practice-target__rank{display:grid;place-items:center;width:31px;height:31px;border-radius:10px;background:#0a67f5;color:#fff;font-weight:900}
      .weak-practice-target__status{padding:5px 8px;border-radius:999px;background:#fff1e8;color:#b6511b;font-size:11px;font-weight:900}
      .weak-practice-target h3{margin:13px 0 7px;color:#102f60;font-size:18px}
      .weak-practice-target p{margin:0;color:#63758c;font-size:13px;line-height:1.6}
      .weak-practice-target__meta{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
      .weak-practice-target__meta span{padding:5px 8px;border-radius:999px;background:#eef4ff;color:#315e9f;font-size:11px;font-weight:800}
      .weak-practice-target__buttons{display:flex;flex-wrap:wrap;gap:8px}
      .weak-practice-modal-backdrop{
        position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:16px;
        background:rgba(2,17,44,.68);backdrop-filter:blur(9px)
      }
      .weak-practice-modal{
        width:min(1060px,100%);max-height:calc(100vh - 32px);overflow:auto;
        border:1px solid rgba(155,190,239,.6);border-radius:25px;background:#fff;
        box-shadow:0 32px 100px rgba(0,24,73,.38)
      }
      .weak-practice-modal__header{
        position:sticky;top:0;z-index:4;display:flex;justify-content:space-between;gap:18px;
        padding:22px 24px 18px;color:#fff;
        background:
          radial-gradient(circle at 90% -30%,rgba(126,205,255,.42),transparent 35%),
          linear-gradient(135deg,#052c72,#0873ff)
      }
      .weak-practice-modal__eyebrow{display:block;color:#a9d5ff;font-size:10px;font-weight:900;letter-spacing:.14em}
      .weak-practice-modal__header h2{margin:6px 0 5px;font-size:24px;letter-spacing:-.04em}
      .weak-practice-modal__header p{margin:0;color:#dceaff;font-size:12px;line-height:1.6}
      .weak-practice-close{flex:0 0 auto;width:42px;height:42px;border:0;border-radius:13px;background:rgba(255,255,255,.16);color:#fff;font-size:25px;cursor:pointer}
      .weak-practice-modal__body{padding:20px 23px 25px}
      .weak-practice-summarybar{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;margin-bottom:15px}
      .weak-practice-formulas{display:flex;flex-wrap:wrap;gap:7px}
      .weak-practice-formulas span{padding:7px 10px;border:1px solid #d5e4f8;border-radius:999px;background:#f3f8ff;color:#255794;font-size:11px;font-weight:800}
      .weak-practice-best{padding:9px 12px;border-radius:13px;background:#eef9f2;color:#247046;font-size:12px;font-weight:900}
      .weak-practice-tip{margin-bottom:15px;padding:12px 14px;border:1px solid #f1d9ab;border-radius:14px;background:#fff9ec;color:#80531a;font-size:12px;line-height:1.6}
      .weak-practice-progress{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:15px}
      .weak-practice-progress__track{flex:1;height:8px;border-radius:999px;background:#e7eef7;overflow:hidden}
      .weak-practice-progress__bar{height:100%;width:0;background:linear-gradient(90deg,#0a67f5,#41b6ff);transition:width .2s}
      .weak-practice-progress strong{color:#345473;font-size:12px}
      .weak-question{
        margin-bottom:14px;padding:18px;border:1px solid #dbe6f4;border-radius:19px;background:#fbfdff;
        transition:border-color .2s,box-shadow .2s
      }
      .weak-question.is-unanswered{border-color:#e8b86a;box-shadow:0 0 0 3px rgba(232,184,106,.12)}
      .weak-question__head{display:flex;gap:11px;align-items:flex-start}
      .weak-question__no{flex:0 0 auto;display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#102f60;color:#fff;font-weight:900}
      .weak-question h3{margin:3px 0 0;color:#142b4b;font-size:16px;line-height:1.6}
      .weak-question__chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 12px 45px}
      .weak-question__chips span{padding:5px 8px;border-radius:999px;background:#eef4ff;color:#3a6094;font-size:10px;font-weight:800}
      .weak-choice-list{display:grid;gap:8px;margin-left:45px}
      .weak-choice{
        display:flex;gap:10px;align-items:flex-start;padding:12px 13px;border:1px solid #d6e1ef;border-radius:14px;background:#fff;
        cursor:pointer;transition:all .16s
      }
      .weak-choice:hover{border-color:#91b8ee;background:#f6faff}
      .weak-choice input{margin-top:3px}
      .weak-choice__mark{flex:0 0 auto;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#edf3fb;color:#315e9b;font-size:11px;font-weight:900}
      .weak-choice.is-correct{border-color:#69bd8b;background:#f2fbf5}
      .weak-choice.is-wrong{border-color:#e78e99;background:#fff5f6}
      .weak-solution{margin:12px 0 0 45px;padding:13px 14px;border:1px solid #d7e5f7;border-radius:14px;background:#f5f9ff;color:#405572;font-size:13px;line-height:1.65}
      .weak-solution strong{color:#0c438e}
      .weak-practice-result{
        margin-bottom:16px;padding:17px;border:1px solid #cce7d5;border-radius:17px;background:#f0faf3;color:#225f39
      }
      .weak-practice-result strong{font-size:18px}
      .weak-practice-footer{
        position:sticky;bottom:0;z-index:3;margin:18px -23px -25px;padding:14px 23px;
        border-top:1px solid #dbe6f3;background:rgba(255,255,255,.96);backdrop-filter:blur(8px)
      }
      .weak-practice-footer__actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:9px}
      @media(max-width:720px){
        .weak-practice-section{padding:20px 16px}
        .weak-practice-heading{display:block}
        .weak-practice-badge{display:inline-block;margin-top:12px}
        .weak-practice-modal__header{padding:18px 16px 15px}
        .weak-practice-modal__body{padding:16px}
        .weak-practice-summarybar{grid-template-columns:1fr}
        .weak-question{padding:15px}
        .weak-question__chips,.weak-choice-list,.weak-solution{margin-left:0}
        .weak-practice-footer{margin:16px -16px -16px;padding:13px 16px}
        .weak-practice-footer__actions{display:grid;grid-template-columns:1fr}
        .weak-practice-action{width:100%}
      }
      @media print{
        #weak-unit-practice,.weak-practice-card-actions,.weak-practice-modal-backdrop{display:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function targets(analysis) {
    const result = [];
    const used = new Set();
    const add = (item, source) => {
      if (!item) return;
      const id = factory.resolveId(item.id);
      if (used.has(id)) return;
      used.add(id);
      result.push({ ...item, id, source });
    };
    (analysis?.persistent || []).forEach((item) => add(item, '지속 취약'));
    (analysis?.currentWeak || []).forEach((item) => add(item, '이번 회차 취약'));
    if (!result.length && analysis?.weakestDomain) {
      const domain = String(analysis.weakestDomain.domain || '');
      const fallback = domain.includes('전기') ? 'circuits'
        : domain.includes('파동') ? 'waves-sound'
        : domain.includes('열') ? 'thermal-balance'
        : 'motion-graphs';
      add({ id: fallback, name: factory.groups[fallback].name, accuracy: analysis.weakestDomain.accuracy }, '누적 최저 대단원');
    }
    return result.slice(0, 7);
  }

  function statusText(item) {
    if (item.source === '지속 취약') {
      if (item.streak >= 2) return `${item.streak}회 연속`;
      if (item.missRounds) return `${item.missRounds}개 회차 반복`;
      return '반복 오답';
    }
    return item.source;
  }

  function bestKey(conceptId) {
    const studentToken = String(location.hash || location.pathname || 'student');
    return `yp-weak-practice-best:${studentToken}:${conceptId}`;
  }

  function readBest(conceptId) {
    try {
      const value = JSON.parse(localStorage.getItem(bestKey(conceptId)) || '{}');
      return Number(value.score || 0);
    } catch (error) {
      return 0;
    }
  }

  function saveBest(conceptId, score, total) {
    const percent = total ? Math.round(score / total * 100) : 0;
    const previous = readBest(conceptId);
    if (percent <= previous) return previous;
    try {
      localStorage.setItem(bestKey(conceptId), JSON.stringify({ score: percent, updatedAt: new Date().toISOString() }));
    } catch (error) {
      console.warn('취약 단원 연습 최고 점수를 저장하지 못했습니다.', error);
    }
    return percent;
  }

  function cardButtons(item) {
    return `
      <div class="weak-practice-card-actions">
        <button type="button" class="weak-practice-launch" data-weak-concept="${esc(item.id)}" data-weak-count="10">이 단원 10문제 풀기</button>
        <button type="button" class="weak-practice-launch weak-practice-launch--secondary" data-weak-concept="${esc(item.id)}" data-weak-count="20">20문제 집중훈련</button>
      </div>
    `;
  }

  function insertButtons(analysis) {
    const persistent = analysis?.persistent || [];
    const cards = [...document.querySelectorAll('#cumulative-weakness .cumulative-weakness-card')];
    cards.forEach((card, index) => {
      if (card.querySelector('.weak-practice-card-actions')) return;
      const item = persistent[index];
      if (!item) return;
      card.insertAdjacentHTML('beforeend', cardButtons({ ...item, id: factory.resolveId(item.id) }));
    });
  }

  function targetCard(item, index) {
    const group = factory.groups[item.id] || factory.groups['motion-graphs'];
    const best = readBest(item.id);
    const meta = [];
    if (Number.isFinite(Number(item.accuracy))) meta.push(`누적 정답률 ${Number(item.accuracy).toFixed(1)}%`);
    if (item.missRounds) meta.push(`${item.missRounds}개 회차 실수`);
    if (best) meta.push(`연습 최고 ${best}%`);
    return `
      <article class="weak-practice-target">
        <div class="weak-practice-target__top">
          <span class="weak-practice-target__rank">${index + 1}</span>
          <span class="weak-practice-target__status">${esc(statusText(item))}</span>
        </div>
        <h3>${esc(item.name || group.name)}</h3>
        <p>${esc(group.tip)}</p>
        <div class="weak-practice-target__meta">
          <span>난수 변형 문제</span>
          <span>정답 제출 후 해설</span>
          ${meta.map((text) => `<span>${esc(text)}</span>`).join('')}
        </div>
        <div class="weak-practice-target__buttons">
          <button type="button" class="weak-practice-launch" data-weak-concept="${esc(item.id)}" data-weak-count="5">5문제 빠르게</button>
          <button type="button" class="weak-practice-launch weak-practice-launch--secondary" data-weak-concept="${esc(item.id)}" data-weak-count="10">10문제</button>
          <button type="button" class="weak-practice-launch weak-practice-launch--secondary" data-weak-concept="${esc(item.id)}" data-weak-count="20">20문제</button>
        </div>
      </article>
    `;
  }

  function insertNavLink() {
    const topNav = document.querySelector('.report-top-nav');
    if (topNav && !topNav.querySelector('a[href="#weak-unit-practice"]')) {
      const link = document.createElement('a');
      link.className = 'report-top-nav__link';
      link.href = '#weak-unit-practice';
      link.textContent = '취약 단원 훈련';
      topNav.appendChild(link);
    }
    const sideNav = document.querySelector('.report-side-nav');
    if (sideNav && !sideNav.querySelector('a[href="#weak-unit-practice"]')) {
      const link = document.createElement('a');
      link.className = 'side-nav__link';
      link.href = '#weak-unit-practice';
      link.innerHTML = '<span class="side-nav__icon">▣</span><span>취약 단원 문제</span>';
      sideNav.appendChild(link);
    }
  }

  function insertSection(analysis) {
    const cumulative = document.getElementById('cumulative-weakness');
    const reportDocument = document.getElementById('reportDocument');
    if (!analysis || !reportDocument) return false;

    const list = targets(analysis);
    const existing = document.getElementById('weak-unit-practice');
    if (existing) existing.remove();

    const section = document.createElement('section');
    section.id = 'weak-unit-practice';
    section.className = 'report-section anchor-section weak-practice-section';
    section.innerHTML = `
      <div class="weak-practice-heading">
        <div>
          <p>04 · ADAPTIVE PRACTICE</p>
          <h2>취약 단원 새 문제 훈련</h2>
          <p class="desc">학생의 현재·누적 취약 단원에 맞춰 수치와 상황이 매번 달라지는 새 유사문항을 생성합니다. 같은 버튼을 다시 눌러도 새로운 문제 세트가 나옵니다.</p>
        </div>
        <span class="weak-practice-badge">${list.length}개 단원 맞춤</span>
      </div>
      <div class="weak-practice-target-grid">
        ${list.map(targetCard).join('')}
      </div>
    `;

    if (cumulative?.nextSibling) cumulative.parentNode.insertBefore(section, cumulative.nextSibling);
    else if (cumulative) cumulative.parentNode.appendChild(section);
    else reportDocument.appendChild(section);

    insertNavLink();
    return true;
  }

  function mount() {
    state.timer = null;
    if (state.mounting) return;
    const analysis = state.analysis || root.__YP_PERSISTENT_WEAKNESS__;
    if (!analysis) return;
    state.mounting = true;
    try {
      injectStyles();
      insertButtons(analysis);
      insertSection(analysis);
    } finally {
      state.mounting = false;
    }
  }

  function scheduleMount(delay = 80) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(mount, delay);
  }

  function newSet(conceptId, count) {
    const seed = `${Date.now()}-${Math.random()}-${location.hash}`;
    state.activeConcept = factory.resolveId(conceptId);
    state.setSize = count;
    state.activeSet = factory.generateSet(state.activeConcept, count, seed);
    renderModalBody();
  }

  function questionHtml(question, index) {
    return `
      <article class="weak-question" data-question-index="${index}">
        <div class="weak-question__head">
          <span class="weak-question__no">${index + 1}</span>
          <h3>${esc(question.stem)}</h3>
        </div>
        <div class="weak-question__chips">
          <span>${esc(question.concept)}</span>
          <span>난이도 ${esc(question.difficulty)}</span>
        </div>
        <div class="weak-choice-list">
          ${question.choices.map((choice, choiceIndex) => `
            <label class="weak-choice">
              <input type="radio" name="weak-q-${index}" value="${choiceIndex}">
              <span class="weak-choice__mark">${choiceIndex + 1}</span>
              <span>${esc(choice)}</span>
            </label>
          `).join('')}
        </div>
        <div class="weak-solution" hidden></div>
      </article>
    `;
  }

  function renderModalBody() {
    if (!state.modal || !state.activeSet) return;
    const set = state.activeSet;
    const body = state.modal.querySelector('.weak-practice-modal__body');
    const best = readBest(set.conceptId);
    body.innerHTML = `
      <div class="weak-practice-summarybar">
        <div class="weak-practice-formulas">${set.formulas.map((formula) => `<span>${esc(formula)}</span>`).join('')}</div>
        <div class="weak-practice-best">연습 최고 ${best || 0}%</div>
      </div>
      <div class="weak-practice-tip"><strong>풀이 전략</strong> · ${esc(set.tip)}</div>
      <div class="weak-practice-progress">
        <div class="weak-practice-progress__track"><div class="weak-practice-progress__bar"></div></div>
        <strong><span id="weakAnsweredCount">0</span>/${set.questions.length} 선택</strong>
      </div>
      <div id="weakPracticeResult"></div>
      <form id="weakPracticeForm">${set.questions.map(questionHtml).join('')}</form>
      <div class="weak-practice-footer">
        <div class="weak-practice-footer__actions">
          <button type="button" class="weak-practice-action secondary" data-weak-action="new">새로운 ${set.questions.length}문제</button>
          <button type="button" class="weak-practice-action secondary" data-weak-action="close">닫기</button>
          <button type="button" class="weak-practice-action" data-weak-action="submit">제출하고 정답·해설 보기</button>
        </div>
      </div>
    `;
    updateProgress();
  }

  function openModal(conceptId, count) {
    injectStyles();
    closeModal();
    const resolved = factory.resolveId(conceptId);
    const group = factory.groups[resolved];
    const backdrop = document.createElement('div');
    backdrop.className = 'weak-practice-modal-backdrop';
    backdrop.innerHTML = `
      <section class="weak-practice-modal" role="dialog" aria-modal="true" aria-labelledby="weakPracticeTitle">
        <header class="weak-practice-modal__header">
          <div>
            <span class="weak-practice-modal__eyebrow">YOUNG'S PHYSICS · ADAPTIVE PRACTICE</span>
            <h2 id="weakPracticeTitle">${esc(group.name)} 맞춤 문제</h2>
            <p>정답은 제출하기 전까지 보이지 않습니다. 새 문제 버튼을 누르면 수치와 조건이 다른 세트가 다시 생성됩니다.</p>
          </div>
          <button type="button" class="weak-practice-close" aria-label="닫기">×</button>
        </header>
        <div class="weak-practice-modal__body"></div>
      </section>
    `;
    state.modal = backdrop;
    document.body.appendChild(backdrop);
    newSet(resolved, count);
  }

  function closeModal() {
    if (!state.modal) return;
    state.modal.remove();
    state.modal = null;
    state.activeSet = null;
    document.body.style.overflow = '';
  }

  function updateProgress() {
    if (!state.modal || !state.activeSet) return;
    const answered = state.modal.querySelectorAll('#weakPracticeForm input[type="radio"]:checked').length;
    const total = state.activeSet.questions.length;
    const percent = total ? answered / total * 100 : 0;
    const countNode = state.modal.querySelector('#weakAnsweredCount');
    const bar = state.modal.querySelector('.weak-practice-progress__bar');
    if (countNode) countNode.textContent = String(answered);
    if (bar) bar.style.width = `${percent}%`;
  }

  function submitSet() {
    if (!state.modal || !state.activeSet) return;
    const form = state.modal.querySelector('#weakPracticeForm');
    const resultNode = state.modal.querySelector('#weakPracticeResult');
    const questions = state.activeSet.questions;
    let score = 0;
    let unanswered = 0;

    questions.forEach((question, index) => {
      const block = form.querySelector(`[data-question-index="${index}"]`);
      const selected = block.querySelector(`input[name="weak-q-${index}"]:checked`);
      const choices = [...block.querySelectorAll('.weak-choice')];
      block.classList.toggle('is-unanswered', !selected);
      choices.forEach((choice, choiceIndex) => {
        choice.classList.remove('is-correct', 'is-wrong');
        if (choiceIndex === question.answer) choice.classList.add('is-correct');
      });
      if (!selected) {
        unanswered += 1;
      } else if (Number(selected.value) === question.answer) {
        score += 1;
      } else {
        selected.closest('.weak-choice')?.classList.add('is-wrong');
      }
      const solution = block.querySelector('.weak-solution');
      solution.hidden = false;
      solution.innerHTML = `
        <strong>정답 ${question.answer + 1}번 · ${esc(question.choices[question.answer])}</strong><br>
        ${esc(question.explanation)}
        ${question.formula ? `<br><strong>사용 공식</strong> · ${esc(question.formula)}` : ''}
      `;
    });

    const total = questions.length;
    const percent = Math.round(score / total * 100);
    const best = saveBest(state.activeSet.conceptId, score, total);
    resultNode.innerHTML = `
      <div class="weak-practice-result">
        <strong>${score}/${total}문항 정답 · ${percent}점</strong><br>
        ${unanswered ? `미선택 ${unanswered}문항이 있습니다. ` : ''}
        틀린 문제의 해설을 확인한 뒤 “새로운 ${total}문제”로 반복 훈련하세요. 연습 최고 점수는 ${best}%입니다.
      </div>
    `;
    resultNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleClick(event) {
    const launch = event.target.closest('[data-weak-concept]');
    if (launch) {
      event.preventDefault();
      openModal(launch.dataset.weakConcept, Math.max(1, Number(launch.dataset.weakCount || 10)));
      return;
    }
    if (!state.modal) return;
    if (event.target === state.modal || event.target.closest('.weak-practice-close') || event.target.closest('[data-weak-action="close"]')) {
      closeModal();
      return;
    }
    if (event.target.closest('[data-weak-action="new"]')) {
      newSet(state.activeConcept, state.setSize);
      return;
    }
    if (event.target.closest('[data-weak-action="submit"]')) {
      submitSet();
    }
  }

  root.addEventListener('yp:persistent-weakness-ready', (event) => {
    state.analysis = event.detail || root.__YP_PERSISTENT_WEAKNESS__;
    scheduleMount(60);
  });

  document.addEventListener('click', handleClick, true);
  document.addEventListener('change', (event) => {
    if (event.target.closest('#weakPracticeForm')) updateProgress();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.modal) closeModal();
  });

  state.observer = new MutationObserver(() => {
    const analysis = state.analysis || root.__YP_PERSISTENT_WEAKNESS__;
    if (!analysis) return;
    if (!document.getElementById('weak-unit-practice') || !document.querySelector('.weak-practice-card-actions')) {
      scheduleMount(100);
    }
  });
  state.observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleMount(100), { once: true });
  } else {
    scheduleMount(100);
  }

  root.YPWeakUnitPractice = {
    version: VERSION,
    open: openModal,
    close: closeModal,
    mount,
    targets,
    getAnalysis: () => state.analysis || root.__YP_PERSISTENT_WEAKNESS__
  };
})(typeof window !== 'undefined' ? window : globalThis);
