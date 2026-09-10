// 必知必会筛选测试：node scripts/test-filters.mjs
import { isMustKnow, filterMustKnow } from '../src/lib/filters.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('✓', name); } else { fail++; console.log('✗', name); } };

const q = (text, opts = []) => ({ type: 'single', text, options: opts.map((t) => ({ letter: 'A', text: t })), answer: ['A'] });

check('题干含“必知必会题”', isMustKnow(q('避让原则是（）。（必知必会题，错一道不及格）')));
check('题干含“必会题”', isMustKnow(q('如需进入跑道必须向塔台申请（必会题，错一道不及格）')));
check('题干含“【必知必会】”', isMustKnow(q('禁止将滑行道作为等待位置。(必知必会题目)')));
check('题干含“错一道不及格”', isMustKnow(q('这个是必考（错一道不及格）')));
check('选项含“必知必会”', isMustKnow(q('普通题干', ['必知必会的选项'])));
check('普通题不算重点', !isMustKnow(q('下列关于消防的说法正确的是')));
check('空题目安全', !isMustKnow(null));

const list = [
  q('普通题1'),
  q('重点题（必会题）'),
  q('普通题2'),
  q('重点题【必知必会】'),
];
const filtered = filterMustKnow(list);
check('filterMustKnow 命中2题', filtered.length === 2);

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
