// 去重模块测试：node scripts/test-dedupe.mjs
import { dedupeQuestions, normQuestionKey } from '../src/lib/dedupe.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('✓', name); } else { fail++; console.log('✗', name); } };

const q = (text) => ({ type: 'single', text, options: [], answer: [] });

check('归一化忽略空白与标点', normQuestionKey('我国消防工作贯彻（ ）的方针。') === normQuestionKey('我国消防工作贯彻()的方针'));

const list = [
  q('我国消防工作贯彻什么方针'),
  q('我国消防工作贯彻什么方针'),          // 完全重复
  q('我国消防工作贯彻 什么 方针。'),      // 空白/标点差异，仍算重复
  q('灭火的基本方法是什么'),              // 不重复
  q('灭火的基本方法是什么？'),
];
const { unique, removed } = dedupeQuestions(list);
check('去重后保留 2 题', unique.length === 2);
check('移除 3 题重复', removed.length === 3);
check('保留首次出现', unique[0].text === '我国消防工作贯彻什么方针' && unique[1].text === '灭火的基本方法是什么');
check('空题干不误删', dedupeQuestions([q(''), q('')]).unique.length === 2);

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
