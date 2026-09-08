import JSZip from 'jszip';

/**
 * .docx 题库解析器（纯规则，无 AI）
 * 支持问卷星导出及表格式题库的常见格式：
 *   - 单选题：题干 [单选题] * / 题干（C） 等
 *   - 多选题：选项标 (正确答案) / 题干尾部（ABCD）
 *   - 判断题：对(正确答案)/错 或 题干尾部（√）（×）
 */

const SECTION_RE = /^(一|二|三|四|五|六|七|八|九|十)+、/;
const SECTION_NAME_RE = /^(单选题|多选题|判断题|填空题|简答题|问答题)$/;
const Q_START_RE = /^(\d{1,3})[.、．）]\s*/;
const OPT_START_RE = /^([A-H])\s*[、.．)）]?\s*/;
const CORRECT_MARK_G = /[（(]\s*正确答案\s*[)）]/g;
const CORRECT_MARK = /[（(]\s*正确答案\s*[)）]/;
const ANSWER_PAREN_G = /[（(]\s*[A-H√×XxVv✓](?:\s*[、，,]?\s*[A-H√×XxVv✓])*\s*[)）]/g;
const EMPTY_PAREN_END = /\s*[（(]\s*[)）]\s*$/;
const TYPE_MARK_RE = /\[(单选题|多选题|判断题)\]\s*\*?/g;

const ENTITY_RE = /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g;

function decodeEntities(s) {
  return s.replace(ENTITY_RE, (m, e) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X'
        ? parseInt(e.slice(2), 16)
        : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return m;
  });
}

const norm = (s) => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

/** 从 document.xml 中按文档顺序提取所有非空段落文本 */
export function extractParagraphs(docXml) {
  const paras = [];
  const chunks = docXml.split(/<w:p[ >]/).slice(1);
  const tRe = /<w:t(?=[\s/>])[^>]*>([\s\S]*?)<\/w:t>/g;
  for (const chunk of chunks) {
    const texts = [];
    let m;
    while ((m = tRe.exec(chunk))) texts.push(decodeEntities(m[1]));
    const text = norm(texts.join(''));
    if (text) paras.push(text);
  }
  return paras;
}

/** 提取题干中所有括号内的答案字母（A-H、√、×），取并集 */
function extractAnswerLetters(text) {
  const out = [];
  const re = /[（(]\s*([A-H√×XxVv✓](?:\s*[、，,]?\s*[A-H√×XxVv✓])*)\s*[)）]/g;
  let m;
  while ((m = re.exec(text))) {
    const seg = m[1].replace(/[^A-H√×XxVv✓]/g, '');
    if (seg) for (const ch of seg) if (!out.includes(ch)) out.push(ch);
  }
  return out;
}

const isTrueMark = (a) => /[√✓Vv]/.test(a);
const isFalseMark = (a) => /[×Xx]/.test(a);
const hasJudgeMark = (arr) => arr.some((a) => isTrueMark(a) || isFalseMark(a));

/** 找到一行中所有“选项起始字母”的位置（支持一行多个选项、字母紧贴中文等） */
function findOptionStarts(line) {
  const idxs = new Set();
  // 行首或空白后的 A-H + 可选分隔符 + 非空白
  const re1 = /(^|\s)([A-H])\s*[、.．)）]?\s*(?=\S)/g;
  let m;
  while ((m = re1.exec(line))) idxs.add(m.index + m[1].length);
  // 中文字符/括号后紧贴的 A-H，后跟空白（如“方式C 有时”）
  const re2 = /[\u4e00-\u9fff）)】]([A-H])\s+(?=\S)/g;
  while ((m = re2.exec(line))) idxs.add(m.index + 1);
  // 中文字符/括号后紧贴的 A-H，后跟中文（如“A避让B指挥C穿插式D故意冲撞”）
  const re3 = /[\u4e00-\u9fff）)】]([A-H])(?=[\u4e00-\u9fff])/g;
  while ((m = re3.exec(line))) idxs.add(m.index + 1);
  return [...idxs].sort((a, b) => a - b);
}

/** 把一行按选项起始位置拆分成多个选项片段 */
function splitOptions(line) {
  const starts = findOptionStarts(line);
  if (starts.length <= 1) return [line.trim()];
  const parts = [];
  for (let k = 0; k < starts.length; k++) {
    const from = starts[k];
    const to = k + 1 < starts.length ? starts[k + 1] : line.length;
    const p = line.slice(from, to).trim();
    if (p) parts.push(p);
  }
  return parts;
}

function parseOptionPart(p) {
  const m = p.match(OPT_START_RE);
  if (!m) return null;
  const letter = m[1];
  const correct = CORRECT_MARK.test(p);
  const text = p.slice(m[0].length).replace(CORRECT_MARK_G, '').trim();
  return { letter, text, correct };
}

/** 把题干中的答案括号替换为空括号，避免刷题时泄露答案 */
function maskAnswerParens(text) {
  return text.replace(ANSWER_PAREN_G, '（ ）').replace(/\s{2,}/g, ' ').trim();
}

const letterIndex = (ch) => ch.charCodeAt(0) - 65; // A=0

export function parseParagraphs(paras) {
  // 先把“一段里挤了两道题”的段落拆开（如 “37.…（√）38.…（×）”）
  const expanded = [];
  for (const raw of paras) {
    const t = norm(raw);
    if (!t) continue;
    if (Q_START_RE.test(t) && /[）)√×]\d{1,3}[.、．]\s*\S/.test(t)) {
      const parts = t.split(/(?<=[）)√×])(?=\d{1,3}[.、．]\s*\S)/);
      for (const p of parts) { const x = norm(p); if (x) expanded.push(x); }
    } else {
      expanded.push(t);
    }
  }

  const questions = [];
  const skipped = [];
  const orphans = [];
  let section = null;
  let cur = null;

  const flush = () => {
    if (!cur) return;

    if (cur.hasInlineOptions) {
      const parts = splitOptions(cur.inlineOptsText);
      const inlineOpts = parts.map(parseOptionPart).filter(Boolean);
      cur.options = [...inlineOpts, ...cur.options];
      cur.text = cur.inlineQuestionText;
      cur.hasInlineOptions = false;
    }

    if (cur.options.length >= 2) {
      const marked = cur.options.filter((o) => o.correct).map((o) => o.letter);
      let ans = marked.length ? marked : cur.tailLetters;
      if (cur.isJudge) {
        ans = ans.map((a) => (isTrueMark(a) ? '√' : isFalseMark(a) ? '×' : a)).filter((a) => a === '√' || a === '×');
        if (!ans.length) ans = cur.tailLetters.map((a) => (isTrueMark(a) ? '√' : isFalseMark(a) ? '×' : a)).filter((a) => a === '√' || a === '×');
      }
      cur.answer = ans;
      if (cur.markerType) cur.type = cur.markerType;
      else if (cur.isJudge) cur.type = 'judge';
      else cur.type = ans.length > 1 ? 'multi' : 'single';
      questions.push(cur);
    } else if (cur.isJudge && cur.tailLetters.length) {
      const isTrue = cur.tailLetters.some(isTrueMark);
      cur.options = [
        { letter: '√', text: '对', correct: isTrue },
        { letter: '×', text: '错', correct: !isTrue },
      ];
      cur.answer = isTrue ? ['√'] : ['×'];
      cur.type = 'judge';
      questions.push(cur);
    } else {
      skipped.push({ no: cur.no, text: cur.text.slice(0, 80) });
    }
    cur = null;
  };

  for (let idx = 0; idx < expanded.length; idx++) {
    const t = expanded[idx];
    if (!t) continue;

    if (SECTION_RE.test(t) || SECTION_NAME_RE.test(t)) {
      flush();
      if (/多选题/.test(t)) section = 'multi';
      else if (/判断题/.test(t)) section = 'judge';
      else if (/单选题/.test(t)) section = 'single';
      else section = 'other';
      continue;
    }
    if (t.includes('答案解析')) { flush(); continue; }
    if (t.startsWith('您的姓名') || t.startsWith('必知必会总结')) continue;

    const isJudgeMarker = /\[判断题\]/.test(t);
    const isSingleMarker = /\[单选题\]/.test(t);
    const isMultiMarker = /\[多选题\]/.test(t);
    const qm = t.match(Q_START_RE);
    const tailLetters = extractAnswerLetters(t);
    const inQSection = section === 'single' || section === 'multi' || section === 'judge';

    const isNumberedQuestion = !!qm && (isJudgeMarker || isSingleMarker || isMultiMarker || inQSection);
    const isUnnumberedQuestion = !qm && tailLetters.length > 0 && !OPT_START_RE.test(t) && inQSection;

    if (isNumberedQuestion || isUnnumberedQuestion) {
      flush();
      let rawText = t.replace(TYPE_MARK_RE, ' ').trim();
      rawText = rawText.replace(Q_START_RE, '').trim();

      const hasJudgeTail = hasJudgeMark(tailLetters);
      cur = {
        no: qm ? qm[1] : '?',
        text: maskAnswerParens(rawText).replace(EMPTY_PAREN_END, '').trim(),
        options: [],
        tailLetters,
        markerType: isJudgeMarker ? 'judge' : isSingleMarker ? 'single' : isMultiMarker ? 'multi' : null,
        isJudge: isJudgeMarker || section === 'judge' || hasJudgeTail,
        hasInlineOptions: false,
        inlineOptsText: '',
        inlineQuestionText: '',
      };

      // 情形1：题干内嵌选项，如 “83.题干（D）。A xxx B xxx C xxx D xxx” / “87.题干（A）。A xxx”
      const om = rawText.match(/[。；;]\s*([A-H])\s*[、.．)）]?\s+\S/);
      if (om) {
        const cut = om.index + om[0].indexOf(om[1]);
        const after = rawText.slice(cut);
        if (!/[。；;]/.test(after)) {
          cur.hasInlineOptions = true;
          cur.inlineOptsText = after.trim();
          cur.inlineQuestionText = rawText
            .slice(0, om.index + 1)
            .replace(ANSWER_PAREN_G, '')
            .replace(EMPTY_PAREN_END, '')
            .trim();
        }
      }

      // 情形2：答案括号后紧跟无字母的选项A文本，如 “62.…工作:（AD）使用信封密封并标注秘密等级…”
      if (!cur.hasInlineOptions) {
        const am = rawText.match(/[（(]\s*([A-H](?:\s*[、，,]?\s*[A-H])*)\s*[)）]([^，。；;].*)$/);
        if (am) {
          const before = rawText.slice(0, am.index).trim();
          if (/[：:]$/.test(before)) {
            cur.text = before;
            cur.options.push({ letter: 'A', text: am[2].trim(), correct: false });
          }
        }
      }
      continue;
    }

    // 选项行
    if (cur && OPT_START_RE.test(t)) {
      for (const p of splitOptions(t)) {
        const o = parseOptionPart(p);
        if (o) cur.options.push(o);
      }
      continue;
    }

    // 判断题选项：对 / 错（可带 (正确答案)）
    if (cur && /^(对|错|正确|错误|√|×)\s*$/.test(t.replace(CORRECT_MARK_G, ''))) {
      const correct = CORRECT_MARK.test(t);
      const isTrue = /^(对|正确|√)/.test(t);
      cur.options.push({ letter: isTrue ? '√' : '×', text: isTrue ? '对' : '错', correct });
      cur.isJudge = true;
      continue;
    }

    // 续行处理
    if (cur) {
      if (cur.options.length > 0) {
        const last = cur.options[cur.options.length - 1];
        const next = expanded[idx + 1] || '';
        const nextOm = next.match(OPT_START_RE);
        // 若下一行选项跳过了字母（如已有 B、下一行是 D），说明本行是缺失的选项 C
        const gap =
          nextOm && letterIndex(nextOm[1]) - letterIndex(last.letter) > 1
            ? String.fromCharCode(last.letter.charCodeAt(0) + 1)
            : null;
        if (gap) {
          cur.options.push({ letter: gap, text: t, correct: false });
        } else if (cur.options.length < 4) {
          if (!/[。；;！？?]$/.test(last.text)) last.text += ' ' + t;
          else orphans.push(t.slice(0, 50));
        } else {
          orphans.push(t.slice(0, 50));
        }
      } else {
        cur.text += ' ' + t;
      }
    } else {
      orphans.push(t.slice(0, 50));
    }
  }
  flush();

  return { questions, skipped, orphans };
}

/** 解析 .docx 文件（ArrayBuffer），返回 { questions, skipped, orphans } */
export async function parseDocx(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('不是有效的 .docx 文件（缺少 word/document.xml）');
  const docXml = await docFile.async('string');
  const paras = extractParagraphs(docXml);
  return parseParagraphs(paras);
}
