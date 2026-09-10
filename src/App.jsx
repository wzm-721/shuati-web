import { useEffect, useMemo, useRef, useState } from 'react';
import { parseDocx } from './lib/docxParser.js';
import {
  buildBank,
  clearSession,
  deleteBank,
  getBanks,
  getExams,
  getRecords,
  getSession,
  isSameQuestionSet,
  recordAnswer,
  saveBank,
  saveExam,
  saveSession,
  shuffle,
  updateBank,
} from './lib/storage.js';
import { filterMustKnow } from './lib/filters.js';
import { dedupeQuestions } from './lib/dedupe.js';
import { applyAnswerFixes } from './lib/answerFixes.js';
import { Search, WrongBook } from './pages.jsx';

// 内置题库（由 scripts/build-builtin.mjs 生成；缺失时自动降级，不影响使用）
const BUILTIN_MODULES = import.meta.glob('./data/builtinBank.js', { eager: true });
const BUILTIN_BANK = (BUILTIN_MODULES['./data/builtinBank.js'] || {}).BUILTIN_BANK || null;

const TYPE_LABEL = { single: '单选题', multi: '多选题', judge: '判断题' };

const isCorrect = (q, sel) => {
  const a = [...q.answer].sort();
  const s = [...sel].sort();
  return a.length === s.length && a.every((x, i) => x === s[i]);
};

export default function App() {
  // 首次打开且本地无题库时，自动载入内置题库
  const [banks, setBanks] = useState(() => {
    const existing = getBanks();
    if (existing.length || !BUILTIN_BANK) return existing;
    saveBank(buildBank(BUILTIN_BANK.name, BUILTIN_BANK.questions));
    return getBanks();
  });
  const [route, setRoute] = useState({ name: 'home' });

  const refresh = () => setBanks(getBanks());

  const goHome = () => {
    refresh();
    setRoute({ name: 'home' });
  };

  return (
    <div className="app">
      {route.name === 'home' && (
        <Home banks={banks} onRefresh={refresh} onOpen={(r) => setRoute(r)} />
      )}
      {route.name === 'search' && (
        <Search banks={banks} initialBankId={route.bankId} onBack={goHome} />
      )}
      {route.name === 'wrongbook' && (
        <WrongBook
          banks={banks}
          onBack={goHome}
          onPractice={(bankId, questionIds) => setRoute({ name: 'practice', bankId, questionIds, title: '错题重练' })}
        />
      )}
      {route.name === 'practice' && (
        <Practice
          bank={banks.find((b) => b.id === route.bankId)}
          questionIds={route.questionIds}
          title={route.title}
          modeKey={route.modeKey}
          onExit={goHome}
        />
      )}
      {route.name === 'exam-setup' && (
        <ExamSetup
          bank={banks.find((b) => b.id === route.bankId)}
          onBack={goHome}
          onStart={(questionIds, minutes) => setRoute({ name: 'exam', bankId: route.bankId, questionIds, minutes })}
        />
      )}
      {route.name === 'exam' && (
        <Exam
          bank={banks.find((b) => b.id === route.bankId)}
          questionIds={route.questionIds}
          minutes={route.minutes}
          onExit={goHome}
          onDone={(result) => setRoute({ name: 'exam-result', bankId: route.bankId, result })}
        />
      )}
      {route.name === 'exam-result' && (
        <ExamResult
          bank={banks.find((b) => b.id === route.bankId)}
          result={route.result}
          onHome={goHome}
          onWrong={() =>
            setRoute({
              name: 'practice',
              bankId: route.bankId,
              questionIds: route.result.wrongIds,
              title: '错题重练',
            })
          }
        />
      )}
    </div>
  );
}

/* ================= 首页 / 题库管理 ================= */

function Home({ banks, onRefresh, onOpen }) {
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(null); // 'loading' | { fileName, questions, skippedCount, removedCount, fixedCount }
  const records = getRecords();
  const totalWrong = banks.reduce((s, b) => {
    const r = records[b.id];
    return s + (r && r.wrongIds ? r.wrongIds.length : 0);
  }, 0);

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setImporting('loading');
    try {
      const buf = await file.arrayBuffer();
      const { questions, skipped } = await parseDocx(buf);
      const { unique, removed } = dedupeQuestions(questions);
      const { questions: fixedQuestions, fixes } = applyAnswerFixes(unique);
      setImporting({
        fileName: file.name.replace(/\.docx$/i, ''),
        questions: fixedQuestions,
        skippedCount: skipped.length,
        removedCount: removed.length,
        fixedCount: fixes.length,
      });
    } catch (err) {
      alert('解析失败：' + err.message + '（请确认是 .docx 格式）');
      setImporting(null);
    }
  }

  function confirmImport() {
    if (!importing || importing === 'loading') return;
    const bank = buildBank(importing.fileName, importing.questions);
    saveBank(bank);
    setImporting(null);
    onRefresh();
  }

  function loadBuiltin() {
    if (!BUILTIN_BANK) return;
    saveBank(buildBank(BUILTIN_BANK.name, BUILTIN_BANK.questions));
    onRefresh();
  }

  // 进入练习：若存在未完成进度，询问是否继续
  function startPractice(bank, modeKey, title, computeIds) {
    const sess = getSession(bank.id, modeKey);
    if (sess && Array.isArray(sess.questionIds) && sess.questionIds.length && (sess.idx || 0) > 0) {
      const cont = confirm(
        `「${title}」上次练到第 ${sess.idx + 1}/${sess.questionIds.length} 题，要继续上次进度吗？\n（点“取消”将重新开始）`
      );
      if (cont) {
        onOpen({ name: 'practice', bankId: bank.id, modeKey, questionIds: sess.questionIds, title });
        return;
      }
      clearSession(bank.id, modeKey);
    }
    onOpen({ name: 'practice', bankId: bank.id, modeKey, questionIds: computeIds(), title });
  }

  // 一键过滤已导入题库中的重复题目
  function dedupeBank(bank) {
    const { unique, removed } = dedupeQuestions(bank.questions);
    if (!removed.length) {
      alert('该题库没有重复题目。');
      return;
    }
    if (!confirm(`发现 ${removed.length} 道重复题目，确定过滤掉吗？`)) return;
    updateBank({ ...bank, questions: unique, count: unique.length });
    onRefresh();
    alert(`已过滤 ${removed.length} 道重复题目，当前共 ${unique.length} 题。`);
  }

  // 应用已知的答案修正（均有法规依据）
  function fixBank(bank) {
    const { questions: fixed, fixes } = applyAnswerFixes(bank.questions);
    if (!fixes.length) {
      alert('该题库没有需要修正的答案。');
      return;
    }
    const detail = fixes.map((f) => `· ${f.desc}：${f.from.join('')} → ${f.to.join('')}`).join('\n');
    if (!confirm(`将修正 ${fixes.length} 处答案：\n${detail}\n\n确定吗？`)) return;
    updateBank({ ...bank, questions: fixed, count: fixed.length });
    onRefresh();
    alert(`已修正 ${fixes.length} 处答案。`);
  }

  return (
    <div className="page home">
      <header className="topbar">
        <h1>刷题小程序</h1>
        <button className="btn primary" onClick={() => fileRef.current.click()}>
          ＋ 导入题库
        </button>
        <input ref={fileRef} type="file" accept=".docx" hidden onChange={onFile} />
      </header>

      {banks.length > 0 && (
        <div className="toolbar">
          <button className="btn" onClick={() => onOpen({ name: 'search', bankId: '' })}>🔍 快速查题</button>
          <button className="btn" onClick={() => onOpen({ name: 'wrongbook' })}>
            📕 错题本{totalWrong > 0 ? ` (${totalWrong})` : ''}
          </button>
        </div>
      )}

      {banks.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📄</div>
          <p>还没有题库</p>
          <p className="sub">上传 Word（.docx）题库文档，自动识别题目后即可刷题</p>
          <button className="btn primary big" onClick={() => fileRef.current.click()}>
            选择 .docx 文件导入
          </button>
          {BUILTIN_BANK && (
            <button className="btn big" style={{ marginTop: 10 }} onClick={loadBuiltin}>
              载入内置题库（{BUILTIN_BANK.questions.length} 题）
            </button>
          )}
        </div>
      ) : (
        <div className="bank-list">
          {banks.map((bank) => {
            const rec = records[bank.id] || { wrongIds: [], doneCount: 0, correctCount: 0 };
            const rate = rec.doneCount ? Math.round((rec.correctCount / rec.doneCount) * 100) : null;
            const byType = { single: 0, multi: 0, judge: 0 };
            bank.questions.forEach((q) => { byType[q.type] = (byType[q.type] || 0) + 1; });
            const mustCount = filterMustKnow(bank.questions).length;
            return (
              <div className="bank-card" key={bank.id}>
                <div className="bank-head">
                  <div className="bank-name">{bank.name}</div>
                  <button
                    className="icon-btn"
                    title="删除题库"
                    onClick={() => {
                      if (confirm(`确定删除题库「${bank.name}」吗？练习记录也会一并删除。`)) {
                        deleteBank(bank.id);
                        onRefresh();
                      }
                    }}
                  >
                    🗑
                  </button>
                </div>
                <div className="bank-meta">
                  <span>共 {bank.count} 题</span>
                  <span>单选 {byType.single}</span>
                  <span>多选 {byType.multi}</span>
                  <span>判断 {byType.judge}</span>
                </div>
                <div className="bank-stats">
                  {rate === null ? '尚未练习' : `已练 ${rec.doneCount} 题 · 正确率 ${rate}%`}
                  <span className={rec.wrongIds.length ? 'wrong-tag' : ''}>错题 {rec.wrongIds.length}</span>
                </div>
                <div className="bank-actions">
                  <button className="btn" onClick={() => onOpen({ name: 'search', bankId: bank.id })}>
                    查题
                  </button>
                  <button
                    className="btn must"
                    disabled={!mustCount}
                    onClick={() => startPractice(bank, 'must', '必知必会专项', () => filterMustKnow(bank.questions).map((q) => q.id))}
                  >
                    必知必会{mustCount ? ` ${mustCount}` : ''}
                  </button>
                  <button className="btn" onClick={() => startPractice(bank, 'order', '顺序练习', () => bank.questions.map((q) => q.id))}>
                    顺序练习
                  </button>
                  <button className="btn" onClick={() => startPractice(bank, 'random', '随机刷题', () => shuffle(bank.questions.map((q) => q.id)))}>
                    随机刷题
                  </button>
                  <button className="btn" onClick={() => onOpen({ name: 'exam-setup', bankId: bank.id })}>
                    模拟考试
                  </button>
                  <button
                    className="btn"
                    disabled={!rec.wrongIds.length}
                    onClick={() => startPractice(bank, 'wrong', '错题重练', () => rec.wrongIds)}
                  >
                    错题重练
                  </button>
                  <button className="btn" onClick={() => dedupeBank(bank)}>
                    去重
                  </button>
                  <button className="btn" onClick={() => fixBank(bank)}>
                    修正答案
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {importing && (
        <div className="modal-mask">
          <div className="modal">
            {importing === 'loading' ? (
              <div className="loading">
                <div className="spinner" />
                <p>正在解析文档…</p>
              </div>
            ) : (
              <>
                <h3>导入预览</h3>
                <p className="modal-file">「{importing.fileName}」</p>
                <div className="preview-stats">
                  <div><b>{importing.questions.length}</b><span>题目总数</span></div>
                  <div><b>{importing.questions.filter((q) => q.type === 'single').length}</b><span>单选</span></div>
                  <div><b>{importing.questions.filter((q) => q.type === 'multi').length}</b><span>多选</span></div>
                  <div><b>{importing.questions.filter((q) => q.type === 'judge').length}</b><span>判断</span></div>
                </div>
                {importing.removedCount > 0 && (
                  <p className="tip">已自动过滤 {importing.removedCount} 道重复题目。</p>
                )}
                {importing.fixedCount > 0 && (
                  <p className="tip">已自动修正 {importing.fixedCount} 处答案。</p>
                )}
                {importing.skippedCount > 0 && (
                  <p className="warn">有 {importing.skippedCount} 段内容未能识别为题目，已忽略。</p>
                )}
                {importing.questions.length === 0 && <p className="warn">未识别到任何题目，请检查文档格式。</p>}
                <div className="modal-actions">
                  <button className="btn" onClick={() => setImporting(null)}>取消</button>
                  <button className="btn primary" disabled={!importing.questions.length} onClick={confirmImport}>
                    确认导入
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= 刷题（顺序 / 随机 / 错题） ================= */

function Practice({ bank, questionIds, title, modeKey, onExit }) {
  const questions = useMemo(
    () => (bank ? questionIds.map((id) => bank.questions.find((q) => q.id === id)).filter(Boolean) : []),
    [bank, questionIds]
  );

  // 首次进入时读取上次未完成的进度（题目顺序与保存的一致才恢复）
  const resume = useMemo(() => {
    if (!modeKey || !bank) return null;
    const s = getSession(bank.id, modeKey);
    return isSameQuestionSet(s, questionIds) ? s : null;
  }, []); // 只在进入练习时计算一次

  const [idx, setIdx] = useState(resume ? resume.idx : 0);
  const [selected, setSelected] = useState([]);
  const [checked, setChecked] = useState(false);
  const [stats, setStats] = useState(resume && resume.stats ? resume.stats : { correct: 0, wrong: 0 });
  const [finished, setFinished] = useState(false);

  // 退出/刷新后可继续：自动保存进度
  useEffect(() => {
    if (!modeKey || !bank || !questions.length || finished) return;
    saveSession(bank.id, modeKey, { questionIds, idx, stats, updatedAt: Date.now() });
  }, [modeKey, idx, stats, finished]);

  // 完成后清除进度
  useEffect(() => {
    if (finished && modeKey && bank) clearSession(bank.id, modeKey);
  }, [finished]);

  if (!bank || !questions.length) {
    return (
      <div className="page">
        <header className="topbar"><button className="btn" onClick={onExit}>← 返回</button><h1>{title}</h1></header>
        <div className="empty"><p>没有可练习的题目</p></div>
      </div>
    );
  }

  const q = questions[idx];
  const total = questions.length;

  function answer(letter) {
    if (checked) return;
    if (q.type === 'multi') {
      setSelected((prev) => (prev.includes(letter) ? prev.filter((x) => x !== letter) : [...prev, letter]));
      return;
    }
    const ok = isCorrect(q, [letter]);
    setSelected([letter]);
    setChecked(true);
    setStats((s) => ({ ...s, [ok ? 'correct' : 'wrong']: s[ok ? 'correct' : 'wrong'] + 1 }));
    recordAnswer(bank.id, q.id, ok);
  }

  function confirmMulti() {
    if (checked || !selected.length) return;
    const ok = isCorrect(q, selected);
    setChecked(true);
    setStats((s) => ({ ...s, [ok ? 'correct' : 'wrong']: s[ok ? 'correct' : 'wrong'] + 1 }));
    recordAnswer(bank.id, q.id, ok);
  }

  function next() {
    if (idx + 1 >= total) {
      setFinished(true);
      return;
    }
    setIdx(idx + 1);
    setSelected([]);
    setChecked(false);
  }

  function restart() {
    if (!confirm('确定重新开始吗？当前练习进度将被清空。')) return;
    if (modeKey && bank) clearSession(bank.id, modeKey);
    setIdx(0);
    setSelected([]);
    setChecked(false);
    setStats({ correct: 0, wrong: 0 });
    setFinished(false);
  }

  if (finished) {
    const rate = total ? Math.round((stats.correct / total) * 100) : 0;
    return (
      <div className="page">
        <header className="topbar"><h1>{title}</h1></header>
        <div className="summary-card">
          <div className="summary-icon">{rate >= 60 ? '🎉' : '💪'}</div>
          <h2>练习完成</h2>
          <div className="preview-stats">
            <div><b>{total}</b><span>总题数</span></div>
            <div><b className="ok">{stats.correct}</b><span>答对</span></div>
            <div><b className="bad">{stats.wrong}</b><span>答错</span></div>
            <div><b>{rate}%</b><span>正确率</span></div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={onExit}>返回首页</button>
          </div>
        </div>
      </div>
    );
  }

  const progress = ((idx + (checked ? 1 : 0)) / total) * 100;

  return (
    <div className="page practice">
      <header className="topbar">
        <button className="btn" onClick={onExit}>← 返回</button>
        <h1 className="topbar-title">{title}</h1>
        <button className="icon-btn" title="重新开始" onClick={restart}>↻</button>
        <span className="counter">{idx + 1}/{total}</span>
      </header>
      <div className="progress"><div className="progress-bar" style={{ width: progress + '%' }} /></div>

      <div className="question-card">
        <div className="q-type">{TYPE_LABEL[q.type] || '题目'}{q.type === 'multi' && <span className="multi-hint">（多选）</span>}</div>
        <div className="q-text">{q.text}</div>
        <div className="options">
          {q.options.map((o) => {
            let cls = 'opt';
            if (checked) {
              const isAns = q.answer.includes(o.letter);
              const isSel = selected.includes(o.letter);
              if (isAns) cls += ' correct';
              else if (isSel) cls += ' wrong';
              else cls += ' dim';
            } else if (selected.includes(o.letter)) {
              cls += ' selected';
            }
            return (
              <button key={o.letter} className={cls} onClick={() => answer(o.letter)}>
                <span className="opt-letter">{o.letter === '√' || o.letter === '×' ? '' : o.letter}</span>
                <span className="opt-text">{o.text}</span>
              </button>
            );
          })}
        </div>

        {q.type === 'multi' && !checked && (
          <button className="btn primary block" disabled={!selected.length} onClick={confirmMulti}>
            确认答案
          </button>
        )}

        {checked && (
          <div className={`feedback ${selected.length && isCorrect(q, selected) ? 'ok' : 'bad'}`}>
            <div className="feedback-title">
              {isCorrect(q, selected) ? '✅ 回答正确' : '❌ 回答错误'}
            </div>
            <div className="feedback-answer">
              正确答案：{q.answer.map((a) => (a === '√' ? '对' : a === '×' ? '错' : a)).join('、')}
            </div>
            <button className="btn primary block" onClick={next}>
              {idx + 1 >= total ? '完成练习' : '下一题'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= 模拟考试设置 ================= */

function ExamSetup({ bank, onBack, onStart }) {
  const [count, setCount] = useState(bank ? bank.count : 10);
  const [minutes, setMinutes] = useState('');
  if (!bank) return null;

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn" onClick={onBack}>← 返回</button>
        <h1>模拟考试</h1>
      </header>
      <div className="form-card">
        <h3>{bank.name}</h3>
        <label className="field">
          <span>题目数量（共 {bank.count} 题）</span>
          <input
            type="number"
            min={1}
            max={bank.count}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(bank.count, Number(e.target.value) || 1)))}
          />
        </label>
        <label className="field">
          <span>考试时长（分钟，0 或留空为不限时）</span>
          <input
            type="number"
            min={0}
            value={minutes}
            placeholder="不限时"
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={onBack}>取消</button>
          <button
            className="btn primary"
            onClick={() => onStart(shuffle(bank.questions.map((q) => q.id)).slice(0, count), minutes ? Number(minutes) : 0)}
          >
            开始考试
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= 模拟考试答题 ================= */

function Exam({ bank, questionIds, minutes, onExit, onDone }) {
  const questions = useMemo(
    () => questionIds.map((id) => bank.questions.find((q) => q.id === id)).filter(Boolean),
    [bank, questionIds]
  );
  const [answers, setAnswers] = useState({});
  const [cur, setCur] = useState(0);
  const [remain, setRemain] = useState(minutes * 60);
  const [showSheet, setShowSheet] = useState(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const total = questions.length;

  function toggle(qid, letter) {
    const q = questions.find((x) => x.id === qid);
    setAnswers((prev) => {
      const old = prev[qid] || [];
      if (q.type === 'multi') {
        return { ...prev, [qid]: old.includes(letter) ? old.filter((x) => x !== letter) : [...old, letter] };
      }
      return { ...prev, [qid]: [letter] };
    });
  }

  function doSubmit(auto) {
    const wrongIds = [];
    let correct = 0;
    for (const q of questions) {
      const sel = answersRef.current[q.id] || [];
      if (isCorrect(q, sel)) correct++;
      else wrongIds.push(q.id);
    }
    const totalQ = questions.length;
    const score = totalQ ? Math.round((correct / totalQ) * 100) : 0;
    const usedSec = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
    const result = { score, correct, wrong: totalQ - correct, total: totalQ, wrongIds, usedSec, auto };
    saveExam({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      bankId: bank.id,
      bankName: bank.name,
      date: Date.now(),
      ...result,
    });
    onDone(result);
  }

  const startRef = useRef(Date.now());
  const submitRef = useRef(doSubmit);
  submitRef.current = doSubmit;

  useEffect(() => {
    if (!minutes) return;
    const timer = setInterval(() => {
      setRemain((r) => {
        if (r <= 1) {
          clearInterval(timer);
          submitRef.current(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [minutes]);

  const answeredCount = Object.keys(answers).filter((id) => (answers[id] || []).length).length;

  function submit() {
    const unanswered = total - answeredCount;
    if (unanswered > 0 && !confirm(`还有 ${unanswered} 题未作答，确定交卷吗？`)) return;
    doSubmit(false);
  }

  const q = questions[cur];
  const mm = String(Math.floor(remain / 60)).padStart(2, '0');
  const ss = String(remain % 60).padStart(2, '0');

  return (
    <div className="page exam">
      <header className="topbar">
        <button className="btn" onClick={onExit}>退出</button>
        <h1 className="topbar-title">模拟考试</h1>
        <button className="btn primary" onClick={submit}>交卷</button>
      </header>
      <div className="progress"><div className="progress-bar" style={{ width: (answeredCount / total) * 100 + '%' }} /></div>

      <div className="question-card">
        <div className="q-type">
          {TYPE_LABEL[q.type]} · 第 {cur + 1}/{total} 题{q.type === 'multi' && <span className="multi-hint">（多选）</span>}
          <span className="exam-info">{minutes ? `⏱ ${mm}:${ss}　` : ''}已答 {answeredCount}/{total}</span>
        </div>
        <div className="q-text">{q.text}</div>
        <div className="options">
          {q.options.map((o) => {
            const sel = (answers[q.id] || []).includes(o.letter);
            return (
              <button key={o.letter} className={`opt${sel ? ' selected' : ''}`} onClick={() => toggle(q.id, o.letter)}>
                <span className="opt-letter">{o.letter === '√' || o.letter === '×' ? '' : o.letter}</span>
                <span className="opt-text">{o.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="exam-bottom">
        <button className="btn" disabled={cur === 0} onClick={() => setCur(cur - 1)}>‹ 上一题</button>
        <button className="btn sheet-btn" onClick={() => setShowSheet(true)}>答题卡 {answeredCount}/{total}</button>
        <button className="btn" disabled={cur >= total - 1} onClick={() => setCur(cur + 1)}>下一题 ›</button>
      </div>

      {showSheet && (
        <div className="sheet-mask" onClick={() => setShowSheet(false)}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <span>答题卡（已答 {answeredCount}/{total}）</span>
              <button className="icon-btn" onClick={() => setShowSheet(false)}>✕</button>
            </div>
            <div className="sheet-grid">
              {questions.map((qq, i) => {
                const done = (answers[qq.id] || []).length > 0;
                return (
                  <button
                    key={qq.id}
                    className={`sheet-item${i === cur ? ' current' : ''}${done ? ' done' : ''}`}
                    onClick={() => { setCur(i); setShowSheet(false); }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <button className="btn primary block" onClick={submit}>交卷</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= 考试成绩 ================= */

function ExamResult({ bank, result, onHome, onWrong }) {
  const mm = Math.floor(result.usedSec / 60);
  const ss = result.usedSec % 60;
  return (
    <div className="page">
      <header className="topbar"><h1>考试成绩</h1></header>
      <div className="summary-card">
        <div className="summary-icon">{result.score >= 60 ? '🎉' : '💪'}</div>
        <div className="score">{result.score}<span>分</span></div>
        <div className="preview-stats">
          <div><b>{result.total}</b><span>总题数</span></div>
          <div><b className="ok">{result.correct}</b><span>答对</span></div>
          <div><b className="bad">{result.wrong}</b><span>答错</span></div>
          <div><b>{mm}:{String(ss).padStart(2, '0')}</b><span>用时</span></div>
        </div>
        {result.auto && <p className="warn">考试时间到，已自动交卷。</p>}
        <div className="modal-actions">
          {result.wrongIds.length > 0 && (
            <button className="btn" onClick={onWrong}>错题重练（{result.wrongIds.length}）</button>
          )}
          <button className="btn primary" onClick={onHome}>返回首页</button>
        </div>
      </div>
    </div>
  );
}

/* ================= 页面组件（查题 / 错题本）见 pages.jsx ================= */
