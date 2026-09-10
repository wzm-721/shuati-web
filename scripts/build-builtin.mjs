// 生成内置题库数据：node scripts/build-builtin.mjs
// 流程：解析 .docx → 去重 → 应用答案修正 → 输出 src/data/builtinBank.js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocx } from '../src/lib/docxParser.js';
import { dedupeQuestions } from '../src/lib/dedupe.js';
import { applyAnswerFixes } from '../src/lib/answerFixes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const buf = await readFile(path.join(root, '通行证练习题（2026）.docx'));
const { questions } = await parseDocx(buf);
const { unique, removed } = dedupeQuestions(questions);
const { questions: fixed, fixes } = applyAnswerFixes(unique);

const bank = {
  name: '通行证练习题（2026）',
  count: fixed.length,
  questions: fixed.map((q) => ({
    type: q.type,
    text: q.text,
    options: q.options.map((o) => ({ letter: o.letter, text: o.text })),
    answer: q.answer,
  })),
};

const out = `// 自动生成，请勿手改。来源：通行证练习题（2026）.docx
// 原 ${questions.length} 题 → 去重 ${unique.length} 题（移除重复 ${removed.length}）→ 应用 ${fixes.length} 处答案修正
export const BUILTIN_BANK = ${JSON.stringify(bank)};

export const BUILTIN_META = {
  source: '通行证练习题（2026）.docx',
  original: ${questions.length},
  duplicateRemoved: ${removed.length},
  answerFixCount: ${fixes.length},
};
`;

await mkdir(path.join(root, 'src', 'data'), { recursive: true });
await writeFile(path.join(root, 'src', 'data', 'builtinBank.js'), out, 'utf8');
console.log('内置题库已生成：', fixed.length, '题；答案修正', fixes.length, '处 → src/data/builtinBank.js');
