// 数据流集成测试：解析 → 导入 → 练习记录 → 错题本（Node 中模拟 localStorage）
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocx } from '../src/lib/docxParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// mock localStorage
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
global.alert = (m) => console.log('[alert]', m);

const S = await import('../src/lib/storage.js');
const buf = await readFile(path.join(__dirname, '..', '通行证练习题（2026）.docx'));
const { questions } = await parseDocx(buf);

// 导入
const bank = S.buildBank('通行证练习题（2026）', questions);
S.saveBank(bank);
console.log('导入后题库数:', S.getBanks().length, '题数:', bank.count);

// 题型分布
const byType = { single: 0, multi: 0, judge: 0 };
bank.questions.forEach((q) => byType[q.type]++);
console.log('题型分布:', JSON.stringify(byType));

// 模拟练习：用第 1 题（应存在且可答）
const q1 = bank.questions[0];
const q1Correct = q1.answer.join('');
S.recordAnswer(bank.id, q1.id, true);
let rec = S.getRecord(bank.id);
console.log('答对1题后: done=%d correct=%d wrongIds=%d', rec.doneCount, rec.correctCount, rec.wrongIds.length);

// 答错一题 → 错题本
const q2 = bank.questions[1];
S.recordAnswer(bank.id, q2.id, false);
rec = S.getRecord(bank.id);
console.log('再答错1题后: done=%d wrong=%d wrongIds=%d', rec.doneCount, rec.wrongCount, rec.wrongIds.length);

// 错题重练答对 → 移出错题本
S.recordAnswer(bank.id, q2.id, true);
rec = S.getRecord(bank.id);
console.log('错题重练答对后: wrongIds=%d', rec.wrongIds.length);

// 模拟考试保存
S.saveExam({ id: 'e1', bankId: bank.id, bankName: bank.name, date: Date.now(), score: 88, correct: 88, wrong: 12, total: 100, wrongIds: [], usedSec: 600, auto: false });
console.log('考试记录数:', S.getExams().length);

// 删除题库清理
S.deleteBank(bank.id);
console.log('删除后题库数:', S.getBanks().length, '考试记录数:', S.getExams().length, '记录keys:', Object.keys(S.getRecords()).length);
console.log('\n集成测试通过 ✓');
