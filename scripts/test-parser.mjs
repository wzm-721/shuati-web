// 解析器验证脚本：node scripts/test-parser.mjs [可选 .docx 路径]
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocx } from '../src/lib/docxParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultSample = path.join(__dirname, '..', '通行证练习题（2026）.docx');
const filePath = process.argv[2] ? path.resolve(process.argv[2]) : defaultSample;

console.log('解析文件:', filePath);
const buf = await readFile(filePath);
const { questions, skipped, orphans } = await parseDocx(buf);

const byType = {};
questions.forEach((q) => { byType[q.type] = (byType[q.type] || 0) + 1; });

console.log('\n=== 解析结果 ===');
console.log('题目总数:', questions.length, JSON.stringify(byType));

const noAnswer = questions.filter((q) => !q.answer || q.answer.length === 0);
const badOpts = questions.filter((q) => q.options.length < 2 || q.options.length > 8);
const mismatch = [];
questions.forEach((q) => {
  const letters = q.options.map((o) => o.letter);
  for (const a of q.answer) {
    if (!letters.includes(a) && a !== '√' && a !== '×') {
      mismatch.push({ no: q.no, a, text: q.text.slice(0, 40) });
      break;
    }
  }
});

console.log('无答案题目:', noAnswer.length);
noAnswer.slice(0, 10).forEach((q) => console.log('  noAns:', q.no, q.type, q.text.slice(0, 60)));
console.log('选项数异常题目:', badOpts.length);
badOpts.slice(0, 10).forEach((q) => console.log('  bad:', q.no, q.type, 'opts=' + q.options.length, q.text.slice(0, 50)));
console.log('答案与选项不匹配:', mismatch.length);
mismatch.slice(0, 10).forEach((x) => console.log('  mis:', x.no, x.a, x.text));
console.log('跳过(无选项):', skipped.length);
skipped.slice(0, 10).forEach((s) => console.log('  skip:', s.no, s.text));
console.log('孤立行:', orphans.length);
orphans.slice(0, 10).forEach((s) => console.log('  orphan:', s));

// 抽样展示
function show(q) {
  console.log(`\n#${q.no} [${q.type}] ans=${(q.answer || []).join('')} :: ${q.text.slice(0, 70)}`);
  q.options.forEach((o) => console.log(`   ${o.letter}${o.correct ? '*' : ''} ${o.text.slice(0, 60)}`));
}
console.log('\n=== 抽样 ===');
const sample = [];
sample.push(questions.find((q) => q.type === 'single'));
sample.push(questions.find((q) => q.type === 'multi'));
sample.push(questions.find((q) => q.type === 'judge'));
const inline = questions.find((q) => q.no === '83');
if (inline) sample.push(inline);
sample.filter(Boolean).forEach(show);
