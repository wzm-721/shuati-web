// 题目修正规则测试：node scripts/test-fixes.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocx } from '../src/lib/docxParser.js';
import { dedupeQuestions } from '../src/lib/dedupe.js';
import { applyQuestionFixes, QUESTION_FIXES } from '../src/lib/answerFixes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('✓', name); } else { fail++; console.log('✗', name); } };

// 1. 规则自身：对构造题目应生效
const fakeJudge = { type: 'judge', text: '候机楼内变电站、机房、配电室、配线间内可以堆放杂物。', options: [{ letter: '√', text: '对' }, { letter: '×', text: '错' }], answer: ['√'] };
const r1 = applyQuestionFixes([fakeJudge]);
check('判断题（配电室堆放杂物）被改为“错”', r1.fixes.length === 1 && r1.questions[0].answer.join('') === '×');

// 2. 在真实样例题库上验证
const buf = await readFile(path.join(root, '通行证练习题（2026）.docx'));
const { questions } = await parseDocx(buf);
const { unique } = dedupeQuestions(questions);
const { questions: fixed, fixes } = applyQuestionFixes(unique);

console.log('\n--- 在样例题库上的修正 ---');
const byId = {};
fixes.forEach((f) => {
  byId[f.id] = (byId[f.id] || 0) + 1;
  const change = f.from ? `${f.from.join('')} → ${f.to.join('')}` : '（文本/选项）';
  console.log(`· [${f.id}] ${change}  ${f.text}`);
});
console.log('\n分类统计：', JSON.stringify(byId));

check('修正总数合理（≥ 15 处）', fixes.length >= 15);
check('拘留期限题（第1、115题）已修正', (byId['detention-days'] || 0) === 2);
check('配电室判断题已修正', (byId['power-room-clutter'] || 0) === 1);
check('FOD 高危区域已统一为跑道', (byId['fod-high-risk-runway'] || 0) >= 1);
check('反诈“转账前”已修正', (byId['anti-fraud-before-transfer'] || 0) === 1);
check('“大力摇晃”判断题已改为错', (byId['shake-warning-judge'] || 0) === 1);
check('带教小时数已统一为 120', (byId['training-hours-120'] || 0) === 1);
check('控制区“分为几部分”答案含“四”', fixed.some((q) => /可将控制区为/.test(q.text) && q.options.some((o) => o.text === '四' && q.answer.includes(o.letter))));
check('控制区多选题已补全“航站楼等建筑”', (byId['control-area-include-terminal'] || 0) === 1);
check('廊桥禁入区域已修正', (byId['bridge-activity-area'] || 0) >= 1);
check('低危外来物多余选项已清理', (byId['low-risk-fod-extra-options'] || 0) === 1);
check('题干残留题号已清理', (byId['clean-number-prefix'] || 0) >= 3);

// 3. 修正后答案确实落在选项里（选项被截断的题也需满足）
const bad = fixed.filter((q) => q.answer.some((a) => a !== '√' && a !== '×' && !q.options.some((o) => o.letter === a)));
check('修正后答案均能在选项中找到', bad.length === 0);

// 4. 所有选项字母唯一（防止截断造成重复）
const dup = fixed.filter((q) => new Set(q.options.map((o) => o.letter)).size !== q.options.length);
check('题目选项字母无重复', dup.length === 0);

console.log(`\n规则数：${QUESTION_FIXES.length}；共修正 ${fixes.length} 处；通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
