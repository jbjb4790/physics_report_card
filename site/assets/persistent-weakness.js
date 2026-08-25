(function () {
  'use strict';

  const VERSION = '3.10.0';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const catalog = Array.isArray(root.EXAM_CATALOG) ? root.EXAM_CATALOG : [];
  const core = root.TPLCore || {};
  const state = {
    latest: null,
    insertionScheduled: false,
    observer: null,
    transportInstalled: false
  };

  const ADVICE = {
    'motion-graphs': '속도·가속도·위치 그래프의 기울기와 넓이를 먼저 표시하고, 부호와 운동 방향을 구분해 풀이하세요.',
    'forces-equilibrium': '물체마다 자유물체도를 따로 그리고, 마찰력·장력·수직항력의 방향을 정한 뒤 운동방정식을 세우세요.',
    'energy-spring': '기준면을 정한 뒤 처음과 나중의 운동에너지·중력 퍼텐셜·탄성 퍼텐셜을 한 식에 정리하세요.',
    'momentum-collision': '계의 범위와 외력을 먼저 확인하고, 운동량 보존과 에너지 보존을 서로 구분해서 적용하세요.',
    'circular-oscillation': '구심력은 새로운 힘이 아니라 중심 방향 합력이라는 점과, 단진동의 평형점·진폭·에너지 관계를 함께 복습하세요.',
    'fluid-buoyancy': '부력은 밀어낸 유체의 무게이며, 연속 방정식과 베르누이 법칙의 적용 조건을 구분하세요.',
    'electrostatics': '전기장은 벡터, 전위는 스칼라라는 차이를 기준으로 방향과 부호를 따로 계산하세요.',
    'circuits': '직렬·병렬 구조를 먼저 단순화하고, 전압·전류·전력 관계를 회로 구간별로 표시하세요.',
    'magnetism': '오른손 법칙으로 자기장 방향을 정한 뒤, 전류 또는 전하의 운동 방향과 자기력 방향을 단계별로 확인하세요.',
    'induction': '자기선속의 변화 원인을 먼저 찾고, 렌츠 법칙으로 변화에 반대하는 유도 전류 방향을 결정하세요.',
    'waves-sound': '파장·진동수·속력 관계와 경로차에 따른 보강·상쇄 조건을 구분해 정리하세요.',
    'refraction-tir': '법선을 기준으로 각도를 표시하고, 굴절률·속력·임계각의 관계를 그림에 직접 적어 풀이하세요.',
    'mirrors-lenses': '물체 위치가 초점·구심에 대해 어디인지 먼저 판단한 뒤 상의 위치·방향·크기를 결정하세요.',
    'light-color-quantum': '빛의 합성·분산·광전효과에서 색, 진동수, 에너지의 관계를 구분해 복습하세요.',
    'thermal-balance': '열량 보존에서 각 물체가 잃고 얻은 열량을 부호와 함께 쓰고, 질량·비열·온도 변화를 빠짐없이 대입하세요.',
    'heat-transfer': '전도·대류·복사의 전달 방식과 열저항 관계를 상황별로 구분하세요.',
    'gas-thermodynamics': '상태량 P·V·T 변화와 열·일·내부에너지의 부호를 과정별로 정리하세요.',
    'thermal-expansion': '물질별 열팽창 계수 차이와 바이메탈의 휘어지는 방향을 온도 변화별로 확인하세요.',
    'other': '틀린 문항의 조건, 적용 법칙, 계산 순서를 한 줄씩 분리해 다시 풀어보세요.'
  };

  function normalize(value) {
    return String(value == null ? '' : value)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHtml(value) {
    return normalize(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function roundNumber(value, digits = 1) {
    const factor = 10 ** digits;
    return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
  }

  function examFor(examId) {
    return catalog.find((exam) => String(exam.id) === String(examId)) || null;
  }

  function questionMeta(exam, index) {
    const question = Array.isArray(exam?.questions) ? exam.questions[index] || {} : {};
    return {
      domain: normalize(question.domain || exam?.domains?.[index] || question.unit || '기타'),
      topic: normalize(question.topic || exam?.units?.[index] || question.unit || `문항 ${index + 1}`)
    };
  }

  function conceptFor(domainValue, topicValue) {
    const domain = normalize(domainValue);
    const topic = normalize(topicValue);
    const text = `${domain} ${topic}`;

    if (domain.includes('전기') || domain.includes('자기')) {
      if (/전자기\s*유도|유도\s*(전류|기전력)|렌츠|패러데이|자기선속|운동\s*기전력|코일.*자석|자석.*코일/.test(text)) {
        return { id: 'induction', name: '전자기 유도·렌츠 법칙', domain: '전기·자기' };
      }
      if (/회로|저항|합성저항|전류|전압|전력|전구|전지|키르히호프|전류계|전압계|검류계|송전|스위치/.test(text)) {
        return { id: 'circuits', name: '전기 회로·저항·전력', domain: '전기·자기' };
      }
      if (/자기장|자기력|로렌츠|솔레노이드|직선\s*도선|원형\s*도선|사이클로트론|속도\s*선택기|전동기/.test(text)) {
        return { id: 'magnetism', name: '자기장·자기력', domain: '전기·자기' };
      }
      return { id: 'electrostatics', name: '정전기·전기장·전위', domain: '전기·자기' };
    }

    if (domain.includes('파동') || domain.includes('광학')) {
      if (/거울|렌즈|상의\s|상의$|시력|근시|원시|초점|구심/.test(text)) {
        return { id: 'mirrors-lenses', name: '거울·렌즈·상의 형성', domain: '파동·광학' };
      }
      if (/굴절|전반사|광섬유|겉보기\s*깊이|굴절률|스넬|임계각/.test(text)) {
        return { id: 'refraction-tir', name: '굴절·전반사', domain: '파동·광학' };
      }
      if (/빛의\s*(합성|삼원색)|물체의\s*색|분산|무지개|광전|양자|색광|백색광/.test(text)) {
        return { id: 'light-color-quantum', name: '빛의 색·분산·양자성', domain: '파동·광학' };
      }
      return { id: 'waves-sound', name: '파동·간섭·소리', domain: '파동·광학' };
    }

    if (domain.includes('열') || domain.includes('기체')) {
      if (/열팽창|바이메탈/.test(text)) {
        return { id: 'thermal-expansion', name: '열팽창·바이메탈', domain: '열·기체' };
      }
      if (/기체|열역학|피스톤|분자\s*(운동|에너지)|단열\s*(변화|과정)|이상기체/.test(text)) {
        return { id: 'gas-thermodynamics', name: '기체·열역학', domain: '열·기체' };
      }
      if (/열전도|전도|대류|복사|이중창|석빙고|열저항|단열/.test(text)) {
        return { id: 'heat-transfer', name: '열의 이동·단열', domain: '열·기체' };
      }
      return { id: 'thermal-balance', name: '열평형·비열·열용량', domain: '열·기체' };
    }

    if (domain.includes('역학') || !domain || domain === '기타') {
      if (/운동량|충격량|충돌|반발\s*계수|질량중심/.test(text)) {
        return { id: 'momentum-collision', name: '운동량·충격량·충돌', domain: '역학' };
      }
      if (/원운동|단진동|단진자|진자|구심|주기|진폭/.test(text)) {
        return { id: 'circular-oscillation', name: '원운동·단진동', domain: '역학' };
      }
      if (/부력|베르누이|유체|연속\s*방정식|수면|아르키메데스/.test(text)) {
        return { id: 'fluid-buoyancy', name: '유체·부력·베르누이', domain: '역학' };
      }
      if (/운동에너지|역학적\s*에너지|위치에너지|퍼텐셜|용수철|탄성|일률|일[-·\s]*에너지|에너지\s*보존/.test(text)) {
        return { id: 'energy-spring', name: '일·에너지·용수철', domain: '역학' };
      }
      if (/마찰|장력|도르래|힘의\s*평형|힘의\s*합성|알짜힘|합력|수직항력|겉보기\s*무게|지레|돌림힘|연결\s*물체/.test(text)) {
        return { id: 'forces-equilibrium', name: '힘·마찰·장력·평형', domain: '역학' };
      }
      return { id: 'motion-graphs', name: '운동 그래프·등가속도', domain: '역학' };
    }

    return { id: 'other', name: topic || domain || '기타 개념', domain: domain || '기타' };
  }

  function normalizedAnswers(record, exam) {
    if (typeof core.normalizeAnswers === 'function') {
      return core.normalizeAnswers(record?.answers || [], Number(exam?.answerCount || exam?.answerKey?.length || 0));
    }
    const count = Number(exam?.answerCount || exam?.answerKey?.length || 0);
    return Array.from({ length: count }, (_, index) => {
      const value = record?.answers?.[index];
      return value == null ? '' : value;
    });
  }

  function historyRecords(snapshot) {
    const records = Array.isArray(snapshot?.history) ? snapshot.history.slice() : [];
    const current = snapshot?.record;
    if (current?.examId) {
      const existingIndex = records.findIndex((record) => String(record.examId) === String(current.examId));
      if (existingIndex >= 0) records[existingIndex] = { ...records[existingIndex], ...current };
      else records.push(current);
    }

    const latest = new Map();
    records.forEach((record) => {
      if (!record?.examId) return;
      const key = String(record.examId);
      const previous = latest.get(key);
      const time = Date.parse(String(record.updatedAt || record.createdAt || '')) || 0;
      const previousTime = previous ? (Date.parse(String(previous.updatedAt || previous.createdAt || '')) || 0) : -1;
      if (!previous || time >= previousTime) latest.set(key, record);
    });

    return [...latest.values()].sort((a, b) =>
      Number(a.round || examFor(a.examId)?.round || 0) - Number(b.round || examFor(b.examId)?.round || 0)
    );
  }

  function ensureConcept(map, concept) {
    if (!map.has(concept.id)) {
      map.set(concept.id, {
        ...concept,
        total: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
        roundResults: new Map(),
        refs: [],
        topics: new Map()
      });
    }
    return map.get(concept.id);
  }

  function ensureDomain(map, domain) {
    if (!map.has(domain)) {
      map.set(domain, {
        domain,
        total: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
        roundResults: new Map()
      });
    }
    return map.get(domain);
  }

  function updateRoundResult(target, round, status) {
    if (!target.roundResults.has(round)) {
      target.roundResults.set(round, { total: 0, correct: 0, wrong: 0, blank: 0, miss: 0 });
    }
    const result = target.roundResults.get(round);
    result.total += 1;
    result[status] += 1;
    if (status !== 'correct') result.miss += 1;
  }

  function finalizeConcept(item, currentRound) {
    const roundRows = [...item.roundResults.entries()]
      .map(([round, result]) => ({ round: Number(round), ...result }))
      .sort((a, b) => a.round - b.round);
    const missRounds = roundRows.filter((row) => row.miss > 0);
    let streak = 0;
    for (let index = roundRows.length - 1; index >= 0; index -= 1) {
      if (roundRows[index].miss > 0) streak += 1;
      else break;
    }
    const miss = item.wrong + item.blank;
    const missRate = item.total ? miss / item.total * 100 : 0;
    const currentResult = roundRows.find((row) => row.round === Number(currentRound));
    const latestResult = roundRows[roundRows.length - 1] || null;
    const priorMisses = missRounds.filter((row) => row.round !== Number(currentRound)).length;
    const persistent = roundRows.length >= 2 && missRounds.length >= 2 && (missRate >= 35 || streak >= 2);
    const severity = persistent && (missRounds.length >= 3 || streak >= 3 || missRate >= 60)
      ? 'high'
      : persistent ? 'medium' : 'watch';
    const sortedTopics = [...item.topics.entries()].sort((a, b) => b[1] - a[1]);
    const refs = item.refs.slice().sort((a, b) => a.round - b.round || a.no - b.no);
    return {
      id: item.id,
      name: item.name,
      domain: item.domain,
      total: item.total,
      correct: item.correct,
      wrong: item.wrong,
      blank: item.blank,
      miss,
      accuracy: roundNumber(item.total ? item.correct / item.total * 100 : 0, 1),
      missRate: roundNumber(missRate, 1),
      exposureRounds: roundRows.length,
      missRounds: missRounds.length,
      priorMissRounds: priorMisses,
      streak,
      currentMiss: Boolean(currentResult && currentResult.miss > 0),
      latestMiss: Boolean(latestResult && latestResult.miss > 0),
      persistent,
      severity,
      roundRows,
      refs,
      topTopics: sortedTopics.slice(0, 3).map(([topic]) => topic),
      advice: ADVICE[item.id] || ADVICE.other
    };
  }

  function finalizeDomain(item) {
    const roundRows = [...item.roundResults.entries()]
      .map(([round, result]) => ({ round: Number(round), ...result }))
      .sort((a, b) => a.round - b.round);
    return {
      domain: item.domain,
      total: item.total,
      correct: item.correct,
      wrong: item.wrong,
      blank: item.blank,
      accuracy: roundNumber(item.total ? item.correct / item.total * 100 : 0, 1),
      missRounds: roundRows.filter((row) => row.miss > 0).length,
      exposureRounds: roundRows.length
    };
  }

  function analyzeSnapshot(snapshot) {
    const records = historyRecords(snapshot);
    const conceptMap = new Map();
    const domainMap = new Map();
    const currentRound = Number(snapshot?.record?.round || examFor(snapshot?.record?.examId)?.round || 0);

    records.forEach((record) => {
      const exam = examFor(record.examId);
      if (!exam) return;
      const round = Number(record.round || exam.round || 0);
      const answers = normalizedAnswers(record, exam);
      const count = Number(exam.answerCount || exam.answerKey?.length || answers.length || 0);

      for (let index = 0; index < count; index += 1) {
        const meta = questionMeta(exam, index);
        const concept = conceptFor(meta.domain, meta.topic);
        const answer = answers[index];
        const key = exam.answerKey?.[index];
        const status = answer === '' || answer == null
          ? 'blank'
          : Number(answer) === Number(key) ? 'correct' : 'wrong';

        const conceptItem = ensureConcept(conceptMap, concept);
        const domainItem = ensureDomain(domainMap, concept.domain || meta.domain || '기타');
        [conceptItem, domainItem].forEach((target) => {
          target.total += 1;
          target[status] += 1;
          updateRoundResult(target, round, status);
        });

        conceptItem.topics.set(meta.topic, (conceptItem.topics.get(meta.topic) || 0) + (status === 'correct' ? 0 : 1));
        if (status !== 'correct') {
          conceptItem.refs.push({
            round,
            no: index + 1,
            examId: exam.id,
            topic: meta.topic,
            status
          });
        }
      }
    });

    const concepts = [...conceptMap.values()].map((item) => finalizeConcept(item, currentRound));
    const domains = [...domainMap.values()].map(finalizeDomain).sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
    const persistent = concepts
      .filter((item) => item.persistent)
      .sort((a, b) => {
        const severity = { high: 3, medium: 2, watch: 1 };
        return (severity[b.severity] - severity[a.severity]) ||
          (Number(b.currentMiss) - Number(a.currentMiss)) ||
          (b.streak - a.streak) ||
          (b.missRounds - a.missRounds) ||
          (b.missRate - a.missRate);
      })
      .slice(0, 5);

    const improving = concepts
      .filter((item) => item.missRounds >= 1 && !item.latestMiss && item.exposureRounds >= 2)
      .sort((a, b) => b.missRounds - a.missRounds || a.accuracy - b.accuracy)
      .slice(0, 3);

    const currentWeak = concepts
      .filter((item) => item.currentMiss)
      .sort((a, b) => b.missRate - a.missRate || b.miss - a.miss)
      .slice(0, 3);

    const weakestDomain = domains[0] || null;
    let summary;
    if (records.length < 2) {
      summary = '이전 회차 기록이 아직 충분하지 않아 반복 취약 여부를 확정하기 어렵습니다. 이번 회차 오답을 기준으로 누적 분석을 시작합니다.';
    } else if (persistent.length) {
      const names = persistent.slice(0, 3).map((item) => item.name).join(', ');
      const top = persistent[0];
      summary = `${records.length}개 회차를 함께 분석한 결과 ${names}에서 반복 오답이 확인되었습니다. 특히 ${top.name}은 ${top.missRounds}개 회차에서 ${top.miss}문항을 틀리거나 미기입하여 우선 복습이 필요합니다.`;
    } else {
      const currentText = currentWeak.length ? ` 이번 회차에서는 ${currentWeak.map((item) => item.name).join(', ')}을 우선 보완하세요.` : '';
      summary = `${records.length}개 회차 기준으로 2개 회차 이상 반복된 뚜렷한 취약 단원은 확인되지 않았습니다.${currentText}`;
    }

    return {
      version: VERSION,
      historyCount: records.length,
      currentRound,
      persistent,
      improving,
      currentWeak,
      domains,
      weakestDomain,
      totalMisses: concepts.reduce((sum, item) => sum + item.miss, 0),
      summary,
      identityNote: '이전 회차 연결은 같은 학교와 동일한 최종 학생 이름을 기준으로 합니다. 동명이인 번호가 붙은 학생은 다음 회차에도 같은 이름을 사용해야 정확히 연결됩니다.'
    };
  }

  function rememberSnapshot(snapshot) {
    try {
      if (!snapshot?.record) return;
      const analysis = analyzeSnapshot(snapshot);
      snapshot.analysis = { ...(snapshot.analysis || {}), cumulativeWeakness: analysis };
      state.latest = analysis;
      root.__YP_PERSISTENT_WEAKNESS__ = analysis;
      if (typeof root.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        root.dispatchEvent(new CustomEvent('yp:persistent-weakness-ready', { detail: analysis }));
      }
      scheduleInsert();
    } catch (error) {
      console.warn('이전 회차 누적 취약 분석에 실패했습니다.', error);
    }
  }

  function extractSnapshot(response) {
    return response?.report || response?.snapshot || (response?.record ? response : null);
  }

  function backendUrl() {
    return normalize(root.APP_CONFIG?.backendUrl || '').replace(/\/+$/, '');
  }

  function installTransport() {
    if (state.transportInstalled || typeof document === 'undefined' || typeof Node === 'undefined') return;
    state.transportInstalled = true;
    const previousAppendChild = Node.prototype.appendChild;

    Node.prototype.appendChild = function (child) {
      try {
        if (child?.tagName === 'SCRIPT' && child.src) {
          const url = new URL(child.src);
          const action = normalize(url.searchParams.get('action'));
          const targetBackend = backendUrl();
          if ((!targetBackend || child.src.startsWith(targetBackend)) && (action === 'get' || action === 'getFast')) {
            const callbackName = normalize(url.searchParams.get('callback'));
            const originalCallback = callbackName ? root[callbackName] : null;
            if (callbackName && typeof originalCallback === 'function' && !originalCallback.__ypPersistentWeaknessWrapped) {
              const wrapped = function (response) {
                const snapshot = extractSnapshot(response);
                if (snapshot) rememberSnapshot(snapshot);
                return originalCallback(response);
              };
              wrapped.__ypPersistentWeaknessWrapped = true;
              root[callbackName] = wrapped;
            }
          }
        }
      } catch (error) {
        console.warn('누적 취약 분석 응답 연결을 준비하지 못했습니다.', error);
      }
      return previousAppendChild.apply(this, arguments);
    };
  }

  function tryFallbackSnapshot() {
    try {
      if (state.latest || typeof location === 'undefined' || typeof core.decodePayload !== 'function') return;
      const params = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
      const encoded = params.get(root.APP_CONFIG?.reportHashKey || 'report');
      if (!encoded) return;
      const decoded = core.decodePayload(encoded);
      const snapshot = extractSnapshot(decoded);
      if (snapshot) rememberSnapshot(snapshot);
    } catch (error) {
      console.warn('링크 백업에서 누적 취약 분석을 만들지 못했습니다.', error);
    }
  }

  function severityLabel(item) {
    if (item.severity === 'high') return '우선 복습';
    if (item.streak >= 2) return `${item.streak}회 연속 실수`;
    return '반복 취약';
  }

  function refHtml(ref) {
    return `<span class="cumulative-ref" title="${escapeHtml(ref.topic)}">${ref.round}회 ${ref.no}번${ref.status === 'blank' ? ' · 미기입' : ''}</span>`;
  }

  function persistentCard(item, index) {
    const recentRefs = item.refs.slice(-6);
    const topics = item.topTopics.filter(Boolean).join(' · ');
    return `<article class="cumulative-weakness-card cumulative-weakness-card--${item.severity}">
      <div class="cumulative-weakness-card__top"><span class="cumulative-rank">${index + 1}</span><span class="cumulative-severity">${severityLabel(item)}</span></div>
      <h3>${escapeHtml(item.name)}</h3>
      <p class="cumulative-weakness-card__stat"><strong>${item.missRounds}개 회차</strong>에서 반복 · 누적 <strong>${item.miss}/${item.total}문항</strong> 보완 필요 · 정답률 <strong>${item.accuracy}%</strong></p>
      ${topics ? `<p class="cumulative-weakness-card__topics">자주 틀린 세부 내용 · ${escapeHtml(topics)}</p>` : ''}
      <div class="cumulative-ref-list">${recentRefs.map(refHtml).join('')}</div>
      <div class="cumulative-advice"><strong>복습 포인트</strong><span>${escapeHtml(item.advice)}</span></div>
    </article>`;
  }

  function domainRows(domains) {
    return domains.slice(0, 4).map((item) => {
      const width = Math.max(2, Math.min(100, item.accuracy));
      return `<div class="cumulative-domain-row"><span>${escapeHtml(item.domain)}</span><div class="cumulative-domain-track"><i style="width:${width}%"></i></div><strong>${item.accuracy}%</strong><em>${item.missRounds}개 회차 실수</em></div>`;
    }).join('');
  }

  function sectionHtml(analysis) {
    const persistentBody = analysis.persistent.length
      ? `<div class="cumulative-card-grid">${analysis.persistent.map(persistentCard).join('')}</div>`
      : `<div class="cumulative-empty"><strong>반복 취약 단원이 아직 뚜렷하지 않습니다.</strong><p>${escapeHtml(analysis.summary)}</p></div>`;
    const improving = analysis.improving.length
      ? `<div class="cumulative-improving"><strong>최근 개선된 개념</strong><div>${analysis.improving.map((item) => `<span>${escapeHtml(item.name)} · 최근 출제 정답</span>`).join('')}</div></div>`
      : '';
    const weakest = analysis.weakestDomain
      ? `${analysis.weakestDomain.domain} ${analysis.weakestDomain.accuracy}%`
      : '분석 중';

    return `<section id="cumulative-weakness" class="report-section anchor-section cumulative-weakness-section">
      <div class="section-heading"><div><p class="section-kicker">03 · CUMULATIVE DIAGNOSIS</p><h2 class="section-title">이전 회차까지 본 지속 취약 단원</h2><p class="section-desc">현재 성적표 회차까지 같은 학생의 모든 오답·미기입을 다시 분류하여, 여러 회차에서 반복되는 개념을 우선순위로 표시합니다.</p></div><span class="tag">${analysis.historyCount}개 회차 누적</span></div>
      <div class="cumulative-summary-grid"><div><span>분석 회차</span><strong>${analysis.historyCount}회</strong><em>현재 회차 포함</em></div><div><span>반복 취약</span><strong>${analysis.persistent.length}개</strong><em>2개 회차 이상 반복</em></div><div><span>누적 오답·미기입</span><strong>${analysis.totalMisses}문항</strong><em>전체 연결 회차</em></div><div><span>누적 최저 대단원</span><strong>${escapeHtml(weakest)}</strong><em>정답률 기준</em></div></div>
      <div class="cumulative-comment"><div class="cumulative-comment__icon">◎</div><div><strong>누적 학습 코멘트</strong><p>${escapeHtml(analysis.summary)}</p></div></div>
      <div class="cumulative-layout"><div><div class="cumulative-subheading"><span>반복 오답 우선순위</span><small>같은 개념을 2개 이상 회차에서 틀린 경우</small></div>${persistentBody}${improving}</div><aside class="cumulative-domain-panel"><h3>누적 대단원 성취</h3><p>현재 성적표까지 출제된 문항을 합산한 정답률입니다.</p>${domainRows(analysis.domains)}<div class="cumulative-identity-note">${escapeHtml(analysis.identityNote)}</div></aside></div>
    </section>`;
  }

  function insertNavLink(containerSelector, afterHref, className, label, icon) {
    const container = document.querySelector(containerSelector);
    if (!container || container.querySelector('a[href="#cumulative-weakness"]')) return;
    const link = document.createElement('a');
    link.className = className;
    link.href = '#cumulative-weakness';
    link.innerHTML = icon ? `<span class="side-nav__icon">${icon}</span><span>${label}</span>` : label;
    const after = container.querySelector(`a[href="${afterHref}"]`);
    if (after?.nextSibling) container.insertBefore(link, after.nextSibling);
    else container.appendChild(link);
  }

  function insertBanner(analysis) {
    const learning = document.getElementById('learning-analysis');
    if (!learning) return;
    learning.querySelector('#cumulativeWeaknessBanner')?.remove();
    const banner = document.createElement('a');
    banner.id = 'cumulativeWeaknessBanner';
    banner.className = 'cumulative-comment-banner';
    banner.href = '#cumulative-weakness';
    banner.innerHTML = `<span>이전 회차 누적 분석</span><strong>${escapeHtml(analysis.summary)}</strong><em>지속 취약 단원 자세히 보기 →</em>`;
    const heading = learning.querySelector('.section-heading');
    if (heading?.nextSibling) learning.insertBefore(banner, heading.nextSibling);
    else learning.prepend(banner);
  }

  function insertSection() {
    state.insertionScheduled = false;
    const analysis = state.latest;
    const documentRoot = document.getElementById('reportDocument');
    if (!analysis || !documentRoot) return;

    document.getElementById('cumulative-weakness')?.remove();
    const template = document.createElement('template');
    template.innerHTML = sectionHtml(analysis).trim();
    const section = template.content.firstElementChild;
    const questionSection = document.getElementById('question-analysis');
    if (questionSection) documentRoot.insertBefore(section, questionSection);
    else documentRoot.appendChild(section);

    insertBanner(analysis);
    insertNavLink('.report-top-nav', '#learning-analysis', 'report-top-nav__link', '누적 취약', '');
    insertNavLink('.report-side-nav', '#learning-analysis', 'side-nav__link', '누적 취약', '↻');
  }

  function scheduleInsert() {
    if (state.insertionScheduled || typeof document === 'undefined') return;
    state.insertionScheduled = true;
    setTimeout(insertSection, 0);
  }

  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById('ypPersistentWeaknessStyles')) return;
    const style = document.createElement('style');
    style.id = 'ypPersistentWeaknessStyles';
    style.textContent = `
      .cumulative-comment-banner{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;margin:0 0 16px;padding:15px 17px;border:1px solid #c9dcfb;border-radius:17px;background:linear-gradient(135deg,#f3f8ff,#fff);color:#19365f;text-decoration:none;box-shadow:0 10px 28px rgba(7,54,142,.06)}
      .cumulative-comment-banner>span{padding:6px 9px;border-radius:999px;color:#fff;background:#0a67f5;font-size:10px;font-weight:900;white-space:nowrap}.cumulative-comment-banner>strong{font-size:12px;line-height:1.55}.cumulative-comment-banner>em{color:#0a5ff0;font-size:11px;font-style:normal;font-weight:900;white-space:nowrap}
      .cumulative-weakness-section{overflow:hidden}.cumulative-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.cumulative-summary-grid>div{padding:15px 16px;border:1px solid #d9e7fb;border-radius:17px;background:linear-gradient(180deg,#fff,#f8fbff)}.cumulative-summary-grid span,.cumulative-summary-grid em{display:block;color:#6a7d99;font-size:10px;font-style:normal;font-weight:800}.cumulative-summary-grid strong{display:block;margin:6px 0 4px;color:#0b2e65;font-size:21px;line-height:1.2;letter-spacing:-.035em}
      .cumulative-comment{display:flex;gap:14px;align-items:flex-start;margin:0 0 18px;padding:17px 18px;border:1px solid #bdd5fa;border-radius:19px;background:linear-gradient(135deg,#eaf3ff,#f9fcff)}.cumulative-comment__icon{display:grid;place-items:center;flex:0 0 42px;height:42px;border-radius:14px;color:#fff;background:linear-gradient(135deg,#083a8e,#0a74ff);font-size:20px;font-weight:900}.cumulative-comment strong{color:#0a2e68;font-size:13px}.cumulative-comment p{margin:5px 0 0;color:#405777;font-size:12px;line-height:1.7}
      .cumulative-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(260px,.75fr);gap:16px;align-items:start}.cumulative-subheading{display:flex;justify-content:space-between;align-items:end;gap:12px;margin:0 0 10px}.cumulative-subheading span{color:#0b2858;font-size:14px;font-weight:900}.cumulative-subheading small{color:#7888a1;font-size:10px}.cumulative-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cumulative-weakness-card{position:relative;padding:17px;border:1px solid #d8e4f3;border-radius:19px;background:#fff;box-shadow:0 10px 28px rgba(7,54,142,.06)}.cumulative-weakness-card--high{border-color:#f0bbc1;background:linear-gradient(180deg,#fff9fa,#fff)}.cumulative-weakness-card--medium{border-color:#c6dcfb;background:linear-gradient(180deg,#f8fbff,#fff)}.cumulative-weakness-card__top{display:flex;justify-content:space-between;align-items:center}.cumulative-rank{display:grid;place-items:center;width:27px;height:27px;border-radius:9px;color:#fff;background:#0a5ff0;font-size:11px;font-weight:900}.cumulative-severity{padding:5px 8px;border-radius:999px;color:#a33042;background:#fff0f2;font-size:9px;font-weight:900}.cumulative-weakness-card h3{margin:11px 0 6px;color:#0b2858;font-size:16px;letter-spacing:-.03em}.cumulative-weakness-card__stat{margin:0;color:#526780;font-size:11px;line-height:1.55}.cumulative-weakness-card__stat strong{color:#0b4aa2}.cumulative-weakness-card__topics{margin:8px 0 0;color:#6a7890;font-size:10px;line-height:1.5}.cumulative-ref-list{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0}.cumulative-ref{padding:5px 7px;border:1px solid #d8e4f3;border-radius:8px;color:#4f6482;background:#f7faff;font-size:9px;font-weight:800}.cumulative-advice{display:grid;gap:4px;padding:10px 11px;border-radius:12px;background:#f1f6fd}.cumulative-advice strong{color:#0a4fae;font-size:9px}.cumulative-advice span{color:#405777;font-size:10px;line-height:1.55}
      .cumulative-domain-panel{padding:18px;border:1px solid #d7e4f4;border-radius:19px;background:linear-gradient(180deg,#f8fbff,#fff)}.cumulative-domain-panel h3{margin:0;color:#0b2858;font-size:15px}.cumulative-domain-panel>p{margin:5px 0 15px;color:#718098;font-size:10px;line-height:1.5}.cumulative-domain-row{display:grid;grid-template-columns:75px 1fr 42px;gap:8px;align-items:center;margin:11px 0}.cumulative-domain-row>span{color:#425979;font-size:10px;font-weight:900}.cumulative-domain-row>strong{color:#0b4da8;font-size:10px;text-align:right}.cumulative-domain-row>em{grid-column:2/4;margin-top:-4px;color:#8a97aa;font-size:8px;font-style:normal}.cumulative-domain-track{height:8px;overflow:hidden;border-radius:999px;background:#e4ebf4}.cumulative-domain-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#0b4da8,#1683ff)}.cumulative-identity-note{margin-top:15px;padding:11px;border:1px dashed #c8d6e8;border-radius:12px;color:#667792;background:#fff;font-size:9px;line-height:1.55}.cumulative-empty{padding:22px;border:1px dashed #c9d9ec;border-radius:17px;text-align:center;background:#fafcff}.cumulative-empty strong{color:#0b3b82}.cumulative-empty p{margin:7px 0 0;color:#697a94;font-size:11px;line-height:1.65}.cumulative-improving{margin-top:12px;padding:13px 14px;border:1px solid #cae7da;border-radius:15px;background:#f5fcf8}.cumulative-improving>strong{display:block;color:#176b4f;font-size:11px}.cumulative-improving>div{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.cumulative-improving span{padding:6px 8px;border-radius:8px;color:#276b56;background:#fff;font-size:9px;font-weight:800}
      @media(max-width:980px){.cumulative-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cumulative-layout{grid-template-columns:1fr}.cumulative-domain-panel{order:-1}}@media(max-width:680px){.cumulative-comment-banner{grid-template-columns:1fr}.cumulative-comment-banner>em{white-space:normal}.cumulative-summary-grid,.cumulative-card-grid{grid-template-columns:1fr}.cumulative-subheading{display:block}.cumulative-subheading small{display:block;margin-top:3px}.cumulative-domain-row{grid-template-columns:70px 1fr 38px}}
      @media print{.cumulative-weakness-section,.cumulative-weakness-card,.cumulative-domain-panel,.cumulative-comment{break-inside:avoid;page-break-inside:avoid}.cumulative-comment-banner{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function observeReport() {
    if (typeof document === 'undefined' || state.observer) return;
    state.observer = new MutationObserver(() => {
      if (state.latest && document.getElementById('reportDocument') && !document.getElementById('cumulative-weakness')) scheduleInsert();
    });
    const target = document.getElementById('reportApp') || document.body;
    state.observer.observe(target, { childList: true, subtree: true });
  }

  root.YPPersistentWeakness = {
    version: VERSION,
    analyzeSnapshot,
    conceptFor,
    getLatest: () => state.latest
  };

  if (typeof document === 'undefined') return;
  injectStyles();
  installTransport();
  observeReport();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryFallbackSnapshot, { once: true });
  } else {
    tryFallbackSnapshot();
  }
})();
