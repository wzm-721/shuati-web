/**
 * 本地存储层：题库、练习记录、错题、考试成绩，全部存 localStorage（无账号）。
 */

const BANKS_KEY = 'st_banks_v1';
const RECORDS_KEY = 'st_records_v1';
const EXAMS_KEY = 'st_exams_v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // localStorage 容量不足时给出提示
    console.error('保存失败', e);
    alert('本地存储空间不足，建议删除部分题库后再导入。');
  }
}

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/* ---------- 题库 ---------- */

export function getBanks() {
  return read(BANKS_KEY, []);
}

export function saveBank(bank) {
  const banks = getBanks();
  banks.unshift(bank);
  write(BANKS_KEY, banks);
  return bank;
}

export function deleteBank(bankId) {
  const banks = getBanks().filter((b) => b.id !== bankId);
  write(BANKS_KEY, banks);
  // 同时清理该题库的记录和考试
  const records = getRecords();
  delete records[bankId];
  write(RECORDS_KEY, records);
  const exams = getExams().filter((e) => e.bankId !== bankId);
  write(EXAMS_KEY, exams);
}

export function getBank(bankId) {
  return getBanks().find((b) => b.id === bankId) || null;
}

/* ---------- 练习记录（含错题） ---------- */

export function getRecords() {
  return read(RECORDS_KEY, {});
}

export function getRecord(bankId) {
  const records = getRecords();
  if (!records[bankId]) {
    records[bankId] = { wrongIds: [], correctCount: 0, wrongCount: 0, doneCount: 0 };
    write(RECORDS_KEY, records);
  }
  return records[bankId];
}

export function updateRecord(bankId, patch) {
  const records = getRecords();
  records[bankId] = { ...getRecord(bankId), ...patch };
  write(RECORDS_KEY, records);
  return records[bankId];
}

/** 练习答对/答错：错题自动进出错题本 */
export function recordAnswer(bankId, questionId, correct) {
  const rec = getRecord(bankId);
  const wrongIds = new Set(rec.wrongIds || []);
  if (correct) {
    wrongIds.delete(questionId);
    return updateRecord(bankId, {
      wrongIds: [...wrongIds],
      correctCount: (rec.correctCount || 0) + 1,
      doneCount: (rec.doneCount || 0) + 1,
    });
  }
  wrongIds.add(questionId);
  return updateRecord(bankId, {
    wrongIds: [...wrongIds],
    wrongCount: (rec.wrongCount || 0) + 1,
    doneCount: (rec.doneCount || 0) + 1,
  });
}

/* ---------- 考试成绩 ---------- */

export function getExams() {
  return read(EXAMS_KEY, []);
}

export function saveExam(exam) {
  const exams = getExams();
  exams.unshift(exam);
  write(EXAMS_KEY, exams);
  return exam;
}

/* ---------- 导入题库（把解析结果转成题库对象） ---------- */

export function buildBank(name, questions) {
  return {
    id: uid(),
    name,
    createdAt: Date.now(),
    count: questions.length,
    questions: questions.map((q, i) => ({
      id: uid(),
      type: q.type,
      text: q.text,
      options: q.options.map((o) => ({ letter: o.letter, text: o.text })),
      answer: q.answer || [],
    })),
  };
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
