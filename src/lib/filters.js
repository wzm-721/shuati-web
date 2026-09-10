/**
 * 题目筛选：识别“必知必会”类重点题。
 * 样例文档中的标记形式包括：必知必会 / 必知必会题 / 必会题 / 错一道不及格 / 【必会题，错一道不及格】
 */
export const MUST_KNOW_RE = /必知必会|必会|错一道不及格/;

export function isMustKnow(q) {
  if (!q) return false;
  if (MUST_KNOW_RE.test(q.text || '')) return true;
  return (q.options || []).some((o) => MUST_KNOW_RE.test(o.text || ''));
}

/** 从题目数组中筛出必知必会题 */
export function filterMustKnow(questions) {
  return (questions || []).filter(isMustKnow);
}
