import { useMemo, useState } from 'react';
import { searchQuestions, formatAnswer } from './lib/search.js';
import { getRecords } from './lib/storage.js';

const TYPE_LABEL = { single: '单选题', multi: '多选题', judge: '判断题' };

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 在文本中高亮关键词 */
export function highlight(text, kw) {
  const k = (kw || '').trim();
  if (!k || !text) return text;
  const re = new RegExp('(' + escapeRe(k) + ')', 'gi');
  const parts = text.split(re);
  const out = [];
  parts.forEach((p, i) => {
    if (i % 2 === 1) out.push(<mark key={'h' + i} className="hl">{p}</mark>);
    else if (p) out.push(p);
  });
  return out;
}

/** 题目卡片：展示题干、选项与正确答案（查题 / 错题本共用） */
export function AnswerCard({ q, kw }) {
  return (
    <div className="search-card">
      <div className="q-type">
        {TYPE_LABEL[q.type] || '题目'}{q.type === 'multi' && <span className="multi-hint">（多选）</span>}
        <span className="card-bank">{q.bankName}</span>
      </div>
      <div className="q-text">{highlight(q.text, kw)}</div>
      <div className="result-answer">答案：<b>{formatAnswer(q.answer)}</b></div>
      <div className="options">
        {q.options.map((o) => {
          const isAns = q.answer.includes(o.letter);
          return (
            <div key={o.letter} className={`result-opt${isAns ? ' correct' : ''}`}>
              <span className="opt-letter">{o.letter === '√' || o.letter === '×' ? '' : o.letter}</span>
              <span className="opt-text">{highlight(o.text, kw)}</span>
              {isAns && <span className="ans-tag">✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 快速查题：按关键词搜索题干与选项，显示正确答案 */
export function Search({ banks, initialBankId, onBack }) {
  const [kw, setKw] = useState('');
  const [bankId, setBankId] = useState(initialBankId || '');
  const results = useMemo(() => searchQuestions(banks, kw, bankId), [banks, kw, bankId]);

  return (
    <div className="page search">
      <header className="topbar">
        <button className="btn" onClick={onBack}>← 返回</button>
        <h1 className="topbar-title">快速查题</h1>
      </header>
      <div className="search-bar">
        <input
          className="search-input"
          type="search"
          placeholder="输入题干或选项关键词"
          value={kw}
          autoFocus
          onChange={(e) => setKw(e.target.value)}
        />
        <select className="bank-select" value={bankId} onChange={(e) => setBankId(e.target.value)}>
          <option value="">全部题库</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {!kw.trim() ? (
        <div className="empty">
          <p>输入关键词，即可查到相关题目和正确答案</p>
        </div>
      ) : results.length === 0 ? (
        <div className="empty"><p>没有找到相关题目，换个关键词试试</p></div>
      ) : (
        <div className="search-list">
          {results.map((q) => (
            <AnswerCard key={q.id} q={q} kw={kw} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 错题本：查看所有错题（按题库分组） */
export function WrongBook({ banks, onBack, onPractice }) {
  const records = getRecords();
  const groups = banks
    .map((bank) => {
      const rec = records[bank.id] || { wrongIds: [] };
      const questions = (rec.wrongIds || [])
        .map((id) => bank.questions.find((q) => q.id === id))
        .filter(Boolean)
        .map((q) => ({ bankName: bank.name, ...q }));
      return { bank, questions };
    })
    .filter((g) => g.questions.length);
  const total = groups.reduce((s, g) => s + g.questions.length, 0);

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn" onClick={onBack}>← 返回</button>
        <h1 className="topbar-title">错题本</h1>
        <span className="counter">{total} 题</span>
      </header>

      {total === 0 ? (
        <div className="empty">
          <div className="empty-icon">🎉</div>
          <p>还没有错题</p>
          <p className="sub">刷题时答错的题会自动收进这里，重新做对后会自动移除</p>
        </div>
      ) : (
        <div className="search-list">
          {groups.map((g) => (
            <div key={g.bank.id}>
              <div className="group-head">
                <span>{g.bank.name}（{g.questions.length} 题）</span>
                <button className="btn" onClick={() => onPractice(g.bank.id, g.questions.map((q) => q.id))}>
                  重练这组
                </button>
              </div>
              {g.questions.map((q) => (
                <AnswerCard key={q.id} q={q} kw="" />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
