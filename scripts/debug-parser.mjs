// 调试脚本：定位解析异常题目附近的段落
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractParagraphs } from '../src/lib/docxParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '..', '通行证练习题（2026）.docx');
const buf = await readFile(filePath);
const paras = extractParagraphs(await (await import('jszip')).default.loadAsync(buf).then(z => z.file('word/document.xml').async('string')));

// 打印包含关键词的段落及其前后 4 行
const keys = [
  '机关、单位确定国家秘密的直接依据',
  '下列属于外来物防范措施的是',
  '传递核心商密纸质文件时须做好',
  '行人、车辆遇有警卫车队时',
  '借用他人证件进入隔离区',
  '出于保障需要，工作人员可以在机坪上进餐',
];
for (const key of keys) {
  console.log(`\n########## ${key} ##########`);
  let found = false;
  for (let i = 0; i < paras.length; i++) {
    if (paras[i].includes(key)) {
      found = true;
      const from = Math.max(0, i - 2);
      const to = Math.min(paras.length - 1, i + 6);
      for (let k = from; k <= to; k++) {
        console.log(`${k}${k === i ? '  <<<' : ''} | ${paras[k].slice(0, 120)}`);
      }
    }
  }
  if (!found) console.log('  (未找到)');
}
