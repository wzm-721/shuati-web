// 练习进度会话测试：node scripts/test-session.mjs
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
global.alert = () => {};

const S = await import('../src/lib/storage.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('✓', name); } else { fail++; console.log('✗', name); } };

// 保存 / 读取
S.saveSession('bank1', 'order', { questionIds: ['q1', 'q2', 'q3'], idx: 2, stats: { correct: 1, wrong: 1 }, updatedAt: Date.now() });
const s = S.getSession('bank1', 'order');
check('保存后可读取', !!s && s.idx === 2 && s.questionIds.length === 3);
check('读取不存在的会话返回 null', S.getSession('bank1', 'random') === null);

// 是否可恢复
check('题目顺序一致且已练过 → 可恢复', S.isSameQuestionSet(s, ['q1', 'q2', 'q3']));
check('题目顺序不同 → 不可恢复', !S.isSameQuestionSet(s, ['q2', 'q1', 'q3']));
check('题目数量不同 → 不可恢复', !S.isSameQuestionSet(s, ['q1', 'q2']));
check('未练过（idx=0）→ 不可恢复', !S.isSameQuestionSet({ questionIds: ['q1', 'q2'], idx: 0 }, ['q1', 'q2']));
check('空会话 → 不可恢复', !S.isSameQuestionSet(null, ['q1']));

// 清除单个会话
S.clearSession('bank1', 'order');
check('清除后读不到该会话', S.getSession('bank1', 'order') === null);

// 删除题库时清理其所有会话
S.saveSession('bank2', 'must', { questionIds: ['x'], idx: 1, stats: { correct: 1, wrong: 0 } });
S.saveSession('bank2', 'order', { questionIds: ['x'], idx: 1, stats: { correct: 1, wrong: 0 } });
S.saveBank({ id: 'bank2', name: 'B', count: 1, questions: [] });
S.deleteBank('bank2');
check('删除题库后其会话被清理', S.getSession('bank2', 'must') === null && S.getSession('bank2', 'order') === null);

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
