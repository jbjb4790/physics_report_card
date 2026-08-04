(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TPLCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const circled = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '❶': '1', '❷': '2', '❸': '3', '❹': '4', '❺': '5' };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const round = (value, digits = 1) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  };
  const sum = (values) => values.reduce((acc, value) => acc + Number(value || 0), 0);
  const average = (values) => values.length ? sum(values) / values.length : 0;
  const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].map(Number).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };

  function normalizeText(value) {
    return String(value == null ? '' : value).normalize('NFKC').trim();
  }

  function normalizeKey(value) {
    return normalizeText(value).replace(/\s+/g, '').toLowerCase();
  }

  function studentKey(record) {
    return `${normalizeKey(record && record.school)}::${normalizeKey(record && record.name)}`;
  }

  function normalizeAnswer(value) {
    let text = normalizeText(value);
    if (!text || /^(0|x|×|-|_|미기입|무응답|빈칸|blank|none)$/i.test(text)) return '';
    Object.entries(circled).forEach(([from, to]) => { text = text.split(from).join(to); });
    return /^[1-5]$/.test(text) ? Number(text) : null;
  }

  function normalizeAnswers(values, count = 20) {
    const source = Array.isArray(values) ? values : [];
    return Array.from({ length: count }, (_, index) => {
      const answer = normalizeAnswer(source[index]);
      return answer === null ? '' : answer;
    });
  }

  function parseAnswerText(text, count = 20) {
    let raw = normalizeText(text);
    if (!raw) return [];
    Object.entries(circled).forEach(([from, to]) => { raw = raw.split(from).join(to); });

    // A plain answer sequence such as "2 3 5 - 1" must be handled before
    // removing numbered prefixes. Otherwise the pair "5 -" can be mistaken
    // for a label such as "5-" and both the answer and blank are lost.
    let tokens = raw.split(/[\s,;/|]+/).filter(Boolean);
    const isPlainAnswerToken = (token) => normalizeAnswer(token) !== null;
    if (tokens.length > 1 && tokens.every(isPlainAnswerToken)) {
      return tokens.slice(0, count).map(normalizeAnswer);
    }
    if (tokens.length === 1 && tokens[0].length >= count && /^[0-5xX×_-]+$/.test(tokens[0])) {
      return tokens[0].slice(0, count).split('').map(normalizeAnswer);
    }

    raw = raw
      .replace(/(?:^|[\s,;/|])(?:문항\s*)?\d{1,2}\s*(?:번|[.):=-])\s*/g, ' ')
      .replace(/[\[\](){}]/g, ' ');
    tokens = raw.split(/[\s,;/|]+/).filter(Boolean);
    return tokens.slice(0, count).map(normalizeAnswer);
  }

  function getExam(catalog, examId) {
    return (catalog || []).find((exam) => exam.id === examId) || null;
  }

  function grade(exam, answers) {
    if (!exam) throw new Error('시험 정보가 없습니다.');
    const count = Number(exam.answerCount || exam.questions?.length || exam.answerKey?.length || 0);
    const normalized = normalizeAnswers(answers, count);
    let correct = 0;
    let wrong = 0;
    let blank = 0;
    const questionResults = normalized.map((answer, index) => {
      const key = Number(exam.answerKey[index]);
      let status = 'blank';
      if (answer === '') blank += 1;
      else if (Number(answer) === key) { status = 'correct'; correct += 1; }
      else { status = 'wrong'; wrong += 1; }
      const points = status === 'correct' ? Number(exam.correctScore) : status === 'wrong' ? Number(exam.wrongScore) : Number(exam.blankScore);
      return {
        no: index + 1,
        answer,
        key,
        status,
        points: round(points, 2),
        question: exam.questions[index]
      };
    });
    const score = round(correct * Number(exam.correctScore) + wrong * Number(exam.wrongScore) + blank * Number(exam.blankScore), 2);
    return { score, correct, wrong, blank, answers: normalized, questionResults };
  }

  function domainStats(exam, gradeResult) {
    const map = new Map();
    exam.questions.forEach((question, index) => {
      const key = question.domain || '기타';
      if (!map.has(key)) map.set(key, { domain: key, total: 0, correct: 0, wrong: 0, blank: 0, points: 0, maxPoints: 0, questionNos: [] });
      const item = map.get(key);
      const result = gradeResult.questionResults[index];
      item.total += 1;
      item.questionNos.push(index + 1);
      item[result.status] += 1;
      item.points += Number(result.points || 0);
      item.maxPoints += Number(exam.correctScore || 0);
    });
    return [...map.values()].map((item) => ({
      ...item,
      points: round(item.points, 2),
      accuracy: round(item.total ? item.correct / item.total * 100 : 0, 1),
      scoreRate: round(item.maxPoints ? item.points / item.maxPoints * 100 : 0, 1)
    }));
  }

  function enrichRecord(catalog, record) {
    const exam = getExam(catalog, record.examId);
    if (!exam) return { ...record, invalidExam: true };
    const result = grade(exam, record.answers);
    return {
      ...record,
      ...result,
      round: Number(record.round || exam.round || 0),
      examTitle: exam.title,
      domainStats: domainStats(exam, result)
    };
  }

  function uniqueRecords(records) {
    const map = new Map();
    (records || []).forEach((record) => {
      const key = record.id || `${record.examId}::${studentKey(record)}::${record.createdAt || ''}`;
      map.set(key, record);
    });
    return [...map.values()];
  }

  function distribution(scores) {
    const bins = [
      { label: '0점 미만', min: -Infinity, max: -0.000001, count: 0 },
      { label: '0-19', min: 0, max: 19.9999, count: 0 },
      { label: '20-39', min: 20, max: 39.9999, count: 0 },
      { label: '40-59', min: 40, max: 59.9999, count: 0 },
      { label: '60-79', min: 60, max: 79.9999, count: 0 },
      { label: '80-100', min: 80, max: Infinity, count: 0 }
    ];
    scores.forEach((score) => {
      const bin = bins.find((item) => Number(score) >= item.min && Number(score) <= item.max);
      if (bin) bin.count += 1;
    });
    return bins;
  }

  function computeCohortStats(catalog, records, examId, currentRecord) {
    const exam = getExam(catalog, examId);
    if (!exam) return null;
    const cohortRaw = uniqueRecords((records || []).filter((record) => record.examId === examId));
    if (currentRecord && !cohortRaw.some((record) => record.id && record.id === currentRecord.id)) cohortRaw.push(currentRecord);
    const cohort = cohortRaw.map((record) => enrichRecord(catalog, record)).filter((record) => !record.invalidExam);
    const scores = cohort.map((record) => Number(record.score));
    const total = cohort.length;
    const current = currentRecord ? enrichRecord(catalog, currentRecord) : null;
    const questionStats = exam.questions.map((question, index) => {
      let correct = 0; let wrong = 0; let blank = 0;
      cohort.forEach((record) => {
        const status = record.questionResults[index].status;
        if (status === 'correct') correct += 1;
        else if (status === 'wrong') wrong += 1;
        else blank += 1;
      });
      return {
        no: index + 1,
        correct,
        wrong,
        blank,
        total,
        answered: correct + wrong,
        accuracy: round(total ? correct / total * 100 : 0, 1),
        attemptedAccuracy: round(correct + wrong ? correct / (correct + wrong) * 100 : 0, 1)
      };
    });

    const domains = [...new Set(exam.questions.map((question) => question.domain || '기타'))];
    const domainAverages = domains.map((domain) => {
      const values = cohort.map((record) => record.domainStats.find((item) => item.domain === domain)?.accuracy || 0);
      return { domain, average: round(average(values), 1), student: current ? current.domainStats.find((item) => item.domain === domain)?.accuracy || 0 : null };
    });

    let rank = null;
    let percentile = null;
    if (current && total) {
      rank = 1 + scores.filter((score) => score > current.score).length;
      percentile = round(scores.filter((score) => score <= current.score).length / total * 100, 1);
    }

    return {
      total,
      average: round(average(scores), 2),
      median: round(median(scores), 2),
      topScore: total ? Math.max(...scores) : 0,
      bottomScore: total ? Math.min(...scores) : 0,
      rank,
      percentile,
      scores,
      distribution: distribution(scores),
      questionStats,
      domainAverages
    };
  }

  function getStudentHistory(catalog, records, currentRecord) {
    const key = studentKey(currentRecord);
    return uniqueRecords(records || [])
      .filter((record) => studentKey(record) === key)
      .map((record) => enrichRecord(catalog, record))
      .filter((record) => !record.invalidExam)
      .sort((a, b) => Number(a.round || 0) - Number(b.round || 0) || String(a.updatedAt || a.createdAt || '').localeCompare(String(b.updatedAt || b.createdAt || '')));
  }

  function generateAnalysis(exam, record, cohortStats, history) {
    const currentDomains = record.domainStats || [];
    const cohortByDomain = new Map((cohortStats?.domainAverages || []).map((item) => [item.domain, item.average]));
    const ranked = currentDomains.map((item) => ({
      ...item,
      cohort: cohortByDomain.get(item.domain) ?? 0,
      gap: round(item.accuracy - (cohortByDomain.get(item.domain) ?? 0), 1)
    })).sort((a, b) => b.accuracy - a.accuracy || b.gap - a.gap);

    const strengths = ranked.filter((item) => item.accuracy >= 70 || item.gap >= 12).slice(0, 2);
    const weaknesses = [...ranked].sort((a, b) => a.accuracy - b.accuracy || a.gap - b.gap).filter((item) => item.accuracy < 70 || item.gap <= -10).slice(0, 2);
    const previous = (history || []).filter((item) => item.id !== record.id && Number(item.round) < Number(record.round)).slice(-1)[0] || null;
    const delta = previous ? round(record.score - previous.score, 2) : null;

    const wrongItems = record.questionResults.filter((item) => item.status === 'wrong');
    const blankItems = record.questionResults.filter((item) => item.status === 'blank');
    const weakestTopics = [...wrongItems, ...blankItems].slice(0, 4).map((item) => `${item.no}번 ${item.question?.unit || ''}`.trim());

    const strengthText = strengths.length
      ? strengths.map((item) => `${item.domain} ${item.accuracy}%${Math.abs(item.gap) >= 5 ? ` (전체 대비 ${item.gap > 0 ? '+' : ''}${item.gap}%p)` : ''}`).join(', ')
      : '뚜렷한 우세 단원보다 전 단원의 기본 정확도를 함께 끌어올리는 단계입니다.';
    const weaknessText = weaknesses.length
      ? weaknesses.map((item) => `${item.domain} ${item.accuracy}%${Math.abs(item.gap) >= 5 ? ` (전체 대비 ${item.gap > 0 ? '+' : ''}${item.gap}%p)` : ''}`).join(', ')
      : '특정 단원에 편중된 큰 취약점은 확인되지 않았습니다.';

    let trendText = '현재 등록된 이전 회차가 없어 이번 결과를 기준점으로 삼습니다.';
    if (previous) {
      if (delta > 0) trendText = `${previous.round}회 대비 ${delta}점 상승했습니다. 오른 점수를 유지하면서 오답 단원의 재현성을 확인하는 것이 좋습니다.`;
      else if (delta < 0) trendText = `${previous.round}회 대비 ${Math.abs(delta)}점 낮아졌습니다. 회차 난이도 차이를 감안하되, 반복해서 틀린 단원을 우선 복습해야 합니다.`;
      else trendText = `${previous.round}회와 같은 점수입니다. 총점보다 단원별 정답 이동과 오답 유형의 변화를 확인하는 것이 중요합니다.`;
    }

    const comments = [];
    if (record.correct >= 16) comments.push('핵심 개념과 계산의 전반적 완성도가 높습니다. 남은 오답은 조건 해석과 선택지 검증 과정을 기록하며 정교하게 다듬으세요.');
    else if (record.correct >= 11) comments.push('기본 개념은 형성되어 있습니다. 틀린 문제를 공식 암기보다 “어떤 조건에서 어떤 법칙을 적용하는가”의 형태로 다시 정리하면 점수 상승 폭이 큽니다.');
    else comments.push('단원별 핵심 공식을 짧게 복습한 뒤, 해설을 덮고 같은 문제를 다시 푸는 2회독이 필요합니다. 한 번에 많은 문제보다 오답의 완전한 재풀이를 우선하세요.');
    if (wrongItems.length) comments.push(`오답 ${wrongItems.length}문항으로 ${round(Math.abs(wrongItems.length * exam.wrongScore), 2)}점이 감점되었습니다. 확신 없이 고른 문항은 근거를 한 줄로 쓰고 답을 결정하는 습관을 권합니다.`);
    if (blankItems.length) comments.push(`미기입 ${blankItems.length}문항은 감점은 없었지만 학습 공백으로 남습니다. 아래 해설과 동형 문제로 개념을 보완하세요.`);
    if (!wrongItems.length && !blankItems.length) comments.push('전 문항 정답입니다. 풀이 시간을 줄이고 다른 표현의 동형 문제에서도 같은 판단을 재현하는 연습으로 확장하세요.');

    return {
      strengths: strengths.map((item) => ({ domain: item.domain, accuracy: item.accuracy, cohort: item.cohort, gap: item.gap, questionNos: item.questionNos })),
      weaknesses: weaknesses.map((item) => ({ domain: item.domain, accuracy: item.accuracy, cohort: item.cohort, gap: item.gap, questionNos: item.questionNos })),
      strengthText,
      weaknessText,
      trendText,
      previousRound: previous?.round || null,
      previousScore: previous?.score ?? null,
      scoreDelta: delta,
      weakestTopics,
      comments
    };
  }

  function buildSnapshot(catalog, currentRecord, records) {
    const record = enrichRecord(catalog, currentRecord);
    if (record.invalidExam) throw new Error('등록되지 않은 시험입니다.');
    const allRecords = uniqueRecords([...(records || []), currentRecord]);
    const cohort = computeCohortStats(catalog, allRecords, currentRecord.examId, currentRecord);
    const history = getStudentHistory(catalog, allRecords, currentRecord).map((item) => ({
      id: item.id,
      examId: item.examId,
      examTitle: item.examTitle,
      round: item.round,
      score: item.score,
      correct: item.correct,
      wrong: item.wrong,
      blank: item.blank,
      answers: item.answers,
      domainStats: item.domainStats,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));
    const analysis = generateAnalysis(getExam(catalog, currentRecord.examId), record, cohort, history);
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      record: {
        id: record.id,
        examId: record.examId,
        round: record.round,
        examTitle: record.examTitle,
        name: record.name,
        school: record.school,
        answers: record.answers,
        score: record.score,
        correct: record.correct,
        wrong: record.wrong,
        blank: record.blank,
        questionResults: record.questionResults.map((item) => ({ no: item.no, answer: item.answer, key: item.key, status: item.status, points: item.points })),
        domainStats: record.domainStats,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      },
      cohort,
      history,
      analysis
    };
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
  }

  function base64ToBytes(value) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  function encodePayload(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decodePayload(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const bytes = base64ToBytes(padded);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatScore(value) {
    const number = Number(value || 0);
    return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/g, '').replace(/\.$/, '');
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function safeFilename(value) {
    return normalizeText(value || 'report').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 100);
  }

  function recordToCsvRows(records, catalog) {
    const rows = [['시험ID', '회차', '학교', '이름', ...Array.from({ length: 20 }, (_, i) => `${i + 1}번`), '점수', '정답수', '오답수', '미기입수', '등록시각', '수정시각']];
    (records || []).forEach((record) => {
      const enriched = enrichRecord(catalog, record);
      rows.push([
        record.examId,
        enriched.round,
        record.school,
        record.name,
        ...normalizeAnswers(record.answers, 20).map((answer) => answer === '' ? '' : answer),
        enriched.score,
        enriched.correct,
        enriched.wrong,
        enriched.blank,
        record.createdAt || '',
        record.updatedAt || ''
      ]);
    });
    return rows;
  }

  function csvEscape(value) {
    const text = String(value == null ? '' : value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function toCsv(records, catalog) {
    return '\uFEFF' + recordToCsvRows(records, catalog).map((row) => row.map(csvEscape).join(',')).join('\r\n');
  }

  function parseCsv(text) {
    const rows = [];
    let row = []; let field = ''; let quoted = false;
    const input = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      if (quoted) {
        if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += char;
    }
    row.push(field.replace(/\r$/, ''));
    if (row.some((value) => value !== '') || rows.length === 0) rows.push(row);
    return rows;
  }

  function csvToRecords(text, catalog) {
    const rows = parseCsv(text);
    if (rows.length < 2) return [];
    const header = rows[0].map(normalizeText);
    const find = (...names) => header.findIndex((value) => names.includes(value));
    const examIndex = find('시험ID', 'examId');
    const schoolIndex = find('학교', '학교명', 'school');
    const nameIndex = find('이름', '성명', 'name');
    const defaultExam = catalog?.[0]?.id;
    return rows.slice(1).filter((row) => row.some((value) => normalizeText(value))).map((row, rowIndex) => {
      const answerIndexes = Array.from({ length: 20 }, (_, i) => {
        const labels = [`${i + 1}번`, String(i + 1), `Q${i + 1}`, `q${i + 1}`];
        return header.findIndex((value) => labels.includes(value));
      });
      const answers = answerIndexes.map((index) => index >= 0 ? normalizeAnswer(row[index]) : '');
      const now = new Date().toISOString();
      return {
        id: `csv-${Date.now().toString(36)}-${rowIndex}-${Math.random().toString(36).slice(2, 8)}`,
        examId: examIndex >= 0 && row[examIndex] ? normalizeText(row[examIndex]) : defaultExam,
        school: schoolIndex >= 0 ? normalizeText(row[schoolIndex]) : '',
        name: nameIndex >= 0 ? normalizeText(row[nameIndex]) : '',
        answers: normalizeAnswers(answers, 20),
        createdAt: now,
        updatedAt: now
      };
    }).filter((record) => record.school && record.name && getExam(catalog, record.examId));
  }

  function makeId(prefix = 'r') {
    const cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
    if (cryptoApi?.randomUUID) return `${prefix}-${cryptoApi.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  return {
    clamp,
    round,
    sum,
    average,
    median,
    normalizeText,
    normalizeKey,
    studentKey,
    normalizeAnswer,
    normalizeAnswers,
    parseAnswerText,
    getExam,
    grade,
    domainStats,
    enrichRecord,
    uniqueRecords,
    distribution,
    computeCohortStats,
    getStudentHistory,
    generateAnalysis,
    buildSnapshot,
    encodePayload,
    decodePayload,
    escapeHtml,
    formatScore,
    formatDate,
    safeFilename,
    toCsv,
    parseCsv,
    csvToRecords,
    makeId
  };
});
