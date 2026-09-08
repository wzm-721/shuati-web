/**
 * 快速查题：在题库中按关键词搜索题干与选项，返回命中的题目（含正确答案）。
 */

/** 在（全部或指定）题库中搜索，返回题目列表，每项带 bankId/bankName */
export function searchQuestions(banks, keyword, bankId) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return [];
  const results = [];
  for (const bank of banks) {
    if (bankId && bank.id !== bankId) continue;
    for (const q of bank.questions) {
      const inText = (q.text || '').toLowerCase().includes(kw);
      const inOpt = q.options.some((o) => (o.text || '').toLowerCase().includes(kw));
      if (inText || inOpt) {
        results.push({ bankId: bank.id, bankName: bank.name, ...q });
      }
    }
  }
  return results;
}

/** 把答案字母/判断符号格式化为可读文本，如 ['A','B'] -> 'A、B'，['√'] -> '对' */
export function formatAnswer(answer) {
  return answer
    .map((a) => (a === '√' ? '对' : a === '×' ? '错' : a))
    .join('、');
}
