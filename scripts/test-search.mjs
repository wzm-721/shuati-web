// 快速查题模块测试：node scripts/test-search.mjs
import { searchQuestions, formatAnswer } from '../src/lib/search.js';

// 构造两个题库样例（模拟解析后的题目结构）
const bankA = {
  id: 'a',
  name: '题库A',
  questions: [
    { id: 'q1', type: 'single', text: '我国消防工作贯彻什么方针', options: [{ letter: 'A', text: '预防为主，防消结合' }, { letter: 'B', text: '以防为主' }], answer: ['A'] },
    { id: 'q2', type: 'multi', text: '下列属于保密范围的是', options: [{ letter: 'A', text: '商业计划' }, { letter: 'B', text: '财务数据' }], answer: ['A', 'B'] },
    { id: 'q3', type: 'judge', text: '消防车可以占用消防通道', options: [{ letter: '√', text: '对' }, { letter: '×', text: '错' }], answer: ['×'] },
  ],
};
const bankB = {
  id: 'b',
  name: '题库B',
  questions: [
    { id: 'q4', type: 'single', text: '灭火的基本方法', options: [{ letter: 'A', text: '冷却法' }, { letter: 'B', text: '隔离法' }], answer: ['B'] },
  ],
};
const banks = [bankA, bankB];

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('✓', name); } else { fail++; console.log('✗', name); } };

// 1. 关键词搜题干
let r = searchQuestions(banks, '消防', '');
check('搜题干命中2题', r.length === 2);
// 2. 关键词搜选项文本
r = searchQuestions(banks, '冷却法', '');
check('搜选项文本命中1题', r.length === 1 && r[0].id === 'q4');
// 3. 限定题库
r = searchQuestions(banks, '消防', 'a');
check('限定题库A命中2题', r.length === 2 && r.every((x) => x.bankId === 'a'));
// 4. 空关键词
r = searchQuestions(banks, '   ', '');
check('空关键词返回空', r.length === 0);
// 5. 命中项带题库与答案
r = searchQuestions(banks, '灭火的基本方法', '');
check('命中项带答案', r.length === 1 && r[0].answer.join('') === 'B');
// 6. formatAnswer
check('formatAnswer 单选', formatAnswer(['A', 'B']) === 'A、B');
check('formatAnswer 判断对', formatAnswer(['√']) === '对');
check('formatAnswer 判断错', formatAnswer(['×']) === '错');

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
