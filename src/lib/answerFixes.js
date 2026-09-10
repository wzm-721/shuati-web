/**
 * 题目修正规则：修正“有明确依据（法规 / 规范 / 常识）”的错误题目。
 * 规则可修正：answer（答案）、text（题干）、options（选项）。
 * 每条规则都写明 reason（依据），便于追溯。
 */

/** 在选项中找文本匹配的项，返回其字母数组；找不到返回 null（表示不改） */
const pick = (q, re) => {
  const opt = (q.options || []).find((o) => re.test(o.text));
  return opt ? [opt.letter] : null;
};

export const QUESTION_FIXES = [
  {
    id: 'detention-days',
    desc: '人员密集场所火灾·工作人员不履行疏散义务的拘留期限',
    reason: '《中华人民共和国消防法》第六十八条：处十日以上十五日以下拘留',
    match: (q) => /人员密集场所发生火灾/.test(q.text) && /拘留/.test(q.text),
    patch: (q) => ({ answer: pick(q, /十日以上十五日以下/) }),
  },
  {
    id: 'power-room-clutter',
    desc: '候机楼内变电站/机房/配电室/配线间可以堆放杂物（判断题）',
    reason: '《消防法》第二十八条及消防安全管理规定：配电室、机房等场所严禁堆放杂物',
    match: (q) => q.type === 'judge' && /配电室|配线间|变电站/.test(q.text) && /堆放杂物/.test(q.text),
    patch: () => ({ answer: ['×'] }),
  },
  {
    id: 'fod-high-risk-runway',
    desc: 'FOD／外来物“高危区域”答案不一致（跑道 vs 滑行道）',
    reason: '常识与文档内一致表述：跑道为高危区域、滑行道为中危区域',
    match: (q) => /高危区/.test(q.text),
    patch: (q) => ({ answer: pick(q, /跑道/) }),
  },
  {
    id: 'anti-fraud-before-transfer',
    desc: '反诈题“问自己”的时机（转账前 / 转账后）',
    reason: '常识（反诈提醒应在转账前）；同型题第38题亦为“转账前”',
    match: (q) => /公然收受巨额资金/.test(q.text),
    patch: (q) => ({ answer: pick(q, /转账前/) }),
  },
  {
    id: 'shake-warning-judge',
    desc: '“确认门禁锁闭时切记大力摇晃…”（判断题）',
    reason: '常识：应为“切忌”大力摇晃，故该说法错误',
    match: (q) => q.type === 'judge' && /大力摇晃/.test(q.text),
    patch: () => ({ answer: ['×'] }),
  },
  {
    id: 'training-hours-120',
    desc: '新员工独立上岗前机坪现场带教小时数（120 / 240 冲突）',
    reason: '文档内多处一致为 120 小时（第9题、第391题）',
    match: (q) => /独立上岗前需接受不得少于/.test(q.text),
    patch: (q) => ({ answer: pick(q, /120/) }),
  },
  {
    id: 'control-area-parts-four',
    desc: '按外来物遗落区域划分控制区为几部分（四 / 五 冲突）',
    reason: '文档内表述为高危（跑道）、中危（滑行道）、低危（停机坪）及航站楼，共 4 类',
    match: (q) => /可将控制区为/.test(q.text),
    patch: (q) => ({ answer: pick(q, /^四$/) }),
  },
  {
    id: 'control-area-include-terminal',
    desc: '“可将控制区分为…”多选题答案不一致（是否含“航站楼等建筑”）',
    reason: '文档内同题单选答“四”部分（高/中/低危 + 航站楼等建筑），故多选应包含该选项',
    match: (q) => q.type === 'multi' && /可将控制区为/.test(q.text) && (q.options || []).some((o) => /航站楼/.test(o.text)),
    patch: (q) => ({ answer: q.options.map((o) => o.letter) }),
  },
  {
    id: 'bridge-activity-area',
    desc: '廊桥靠桥/撤桥作业时禁止进入的区域',
    reason: '规范表述为“廊桥活动区”，与同型题第121题一致',
    match: (q) => /撤桥作业时，禁止其他人员进入/.test(q.text),
    patch: (q) => ({ answer: pick(q, /廊桥活动区/) }),
  },
  {
    id: 'low-risk-fod-extra-options',
    desc: '“下列属于低危外来物的是”混入了其它题的选项',
    reason: '清理混入的多余选项（原文档排版问题）',
    match: (q) => /低危外来物/.test(q.text) && (q.options || []).length > 4,
    patch: (q) => ({ options: q.options.slice(0, 4) }),
  },
  {
    id: 'missing-paren',
    desc: '题干缺少填空括号',
    reason: '补全题干中的（ ）',
    match: (q) => /^国家秘密被境外人员知悉。?$/.test(q.text),
    patch: () => ({ text: '国家秘密被境外人员知悉（ ）。' }),
  },
  {
    id: 'clean-number-prefix',
    desc: '题干残留题号（如“35下列说法…”“38在机坪上…”）',
    reason: '清理原文档表格中残留的题号，避免干扰阅读',
    match: (q) => /^\d{1,2}(?![\d年月日小元米个分秒种级名位条款类度倍%％])(?=[\u4e00-\u9fff])/.test(q.text),
    patch: (q) => ({ text: q.text.replace(/^\d{1,2}(?=[\u4e00-\u9fff])/, '') }),
  },
];

const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));

/** 应用题目修正，返回 { questions, fixes }；fixes 记录被修改的题目 */
export function applyQuestionFixes(questions) {
  const fixes = [];
  const out = (questions || []).map((q) => {
    let next = q;
    for (const f of QUESTION_FIXES) {
      let hit = false;
      try {
        hit = f.match(next);
      } catch {
        hit = false;
      }
      if (!hit) continue;
      const patch = f.patch(next) || {};
      const changed = {};
      if (patch.answer && patch.answer.length && !sameSet(patch.answer, next.answer)) changed.answer = [...patch.answer];
      if (patch.text && patch.text !== next.text) changed.text = patch.text;
      if (patch.options && patch.options.length !== (next.options || []).length) changed.options = patch.options;
      if (!Object.keys(changed).length) continue;
      fixes.push({
        id: f.id,
        desc: f.desc,
        reason: f.reason,
        text: next.text.slice(0, 50),
        fields: Object.keys(changed).join('/'),
        from: changed.answer ? [...next.answer] : null,
        to: changed.answer ? changed.answer : null,
      });
      next = { ...next, ...changed };
    }
    return next;
  });
  return { questions: out, fixes };
}

// 兼容旧引用
export const ANSWER_FIXES = QUESTION_FIXES;
export const applyAnswerFixes = applyQuestionFixes;
