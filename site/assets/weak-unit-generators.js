(function (root) {
  'use strict';

  if (root.YPWeakQuestionFactory?.version) return;

  const VERSION = '3.11.1';

  function hashSeed(value) {
    let hash = 2166136261;
    const text = String(value ?? '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRng(seedValue) {
    let state = hashSeed(seedValue) || 0x9e3779b9;
    return function random() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  const int = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;
  const pick = (rng, values) => values[Math.floor(rng() * values.length)];
  const round = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  };
  const fmt = (value, digits = 2) => {
    const number = round(value, digits);
    return Number.isInteger(number) ? String(number) : String(number).replace(/0+$/, '').replace(/\.$/, '');
  };

  function shuffle(rng, values) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function unique(values) {
    const seen = new Set();
    return values.filter((value) => {
      const key = String(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function choiceQuestion(rng, options) {
    const correct = String(options.correct);
    let choices = unique([correct, ...(options.distractors || []).map(String)]);
    const fallback = options.fallback || ['0', '1', '2', '3', '4', '5', '10', '20'];
    for (const value of fallback) {
      if (choices.length >= 5) break;
      if (!choices.includes(String(value))) choices.push(String(value));
    }
    choices = shuffle(rng, choices.slice(0, 5));
    return {
      id: `${options.conceptId}-${Math.random().toString(36).slice(2)}`,
      conceptId: options.conceptId,
      concept: options.concept,
      difficulty: options.difficulty || '중',
      stem: options.stem,
      choices,
      answer: choices.indexOf(correct),
      explanation: options.explanation,
      formula: options.formula || '',
      skill: options.skill || options.concept || ''
    };
  }

  function numericQuestion(rng, options) {
    const unit = options.unit ? ` ${options.unit}` : '';
    const correct = `${fmt(options.correct, options.digits ?? 2)}${unit}`;
    const distractors = (options.distractors || []).map((value) =>
      typeof value === 'string' ? value : `${fmt(value, options.digits ?? 2)}${unit}`
    );
    return choiceQuestion(rng, { ...options, correct, distractors });
  }

  function ratioQuestion(rng, options) {
    return choiceQuestion(rng, options);
  }

  const GROUPS = {
    'motion-graphs': {
      name: '운동 그래프·등가속도',
      domain: '역학',
      formulas: ['v = v₀ + at', 's = v₀t + ½at²', 'v² - v₀² = 2as', 'v-t 그래프 넓이 = 변위'],
      tip: '그래프에서는 기울기와 넓이가 어떤 물리량인지 먼저 표시하세요.',
      templates: [
        (rng) => {
          const v0 = int(rng, 2, 10), a = int(rng, 1, 5), t = int(rng, 2, 6);
          const answer = v0 + a * t;
          return numericQuestion(rng, {
            conceptId: 'motion-graphs', concept: '등가속도 속도식',
            stem: `처음 속력이 ${v0} m/s인 물체가 ${a} m/s²의 일정한 가속도로 ${t}초 동안 운동했다. 나중 속력은?`,
            correct: answer, distractors: [v0 + a, a * t, v0 + a * (t - 1), v0 + 0.5 * a * t],
            unit: 'm/s', formula: 'v = v₀ + at',
            explanation: `v = ${v0} + ${a}×${t} = ${answer} m/s이다.`
          });
        },
        (rng) => {
          const v0 = pick(rng, [0, 2, 4, 6]), a = pick(rng, [2, 4]), t = int(rng, 2, 5);
          const answer = v0 * t + 0.5 * a * t * t;
          return numericQuestion(rng, {
            conceptId: 'motion-graphs', concept: '등가속도 변위',
            stem: `처음 속도 ${v0} m/s, 가속도 ${a} m/s²인 물체가 ${t}초 동안 이동한 변위는?`,
            correct: answer, distractors: [v0 * t + a * t * t, 0.5 * a * t * t, (v0 + a * t) * t, v0 + a * t],
            unit: 'm', formula: 's = v₀t + ½at²',
            explanation: `s = ${v0}×${t} + ½×${a}×${t}² = ${answer} m이다.`
          });
        },
        (rng) => {
          const v1 = int(rng, 2, 8), a = int(rng, 1, 4), t = int(rng, 2, 6);
          const v2 = v1 + a * t;
          const answer = (v1 + v2) / 2 * t;
          return numericQuestion(rng, {
            conceptId: 'motion-graphs', concept: 'v-t 그래프 넓이',
            stem: `속력이 ${v1} m/s에서 ${v2} m/s로 ${t}초 동안 일정하게 증가했다. 이 동안 이동거리는?`,
            correct: answer, distractors: [v2 * t, (v2 - v1) * t, (v1 + v2) * t, 0.5 * (v2 - v1) * t],
            unit: 'm', formula: 's = 평균속력×시간 = ½(v₁+v₂)t',
            explanation: `평균속력은 (${v1}+${v2})/2 = ${(v1 + v2) / 2} m/s이고, 이동거리는 ${answer} m이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'motion-graphs', concept: '그래프 해석',
          stem: '위치-시간(x-t) 그래프의 한 점에서 접선의 기울기가 의미하는 물리량은?',
          correct: '그 순간의 속도', distractors: ['그 순간의 가속도', '그때까지의 이동거리', '물체의 질량', '그 순간의 알짜힘'],
          explanation: '위치-시간 그래프의 순간 기울기 dx/dt는 순간 속도이다.',
          formula: 'v = dx/dt'
        }),
        (rng) => {
          const s = pick(rng, [24, 30, 36, 42]), t = pick(rng, [3, 4, 6]);
          const answer = s / t;
          return numericQuestion(rng, {
            conceptId: 'motion-graphs', concept: '평균속력',
            stem: `물체가 총 ${s} m를 ${t}초 동안 이동했다. 평균속력은?`,
            correct: answer, distractors: [s * t, s / (t + 1), (s + t) / t, s / (2 * t)],
            unit: 'm/s', explanation: `평균속력 = 총 이동거리/총 시간 = ${s}/${t} = ${fmt(answer)} m/s이다.`,
            formula: '평균속력 = 총 이동거리 / 총 시간'
          });
        }
      ]
    },

    'forces-equilibrium': {
      name: '힘·마찰·장력·평형',
      domain: '역학',
      formulas: ['ΣF = ma', 'fₖ = μₖN', '평형: ΣF = 0, Στ = 0', 'τ = rF sinθ'],
      tip: '물체별 자유물체도를 먼저 그리고, 같은 줄의 장력과 작용·반작용을 구분하세요.',
      templates: [
        (rng) => {
          const m = int(rng, 2, 6), mu = pick(rng, [0.1, 0.2, 0.3]), extra = int(rng, 2, 6);
          const friction = mu * m * 10;
          const F = friction + m * extra;
          return numericQuestion(rng, {
            conceptId: 'forces-equilibrium', concept: '마찰이 있는 수평 운동',
            stem: `질량 ${m} kg 물체가 거친 수평면 위에 있다. 운동마찰계수는 ${mu}이고 오른쪽으로 ${fmt(F)} N의 힘을 가한다. 가속도는? (g=10 m/s²)`,
            correct: extra, distractors: [F / m, friction / m, extra + mu * 10, Math.max(0, extra - mu * 10)],
            unit: 'm/s²', formula: 'F - μmg = ma',
            explanation: `마찰력은 μmg=${mu}×${m}×10=${fmt(friction)} N, 알짜힘은 ${fmt(F - friction)} N이므로 a=${extra} m/s²이다.`
          });
        },
        (rng) => {
          const m1 = int(rng, 1, 4), m2 = m1 + int(rng, 1, 4);
          const answer = 10 * (m2 - m1) / (m1 + m2);
          return numericQuestion(rng, {
            conceptId: 'forces-equilibrium', concept: '도르래 연결 물체',
            stem: `질량 ${m1} kg과 ${m2} kg인 두 물체를 가벼운 줄로 연결해 도르래에 걸었다. 가속도 크기는? (g=10 m/s²)`,
            correct: answer, distractors: [10 * (m2 + m1) / (m2 - m1), 10 * m2 / (m1 + m2), 10 * (m2 - m1) / m2, 10 * m1 / (m1 + m2)],
            unit: 'm/s²', formula: 'a = (m₂-m₁)g/(m₁+m₂)',
            explanation: `a=(${m2}-${m1})×10/(${m1}+${m2})=${fmt(answer)} m/s²이다.`
          });
        },
        (rng) => {
          const F1 = int(rng, 2, 8), d1 = int(rng, 2, 5), d2 = int(rng, 1, 4);
          const answer = F1 * d1 / d2;
          return numericQuestion(rng, {
            conceptId: 'forces-equilibrium', concept: '돌림힘 평형',
            stem: `지레의 한쪽에서 받침점으로부터 ${d1} m 떨어진 곳에 ${F1} N의 힘이 작용한다. 반대쪽 ${d2} m 지점에 가해야 평형이 되는 힘은?`,
            correct: answer, distractors: [F1 * d2 / d1, F1 * (d1 + d2), F1 * d1, F1 / d2],
            unit: 'N', formula: 'F₁d₁ = F₂d₂',
            explanation: `돌림힘 평형에서 ${F1}×${d1}=F₂×${d2}, 따라서 F₂=${fmt(answer)} N이다.`
          });
        },
        (rng) => {
          const m = int(rng, 40, 80), a = int(rng, 1, 3);
          const answer = m * (10 + a);
          return numericQuestion(rng, {
            conceptId: 'forces-equilibrium', concept: '엘리베이터 겉보기 무게',
            stem: `질량 ${m} kg인 학생이 위쪽으로 ${a} m/s²의 가속도로 움직이는 엘리베이터 안 체중계 위에 있다. 체중계가 나타내는 수직항력은? (g=10 m/s²)`,
            correct: answer, distractors: [m * 10, m * (10 - a), m * a, m * (10 + 2 * a)],
            unit: 'N', formula: 'N - mg = ma',
            explanation: `N=m(g+a)=${m}×(10+${a})=${answer} N이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'forces-equilibrium', concept: '작용·반작용',
          stem: '수평면 위 상자가 정지해 있을 때, 상자에 작용하는 중력과 수직항력의 관계로 옳은 것은?',
          correct: '크기는 같고 평형 관계이지만 작용·반작용 쌍은 아니다',
          distractors: ['서로 작용·반작용 쌍이다', '중력이 항상 더 크다', '수직항력이 항상 더 크다', '두 힘의 방향이 같다'],
          explanation: '두 힘은 같은 물체에 작용해 평형을 이루며, 작용·반작용은 서로 다른 물체에 작용한다.',
          formula: '평형: ΣF=0'
        })
      ]
    },

    'energy-spring': {
      name: '일·에너지·용수철',
      domain: '역학',
      formulas: ['K = ½mv²', 'U_g = mgh', 'U_s = ½kx²', 'W_net = ΔK', 'P = W/t'],
      tip: '처음과 나중 상태의 에너지 항을 표로 정리하고 마찰이 한 일을 따로 넣으세요.',
      templates: [
        (rng) => {
          const m = int(rng, 1, 5), v = int(rng, 2, 8);
          const answer = 0.5 * m * v * v;
          return numericQuestion(rng, {
            conceptId: 'energy-spring', concept: '운동에너지',
            stem: `질량 ${m} kg인 물체가 ${v} m/s로 운동한다. 운동에너지는?`,
            correct: answer, distractors: [m * v, m * v * v, 0.5 * m * v, answer + m * 10],
            unit: 'J', formula: 'K = ½mv²',
            explanation: `K=½×${m}×${v}²=${fmt(answer)} J이다.`
          });
        },
        (rng) => {
          const k = pick(rng, [100, 200, 300, 400]), x = pick(rng, [0.1, 0.2, 0.3]);
          const answer = 0.5 * k * x * x;
          return numericQuestion(rng, {
            conceptId: 'energy-spring', concept: '탄성 퍼텐셜에너지',
            stem: `용수철 상수 ${k} N/m인 용수철을 ${x} m 압축했다. 저장된 탄성 퍼텐셜에너지는?`,
            correct: answer, distractors: [k * x, k * x * x, 0.5 * k * x, answer * 2],
            unit: 'J', formula: 'U_s = ½kx²',
            explanation: `U_s=½×${k}×${x}²=${fmt(answer)} J이다.`
          });
        },
        (rng) => {
          const h = pick(rng, [1.25, 1.8, 3.2, 5]);
          const answer = Math.sqrt(20 * h);
          return numericQuestion(rng, {
            conceptId: 'energy-spring', concept: '역학적 에너지 보존',
            stem: `물체를 높이 ${h} m에서 정지 상태로 놓았다. 마찰 없이 바닥에 도달할 때 속력은? (g=10 m/s²)`,
            correct: answer, distractors: [10 * h, Math.sqrt(10 * h), 20 * h, answer / 2],
            unit: 'm/s', formula: 'mgh = ½mv²',
            explanation: `v=√(2gh)=√(20×${h})=${fmt(answer)} m/s이다.`
          });
        },
        (rng) => {
          const m = int(rng, 2, 5), mu = pick(rng, [0.1, 0.2, 0.3]), s = int(rng, 3, 8);
          const answer = mu * m * 10 * s;
          return numericQuestion(rng, {
            conceptId: 'energy-spring', concept: '마찰이 한 일',
            stem: `질량 ${m} kg 물체가 운동마찰계수 ${mu}인 수평면을 ${s} m 이동했다. 마찰력이 한 일의 크기는? (g=10 m/s²)`,
            correct: answer, distractors: [mu * m * s, m * 10 * s, mu * m * 10, answer / 2],
            unit: 'J', formula: '|W_f| = μmgs',
            explanation: `|W_f|=${mu}×${m}×10×${s}=${fmt(answer)} J이다.`
          });
        },
        (rng) => {
          const W = pick(rng, [600, 900, 1200, 1500]), t = pick(rng, [3, 5, 6, 10]);
          const answer = W / t;
          return numericQuestion(rng, {
            conceptId: 'energy-spring', concept: '일률',
            stem: `${W} J의 일을 ${t}초 동안 했다. 평균 일률은?`,
            correct: answer, distractors: [W * t, W / (2 * t), W + t, t / W],
            unit: 'W', formula: 'P = W/t',
            explanation: `P=${W}/${t}=${fmt(answer)} W이다.`
          });
        }
      ]
    },

    'momentum-collision': {
      name: '운동량·충격량·충돌',
      domain: '역학',
      formulas: ['p = mv', 'I = FΔt = Δp', 'Σp_before = Σp_after'],
      tip: '양의 방향을 정하고 속도에 부호를 붙인 뒤, 외력이 무시되는 계를 선택하세요.',
      templates: [
        (rng) => {
          const m1 = int(rng, 1, 4), m2 = int(rng, 1, 4), v1 = int(rng, 2, 8), v2 = 0;
          const answer = m1 * v1 / (m1 + m2);
          return numericQuestion(rng, {
            conceptId: 'momentum-collision', concept: '완전 비탄성 충돌',
            stem: `질량 ${m1} kg 물체가 ${v1} m/s로 움직이다가 정지한 질량 ${m2} kg 물체와 충돌해 붙었다. 충돌 직후 속력은?`,
            correct: answer, distractors: [v1, m1 * v1 / m2, v1 / (m1 + m2), (m1 + m2) * v1 / m1],
            unit: 'm/s', formula: 'm₁v₁ = (m₁+m₂)v',
            explanation: `운동량 보존에서 v=${m1}×${v1}/(${m1}+${m2})=${fmt(answer)} m/s이다.`
          });
        },
        (rng) => {
          const F = int(rng, 5, 20), t = pick(rng, [0.2, 0.4, 0.5, 1, 2]);
          const answer = F * t;
          return numericQuestion(rng, {
            conceptId: 'momentum-collision', concept: '충격량',
            stem: `평균힘 ${F} N이 ${t}초 동안 작용했다. 충격량은?`,
            correct: answer, distractors: [F / t, F + t, 0.5 * F * t, answer * 2],
            unit: 'N·s', formula: 'I = FΔt',
            explanation: `I=${F}×${t}=${fmt(answer)} N·s이다.`
          });
        },
        (rng) => {
          const m = int(rng, 1, 4), vi = int(rng, 2, 6), vf = -int(rng, 1, 5), dt = pick(rng, [0.1, 0.2, 0.5]);
          const answer = Math.abs(m * (vf - vi) / dt);
          return numericQuestion(rng, {
            conceptId: 'momentum-collision', concept: '평균 충돌력',
            stem: `질량 ${m} kg 공의 속도가 ${vi} m/s에서 ${vf} m/s로 ${dt}초 동안 변했다. 평균힘의 크기는?`,
            correct: answer, distractors: [Math.abs(m * (vf + vi) / dt), Math.abs(m * (vf - vi)), Math.abs((vf - vi) / (m * dt)), answer / 2],
            unit: 'N', formula: 'F_avg = Δp/Δt',
            explanation: `|F|=|${m}×(${vf}-${vi})/${dt}|=${fmt(answer)} N이다.`
          });
        },
        (rng) => {
          const m1 = int(rng, 1, 4), v1 = int(rng, 2, 6), m2 = int(rng, 1, 4);
          const answer = m1 * v1 / m2;
          return numericQuestion(rng, {
            conceptId: 'momentum-collision', concept: '반동',
            stem: `정지한 계에서 질량 ${m1} kg 물체가 오른쪽으로 ${v1} m/s로 분리되었다. 질량 ${m2} kg인 다른 물체의 왼쪽 방향 속력은?`,
            correct: answer, distractors: [v1, m2 * v1 / m1, (m1 + m2) * v1, m1 * m2 / v1],
            unit: 'm/s', formula: 'm₁v₁ + m₂v₂ = 0',
            explanation: `운동량 합이 0이므로 속력은 ${m1}×${v1}/${m2}=${fmt(answer)} m/s이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'momentum-collision', concept: '충돌 안전',
          stem: '같은 운동량 변화가 일어날 때 에어백이 탑승자가 받는 평균힘을 줄이는 원리는?',
          correct: '충돌 시간을 늘려 평균힘을 줄인다',
          distractors: ['운동량 변화를 0으로 만든다', '질량을 줄인다', '충돌 시간을 줄인다', '중력을 없앤다'],
          explanation: 'I=FΔt=Δp에서 같은 Δp라면 Δt가 커질수록 평균힘 F가 작아진다.',
          formula: 'F_avg = Δp/Δt'
        })
      ]
    },

    'circular-oscillation': {
      name: '원운동·단진동',
      domain: '역학',
      formulas: ['a_c = v²/r = ω²r', 'v = ωr', 'T_spring = 2π√(m/k)', 'E = ½kA²'],
      tip: '구심력은 별도의 힘이 아니라 중심 방향 합력이고, 단진동에서는 평형점과 끝점을 구분하세요.',
      templates: [
        (rng) => {
          const r = pick(rng, [1, 2, 4]), v = pick(rng, [2, 4, 6, 8]);
          const answer = v * v / r;
          return numericQuestion(rng, {
            conceptId: 'circular-oscillation', concept: '구심가속도',
            stem: `반지름 ${r} m인 원궤도를 속력 ${v} m/s로 등속 원운동한다. 구심가속도는?`,
            correct: answer, distractors: [v / r, v * r, v * v * r, 2 * v / r],
            unit: 'm/s²', formula: 'a_c = v²/r',
            explanation: `a_c=${v}²/${r}=${fmt(answer)} m/s²이다.`
          });
        },
        (rng) => {
          const omega = int(rng, 2, 6), r = pick(rng, [0.5, 1, 2, 3]);
          const answer = omega * r;
          return numericQuestion(rng, {
            conceptId: 'circular-oscillation', concept: '각속도와 선속도',
            stem: `각속도 ${omega} rad/s로 회전하는 원판에서 회전축으로부터 ${r} m 떨어진 점의 속력은?`,
            correct: answer, distractors: [omega / r, omega * r * r, r / omega, 2 * omega * r],
            unit: 'm/s', formula: 'v = ωr',
            explanation: `v=${omega}×${r}=${fmt(answer)} m/s이다.`
          });
        },
        (rng) => {
          const factor = pick(rng, [4, 9, 16]);
          return ratioQuestion(rng, {
            conceptId: 'circular-oscillation', concept: '용수철 진자 주기',
            stem: `같은 용수철에 매단 물체의 질량을 ${factor}배로 바꾸면 주기는 처음의 몇 배인가?`,
            correct: `${Math.sqrt(factor)}배`,
            distractors: [`${factor}배`, `${1 / factor}배`, `${fmt(1 / Math.sqrt(factor))}배`, '변하지 않는다'],
            formula: 'T ∝ √m',
            explanation: `T=2π√(m/k)이므로 질량이 ${factor}배이면 주기는 √${factor}=${Math.sqrt(factor)}배이다.`
          });
        },
        (rng) => {
          const ratio = pick(rng, [
            { x: 'A/2', u: 1, k: 3 },
            { x: 'A/3', u: 1, k: 8 },
            { x: 'A/√2', u: 1, k: 1 }
          ]);
          return ratioQuestion(rng, {
            conceptId: 'circular-oscillation', concept: '단진동 에너지',
            stem: `진폭 A로 단진동하는 용수철 진자가 변위 ${ratio.x}를 지날 때 탄성 퍼텐셜에너지 : 운동에너지는?`,
            correct: `${ratio.u}:${ratio.k}`,
            distractors: [`${ratio.k}:${ratio.u}`, '1:2', '2:1', '1:4'],
            formula: 'U/E = x²/A²',
            explanation: `U/E=x²/A²이고 K=E-U이다. 따라서 비는 ${ratio.u}:${ratio.k}이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'circular-oscillation', concept: '단진동 상태',
          stem: '이상적인 단진동 물체가 평형점을 통과하는 순간의 상태로 옳은 것은?',
          correct: '속력은 최대이고 가속도는 0이다',
          distractors: ['속력과 가속도가 모두 최대이다', '속력은 0이고 가속도는 최대이다', '속력과 가속도가 모두 0이다', '퍼텐셜에너지가 최대이다'],
          explanation: '평형점에서는 변위 x=0이므로 복원가속도는 0이고 운동에너지가 최대이다.',
          formula: 'a = -ω²x'
        })
      ]
    },

    'fluid-buoyancy': {
      name: '유체·부력·베르누이',
      domain: '역학',
      formulas: ['p = ρgh', 'F_b = ρVg', 'A₁v₁ = A₂v₂', 'p + ½ρv² + ρgh = 일정'],
      tip: '잠긴 부피와 물체 전체 부피를 구분하고, 같은 유선에서 연속 방정식과 베르누이식을 적용하세요.',
      templates: [
        (rng) => {
          const rho = pick(rng, [800, 1000, 1200]), h = pick(rng, [0.5, 1, 1.5, 2]);
          const answer = rho * 10 * h;
          return numericQuestion(rng, {
            conceptId: 'fluid-buoyancy', concept: '유체 압력',
            stem: `밀도 ${rho} kg/m³인 액체 속 깊이 ${h} m에서 액체에 의한 압력은? (g=10 m/s², 대기압 제외)`,
            correct: answer, distractors: [rho * h, rho * 10 / h, 10 * h, rho * 10 * h * h],
            unit: 'Pa', formula: 'p = ρgh',
            explanation: `p=${rho}×10×${h}=${fmt(answer)} Pa이다.`
          });
        },
        (rng) => {
          const rho = pick(rng, [800, 1000, 1200]), V = pick(rng, [0.002, 0.005, 0.01]);
          const answer = rho * V * 10;
          return numericQuestion(rng, {
            conceptId: 'fluid-buoyancy', concept: '부력',
            stem: `부피 ${V} m³인 물체가 밀도 ${rho} kg/m³인 액체에 완전히 잠겼다. 부력은? (g=10 m/s²)`,
            correct: answer, distractors: [rho * V, V * 10, rho / V, answer / 2],
            unit: 'N', formula: 'F_b = ρVg',
            explanation: `F_b=${rho}×${V}×10=${fmt(answer)} N이다.`
          });
        },
        (rng) => {
          const rhoObj = pick(rng, [400, 600, 750, 800]), rhoFluid = 1000;
          const answer = rhoObj / rhoFluid * 100;
          return numericQuestion(rng, {
            conceptId: 'fluid-buoyancy', concept: '뜨는 물체',
            stem: `밀도 ${rhoObj} kg/m³인 물체가 물(1000 kg/m³)에 떠 있다. 물속에 잠긴 부피는 전체의 몇 %인가?`,
            correct: answer, distractors: [100 - answer, rhoFluid / rhoObj * 100, rhoObj / 10, answer / 2],
            unit: '%', formula: 'V_sub/V = ρ_object/ρ_fluid',
            explanation: `잠긴 비율=${rhoObj}/1000=${answer / 100}, 즉 ${answer}%이다.`
          });
        },
        (rng) => {
          const ratio = pick(rng, [2, 3, 4]), v1 = int(rng, 1, 4);
          const answer = ratio * v1;
          return numericQuestion(rng, {
            conceptId: 'fluid-buoyancy', concept: '연속 방정식',
            stem: `수평 관의 단면적이 A에서 B로 갈 때 1/${ratio}로 줄어든다. A에서 유속이 ${v1} m/s이면 B에서 유속은?`,
            correct: answer, distractors: [v1 / ratio, v1, ratio * ratio * v1, v1 + ratio],
            unit: 'm/s', formula: 'A₁v₁ = A₂v₂',
            explanation: `A_B=A_A/${ratio}이므로 v_B=${ratio}v_A=${answer} m/s이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'fluid-buoyancy', concept: '베르누이 원리',
          stem: '높이가 같은 수평 관에서 유체의 속력이 더 빠른 지점에 대한 설명으로 옳은 것은?',
          correct: '정압은 더 작다',
          distractors: ['정압은 더 크다', '밀도는 반드시 0이다', '중력 퍼텐셜에너지가 더 크다', '유량은 반드시 더 작다'],
          explanation: '높이가 같고 손실을 무시하면 속력이 커질수록 정압은 작아진다.',
          formula: 'p + ½ρv² = 일정'
        })
      ]
    },

    'electrostatics': {
      name: '정전기·전기장·전위',
      domain: '전기·자기',
      formulas: ['F = k|q₁q₂|/r²', 'E = k|Q|/r²', 'V = kQ/r', 'U = qV'],
      tip: '전기장은 벡터, 전위는 스칼라라는 차이를 이용해 방향과 부호를 따로 처리하세요.',
      templates: [
        (rng) => {
          const factor = pick(rng, [2, 3, 4]);
          return ratioQuestion(rng, {
            conceptId: 'electrostatics', concept: '쿨롱 힘 거리 의존성',
            stem: `두 점전하 사이 거리를 ${factor}배로 늘리면 전기력의 크기는 처음의 몇 배인가?`,
            correct: `1/${factor * factor}배`,
            distractors: [`1/${factor}배`, `${factor}배`, `${factor * factor}배`, '변하지 않는다'],
            formula: 'F ∝ 1/r²',
            explanation: `전기력은 거리의 제곱에 반비례하므로 1/${factor}²=1/${factor * factor}배이다.`
          });
        },
        (rng) => {
          const Q = pick(rng, [1, 2, 3, 4]), r = pick(rng, [1, 2, 3]);
          const kQ = 9 * Q;
          const answer = kQ / (r * r);
          return numericQuestion(rng, {
            conceptId: 'electrostatics', concept: '점전하의 전기장',
            stem: `점전하 +${Q} nC에서 ${r} m 떨어진 점의 전기장 세기는? (k=9×10⁹, 단위 계산 결과를 N/C로 표시)`,
            correct: answer, distractors: [kQ / r, kQ * r, kQ * r * r, Q / (r * r)],
            unit: 'N/C', formula: 'E = kQ/r²',
            explanation: `kQ=9×10⁹×${Q}×10⁻⁹=${kQ}, 따라서 E=${kQ}/${r}²=${fmt(answer)} N/C이다.`
          });
        },
        (rng) => {
          const Q = pick(rng, [1, 2, 3, 4]), r = pick(rng, [1, 2, 4]);
          const answer = 9 * Q / r;
          return numericQuestion(rng, {
            conceptId: 'electrostatics', concept: '전위',
            stem: `점전하 +${Q} nC에서 ${r} m 떨어진 점의 전위는? (k=9×10⁹)`,
            correct: answer, distractors: [9 * Q / (r * r), 9 * Q * r, Q / r, answer / 2],
            unit: 'V', formula: 'V = kQ/r',
            explanation: `V=9×10⁹×${Q}×10⁻⁹/${r}=${fmt(answer)} V이다.`
          });
        },
        (rng) => {
          const q = pick(rng, [1, 2, 3, 4]), deltaV = pick(rng, [5, 10, 20, 30]);
          const answer = q * deltaV;
          return numericQuestion(rng, {
            conceptId: 'electrostatics', concept: '전기적 위치에너지',
            stem: `전하량 +${q} C인 입자를 전위가 ${deltaV} V 높은 곳으로 천천히 옮겼다. 전기적 위치에너지 증가량은?`,
            correct: answer, distractors: [deltaV / q, q / deltaV, 0.5 * q * deltaV, q + deltaV],
            unit: 'J', formula: 'ΔU = qΔV',
            explanation: `ΔU=${q}×${deltaV}=${answer} J이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'electrostatics', concept: '전기 쌍극자',
          stem: '크기가 같은 +Q와 -Q를 잇는 선분의 수직이등분선 위 한 점에서 전위는?',
          correct: '0이다',
          distractors: ['항상 양수이다', '항상 음수이다', '무한대이다', '거리와 무관하게 Q이다'],
          explanation: '+Q와 -Q까지의 거리가 같아 두 전위가 크기는 같고 부호는 반대이므로 상쇄된다.',
          formula: 'V_total = kQ/r + k(-Q)/r = 0'
        })
      ]
    },

    'circuits': {
      name: '전기 회로·저항·전력',
      domain: '전기·자기',
      formulas: ['V = IR', 'R_series = ΣR', '1/R_parallel = Σ(1/R)', 'P = VI = I²R = V²/R'],
      tip: '직렬·병렬 구조를 먼저 단순화하고 각 구간의 전압·전류를 표시하세요.',
      templates: [
        (rng) => {
          const V = pick(rng, [6, 9, 12, 18, 24]), R = pick(rng, [2, 3, 4, 6]);
          const answer = V / R;
          return numericQuestion(rng, {
            conceptId: 'circuits', concept: '옴의 법칙',
            stem: `저항 ${R} Ω에 전압 ${V} V를 걸었다. 흐르는 전류는?`,
            correct: answer, distractors: [V * R, R / V, V / (2 * R), V + R],
            unit: 'A', formula: 'I = V/R',
            explanation: `I=${V}/${R}=${fmt(answer)} A이다.`
          });
        },
        (rng) => {
          const R1 = int(rng, 2, 8), R2 = int(rng, 2, 8);
          const answer = R1 + R2;
          return numericQuestion(rng, {
            conceptId: 'circuits', concept: '직렬 합성저항',
            stem: `저항 ${R1} Ω과 ${R2} Ω을 직렬로 연결했다. 합성저항은?`,
            correct: answer, distractors: [R1 * R2 / (R1 + R2), Math.abs(R1 - R2), R1 * R2, (R1 + R2) / 2],
            unit: 'Ω', formula: 'R_eq = R₁ + R₂',
            explanation: `직렬 연결이므로 ${R1}+${R2}=${answer} Ω이다.`
          });
        },
        (rng) => {
          const R = pick(rng, [4, 6, 8, 10, 12]);
          const answer = R / 2;
          return numericQuestion(rng, {
            conceptId: 'circuits', concept: '병렬 합성저항',
            stem: `같은 저항 ${R} Ω 두 개를 병렬로 연결했다. 합성저항은?`,
            correct: answer, distractors: [R * 2, R, R / 4, R * R],
            unit: 'Ω', formula: '같은 저항 2개 병렬: R_eq = R/2',
            explanation: `1/R_eq=1/${R}+1/${R}=2/${R}, 따라서 R_eq=${answer} Ω이다.`
          });
        },
        (rng) => {
          const V = pick(rng, [6, 12, 24]), R = pick(rng, [2, 3, 4, 6, 8]);
          const answer = V * V / R;
          return numericQuestion(rng, {
            conceptId: 'circuits', concept: '소비 전력',
            stem: `저항 ${R} Ω을 전압 ${V} V에 연결했다. 소비 전력은?`,
            correct: answer, distractors: [V / R, V * R, V * V * R, answer / 2],
            unit: 'W', formula: 'P = V²/R',
            explanation: `P=${V}²/${R}=${fmt(answer)} W이다.`
          });
        },
        (rng) => {
          const E = pick(rng, [6, 9, 12]), R = pick(rng, [2, 3, 4]), r = pick(rng, [1, 2]);
          const answer = E / (R + r);
          return numericQuestion(rng, {
            conceptId: 'circuits', concept: '전지 내부저항',
            stem: `기전력 ${E} V, 내부저항 ${r} Ω인 전지에 외부저항 ${R} Ω을 연결했다. 회로 전류는?`,
            correct: answer, distractors: [E / R, E / r, E * (R + r), E / Math.abs(R - r || 1)],
            unit: 'A', formula: 'I = ℰ/(R+r)',
            explanation: `전체 저항은 ${R}+${r}=${R + r} Ω이므로 I=${E}/${R + r}=${fmt(answer)} A이다.`
          });
        }
      ]
    },

    'magnetism': {
      name: '자기장·자기력',
      domain: '전기·자기',
      formulas: ['F = BIL sinθ', 'F = qvB sinθ', 'r = mv/(|q|B)', 'B_wire ∝ I/r'],
      tip: '오른손 법칙으로 자기장 방향을 먼저 구한 뒤 전류·전하의 부호를 반영하세요.',
      templates: [
        (rng) => {
          const B = pick(rng, [0.2, 0.4, 0.5, 0.8]), I = int(rng, 2, 6), L = pick(rng, [0.5, 1, 2]);
          const answer = B * I * L;
          return numericQuestion(rng, {
            conceptId: 'magnetism', concept: '전류가 받는 자기력',
            stem: `자기장 ${B} T에 수직인 길이 ${L} m 도선에 전류 ${I} A가 흐른다. 도선이 받는 자기력은?`,
            correct: answer, distractors: [B * I / L, B * L / I, I * L / B, answer * 2],
            unit: 'N', formula: 'F = BIL',
            explanation: `F=${B}×${I}×${L}=${fmt(answer)} N이다.`
          });
        },
        (rng) => {
          const factor = pick(rng, [2, 3, 4]);
          return ratioQuestion(rng, {
            conceptId: 'magnetism', concept: '원운동 반지름',
            stem: `같은 속력의 대전 입자가 같은 자기장에 들어갈 때 질량만 ${factor}배가 되면 원운동 반지름은?`,
            correct: `${factor}배`,
            distractors: [`1/${factor}배`, `${factor * factor}배`, `1/${factor * factor}배`, '변하지 않는다'],
            formula: 'r = mv/(|q|B)',
            explanation: '다른 조건이 같으면 반지름은 질량에 정비례한다.'
          });
        },
        (rng) => {
          const I1 = int(rng, 1, 5), I2 = int(rng, 1, 5), r1 = int(rng, 1, 4), r2 = int(rng, 1, 4);
          const ratio1 = I1 / r1, ratio2 = I2 / r2;
          return ratioQuestion(rng, {
            conceptId: 'magnetism', concept: '직선 도선의 자기장',
            stem: `긴 직선 도선 A에는 ${I1} A가 흐르고 거리 ${r1} m에서 자기장을 잰다. 도선 B에는 ${I2} A가 흐르고 거리 ${r2} m에서 잰다. B_A : B_B는?`,
            correct: `${fmt(ratio1)}:${fmt(ratio2)}`,
            distractors: [`${I1 * r1}:${I2 * r2}`, `${I1}:${I2}`, `${r2}:${r1}`, `${fmt(1 / ratio1)}:${fmt(1 / ratio2)}`],
            formula: 'B ∝ I/r',
            explanation: `자기장은 I/r에 비례하므로 비는 (${I1}/${r1}):(${I2}/${r2})=${fmt(ratio1)}:${fmt(ratio2)}이다.`
          });
        },
        (rng) => {
          const E = pick(rng, [200, 300, 400, 600]), B = pick(rng, [0.1, 0.2, 0.4]);
          const answer = E / B;
          return numericQuestion(rng, {
            conceptId: 'magnetism', concept: '속도 선택기',
            stem: `서로 수직인 전기장 ${E} V/m와 자기장 ${B} T에서 대전 입자가 휘지 않고 통과한다. 입자 속력은?`,
            correct: answer, distractors: [E * B, B / E, E / (2 * B), 2 * E / B],
            unit: 'm/s', formula: 'qE = qvB → v=E/B',
            explanation: `전기력과 자기력이 평형이므로 v=${E}/${B}=${fmt(answer)} m/s이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'magnetism', concept: '자기력 방향',
          stem: '양전하가 +x 방향으로 운동하고 자기장이 +z 방향일 때 자기력 방향은?',
          correct: '-y 방향',
          distractors: ['+y 방향', '+x 방향', '-x 방향', '+z 방향'],
          explanation: '양전하에 대해 v×B = x×z = -y이다.',
          formula: 'F = q(v×B)'
        })
      ]
    },

    'induction': {
      name: '전자기 유도·렌츠 법칙',
      domain: '전기·자기',
      formulas: ['|ε| = N|ΔΦ|/Δt', 'ε = BLv', 'I = ε/R', 'V₁/V₂ = N₁/N₂'],
      tip: '자기선속이 왜 변하는지 먼저 찾고, 그 변화를 방해하는 자기장을 만드는 전류 방향을 구하세요.',
      templates: [
        (rng) => {
          const B = pick(rng, [0.2, 0.4, 0.5, 0.8]), L = pick(rng, [0.5, 1, 1.5]), v = int(rng, 2, 6);
          const answer = B * L * v;
          return numericQuestion(rng, {
            conceptId: 'induction', concept: '운동 기전력',
            stem: `길이 ${L} m 도체 막대가 자기장 ${B} T에 수직으로 ${v} m/s로 움직인다. 유도 기전력은?`,
            correct: answer, distractors: [B * L / v, B * v / L, L * v / B, answer * 2],
            unit: 'V', formula: 'ε = BLv',
            explanation: `ε=${B}×${L}×${v}=${fmt(answer)} V이다.`
          });
        },
        (rng) => {
          const N = pick(rng, [10, 20, 50, 100]), dPhi = pick(rng, [0.01, 0.02, 0.05]), dt = pick(rng, [0.1, 0.2, 0.5, 1]);
          const answer = N * dPhi / dt;
          return numericQuestion(rng, {
            conceptId: 'induction', concept: '패러데이 법칙',
            stem: `${N}회 감은 코일을 지나는 자기선속이 ${dPhi} Wb만큼 ${dt}초 동안 변했다. 평균 유도 기전력은?`,
            correct: answer, distractors: [dPhi / (N * dt), N * dPhi * dt, dPhi / dt, N / (dPhi * dt)],
            unit: 'V', formula: '|ε| = N|ΔΦ|/Δt',
            explanation: `|ε|=${N}×${dPhi}/${dt}=${fmt(answer)} V이다.`
          });
        },
        (rng) => {
          const V1 = pick(rng, [110, 220]), N1 = pick(rng, [100, 200, 400]), ratio = pick(rng, [2, 4, 5]);
          const N2 = N1 / ratio;
          const answer = V1 / ratio;
          return numericQuestion(rng, {
            conceptId: 'induction', concept: '이상적 변압기',
            stem: `이상적 변압기에서 1차 코일 ${N1}회, 2차 코일 ${N2}회이고 1차 전압이 ${V1} V이다. 2차 전압은?`,
            correct: answer, distractors: [V1 * ratio, V1 * N1 / N2, V1 / (ratio * ratio), V1 - ratio],
            unit: 'V', formula: 'V₁/V₂ = N₁/N₂',
            explanation: `V₂=V₁(N₂/N₁)=${V1}/${ratio}=${fmt(answer)} V이다.`
          });
        },
        (rng) => {
          const emf = pick(rng, [2, 4, 6, 8, 12]), R = pick(rng, [1, 2, 3, 4, 6]);
          const answer = emf / R;
          return numericQuestion(rng, {
            conceptId: 'induction', concept: '유도 전류',
            stem: `코일에 ${emf} V의 유도 기전력이 생겼고 회로 저항은 ${R} Ω이다. 유도 전류는?`,
            correct: answer, distractors: [emf * R, R / emf, emf / (2 * R), emf + R],
            unit: 'A', formula: 'I = ε/R',
            explanation: `I=${emf}/${R}=${fmt(answer)} A이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'induction', concept: '렌츠 법칙',
          stem: '코일을 지나는 종이면 안쪽 방향 자기선속이 증가할 때, 코일이 만드는 유도 자기장 방향은?',
          correct: '종이면 바깥쪽',
          distractors: ['종이면 안쪽', '오른쪽', '왼쪽', '자기장이 생기지 않는다'],
          explanation: '유도 자기장은 원래 자기선속의 증가를 방해해야 하므로 반대 방향인 종이면 바깥쪽이다.',
          formula: '렌츠 법칙'
        })
      ]
    },

    'waves-sound': {
      name: '파동·간섭·소리',
      domain: '파동·광학',
      formulas: ['v = fλ', 'f = 1/T', '보강: ΔL = nλ', '상쇄: ΔL = (n+½)λ'],
      tip: '주기·진동수·파장을 구분하고, 간섭에서는 경로차를 파장과 비교하세요.',
      templates: [
        (rng) => {
          const f = pick(rng, [50, 100, 200, 250, 400]), lambda = pick(rng, [0.5, 1, 1.5, 2]);
          const answer = f * lambda;
          return numericQuestion(rng, {
            conceptId: 'waves-sound', concept: '파동 속력',
            stem: `진동수 ${f} Hz, 파장 ${lambda} m인 파동의 속력은?`,
            correct: answer, distractors: [f / lambda, lambda / f, f + lambda, answer / 2],
            unit: 'm/s', formula: 'v = fλ',
            explanation: `v=${f}×${lambda}=${fmt(answer)} m/s이다.`
          });
        },
        (rng) => {
          const T = pick(rng, [0.002, 0.004, 0.005, 0.01, 0.02]);
          const answer = 1 / T;
          return numericQuestion(rng, {
            conceptId: 'waves-sound', concept: '주기와 진동수',
            stem: `파동의 주기가 ${T} s이다. 진동수는?`,
            correct: answer, distractors: [T, 2 / T, 0.5 / T, 1 / (2 * T)],
            unit: 'Hz', formula: 'f = 1/T',
            explanation: `f=1/${T}=${fmt(answer)} Hz이다.`
          });
        },
        (rng) => {
          const n = int(rng, 1, 4);
          return choiceQuestion(rng, {
            conceptId: 'waves-sound', concept: '보강 간섭',
            stem: `위상이 같은 두 파원의 파장이 λ일 때 경로차가 ${n}λ인 점에서 일어나는 현상은?`,
            correct: '보강 간섭',
            distractors: ['상쇄 간섭', '굴절', '전반사', '회절이 사라짐'],
            explanation: '위상이 같은 두 파원에서 경로차가 정수배 파장이면 보강 간섭한다.',
            formula: 'ΔL = nλ'
          });
        },
        (rng) => {
          const v = pick(rng, [200, 300, 340, 400]), L = pick(rng, [0.5, 1, 1.5, 2]);
          const answer = v / (2 * L);
          return numericQuestion(rng, {
            conceptId: 'waves-sound', concept: '양끝 고정 줄의 기본진동',
            stem: `길이 ${L} m인 양끝 고정 줄에서 파동 속력이 ${v} m/s이다. 기본진동수는?`,
            correct: answer, distractors: [v / L, 2 * v / L, L / (2 * v), v * L],
            unit: 'Hz', formula: 'f₁ = v/(2L)',
            explanation: `기본모드에서 λ=2L이므로 f=${v}/(2×${L})=${fmt(answer)} Hz이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'waves-sound', concept: '소리의 특성',
          stem: '같은 매질에서 소리의 진동수가 커질 때 사람이 느끼는 변화는?',
          correct: '음의 높이가 높아진다',
          distractors: ['음량만 커진다', '전파 속력이 반드시 커진다', '진폭이 반드시 커진다', '소리가 사라진다'],
          explanation: '음의 높이는 진동수로 결정되며, 같은 매질에서 속력은 주로 매질 특성에 의해 정해진다.'
        })
      ]
    },

    'refraction-tir': {
      name: '굴절·전반사',
      domain: '파동·광학',
      formulas: ['n₁sinθ₁ = n₂sinθ₂', 'v = c/n', 'sinθ_c = n₂/n₁', '겉보기 깊이 = 실제 깊이/n'],
      tip: '각도는 경계면이 아니라 법선에서 재고, 전반사는 굴절률이 큰 매질에서 작은 매질로 갈 때만 가능합니다.',
      templates: [
        (rng) => {
          const depth = pick(rng, [6, 8, 9, 12, 15]), n = pick(rng, [1.2, 1.5, 2]);
          const answer = depth / n;
          return numericQuestion(rng, {
            conceptId: 'refraction-tir', concept: '겉보기 깊이',
            stem: `굴절률 ${n}인 액체 속 실제 깊이 ${depth} cm에 물체가 있다. 위에서 거의 수직으로 볼 때 겉보기 깊이는?`,
            correct: answer, distractors: [depth * n, depth / (n * n), depth - n, depth + n],
            unit: 'cm', formula: '겉보기 깊이 = 실제 깊이/n',
            explanation: `${depth}/${n}=${fmt(answer)} cm이다.`
          });
        },
        (rng) => {
          const n = pick(rng, [1.2, 1.5, 2, 2.5]);
          return ratioQuestion(rng, {
            conceptId: 'refraction-tir', concept: '매질 속 빛의 속력',
            stem: `굴절률이 ${n}인 매질에서 빛의 속력은 진공 속 빛의 속력 c의 몇 배인가?`,
            correct: `1/${n}배`,
            distractors: [`${n}배`, `${n * n}배`, `1/${fmt(n * n)}배`, '변하지 않는다'],
            formula: 'v = c/n',
            explanation: `굴절률 n=c/v이므로 v=c/${n}이다.`
          });
        },
        (rng) => {
          const pair = pick(rng, [
            { n1: 2, n2: 1, sin: '1/2', angle: '30°' },
            { n1: Math.SQRT2, n2: 1, sin: '1/√2', angle: '45°' }
          ]);
          return choiceQuestion(rng, {
            conceptId: 'refraction-tir', concept: '임계각',
            stem: `굴절률 ${fmt(pair.n1, 3)}인 매질에서 굴절률 ${pair.n2}인 매질로 빛이 진행한다. 임계각은?`,
            correct: pair.angle,
            distractors: ['15°', '60°', '90°', '임계각이 없다'],
            formula: 'sinθ_c = n₂/n₁',
            explanation: `sinθ_c=${pair.n2}/${fmt(pair.n1, 3)}=${pair.sin}이므로 θ_c=${pair.angle}이다.`
          });
        },
        (rng) => {
          const n1 = pick(rng, [1, 1.2, 1.5]), n2 = pick(rng, [1.5, 2]);
          const theta1 = 30;
          const sin2 = n1 * 0.5 / n2;
          return choiceQuestion(rng, {
            conceptId: 'refraction-tir', concept: '스넬 법칙',
            stem: `굴절률 ${n1}인 매질에서 굴절률 ${n2}인 매질로 입사각 30°로 빛이 들어간다. 굴절각 θ₂에 대해 옳은 식은?`,
            correct: `sinθ₂ = ${fmt(sin2, 3)}`,
            distractors: [`sinθ₂ = ${fmt(n2 * 0.5 / n1, 3)}`, `sinθ₂ = ${fmt(0.5, 3)}`, `sinθ₂ = ${fmt(n1 / n2, 3)}`, 'θ₂ = 90°'],
            formula: 'n₁sinθ₁ = n₂sinθ₂',
            explanation: `sinθ₂=(${n1}/${n2})×sin30°=${fmt(sin2, 3)}이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'refraction-tir', concept: '전반사 조건',
          stem: '전반사가 일어나기 위한 조건으로 옳은 것은?',
          correct: '굴절률이 큰 매질에서 작은 매질로 진행하고 입사각이 임계각보다 크다',
          distractors: ['작은 매질에서 큰 매질로 진행하면 항상 발생한다', '입사각이 0°이면 발생한다', '진동수가 0이면 발생한다', '모든 경계면에서 항상 발생한다'],
          explanation: '전반사는 큰 굴절률 매질에서 작은 굴절률 매질로 진행할 때 입사각이 임계각보다 큰 경우에 발생한다.'
        })
      ]
    },

    'mirrors-lenses': {
      name: '거울·렌즈·상의 형성',
      domain: '파동·광학',
      formulas: ['1/f = 1/u + 1/v', '|m| = |v/u|', 'P(D) = 1/f(m)'],
      tip: '물체 위치를 초점 F와 구심 2F에 대해 먼저 분류한 뒤 상의 방향·크기·실허상을 판단하세요.',
      templates: [
        (rng) => {
          const pair = pick(rng, [
            { f: 10, u: 15, v: 30 },
            { f: 10, u: 20, v: 20 },
            { f: 12, u: 18, v: 36 },
            { f: 15, u: 30, v: 30 }
          ]);
          return numericQuestion(rng, {
            conceptId: 'mirrors-lenses', concept: '얇은 렌즈 공식',
            stem: `초점거리 ${pair.f} cm인 볼록렌즈 앞 ${pair.u} cm에 물체를 두었다. 상까지의 거리는?`,
            correct: pair.v, distractors: [pair.u - pair.f, pair.u + pair.f, pair.f * pair.u / (pair.u + pair.f), pair.f],
            unit: 'cm', formula: '1/f = 1/u + 1/v',
            explanation: `1/v=1/${pair.f}-1/${pair.u}, 따라서 v=${pair.v} cm이다.`
          });
        },
        (rng) => {
          const pair = pick(rng, [
            { u: 15, v: 30, m: 2 },
            { u: 20, v: 20, m: 1 },
            { u: 30, v: 15, m: 0.5 }
          ]);
          return ratioQuestion(rng, {
            conceptId: 'mirrors-lenses', concept: '배율',
            stem: `렌즈에서 물체 거리 ${pair.u} cm, 상 거리 ${pair.v} cm이다. 상의 크기/물체 크기의 절댓값은?`,
            correct: `${pair.m}배`,
            distractors: [`${fmt(1 / pair.m)}배`, `${pair.u + pair.v}배`, `${Math.abs(pair.v - pair.u)}배`, '거리와 무관'],
            formula: '|m| = |v/u|',
            explanation: `|m|=${pair.v}/${pair.u}=${pair.m}배이다.`
          });
        },
        (rng) => {
          const f = pick(rng, [0.1, 0.2, 0.25, 0.5]);
          const answer = 1 / f;
          return numericQuestion(rng, {
            conceptId: 'mirrors-lenses', concept: '렌즈의 굴절력',
            stem: `초점거리 ${f} m인 수렴렌즈의 굴절력은?`,
            correct: answer, distractors: [f, 100 / f, 1 / (2 * f), f * 10],
            unit: 'D', formula: 'P = 1/f(m)',
            explanation: `P=1/${f}=${fmt(answer)} D이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'mirrors-lenses', concept: '볼록거울',
          stem: '볼록거울이 만드는 상의 특징은?',
          correct: '항상 정립·축소된 허상',
          distractors: ['항상 도립·확대된 실상', '항상 정립·확대된 실상', '물체 위치에 따라 항상 실상', '항상 물체와 같은 크기'],
          explanation: '볼록거울은 물체 위치와 관계없이 거울 뒤에 정립·축소 허상을 만든다.'
        }),
        (rng) => choiceQuestion(rng, {
          conceptId: 'mirrors-lenses', concept: '오목거울',
          stem: '오목거울의 초점 F와 거울 사이에 물체를 두었을 때 생기는 상은?',
          correct: '정립·확대된 허상',
          distractors: ['도립·축소된 실상', '도립·확대된 실상', '정립·축소된 실상', '상이 생기지 않는다'],
          explanation: '물체가 초점 안쪽에 있으면 반사광의 연장선이 만나 정립·확대 허상을 만든다.'
        })
      ]
    },

    'light-color-quantum': {
      name: '빛의 색·분산·양자성',
      domain: '파동·광학',
      formulas: ['E = hf = hc/λ', 'K_max = hf - φ', 'p = h/λ'],
      tip: '빛의 세기와 광자 한 개의 에너지, 색의 합성과 물감의 혼합을 구분하세요.',
      templates: [
        (rng) => {
          const factor = pick(rng, [2, 3, 4]);
          return ratioQuestion(rng, {
            conceptId: 'light-color-quantum', concept: '광자 에너지',
            stem: `빛의 진동수가 ${factor}배가 되면 광자 한 개의 에너지는 몇 배가 되는가?`,
            correct: `${factor}배`,
            distractors: [`1/${factor}배`, `${factor * factor}배`, `1/${factor * factor}배`, '변하지 않는다'],
            formula: 'E = hf',
            explanation: '광자 에너지는 진동수에 정비례한다.'
          });
        },
        (rng) => {
          const E = pick(rng, [3, 4, 5, 6]), phi = pick(rng, [1, 2, 2.5]);
          const answer = E - phi;
          return numericQuestion(rng, {
            conceptId: 'light-color-quantum', concept: '광전효과',
            stem: `광자 에너지가 ${E} eV이고 금속의 일함수가 ${phi} eV이다. 방출 광전자의 최대 운동에너지는?`,
            correct: answer, distractors: [E + phi, E * phi, phi - E, E / phi],
            unit: 'eV', formula: 'K_max = E_photon - φ',
            explanation: `K_max=${E}-${phi}=${fmt(answer)} eV이다.`
          });
        },
        (rng) => {
          const factor = pick(rng, [2, 3, 4]);
          return ratioQuestion(rng, {
            conceptId: 'light-color-quantum', concept: '광자 운동량',
            stem: `빛의 파장이 ${factor}배로 길어지면 광자 운동량의 크기는?`,
            correct: `1/${factor}배`,
            distractors: [`${factor}배`, `${factor * factor}배`, `1/${factor * factor}배`, '변하지 않는다'],
            formula: 'p = h/λ',
            explanation: '광자 운동량은 파장에 반비례한다.'
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'light-color-quantum', concept: '빛의 삼원색',
          stem: '빨간빛과 초록빛을 같은 세기로 합성하면 보이는 색은?',
          correct: '노란색',
          distractors: ['청록색', '자홍색', '검은색', '파란색'],
          explanation: '빛의 가산혼합에서 빨강+초록=노랑이다.'
        }),
        (rng) => choiceQuestion(rng, {
          conceptId: 'light-color-quantum', concept: '분산',
          stem: '유리 프리즘에서 일반적으로 보라색 빛이 빨간색 빛보다 더 크게 굴절하는 이유는?',
          correct: '유리의 굴절률이 보라색 빛에 대해 더 크기 때문이다',
          distractors: ['보라색의 진동수가 경계에서 변하기 때문이다', '빨간색의 진공 속 속력이 더 느리기 때문이다', '보라색의 세기가 항상 더 크기 때문이다', '프리즘 안에서 모든 색의 굴절률이 같기 때문이다'],
          explanation: '정상 분산 영역에서 짧은 파장일수록 굴절률이 커 더 크게 굴절한다.'
        })
      ]
    },

    'thermal-balance': {
      name: '열평형·비열·열용량',
      domain: '열·기체',
      formulas: ['Q = mcΔT', '잃은 열량 = 얻은 열량', '열용량 C = mc'],
      tip: '고온 물체의 잃은 열과 저온 물체의 얻은 열을 부호 없이 크기로 같게 두세요.',
      templates: [
        (rng) => {
          const m = pick(rng, [0.2, 0.5, 1, 2]), c = pick(rng, [400, 500, 900, 1000, 4200]), dT = int(rng, 2, 10);
          const answer = m * c * dT;
          return numericQuestion(rng, {
            conceptId: 'thermal-balance', concept: '열량',
            stem: `질량 ${m} kg, 비열 ${c} J/(kg·℃)인 물체의 온도를 ${dT}℃ 높이는 데 필요한 열량은?`,
            correct: answer, distractors: [c * dT, m * c, m * dT, answer / 2],
            unit: 'J', formula: 'Q = mcΔT',
            explanation: `Q=${m}×${c}×${dT}=${fmt(answer)} J이다.`
          });
        },
        (rng) => {
          const m1 = pick(rng, [100, 200, 300]), m2 = pick(rng, [100, 200, 300]), T1 = pick(rng, [60, 70, 80, 90]), T2 = pick(rng, [10, 20, 30]);
          const answer = (m1 * T1 + m2 * T2) / (m1 + m2);
          return numericQuestion(rng, {
            conceptId: 'thermal-balance', concept: '같은 물질 혼합',
            stem: `같은 물질 ${m1} g(${T1}℃)과 ${m2} g(${T2}℃)을 열손실 없이 섞었다. 평형온도는?`,
            correct: answer, distractors: [(T1 + T2) / 2, T1 - T2, (m1 * T2 + m2 * T1) / (m1 + m2), answer + 10],
            unit: '℃', formula: 'm₁(T₁-T)=m₂(T-T₂)',
            explanation: `같은 비열이므로 질량가중평균 T=(${m1}×${T1}+${m2}×${T2})/(${m1}+${m2})=${fmt(answer)}℃이다.`
          });
        },
        (rng) => {
          const m = pick(rng, [0.5, 1, 2]), c = pick(rng, [400, 500, 1000, 4200]);
          const answer = m * c;
          return numericQuestion(rng, {
            conceptId: 'thermal-balance', concept: '열용량',
            stem: `질량 ${m} kg, 비열 ${c} J/(kg·℃)인 물체의 열용량은?`,
            correct: answer, distractors: [c / m, m / c, c, answer * 10],
            unit: 'J/℃', formula: 'C = mc',
            explanation: `C=${m}×${c}=${fmt(answer)} J/℃이다.`
          });
        },
        (rng) => {
          const Q = pick(rng, [1000, 2000, 3000, 4200]), m = pick(rng, [0.2, 0.5, 1]), dT = pick(rng, [2, 4, 5, 10]);
          const answer = Q / (m * dT);
          return numericQuestion(rng, {
            conceptId: 'thermal-balance', concept: '비열 계산',
            stem: `질량 ${m} kg 물체에 ${Q} J를 공급했더니 온도가 ${dT}℃ 올랐다. 비열은?`,
            correct: answer, distractors: [Q * m * dT, Q / dT, Q / m, m * dT / Q],
            unit: 'J/(kg·℃)', formula: 'c = Q/(mΔT)',
            explanation: `c=${Q}/(${m}×${dT})=${fmt(answer)} J/(kg·℃)이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'thermal-balance', concept: '열평형',
          stem: '서로 접촉한 두 물체가 열평형에 도달했다는 뜻은?',
          correct: '두 물체의 온도가 같아져 순열이동이 없다',
          distractors: ['두 물체의 열에너지가 반드시 같다', '두 물체의 질량이 같다', '두 물체의 비열이 같다', '두 물체가 모두 0℃가 된다'],
          explanation: '열평형은 온도가 같아져 두 물체 사이의 순열이동이 없는 상태이다.'
        })
      ]
    },

    'heat-transfer': {
      name: '열의 이동·단열',
      domain: '열·기체',
      formulas: ['Q/t = kAΔT/L', '열저항 R_th = L/(kA)', '복사 P ∝ T⁴'],
      tip: '전도·대류·복사를 구분하고, 전도 문제에서는 단면적·길이·열전도율을 모두 확인하세요.',
      templates: [
        (rng) => {
          const k = pick(rng, [10, 20, 50]), A = pick(rng, [0.01, 0.02, 0.05]), dT = pick(rng, [20, 40, 50]), L = pick(rng, [0.1, 0.2, 0.5]);
          const answer = k * A * dT / L;
          return numericQuestion(rng, {
            conceptId: 'heat-transfer', concept: '열전도율',
            stem: `열전도율 ${k} W/(m·K), 단면적 ${A} m², 길이 ${L} m인 막대 양끝 온도차가 ${dT} K이다. 정상상태 열전달률은?`,
            correct: answer, distractors: [k * A * dT * L, k * dT / (A * L), A * dT / (k * L), answer / 2],
            unit: 'W', formula: 'Q/t = kAΔT/L',
            explanation: `열전달률=${k}×${A}×${dT}/${L}=${fmt(answer)} W이다.`
          });
        },
        (rng) => {
          const factor = pick(rng, [2, 3, 4]);
          return ratioQuestion(rng, {
            conceptId: 'heat-transfer', concept: '전도 길이 효과',
            stem: `같은 물질·단면적·온도차에서 막대 길이를 ${factor}배로 하면 정상상태 열전달률은?`,
            correct: `1/${factor}배`,
            distractors: [`${factor}배`, `${factor * factor}배`, `1/${factor * factor}배`, '변하지 않는다'],
            formula: 'Q/t ∝ 1/L',
            explanation: '열전달률은 길이에 반비례한다.'
          });
        },
        (rng) => {
          const factor = pick(rng, [2, 3]);
          return ratioQuestion(rng, {
            conceptId: 'heat-transfer', concept: '열복사',
            stem: `표면 성질과 면적이 같은 물체의 절대온도가 ${factor}배가 되면 이상적인 복사 에너지 방출률은 몇 배인가?`,
            correct: `${factor ** 4}배`,
            distractors: [`${factor}배`, `${factor ** 2}배`, `${factor ** 3}배`, '변하지 않는다'],
            formula: 'P ∝ T⁴',
            explanation: `스테판-볼츠만 법칙에 따라 ${factor}⁴=${factor ** 4}배이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'heat-transfer', concept: '이중창 단열',
          stem: '이중창 사이에 얇은 공기층을 두는 주된 이유는?',
          correct: '공기의 낮은 열전도율을 이용하고 큰 대류를 억제하기 위해서',
          distractors: ['공기가 금속보다 열전도율이 높기 때문에', '복사를 완전히 100% 없애기 위해', '유리의 질량을 늘리기 위해', '실내 압력을 높이기 위해'],
          explanation: '갇힌 공기는 열전도율이 낮고 대류가 제한되어 단열 효과가 크다.'
        }),
        (rng) => choiceQuestion(rng, {
          conceptId: 'heat-transfer', concept: '열전달 방식',
          stem: '태양에서 지구로 에너지가 전달되는 주된 방식은?',
          correct: '복사',
          distractors: ['전도', '대류', '증발', '응결'],
          explanation: '진공에서도 전달 가능한 전자기파 형태의 복사이다.'
        })
      ]
    },

    'gas-thermodynamics': {
      name: '기체·열역학',
      domain: '열·기체',
      formulas: ['PV = nRT', '등온: P₁V₁=P₂V₂', '정적: P/T=일정', 'ΔU = Q - W'],
      tip: '절대온도(K)를 사용하고, 기체가 한 일 W의 부호를 과정별로 일관되게 적용하세요.',
      templates: [
        (rng) => {
          const P1 = pick(rng, [1, 2, 3]), T1 = pick(rng, [300, 400]), T2 = T1 * pick(rng, [1.5, 2, 3]);
          const answer = P1 * T2 / T1;
          return numericQuestion(rng, {
            conceptId: 'gas-thermodynamics', concept: '정적 과정',
            stem: `부피가 일정한 이상기체의 압력이 ${P1} atm, 온도가 ${T1} K이다. 온도를 ${T2} K로 바꾸면 압력은?`,
            correct: answer, distractors: [P1 * T1 / T2, P1 + (T2 - T1) / 100, P1 * (T2 / T1) ** 2, P1],
            unit: 'atm', formula: 'P/T = 일정',
            explanation: `P₂=${P1}×${T2}/${T1}=${fmt(answer)} atm이다.`
          });
        },
        (rng) => {
          const P1 = pick(rng, [1, 2, 4]), V1 = pick(rng, [2, 3, 4, 6]), V2 = pick(rng, [1, 2, 3, 4]);
          const answer = P1 * V1 / V2;
          return numericQuestion(rng, {
            conceptId: 'gas-thermodynamics', concept: '등온 과정',
            stem: `이상기체가 등온 변화한다. 처음 압력 ${P1} atm, 부피 ${V1} L에서 부피가 ${V2} L가 되면 압력은?`,
            correct: answer, distractors: [P1 * V2 / V1, P1 * V1 * V2, P1 + V1 - V2, P1],
            unit: 'atm', formula: 'P₁V₁=P₂V₂',
            explanation: `P₂=${P1}×${V1}/${V2}=${fmt(answer)} atm이다.`
          });
        },
        (rng) => {
          const Q = pick(rng, [200, 300, 500, 800]), W = pick(rng, [50, 100, 150, 200]);
          const answer = Q - W;
          return numericQuestion(rng, {
            conceptId: 'gas-thermodynamics', concept: '열역학 제1법칙',
            stem: `기체가 ${Q} J의 열을 흡수하고 외부에 ${W} J의 일을 했다. 내부에너지 변화량은?`,
            correct: answer, distractors: [Q + W, W - Q, Q, W],
            unit: 'J', formula: 'ΔU = Q - W',
            explanation: `ΔU=${Q}-${W}=${answer} J이다.`
          });
        },
        (rng) => {
          const factor = pick(rng, [4, 9, 16]);
          return ratioQuestion(rng, {
            conceptId: 'gas-thermodynamics', concept: '분자 평균속력',
            stem: `같은 기체의 절대온도를 ${factor}배로 하면 분자의 rms 속력은 몇 배가 되는가?`,
            correct: `${Math.sqrt(factor)}배`,
            distractors: [`${factor}배`, `1/${factor}배`, `1/${Math.sqrt(factor)}배`, '변하지 않는다'],
            formula: 'v_rms ∝ √T',
            explanation: `분자 속력은 절대온도의 제곱근에 비례하므로 ${Math.sqrt(factor)}배이다.`
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'gas-thermodynamics', concept: '단열 팽창',
          stem: '이상기체가 외부와 열교환 없이 단열 팽창하며 외부에 일을 했다. 기체의 내부에너지는?',
          correct: '감소한다',
          distractors: ['증가한다', '변하지 않는다', '항상 0이 된다', '압력과 무관하게 무한대가 된다'],
          explanation: 'Q=0이고 기체가 양의 일을 하므로 ΔU=Q-W<0이다.',
          formula: 'ΔU = -W (단열)'
        })
      ]
    },

    'thermal-expansion': {
      name: '열팽창·바이메탈',
      domain: '열·기체',
      formulas: ['ΔL = αL₀ΔT', '면적팽창계수 ≈ 2α', '부피팽창계수 ≈ 3α'],
      tip: '온도가 오르면 구멍도 함께 커진다는 점과, 바이메탈은 더 많이 팽창하는 금속 쪽이 바깥쪽이 된다는 점을 기억하세요.',
      templates: [
        (rng) => {
          const alpha = pick(rng, [1, 1.2, 1.5, 2]) * 1e-5, L = pick(rng, [1, 2, 5, 10]), dT = pick(rng, [20, 50, 100]);
          const answerMm = alpha * L * dT * 1000;
          return numericQuestion(rng, {
            conceptId: 'thermal-expansion', concept: '선팽창',
            stem: `선팽창계수 ${fmt(alpha * 1e5)}×10⁻⁵ /℃, 길이 ${L} m인 막대의 온도를 ${dT}℃ 올렸다. 길이 증가는?`,
            correct: answerMm, distractors: [answerMm * 2, answerMm / 2, alpha * dT * 1000, alpha * L * 1000],
            unit: 'mm', formula: 'ΔL = αLΔT',
            explanation: `ΔL=${fmt(alpha * 1e5)}×10⁻⁵×${L}×${dT} m=${fmt(answerMm)} mm이다.`
          });
        },
        (rng) => {
          const factor = pick(rng, [2, 3, 4]);
          return ratioQuestion(rng, {
            conceptId: 'thermal-expansion', concept: '면적 팽창',
            stem: `등방성 고체의 선팽창계수가 α일 때 작은 온도 변화에 대한 면적팽창계수는 약 얼마인가?`,
            correct: '2α',
            distractors: ['α/2', 'α²', '3α', '변하지 않는다'],
            explanation: '작은 팽창에서 면적팽창계수는 선팽창계수의 약 2배이다.'
          });
        },
        (rng) => choiceQuestion(rng, {
          conceptId: 'thermal-expansion', concept: '가열한 금속 고리',
          stem: '금속 고리를 균일하게 가열하면 가운데 구멍의 크기는 어떻게 되는가?',
          correct: '커진다',
          distractors: ['작아진다', '변하지 않는다', '처음에는 작아졌다가 사라진다', '질량에 따라 무조건 0이 된다'],
          explanation: '고리 전체가 같은 비율로 확대되므로 구멍도 커진다.'
        }),
        (rng) => choiceQuestion(rng, {
          conceptId: 'thermal-expansion', concept: '바이메탈',
          stem: '금속 A의 열팽창계수가 B보다 크다. A와 B를 붙인 바이메탈을 가열하면 어느 쪽으로 휘는가?',
          correct: '열팽창계수가 작은 B 쪽으로 휜다',
          distractors: ['열팽창계수가 큰 A 쪽으로 휜다', '항상 곧게 유지된다', '중력 방향으로만 휜다', '두 금속이 분리된다'],
          explanation: '더 많이 늘어나는 A가 바깥쪽, 덜 늘어나는 B가 안쪽이 되어 B 쪽으로 휜다.'
        }),
        (rng) => choiceQuestion(rng, {
          conceptId: 'thermal-expansion', concept: '철도 레일 틈',
          stem: '철도 레일 사이에 틈을 두는 주된 이유는?',
          correct: '온도 상승에 따른 팽창으로 레일이 휘는 것을 막기 위해',
          distractors: ['전기 저항을 0으로 만들기 위해', '소리를 완전히 없애기 위해', '질량을 줄이기 위해', '열전도를 증가시키기 위해'],
          explanation: '팽창할 공간이 없으면 압축 응력이 생겨 레일이 휘거나 손상될 수 있다.'
        })
      ]
    }
  };

  // 동일한 개념 분류에 대응하는 보조 ID
  const ALIASES = {
    'other': 'motion-graphs',
    'waves-sound': 'waves-sound',
    'refraction-tir': 'refraction-tir',
    'mirrors-lenses': 'mirrors-lenses',
    'light-color-quantum': 'light-color-quantum',
    'thermal-balance': 'thermal-balance',
    'heat-transfer': 'heat-transfer',
    'gas-thermodynamics': 'gas-thermodynamics',
    'thermal-expansion': 'thermal-expansion',
    'fluid-buoyancy': 'fluid-buoyancy',
    'electrostatics': 'electrostatics',
    'circuits': 'circuits',
    'magnetism': 'magnetism',
    'induction': 'induction',
    'motion-graphs': 'motion-graphs',
    'forces-equilibrium': 'forces-equilibrium',
    'energy-spring': 'energy-spring',
    'momentum-collision': 'momentum-collision',
    'circular-oscillation': 'circular-oscillation'
  };

  function resolveId(value) {
    const id = String(value || '').trim();
    if (GROUPS[id]) return id;
    if (ALIASES[id] && GROUPS[ALIASES[id]]) return ALIASES[id];
    return 'motion-graphs';
  }

  function generateQuestion(conceptId, seed) {
    const resolved = resolveId(conceptId);
    const rng = createRng(`${seed}-${resolved}`);
    const group = GROUPS[resolved];
    const template = pick(rng, group.templates);
    return template(rng);
  }

  function generateSet(conceptId, count = 10, seed = Date.now()) {
    const resolved = resolveId(conceptId);
    const group = GROUPS[resolved];
    const result = [];
    const seen = new Set();
    let attempt = 0;
    while (result.length < count && attempt < count * 30) {
      const question = generateQuestion(resolved, `${seed}-${attempt}`);
      const key = question.stem;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ ...question, number: result.length + 1 });
      }
      attempt += 1;
    }
    return {
      version: VERSION,
      conceptId: resolved,
      name: group.name,
      domain: group.domain,
      formulas: group.formulas.slice(),
      tip: group.tip,
      seed: String(seed),
      questions: result
    };
  }

  root.YPWeakQuestionFactory = {
    version: VERSION,
    groups: GROUPS,
    resolveId,
    generateQuestion,
    generateSet,
    createRng
  };
})(typeof window !== 'undefined' ? window : globalThis);
