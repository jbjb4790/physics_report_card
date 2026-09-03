(function (root) {
  'use strict';

  const base = root.YPWeakQuestionFactory;
  if (!base || base.hardModeVersion === '3.12.1') return;

  const VERSION = '3.12.1';
  const GROUP_IDS = Object.keys(base.groups || {});

  const hashSeed = (value) => {
    let hash = 2166136261;
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  const createRng = base.createRng || ((seedValue) => {
    let state = hashSeed(seedValue) || 0x9e3779b9;
    return function random() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  });

  const int = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;
  const pick = (rng, values) => values[Math.floor(rng() * values.length)];
  const round = (value, digits = 3) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  };
  const fmt = (value, digits = 3) => {
    const number = round(value, digits);
    return Number.isInteger(number) ? String(number) : String(number).replace(/0+$/, '').replace(/\.$/, '');
  };

  function shuffle(rng, values) {
    const output = values.slice();
    for (let i = output.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [output[i], output[j]] = [output[j], output[i]];
    }
    return output;
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

  function makeChoice(rng, options) {
    const correct = String(options.correct);
    let choices = unique([correct, ...(options.distractors || []).map(String)]);
    const fallback = [
      '조건만으로 결정할 수 없다',
      '0',
      '1',
      '2',
      '변하지 않는다',
      '두 배'
    ];
    for (const value of fallback) {
      if (choices.length >= 5) break;
      if (!choices.includes(value)) choices.push(value);
    }
    choices = shuffle(rng, choices.slice(0, 5));

    return {
      id: `${options.conceptId}-hard-${hashSeed(`${options.stem}-${rng()}`)}`,
      conceptId: options.conceptId,
      concept: options.concept,
      difficulty: options.difficulty || (rng() < 0.52 ? '상' : '중상'),
      stem: options.stem,
      choices,
      answer: choices.indexOf(correct),
      explanation: options.explanation,
      formula: options.formula || '',
      skill: options.skill || options.concept || '',
      hardMode: true
    };
  }

  function makeNumeric(rng, options) {
    const digits = options.digits ?? 3;
    const unit = options.unit ? ` ${options.unit}` : '';
    const correctValue = Number(options.correct);
    const correct = `${fmt(correctValue, digits)}${unit}`;
    const distractors = (options.distractors || [
      correctValue * 2,
      correctValue / 2,
      correctValue + 1,
      Math.max(0, correctValue - 1)
    ]).map((value) => typeof value === 'string' ? value : `${fmt(value, digits)}${unit}`);

    return makeChoice(rng, { ...options, correct, distractors });
  }

  function pairQuestion(conceptId, rng, seed) {
    const first = base.generateQuestion(conceptId, `${seed}-A`);
    const second = base.generateQuestion(conceptId, `${seed}-B`);
    const a = first.choices[first.answer];
    const b = second.choices[second.answer];
    const aWrong = first.choices.find((_, index) => index !== first.answer) || a;
    const bWrong = second.choices.find((_, index) => index !== second.answer) || b;

    return makeChoice(rng, {
      conceptId,
      concept: `${first.concept} + ${second.concept}`,
      difficulty: '중상',
      stem:
        `[복합형] 다음 (가), (나)를 각각 계산한 답의 순서쌍으로 옳은 것은?\n` +
        `(가) ${first.stem}\n` +
        `(나) ${second.stem}`,
      correct: `(가) ${a} / (나) ${b}`,
      distractors: [
        `(가) ${aWrong} / (나) ${b}`,
        `(가) ${a} / (나) ${bWrong}`,
        `(가) ${aWrong} / (나) ${bWrong}`,
        `(가) ${b} / (나) ${a}`
      ],
      formula: [first.formula, second.formula].filter(Boolean).join(' · '),
      explanation:
        `(가) ${first.explanation}\n` +
        `(나) ${second.explanation}\n` +
        `따라서 순서쌍은 (가) ${a} / (나) ${b}이다.`
    });
  }

  const ADVANCED = {
    'motion-graphs': [
      (rng) => {
        const d = pick(rng, [
          { v0: 4, a: 3, t1: 4, b: 4 },
          { v0: 6, a: 2, t1: 6, b: 3 },
          { v0: 2, a: 4, t1: 4, b: 3 }
        ]);
        const v1 = d.v0 + d.a * d.t1;
        const t2 = v1 / d.b;
        const s1 = (d.v0 + v1) * d.t1 / 2;
        const s2 = v1 * t2 / 2;
        return makeNumeric(rng, {
          conceptId: 'motion-graphs',
          concept: '두 구간 등가속도 운동',
          difficulty: '상',
          stem: `자동차가 ${d.v0} m/s에서 ${d.a} m/s²로 ${d.t1}초 가속한 직후, ${d.b} m/s²로 감속하여 정지했다. 전체 이동거리는?`,
          correct: s1 + s2,
          distractors: [s1, s2, v1 * (d.t1 + t2), (s1 + s2) / 2],
          unit: 'm',
          formula: '각 구간의 v-t 그래프 넓이를 합한다.',
          explanation: `가속 후 속력은 ${v1} m/s이다. 첫 구간은 ${fmt(s1)} m, 감속 구간은 ${fmt(s2)} m이므로 전체는 ${fmt(s1 + s2)} m이다.`
        });
      },
      (rng) => {
        const d = pick(rng, [
          { t: 4, s: 80, vf: 28, next: 2 },
          { t: 5, s: 100, vf: 30, next: 3 },
          { t: 6, s: 126, vf: 30, next: 2 }
        ]);
        const v0 = 2 * d.s / d.t - d.vf;
        const a = (d.vf - v0) / d.t;
        const nextDistance = d.vf * d.next + 0.5 * a * d.next ** 2;
        return makeNumeric(rng, {
          conceptId: 'motion-graphs',
          concept: '자료로 운동식 복원',
          difficulty: '상',
          stem: `등가속도 운동하는 물체가 ${d.t}초 동안 ${d.s} m 이동했고 ${d.t}초 순간 속력이 ${d.vf} m/s였다. 같은 가속도로 그 뒤 ${d.next}초 더 이동한 거리는?`,
          correct: nextDistance,
          distractors: [d.vf * d.next, d.s / d.t * d.next, 0.5 * a * d.next ** 2, nextDistance - a * d.next ** 2],
          unit: 'm',
          formula: 's=½(v₀+v)t → v₀와 a를 먼저 구한다.',
          explanation: `v₀=${fmt(v0)} m/s, a=${fmt(a)} m/s²이다. 이후 변위는 ${d.vf}×${d.next}+½×${fmt(a)}×${d.next}²=${fmt(nextDistance)} m이다.`
        });
      }
    ],

    'forces-equilibrium': [
      (rng) => {
        const d = pick(rng, [
          { m: 4, sin: 0.6, cos: 0.8, angle: 37 },
          { m: 5, sin: 0.8, cos: 0.6, angle: 53 },
          { m: 8, sin: 0.6, cos: 0.8, angle: 37 }
        ]);
        const normal = d.m * 10 / d.cos;
        return makeNumeric(rng, {
          conceptId: 'forces-equilibrium',
          concept: '경사면 평형과 수직항력',
          difficulty: '상',
          stem: `마찰 없는 ${d.angle}° 경사면의 질량 ${d.m} kg 물체에 수평 힘을 가해 정지시켰다. sin=${d.sin}, cos=${d.cos}일 때 수직항력은? (g=10)`,
          correct: normal,
          distractors: [d.m * 10 * d.cos, d.m * 10 / d.sin, d.m * 10, normal * d.sin],
          unit: 'N',
          formula: 'Fcosθ=mgsinθ, N=mgcosθ+Fsinθ=mg/cosθ',
          explanation: `경사면 평형식을 연립하면 N=mg/cosθ=${d.m * 10}/${d.cos}=${fmt(normal)} N이다.`
        });
      },
      (rng) => {
        const d = pick(rng, [
          { table: 4, hanging: 3, mu: 0.25 },
          { table: 5, hanging: 4, mu: 0.2 },
          { table: 6, hanging: 5, mu: 0.25 }
        ]);
        const a = (d.hanging * 10 - d.mu * d.table * 10) / (d.table + d.hanging);
        const tension = d.hanging * (10 - a);
        return makeNumeric(rng, {
          conceptId: 'forces-equilibrium',
          concept: '마찰면-도르래 연립',
          difficulty: '상',
          stem: `질량 ${d.table} kg 물체가 운동마찰계수 ${d.mu}인 수평면에 있고 줄로 질량 ${d.hanging} kg 추와 연결되어 움직인다. 줄의 장력은? (g=10)`,
          correct: tension,
          distractors: [d.hanging * 10, d.mu * d.table * 10, (d.table + d.hanging) * a, d.table * a],
          unit: 'N',
          formula: 'm₂g-μm₁g=(m₁+m₂)a, T=m₂(g-a)',
          explanation: `가속도는 ${fmt(a)} m/s²이고 T=${d.hanging}(10-${fmt(a)})=${fmt(tension)} N이다.`
        });
      }
    ],

    'energy-spring': [
      (rng) => {
        const d = pick(rng, [
          { m: 2, v: 10, mu: 0.2, L: 5, k: 200 },
          { m: 1, v: 12, mu: 0.1, L: 4, k: 100 },
          { m: 3, v: 8, mu: 0.2, L: 2, k: 150 }
        ]);
        const available = 0.5 * d.m * d.v ** 2 - d.mu * d.m * 10 * d.L;
        const x = Math.sqrt(2 * available / d.k);
        return makeNumeric(rng, {
          conceptId: 'energy-spring',
          concept: '마찰 구간 뒤 용수철 압축',
          difficulty: '상',
          stem: `질량 ${d.m} kg 물체가 ${d.v} m/s로 운동하다 길이 ${d.L} m, 운동마찰계수 ${d.mu}인 구간을 지난 뒤 k=${d.k} N/m 용수철을 압축한다. 최대 압축 길이는? (g=10)`,
          correct: x,
          distractors: [Math.sqrt(d.m * d.v ** 2 / d.k), x / 2, available / d.k, Math.sqrt(2 * d.mu * d.m * 10 * d.L / d.k)],
          unit: 'm',
          formula: '½mv²-μmgL=½kx²',
          explanation: `마찰 후 남은 에너지는 ${fmt(available)} J이다. ½kx²=${fmt(available)}에서 x=${fmt(x)} m이다.`
        });
      },
      (rng) => {
        const radius = pick(rng, [1, 2, 3, 4]);
        return makeNumeric(rng, {
          conceptId: 'energy-spring',
          concept: '수직 원운동 최소 출발높이',
          difficulty: '상',
          stem: `마찰 없는 궤도에서 물체가 정지 상태로 출발하여 반지름 ${radius} m인 수직 원형궤도를 이탈하지 않고 돌기 위한 최소 출발높이(최저점 기준)는?`,
          correct: 2.5 * radius,
          distractors: [2 * radius, 3 * radius, 1.5 * radius, 4 * radius],
          unit: 'm',
          formula: '최고점 v²=gR, mgh=2mgR+½mgR',
          explanation: `최고점 최소조건을 에너지식에 넣으면 h=2R+R/2=2.5R=${2.5 * radius} m이다.`
        });
      }
    ],

    'momentum-collision': [
      (rng) => {
        const d = pick(rng, [
          { v1: 6, v2: 8 },
          { v1: 10, v2: 10 },
          { v1: 12, v2: 5 }
        ]);
        const speed = Math.sqrt(d.v1 ** 2 + d.v2 ** 2) / 2;
        return makeNumeric(rng, {
          conceptId: 'momentum-collision',
          concept: '수직 운동량 합성',
          difficulty: '상',
          stem: `질량이 같은 두 물체가 서로 수직인 방향으로 각각 ${d.v1} m/s, ${d.v2} m/s로 운동하다 충돌해 붙었다. 충돌 직후 속력은?`,
          correct: speed,
          distractors: [Math.sqrt(d.v1 ** 2 + d.v2 ** 2), (d.v1 + d.v2) / 2, Math.abs(d.v1 - d.v2) / 2, speed * 2],
          unit: 'm/s',
          formula: '벡터 운동량 합 ÷ 전체 질량',
          explanation: `총운동량 크기는 m√(${d.v1}²+${d.v2}²), 전체 질량은 2m이므로 속력은 ${fmt(speed)} m/s이다.`
        });
      },
      (rng) => {
        const d = pick(rng, [
          { bullet: 0.02, block: 0.98, h: 0.2 },
          { bullet: 0.01, block: 0.49, h: 0.45 },
          { bullet: 0.025, block: 0.975, h: 0.8 }
        ]);
        const V = Math.sqrt(20 * d.h);
        const u = (d.bullet + d.block) * V / d.bullet;
        return makeNumeric(rng, {
          conceptId: 'momentum-collision',
          concept: '탄도진자',
          difficulty: '상',
          stem: `질량 ${d.bullet} kg 탄환이 정지한 질량 ${d.block} kg 나무토막에 박힌 뒤 함께 ${d.h} m 올라갔다. 탄환의 충돌 직전 속력은? (g=10)`,
          correct: u,
          distractors: [V, d.block * V / d.bullet, u / 2, (d.bullet + d.block) * 20 * d.h / d.bullet],
          unit: 'm/s',
          formula: 'mu=(M+m)V, ½(M+m)V²=(M+m)gh',
          explanation: `충돌 직후 V=√(2gh)=${fmt(V)} m/s. 운동량 보존으로 u=${fmt(u)} m/s이다.`
        });
      }
    ],

    'circular-oscillation': [
      (rng) => {
        const d = pick(rng, [
          { mu: 0.25, r: 0.1 },
          { mu: 0.4, r: 0.25 },
          { mu: 0.5, r: 0.2 }
        ]);
        const omega = Math.sqrt(d.mu * 10 / d.r);
        return makeNumeric(rng, {
          conceptId: 'circular-oscillation',
          concept: '회전 원판 미끄럼 한계',
          difficulty: '상',
          stem: `수평 회전원판에서 회전축으로부터 ${d.r} m 떨어진 물체와 원판 사이 정지마찰계수가 ${d.mu}이다. 미끄러지지 않는 최대 각속도는? (g=10)`,
          correct: omega,
          distractors: [d.mu * 10 / d.r, Math.sqrt(d.mu * d.r * 10), omega / 2, d.mu * 10 * d.r],
          unit: 'rad/s',
          formula: 'mω²r=μ_smg',
          explanation: `ω=√(μg/r)=√(${d.mu}×10/${d.r})=${fmt(omega)} rad/s이다.`
        });
      },
      (rng) => {
        const mass = pick(rng, [1, 2, 3, 5]);
        return makeNumeric(rng, {
          conceptId: 'circular-oscillation',
          concept: '연직 원운동의 장력',
          difficulty: '상',
          stem: `질량 ${mass} kg 물체가 반지름 R인 연직 원운동을 한다. 최고점에서 줄이 막 느슨해지지 않는 최소 상태일 때 최저점의 장력은? (g=10)`,
          correct: 60 * mass,
          distractors: [10 * mass, 40 * mass, 50 * mass, 70 * mass],
          unit: 'N',
          formula: 'v_top²=gR, v_bottom²=5gR, T_bottom=6mg',
          explanation: `최고점 최소조건과 에너지보존을 쓰면 최저점에서 v²=5gR, 따라서 T=5mg+mg=6mg=${60 * mass} N이다.`
        });
      }
    ],

    'fluid-buoyancy': [
      (rng) => {
        const d = pick(rng, [
          { rho1: 800, rho2: 1200, fraction: 0.5 },
          { rho1: 900, rho2: 1400, fraction: 0.4 },
          { rho1: 1000, rho2: 13600, fraction: 0.25 }
        ]);
        const density = d.fraction * d.rho1 + (1 - d.fraction) * d.rho2;
        return makeNumeric(rng, {
          conceptId: 'fluid-buoyancy',
          concept: '두 유체 경계 부력평형',
          difficulty: '상',
          stem: `물체가 밀도 ${d.rho1} kg/m³인 위 액체와 ${d.rho2} kg/m³인 아래 액체 경계에 떠 있다. 부피의 ${fmt(d.fraction * 100)}%가 위 액체에 잠길 때 물체 밀도는?`,
          correct: density,
          distractors: [(d.rho1 + d.rho2) / 2, d.fraction * d.rho2 + (1 - d.fraction) * d.rho1, d.rho2 - d.rho1, d.rho1 * d.rho2 / (d.rho1 + d.rho2)],
          unit: 'kg/m³',
          formula: 'ρ_objV=ρ₁V₁+ρ₂V₂',
          explanation: `ρ_obj=${d.fraction}×${d.rho1}+${fmt(1 - d.fraction)}×${d.rho2}=${fmt(density)} kg/m³이다.`
        });
      },
      (rng) => {
        const d = pick(rng, [
          { rho: 1000, v: 2, areaRatio: 2 },
          { rho: 800, v: 3, areaRatio: 3 },
          { rho: 1000, v: 4, areaRatio: 2 }
        ]);
        const v2 = d.areaRatio * d.v;
        const pressure = 0.5 * d.rho * (v2 ** 2 - d.v ** 2);
        return makeNumeric(rng, {
          conceptId: 'fluid-buoyancy',
          concept: '연속방정식과 베르누이',
          difficulty: '상',
          stem: `수평관에서 밀도 ${d.rho} kg/m³ 유체가 흐른다. 넓은 부분 속력이 ${d.v} m/s이고 좁은 부분 단면적이 1/${d.areaRatio}일 때, 넓은 부분 압력-좁은 부분 압력은?`,
          correct: pressure,
          distractors: [0.5 * d.rho * (v2 - d.v) ** 2, d.rho * d.v * v2, pressure / 2, 2 * pressure],
          unit: 'Pa',
          formula: 'A₁v₁=A₂v₂, P₁-P₂=½ρ(v₂²-v₁²)',
          explanation: `좁은 곳 속력은 ${v2} m/s이고 압력차는 ${fmt(pressure)} Pa이다.`
        });
      }
    ],

    'electrostatics': [
      (rng) => makeChoice(rng, {
        conceptId: 'electrostatics',
        concept: '전기쌍극자의 전기장과 전위',
        difficulty: '상',
        stem: '같은 크기의 +Q와 -Q가 x축 위 x=-d, +d에 있다. y축 위 점 P에서 전기장과 전위에 대한 설명으로 옳은 것은?',
        correct: '전위는 0이고 전기장은 +전하에서 -전하를 향하는 x축 방향이다',
        distractors: ['전기장과 전위가 모두 0이다', '전위는 양수이고 전기장은 y축 방향이다', '전위는 음수이고 전기장은 y축 방향이다', '전위는 0이고 전기장도 y축 방향이다'],
        formula: 'V는 스칼라 합, E는 벡터 합',
        explanation: '두 전하까지 거리가 같아 전위는 상쇄된다. 전기장의 y성분은 상쇄되고 x성분은 같은 방향으로 더해진다.'
      }),
      (rng) => {
        const d = pick(rng, [
          { E: 200, L: 0.4, v: 20, y: 0.02 },
          { E: 500, L: 0.5, v: 25, y: 0.04 },
          { E: 300, L: 0.6, v: 30, y: 0.03 }
        ]);
        const qm = 2 * d.y * d.v ** 2 / (d.E * d.L ** 2);
        return makeNumeric(rng, {
          conceptId: 'electrostatics',
          concept: '균일 전기장 속 포물선 운동',
          difficulty: '상',
          stem: `대전입자가 수평속력 ${d.v} m/s로 길이 ${d.L} m인 균일전기장 ${d.E} N/C 영역을 통과하며 수직으로 ${d.y} m 편향되었다. |q|/m은?`,
          correct: qm,
          distractors: [d.y * d.v ** 2 / (d.E * d.L ** 2), 2 * d.y * d.v / (d.E * d.L), d.E * d.L ** 2 / (2 * d.y * d.v ** 2), qm * d.L],
          unit: 'C/kg',
          formula: 't=L/v, y=½(qE/m)t²',
          explanation: `|q|/m=2yv²/(EL²)=${fmt(qm)} C/kg이다.`
        });
      }
    ],

    'circuits': [
      (rng) => {
        const d = pick(rng, [
          { E: 12, r: 2, R1: 4, R2: 6 },
          { E: 10, r: 2, R1: 3, R2: 8 },
          { E: 9, r: 1, R1: 2, R2: 5 }
        ]);
        const I1 = d.E / (d.R1 + d.r);
        const I2 = d.E / (d.R2 + d.r);
        return makeNumeric(rng, {
          conceptId: 'circuits',
          concept: '전지의 내부저항',
          difficulty: '상',
          stem: `전지에 ${d.R1} Ω을 연결했을 때 ${fmt(I1)} A, ${d.R2} Ω을 연결했을 때 ${fmt(I2)} A가 흘렀다. 내부저항은?`,
          correct: d.r,
          distractors: [d.E, d.R2 - d.R1, d.r / 2, 2 * d.r],
          unit: 'Ω',
          formula: 'ℰ=I(R+r)를 두 경우에 적용',
          explanation: `두 식 ${fmt(I1)}(${d.R1}+r)=${fmt(I2)}(${d.R2}+r)를 풀면 r=${d.r} Ω이다.`
        });
      },
      (rng) => {
        const n = pick(rng, [2, 3, 4, 5]);
        return makeChoice(rng, {
          conceptId: 'circuits',
          concept: '저항선 절단 후 병렬연결',
          difficulty: '상',
          stem: `저항 R인 균일한 저항선을 ${n}등분한 뒤 모든 조각을 병렬 연결하여 같은 전압에 연결했다. 소비전력은 원래의 몇 배인가?`,
          correct: `${n ** 2}배`,
          distractors: [`${n}배`, `1/${n}배`, `1/${n ** 2}배`, '변하지 않는다'],
          formula: '각 조각 R/n, n개 병렬 → R_eq=R/n², P=V²/R',
          explanation: `합성저항이 R/${n ** 2}이므로 같은 전압에서 전력은 ${n ** 2}배이다.`
        });
      }
    ],

    'magnetism': [
      (rng) => makeChoice(rng, {
        conceptId: 'magnetism',
        concept: '두 직선도선의 합성 자기장',
        difficulty: '상',
        stem: '같은 방향 전류가 흐르는 평행한 두 긴 직선도선 A, B가 2d 떨어져 있다. A에는 2I, B에는 I가 흐른다. 중점 P, B 오른쪽 d 지점 Q, 오른쪽 2d 지점 R에서 자기장 세기 비 B_P:B_Q:B_R는?',
        correct: '3:5:3',
        distractors: ['1:1:1', '1:5:3', '6:5:3', '9:5:3'],
        formula: 'B∝I/r, 방향을 포함해 합성',
        explanation: 'P에서는 B₀, Q에서는 5B₀/3, R에서는 B₀이므로 3:5:3이다.'
      }),
      (rng) => {
        const d = pick(rng, [
          { E: 600, B1: 0.2, B2: 0.5, mq: 0.02 },
          { E: 800, B1: 0.4, B2: 0.2, mq: 0.01 },
          { E: 1000, B1: 0.25, B2: 0.4, mq: 0.016 }
        ]);
        const v = d.E / d.B1;
        const r = d.mq * v / d.B2;
        return makeNumeric(rng, {
          conceptId: 'magnetism',
          concept: '속도선택기 이후 원운동',
          difficulty: '상',
          stem: `전기장 ${d.E} V/m와 자기장 ${d.B1} T인 속도선택기를 통과한 입자가 자기장 ${d.B2} T 영역에 들어간다. m/|q|=${d.mq} kg/C일 때 반지름은?`,
          correct: r,
          distractors: [d.mq * d.E * d.B1 / d.B2, 2 * r, r / 2, d.mq * d.B1 / (d.E * d.B2)],
          unit: 'm',
          formula: 'v=E/B₁, r=(m/|q|)v/B₂',
          explanation: `v=${fmt(v)} m/s, r=${d.mq}×${fmt(v)}/${d.B2}=${fmt(r)} m이다.`
        });
      }
    ],

    'induction': [
      (rng) => {
        const d = pick(rng, [
          { B: 0.5, L: 0.4, v: 5, R: 2 },
          { B: 0.8, L: 0.5, v: 4, R: 4 },
          { B: 1.2, L: 0.25, v: 6, R: 3 }
        ]);
        const force = d.B ** 2 * d.L ** 2 * d.v / d.R;
        return makeNumeric(rng, {
          conceptId: 'induction',
          concept: '운동기전력과 자기저항력',
          difficulty: '상',
          stem: `길이 ${d.L} m 막대가 자기장 ${d.B} T 속에서 ${d.v} m/s로 등속운동한다. 전체저항 ${d.R} Ω일 때 등속을 유지하는 외력은?`,
          correct: force,
          distractors: [d.B * d.L * d.v / d.R, d.B ** 2 * d.L * d.v / d.R, d.B * d.L ** 2 * d.v, d.R * d.v / (d.B * d.L)],
          unit: 'N',
          formula: 'ε=BLv, I=ε/R, F=BIL',
          explanation: `F=B²L²v/R=${fmt(force)} N이다.`
        });
      },
      (rng) => {
        const d = pick(rng, [
          { B: 0.5, A: 0.2, R: 2 },
          { B: 0.8, A: 0.15, R: 4 },
          { B: 1.2, A: 0.1, R: 3 }
        ]);
        const charge = d.B * d.A / d.R;
        return makeNumeric(rng, {
          conceptId: 'induction',
          concept: '자속 변화와 총 전하량',
          difficulty: '상',
          stem: `저항 ${d.R} Ω인 한 바퀴 코일을 자기장이 없는 곳에서 ${d.B} T인 영역으로 완전히 넣었다. 코일 면적 ${d.A} m²일 때 이동 중 흐른 총 전하량은?`,
          correct: charge,
          distractors: [d.B * d.A * d.R, d.B / (d.A * d.R), 2 * charge, d.A / (d.B * d.R)],
          unit: 'C',
          formula: 'Q=ΔΦ/R=BA/R',
          explanation: `총 전하량은 이동속도와 무관하며 BA/R=${fmt(charge)} C이다.`
        });
      }
    ],

    'waves-sound': [
      (rng) => {
        const avg = pick(rng, [256, 300, 440, 512]);
        const beat = pick(rng, [4, 6, 8, 10]);
        const f1 = avg - beat / 2;
        const f2 = avg + beat / 2;
        return makeChoice(rng, {
          conceptId: 'waves-sound',
          concept: '맥놀이',
          difficulty: '중상',
          stem: `두 순음의 평균 진동수가 ${avg} Hz이고 초당 ${beat}회의 맥놀이가 들린다. 가능한 두 진동수는?`,
          correct: `${fmt(f1)} Hz와 ${fmt(f2)} Hz`,
          distractors: [`${avg} Hz와 ${avg + beat} Hz`, `${avg - beat} Hz와 ${avg + beat} Hz`, `${beat} Hz와 ${avg} Hz`, `${avg / 2} Hz와 ${avg / 2 + beat} Hz`],
          formula: 'f_beat=|f₂-f₁|, 평균=(f₁+f₂)/2',
          explanation: `차는 ${beat} Hz, 합은 ${2 * avg} Hz이므로 ${fmt(f1)} Hz와 ${fmt(f2)} Hz이다.`
        });
      },
      (rng) => {
        const d = pick(rng, [
          { f: 500, v: 340, vs: 20 },
          { f: 600, v: 330, vs: 30 },
          { f: 400, v: 320, vs: 40 }
        ]);
        const observed = d.f * d.v / (d.v - d.vs);
        return makeNumeric(rng, {
          conceptId: 'waves-sound',
          concept: '도플러 효과',
          difficulty: '상',
          stem: `정지한 관찰자를 향해 ${d.f} Hz 음원이 ${d.vs} m/s로 접근한다. 소리속력 ${d.v} m/s일 때 관찰진동수는?`,
          correct: observed,
          distractors: [d.f * (d.v - d.vs) / d.v, d.f * d.v / (d.v + d.vs), d.f * (d.v + d.vs) / d.v, d.f + d.vs],
          unit: 'Hz',
          formula: '접근 음원 f′=fv/(v-v_s)',
          explanation: `f′=${d.f}×${d.v}/(${d.v}-${d.vs})=${fmt(observed)} Hz이다.`
        });
      }
    ],

    'refraction-tir': [
      (rng) => {
        const d = pick(rng, [
          { n1: 1.5, n2: 1.2 },
          { n1: 1.6, n2: 1.2 },
          { n1: 1.7, n2: 1.3 }
        ]);
        const value = Math.sqrt(d.n1 ** 2 - d.n2 ** 2);
        return makeNumeric(rng, {
          conceptId: 'refraction-tir',
          concept: '광섬유 수치개구',
          difficulty: '상',
          stem: `공기에서 심 굴절률 ${d.n1}, 클래딩 굴절률 ${d.n2}인 광섬유로 빛을 넣는다. 전반사를 위한 최대 입사각 θ에 대해 sinθ_max는?`,
          correct: value,
          distractors: [d.n2 / d.n1, d.n1 - d.n2, d.n1 / d.n2, value / 2],
          formula: 'sinθ_max=√(n₁²-n₂²)',
          explanation: `수치개구를 적용하면 sinθ_max=${fmt(value)}이다.`
        });
      },
      (rng) => {
        const d = pick(rng, [
          { d1: 4, n1: 1.5, d2: 6, n2: 1.2 },
          { d1: 3, n1: 1.5, d2: 5, n2: 1.25 },
          { d1: 6, n1: 2, d2: 4, n2: 1.25 }
        ]);
        const apparent = d.d1 / d.n1 + d.d2 / d.n2;
        return makeNumeric(rng, {
          conceptId: 'refraction-tir',
          concept: '복층 매질의 겉보기 깊이',
          difficulty: '상',
          stem: `두께 ${d.d1} cm·굴절률 ${d.n1}인 층 아래에 두께 ${d.d2} cm·굴절률 ${d.n2}인 층이 있다. 위에서 본 맨 아래 물체의 겉보기 깊이는? (작은 각 근사)`,
          correct: apparent,
          distractors: [(d.d1 + d.d2) / (d.n1 + d.n2), d.d1 * d.n1 + d.d2 * d.n2, (d.d1 + d.d2) / d.n1, apparent / 2],
          unit: 'cm',
          formula: 'd_app=d₁/n₁+d₂/n₂',
          explanation: `각 층의 겉보기 두께를 더하면 ${fmt(apparent)} cm이다.`
        });
      }
    ],

    'mirrors-lenses': [
      (rng) => {
        const d = pick(rng, [
          { f: 10, u: 30 },
          { f: 12, u: 36 },
          { f: 15, u: 25 }
        ]);
        const v = 1 / (1 / d.f - 1 / d.u);
        const magnification = Math.abs(v / d.u);
        return makeChoice(rng, {
          conceptId: 'mirrors-lenses',
          concept: '렌즈식과 배율',
          difficulty: '상',
          stem: `초점거리 ${d.f} cm인 볼록렌즈 앞 ${d.u} cm에 물체가 있다. 상거리와 상의 크기/물체 크기의 순서쌍은?`,
          correct: `${fmt(v)} cm, ${fmt(magnification)}배`,
          distractors: [`${d.u - d.f} cm, ${fmt(d.u / v)}배`, `${fmt(v)} cm, ${fmt(d.u / v)}배`, `${d.f} cm, 1배`, `${d.u + d.f} cm, ${fmt(magnification)}배`],
          formula: '1/f=1/u+1/v, |m|=v/u',
          explanation: `v=${fmt(v)} cm, |m|=${fmt(magnification)}이다.`
        });
      },
      (rng) => {
        const far = pick(rng, [1, 2, 4, 5]);
        return makeNumeric(rng, {
          conceptId: 'mirrors-lenses',
          concept: '근시 교정렌즈 도수',
          difficulty: '중상',
          stem: `먼점이 눈앞 ${far} m인 근시 학생이 매우 먼 물체를 보기 위해 필요한 렌즈 도수는?`,
          correct: -1 / far,
          distractors: [1 / far, -far, far, 1 / (2 * far)],
          unit: 'D',
          formula: 'f=-d_far, P=1/f',
          explanation: `초점거리 -${far} m이므로 P=-1/${far}=${fmt(-1 / far)} D이다.`
        });
      }
    ],

    'light-color-quantum': [
      (rng) => makeChoice(rng, {
        conceptId: 'light-color-quantum',
        concept: '광전효과의 세기와 진동수',
        difficulty: '상',
        stem: '문턱진동수 f₀인 금속에 2f₀ 빛을 비추어 광전자가 나온다. 빛의 세기만 2배로 했을 때 옳은 것은?',
        correct: '광전자 수는 증가하지만 최대 운동에너지는 변하지 않는다',
        distractors: ['최대 운동에너지가 2배가 된다', '문턱진동수가 2배가 된다', '광전자 수와 최대 운동에너지가 모두 변하지 않는다', '광전자가 방출되지 않는다'],
        formula: 'K_max=hf-φ, 세기↑→광자수↑',
        explanation: '광자 1개의 에너지는 진동수로 정해지고, 세기는 단위시간당 광자 수를 바꾼다.'
      }),
      (rng) => {
        const factor = pick(rng, [4, 9, 16]);
        return makeChoice(rng, {
          conceptId: 'light-color-quantum',
          concept: '가속전자의 드브로이 파장',
          difficulty: '상',
          stem: `정지한 전자를 전위차 V와 ${factor}V로 각각 가속했다. 드브로이 파장 비 λ(V):λ(${factor}V)는?`,
          correct: `${Math.sqrt(factor)}:1`,
          distractors: [`1:${Math.sqrt(factor)}`, `${factor}:1`, '1:1', `${factor ** 2}:1`],
          formula: 'λ∝1/√V',
          explanation: `전위차가 ${factor}배면 운동량은 ${Math.sqrt(factor)}배, 파장은 1/${Math.sqrt(factor)}배이므로 비는 ${Math.sqrt(factor)}:1이다.`
        });
      }
    ],

    'thermal-balance': [
      (rng) => {
        const d = pick(rng, [
          { mm: 0.1, Tm: 80, mw: 0.2, Tw: 20, Tf: 30, Ccal: 40 },
          { mm: 0.2, Tm: 100, mw: 0.3, Tw: 20, Tf: 35, Ccal: 60 },
          { mm: 0.15, Tm: 90, mw: 0.25, Tw: 18, Tf: 30, Ccal: 50 }
        ]);
        const c = (d.mw * 4200 * (d.Tf - d.Tw) + d.Ccal * (d.Tf - d.Tw)) / (d.mm * (d.Tm - d.Tf));
        return makeNumeric(rng, {
          conceptId: 'thermal-balance',
          concept: '열량계를 포함한 비열 측정',
          difficulty: '상',
          stem: `질량 ${d.mm} kg, ${d.Tm}℃ 금속을 ${d.mw} kg, ${d.Tw}℃ 물과 열용량 ${d.Ccal} J/℃인 열량계에 넣어 ${d.Tf}℃가 되었다. 금속 비열은? (물 4200 J/kg·℃)`,
          correct: c,
          distractors: [d.mw * 4200 * (d.Tf - d.Tw) / (d.mm * (d.Tm - d.Tf)), c / 2, 2 * c, d.mm * 4200],
          unit: 'J/(kg·℃)',
          formula: '금속 손실열=물 획득열+열량계 획득열',
          explanation: `열량 보존을 적용하면 금속 비열은 ${fmt(c)} J/(kg·℃)이다.`
        });
      },
      (rng) => {
        const d = pick(rng, [
          { water: 0.5, Tw: 40, ice: 0.05 },
          { water: 0.4, Tw: 50, ice: 0.08 },
          { water: 0.6, Tw: 30, ice: 0.04 }
        ]);
        const finalT = (d.water * 4200 * d.Tw - d.ice * 334000) / ((d.water + d.ice) * 4200);
        return makeNumeric(rng, {
          conceptId: 'thermal-balance',
          concept: '얼음 융해 후 열평형',
          difficulty: '상',
          stem: `${d.Tw}℃ 물 ${d.water} kg에 0℃ 얼음 ${d.ice} kg을 넣었다. 얼음이 모두 녹을 때 최종온도는? (물 4200 J/kg·℃, 융해열 334 kJ/kg)`,
          correct: finalT,
          distractors: [d.water * d.Tw / (d.water + d.ice), finalT / 2, 0, d.Tw - d.ice * 334 / 4.2],
          unit: '℃',
          formula: 'm_wc(T_w-T_f)=m_iL+m_icT_f',
          explanation: `물의 손실열에서 얼음 융해열을 빼고 전체 물의 열용량으로 나누면 ${fmt(finalT)}℃이다.`
        });
      }
    ],

    'heat-transfer': [
      (rng) => {
        const d = pick(rng, [
          { kA: 2, kB: 1, hot: 100, cold: 10 },
          { kA: 3, kB: 2, hot: 120, cold: 20 },
          { kA: 4, kB: 1, hot: 90, cold: 0 }
        ]);
        const interfaceT = (d.kA * d.hot + d.kB * d.cold) / (d.kA + d.kB);
        return makeNumeric(rng, {
          conceptId: 'heat-transfer',
          concept: '복합막대 접촉면 온도',
          difficulty: '상',
          stem: `길이와 단면적이 같은 막대 A, B를 직렬 연결했다. k_A:k_B=${d.kA}:${d.kB}, 양끝 온도는 ${d.hot}℃와 ${d.cold}℃이다. 정상상태 접촉면 온도는?`,
          correct: interfaceT,
          distractors: [(d.hot + d.cold) / 2, (d.kB * d.hot + d.kA * d.cold) / (d.kA + d.kB), d.hot - (d.hot - d.cold) * d.kA / (d.kA + d.kB), d.cold],
          unit: '℃',
          formula: 'k_A(T_h-T_i)=k_B(T_i-T_c)',
          explanation: `정상상태 열류가 같다는 식을 풀면 T_i=${fmt(interfaceT)}℃이다.`
        });
      },
      (rng) => {
        const d = pick(rng, [
          { L1: 0.004, k1: 0.8, L2: 0.012, k2: 0.024 },
          { L1: 0.005, k1: 1, L2: 0.01, k2: 0.025 },
          { L1: 0.006, k1: 1.2, L2: 0.015, k2: 0.03 }
        ]);
        const R1 = d.L1 / d.k1;
        const R2 = d.L2 / d.k2;
        const factor = R1 / (R1 + R2);
        return makeChoice(rng, {
          conceptId: 'heat-transfer',
          concept: '이중창 열저항',
          difficulty: '상',
          stem: `유리 두께 ${d.L1} m·열전도율 ${d.k1}에 공기층 두께 ${d.L2} m·열전도율 ${d.k2}를 직렬로 추가했다. 같은 온도차에서 열손실률은 단일 유리의 몇 배인가?`,
          correct: `${fmt(factor)}배`,
          distractors: [`${fmt(1 / factor)}배`, `${fmt(R2 / R1)}배`, `${fmt(R1 / R2)}배`, '변하지 않는다'],
          formula: 'H=ΔT/(R₁+R₂), R=L/(kA)',
          explanation: `열손실률 비는 R₁/(R₁+R₂)=${fmt(factor)}배이다.`
        });
      }
    ],

    'gas-thermodynamics': [
      (rng) => {
        const d = pick(rng, [
          { P: 2, V1: 2, V2: 5, heat: 1000 },
          { P: 3, V1: 1, V2: 4, heat: 1400 },
          { P: 1.5, V1: 3, V2: 7, heat: 900 }
        ]);
        const work = d.P * (d.V2 - d.V1) * 100;
        const deltaU = d.heat - work;
        return makeNumeric(rng, {
          conceptId: 'gas-thermodynamics',
          concept: '등압팽창과 열역학 제1법칙',
          difficulty: '상',
          stem: `이상기체가 ${d.P} atm에서 ${d.V1} L→${d.V2} L로 등압팽창하며 ${d.heat} J의 열을 흡수했다. 1 atm·L=100 J일 때 내부에너지 변화는?`,
          correct: deltaU,
          distractors: [d.heat + work, work, d.heat, deltaU / 2],
          unit: 'J',
          formula: 'W=PΔV, ΔU=Q-W',
          explanation: `일은 ${fmt(work)} J이고 ΔU=${d.heat}-${fmt(work)}=${fmt(deltaU)} J이다.`
        });
      },
      (rng) => {
        const d = pick(rng, [
          { P1: 1, P2: 3, V1: 2, V2: 5 },
          { P1: 2, P2: 5, V1: 1, V2: 4 },
          { P1: 1.5, P2: 4, V1: 3, V2: 6 }
        ]);
        const work = (d.P2 - d.P1) * (d.V2 - d.V1) * 100;
        return makeNumeric(rng, {
          conceptId: 'gas-thermodynamics',
          concept: 'P-V 순환과정의 순일',
          difficulty: '상',
          stem: `P-V 선도에서 압력 ${d.P1}→${d.P2} atm, 부피 ${d.V1}→${d.V2} L인 직사각형을 시계방향으로 순환한다. 한 주기 순일은? (1 atm·L=100 J)`,
          correct: work,
          distractors: [(d.P2 + d.P1) * (d.V2 - d.V1) * 100, work / 2, -work, (d.P2 - d.P1) * (d.V2 + d.V1) * 100],
          unit: 'J',
          formula: '순일=폐곡선 면적=ΔPΔV',
          explanation: `시계방향이므로 양의 순일이며 직사각형 면적은 ${fmt(work)} J이다.`
        });
      }
    ],

    'thermal-expansion': [
      (rng) => {
        const alpha = pick(rng, [1.2e-5, 1.5e-5, 2e-5]);
        const deltaT = pick(rng, [50, 80, 100]);
        const loss = 86400 * 0.5 * alpha * deltaT;
        return makeNumeric(rng, {
          conceptId: 'thermal-expansion',
          concept: '진자시계의 온도오차',
          difficulty: '상',
          stem: `선팽창계수 ${fmt(alpha * 1e5)}×10⁻⁵/℃인 진자시계의 온도가 ${deltaT}℃ 상승했다. T∝√L일 때 하루 동안 잃는 시간은 약?`,
          correct: loss,
          distractors: [86400 * alpha * deltaT, loss / 2, 2 * loss, 43200 * alpha * deltaT],
          unit: 's',
          formula: 'ΔT_period/T≈½αΔθ',
          explanation: `상대 주기증가는 약 ½αΔθ이므로 하루 오차는 86400×½αΔθ=${fmt(loss)} s이다.`
        });
      },
      (rng) => {
        const d = pick(rng, [
          { V: 2, liquid: 9e-4, container: 3e-5, deltaT: 50 },
          { V: 1.5, liquid: 1.1e-3, container: 4e-5, deltaT: 40 },
          { V: 3, liquid: 8e-4, container: 5e-5, deltaT: 60 }
        ]);
        const overflow = d.V * (d.liquid - d.container) * d.deltaT * 1000;
        return makeNumeric(rng, {
          conceptId: 'thermal-expansion',
          concept: '액체와 용기의 상대팽창',
          difficulty: '상',
          stem: `부피 ${d.V} L 용기에 액체를 가득 채웠다. 액체와 용기의 부피팽창계수는 각각 ${d.liquid}, ${d.container}/℃이고 ${d.deltaT}℃ 가열했다. 넘치는 부피는?`,
          correct: overflow,
          distractors: [d.V * d.liquid * d.deltaT * 1000, d.V * d.container * d.deltaT * 1000, overflow / 2, 2 * overflow],
          unit: 'mL',
          formula: 'ΔV_over=V(β_liquid-β_container)ΔT',
          explanation: `계수 차를 사용하면 넘치는 부피는 ${fmt(overflow)} mL이다.`
        });
      }
    ]
  };

  function resolveId(value) {
    return base.resolveId(value);
  }

  function generateQuestion(conceptId, seed) {
    const resolved = resolveId(conceptId);
    const rng = createRng(`${seed}-${resolved}-hard`);
    const builders = ADVANCED[resolved] || [];
    if (builders.length && rng() < 0.78) {
      return pick(rng, builders)(rng);
    }
    return pairQuestion(resolved, rng, seed);
  }

  function generateSet(conceptId, count = 10, seed = Date.now()) {
    const resolved = resolveId(conceptId);
    const group = base.groups[resolved];
    const questions = [];
    const seen = new Set();
    let attempts = 0;

    while (questions.length < count && attempts < count * 100) {
      const question = generateQuestion(resolved, `${seed}-${attempts}`);
      if (
        question &&
        Array.isArray(question.choices) &&
        question.choices.length === 5 &&
        Number.isInteger(question.answer) &&
        question.answer >= 0 &&
        question.answer < 5 &&
        !seen.has(question.stem)
      ) {
        seen.add(question.stem);
        questions.push({ ...question, number: questions.length + 1 });
      }
      attempts += 1;
    }

    return {
      version: VERSION,
      hardModeVersion: VERSION,
      difficultyProfile: '중상~상',
      conceptId: resolved,
      name: group.name,
      domain: group.domain,
      formulas: group.formulas.slice(),
      tip: `${group.tip} 단순 공식 대입보다 식을 두 단계 이상 연결해 풀이하세요.`,
      seed: String(seed),
      questions
    };
  }

  root.YPWeakQuestionFactory = {
    ...base,
    version: VERSION,
    hardModeVersion: VERSION,
    difficultyProfile: '중상~상',
    generateQuestion,
    generateSet,
    baseFactory: base
  };
})(typeof window !== 'undefined' ? window : globalThis);
