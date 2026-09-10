/**
 * 题目去重：按“归一化题干”判定重复，保留首次出现的题目。
 */

/** 归一化题干：去空白、标点、全半角差异，便于比较 */
export function normQuestionKey(text) {
  return (text || '')
    .replace(/\s+/g, '')
    .replace(/[（）()【】\[\]{}《》<>，,。.、;；:：？！?!"'“”‘’·\-—_~`]/g, '')
    .toLowerCase();
}

/**
 * 去重：返回 { unique, removed }
 * @param {Array} questions 题目数组
 */
export function dedupeQuestions(questions) {
  const seen = new Set();
  const unique = [];
  const removed = [];
  for (const q of questions || []) {
    const key = normQuestionKey(q.text);
    if (!key) {
      unique.push(q);
      continue;
    }
    if (seen.has(key)) {
      removed.push(q);
      continue;
    }
    seen.add(key);
    unique.push(q);
  }
  return { unique, removed };
}
