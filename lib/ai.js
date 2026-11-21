// 四处真接 AI 的地方：
//  ① 书记员：把双方说法整理成“案情速览 + 争议焦点”
//  ② 法官：结合票数和高赞评语，写一份好笑温暖的判决书 + 寝室公约
//  ③ 陪审员评价：给每位陪审员的评语打“客观度”分，攒成信誉分
//  ④ 遴选陪审团：根据报名理由和过往信誉分，挑出最适合的十几位
// 每处都有兜底：模型没配或出错时，用简单规则生成，保证演示不断。

const { chatJson, hasKey } = require('./llm');

const CHOICE_TEXT = { A: '支持室友 A', MID: '各退一步', B: '支持室友 B' };

const TONE = `基调：轻松、温暖、积极向上。这是室友之间的小事，不是吵架，更不是审判，没有坏人。不要放大冲突，不要判谁输谁赢，不要人身攻击。
隐私：双方一律称“室友 A”“室友 B”，绝不出现真名、昵称、宿舍号、学院班级。如果材料里出现了，用“室友 A / 室友 B / 寝室”替换。`;

// ---------------- ⓪ 隐私审核 + 降火 ----------------
// 用户写的任何说法/聊天，在进入案子之前都要过这一关：
//  1) 隐私：隐去真名、昵称、外号、宿舍号楼栋、手机号微信号学号、学院班级、老师姓名等可识别信息；
//  2) 降火：把讽刺、辱骂、情绪化的措辞改写成平和的陈述，事实不变；
//  3) 拒收：骚扰、人肉、威胁、歧视、低俗，或者怎么改都无法匿名的内容。

const PRIVACY_SYSTEM = `你是「评评理」的隐私审核员兼降火员。同学会写下和室友之间的小分歧，这些内容会匿名展示给全校同学围观，所以必须保证无法认出当事人。
请审核并改写下面的材料：
1. 隐私：把真名、昵称、外号、宿舍号/楼栋/楼层、手机号、微信号/QQ 号、学号、邮箱、学院/专业/班级/年级、老师姓名、可识别的具体地点或事件，全部替换成“室友 A”“室友 B”“寝室”“学校”等泛称，或直接删去。群聊里的发言人也统一写成 A、B。
2. 降火：把讽刺、辱骂、阴阳怪气、情绪化的措辞改写得平和中立，只保留事实和诉求，不要改变事实，也不要替任何一方辩护。
3. 拒收：如果内容含有骚扰、威胁、人肉搜索、歧视、低俗色情，或者即使改写也能认出当事人，把 ok 设为 false，并用一句话说明原因，语气友好。
保持原意，字数和原文相近，不要添油加醋。

只输出 JSON：{"ok": true/false, "title": "改写后的标题", "claim": "改写后的说法", "chat": "改写后的聊天记录（没有就留空字符串）", "redactions": ["隐去了什么，如“2 处姓名”“1 处宿舍号”"], "softened": 是否做了降火, "reason": "ok 为 false 时的原因"}`;

// 规则兜底：只能处理有固定格式的信息（手机号、邮箱、宿舍号、学号、微信号、证件号）。
const PII_RULES = [
  [/1[3-9]\d{9}/g, '手机号'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '邮箱'],
  [/\d{17}[\dXx]/g, '证件号'],
  [/(微信|vx|wx|VX|WX|QQ|qq)\s*[:：号]?\s*[A-Za-z0-9_-]{5,}/g, '社交账号'],
  [/\d{1,2}\s*[号栋幢]\s*楼?\s*\d{0,4}\s*[室舍寝]?|[一二三四五六七八九十]+\s*[号栋幢]楼|\d{3,4}\s*(?:宿舍|寝室|[室舍寝])/g, '宿舍号'],
  [/\b\d{8,12}\b/g, '学号'],
];
function ruleRedact(text) {
  let out = String(text || '');
  const hits = {};
  for (const [re, label] of PII_RULES) {
    out = out.replace(re, () => { hits[label] = (hits[label] || 0) + 1; return '【已隐去】'; });
  }
  return { text: out, hits };
}

async function reviewPrivacy({ title = '', claim = '', chat = '' }) {
  if (hasKey()) {
    try {
      const d = await chatJson(PRIVACY_SYSTEM, `标题：${title}\n说法：${claim}\n聊天记录：${chat || '（无）'}`, { temperature: 0.1, timeoutMs: 45000 });
      if (d.ok === false) return { ok: false, reason: String(d.reason || '这段内容不适合公开展示，请改一改再提交。') };
      if (d.claim) {
        // AI 改完后再用规则扫一遍，双保险
        const a = ruleRedact(d.claim), b = ruleRedact(d.title || title), c = ruleRedact(d.chat || '');
        const extra = Object.entries({ ...a.hits, ...b.hits, ...c.hits }).map(([k, n]) => `${n} 处${k}`);
        return { ok: true, title: b.text, claim: a.text, chat: c.text, redactions: [...(d.redactions || []).map(String), ...extra], softened: Boolean(d.softened), by: 'ai' };
      }
    } catch (e) {
      console.error('[隐私审核] AI 失败，改用规则：', e.message);
    }
  }
  const t = ruleRedact(title), cl = ruleRedact(claim), ch = ruleRedact(chat);
  const hits = Object.entries({ ...t.hits, ...cl.hits, ...ch.hits }).map(([k, n]) => `${n} 处${k}`);
  return { ok: true, title: t.text, claim: cl.text, chat: ch.text, redactions: hits, softened: false, by: 'rule' };
}

// ---------------- ① 案情速览 ----------------

const INTAKE_SYSTEM = `你是「评评理」的 AI 书记员。大学室友之间有点小分歧，双方各写了自己的说法（可能还附上寝室群聊天），你要整理一份让围观同学一眼看懂的“案情速览”。
${TONE}
只写材料里有的事，不编造。
如果室友 B 还没有回应（“单方面展示”），就只转述室友 A 的说法，明确写出“室友 B 暂未回应”，不要替 B 编造立场，也不要暗示 B 理亏。

只输出 JSON：
{"summary": "60~120 字的案情速览，中立、略带善意的幽默，说清双方各自的难处，并点明两人其实都想好好相处", "focus": "一句话争议焦点，不超过 25 字，用问句"}`;

async function generateIntake(c) {
  const user = `案由：${c.category}
标题：${c.title}
室友 A 的说法：${c.claimA}
室友 B 的说法：${c.solo ? '（室友 B 暂未回应，本案为单方面展示）' : c.claimB || '（尚未填写）'}
寝室群聊天记录：${c.chat || '（无）'}`;
  if (hasKey()) {
    try {
      const d = await chatJson(INTAKE_SYSTEM, user, { temperature: 0.6 });
      if (d.summary && d.focus) return { summary: String(d.summary), focus: String(d.focus), by: 'ai' };
    } catch (e) {
      console.error('[速览] AI 失败，改用规则兜底：', e.message);
    }
  }
  return {
    summary: c.solo ? `室友 A 说：${trim(c.claimA, 80)} 室友 B 暂未回应。希望大家帮忙出出主意，也欢迎 B 有空来补充。` : `室友 A 说：${trim(c.claimA, 60)} 室友 B 说：${trim(c.claimB, 60)} 两人都不想吵架，只是想找个让双方都舒服的办法。`,
    focus: `关于“${trim(c.title, 20)}”，怎么办才两全？`,
    by: 'rule',
  };
}

// ---------------- ② 判决书 + 寝室公约 ----------------

const VERDICT_SYSTEM = `你是「评评理」的 AI 法官，专门审理大学室友之间的生活小事。陪审团（十几位报名并做了“客观承诺”的同学）已经投完票，请你写一份判决书和一份寝室公约。
${TONE}
判决书风格：模仿民事判决书的腔调（“本院查明”“本院认为”“判决如下”），但内容温暖好笑，有一点梗，对“都没吵架”“愿意找办法”这类好行为要表扬。采纳多数票的方向，并吸收高赞评语里的具体办法。不要把票数少的一方说成错的。如果是“单方面展示”（室友 B 未回应），只听到一方说法，要明确写出“本院只听到一方说法，结论仅供参考”，不判断对错，只给善意的建议，并邀请 B 有空来补充。
- paragraphs：4~5 段，每段 30~110 字。依次是：本院查明（双方各自的难处）/ 本院认为（采纳陪审团意见的理由）/ 判决如下（具体、可执行的办法）/ 最后一段一句温暖的寄语。
- pact：3 条寝室公约，每条不超过 22 字，具体可执行，可以带一点小幽默，尽量来自陪审团的评语。

只输出 JSON：{"paragraphs": ["…"], "pact": ["…", "…", "…"]}`;

async function generateVerdict(c, tally, hot) {
  const user = `案由：${c.category}　标题：${c.title}
室友 A 的说法：${c.claimA}
室友 B 的说法：${c.solo ? '（暂未回应，单方面展示）' : c.claimB}
案情速览：${c.summary}
争议焦点：${c.focus}

陪审团投票（共 ${tally.total} 票）：支持 A ${tally.A} 票 / 各退一步 ${tally.MID} 票 / 支持 B ${tally.B} 票
高赞评语（含票型）：
${hot.map((v) => `- [${CHOICE_TEXT[v.choice]}] ${v.comment}（👍 ${v.likes}）`).join('\n') || '（无）'}`;
  if (hasKey()) {
    try {
      const d = await chatJson(VERDICT_SYSTEM, user, { temperature: 0.9 });
      const paragraphs = (d.paragraphs || []).map(String).filter(Boolean);
      const pact = (d.pact || []).map(String).filter(Boolean).slice(0, 3);
      if (paragraphs.length >= 3 && pact.length >= 2) return { paragraphs, pact, by: 'ai' };
    } catch (e) {
      console.error('[判决] AI 失败，改用模板兜底：', e.message);
    }
  }
  return { ...templateVerdict(c, tally, hot), by: 'rule' };
}

function templateVerdict(c, tally, hot) {
  const top = Object.entries({ A: tally.A, MID: tally.MID, B: tally.B }).sort((a, b) => b[1] - a[1])[0][0];
  const lean = top === 'MID' ? '多数陪审员主张各退一步' : `多数陪审员更理解室友 ${top} 的难处，同时也希望照顾另一方`;
  const ideas = hot.map((v) => v.comment).filter(Boolean);
  return {
    paragraphs: [
      `本院查明：室友 A 称“${trim(c.claimA, 40)}”，室友 B 称“${trim(c.claimB, 40)}”。双方均未恶语相向，本院予以表扬。`,
      `本院认为：这不是对错之争，只是两种生活习惯碰了面。${lean}，本院采纳。`,
      `判决如下：${ideas[0] ? `参考热评“${trim(ideas[0], 40)}”，` : ''}请双方在本周内就此事定一个看得见的小规矩，并各让一步。`,
      '愿二位从此相处愉快，寝室和睦，一觉到天亮。',
    ],
    pact: [ideas[0], ideas[1], '有分歧先在群里说，不要默默较劲'].filter(Boolean).map((s) => trim(s, 22)).slice(0, 3),
  };
}

// ---------------- ③ 陪审员评价 ----------------

const JUROR_SYSTEM = `你是「评评理」的陪审员评价官。每位陪审员投了票并写了一句评语，请从“客观、对事不对人、有建设性”三个角度，给每条评语打 0~100 分，并写一句不超过 20 字的点评。
- 给出具体可执行办法的评语，分数高；
- 情绪化、嘲讽、人身攻击、只站队没理由的，分数低；
- 不要因为某人的投票结果与多数相同或不同而打分，只看评语本身。

只输出 JSON：{"scores": [{"i": 序号, "score": 0~100 的整数, "note": "点评"}]}`;

async function evaluateJurors(c) {
  const items = c.votes.map((v, i) => ({ i, choice: v.choice, comment: v.comment, reason: (c.applications.find((a) => a.userId === v.userId) || {}).reason || '' }));
  if (!items.length) return {};
  if (hasKey()) {
    try {
      const d = await chatJson(JUROR_SYSTEM, `案件：${c.title}\n${items.map((x) => `${x.i}. [${CHOICE_TEXT[x.choice]}] 评语：${x.comment || '（无）'}　报名理由：${x.reason}`).join('\n')}`, { temperature: 0.2 });
      const out = {};
      for (const s of d.scores || []) out[s.i] = { score: clamp(+s.score), note: String(s.note || '') };
      if (Object.keys(out).length) return out;
    } catch (e) {
      console.error('[陪审员评价] AI 失败，改用规则：', e.message);
    }
  }
  return ruleEvaluate(items);
}

// 规则版评分：有具体办法加分，攻击性语言扣分（AI 没连上时用，也用于预置案例）
function ruleEvaluate(items) {
  const out = {};
  for (const x of items) {
    const t = x.comment || '';
    let score = 55 + Math.min(20, t.length);
    if (/[，,、；;+]|建议|可以|不如|试试|轮流|各自|先|提前/.test(t)) score += 10;
    if (/傻|笨|有病|活该|滚|矫情|垃圾人/.test(t)) score -= 35;
    out[x.i] = { score: clamp(score), note: !t ? '没有留评语' : score < 45 ? '只有情绪，没讲理由' : /[，,、；;+]|建议|可以|不如|试试|轮流/.test(t) ? '给出了具体办法' : '有理由，办法可以更具体' };
  }
  return out;
}

// ---------------- ④ AI 筛选陪审团 ----------------

const SELECT_SYSTEM = `你是「评评理」的陪审团遴选官。有若干位同学报名担任某个室友小案的陪审员，请根据每人的“过往信誉分、陪审过的案子数、本次报名理由”，挑出最适合的 N 位。
遴选标准：
- 过往评语客观、有建设性的（信誉分高）优先；
- 报名理由是想帮忙找办法、有相似经历但承诺保持中立的，加分；
- 理由里透露认识当事人、想站队、想看热闹吵架的，不选；
- 新人（陪审 0 次）信誉分默认 60，可以给机会，但最多占一半。
为每个入选者写一句不超过 18 字的“入选理由”。

只输出 JSON：{"picks": [{"i": 序号, "note": "入选理由"}]}`;

async function selectJury(c, applicants, n) {
  // applicants: [{ i, rep, cases, reason }]
  const byRep = () => applicants.slice().sort((a, b) => b.rep - a.rep || b.reason.length - a.reason.length).slice(0, n).map((a) => ({ i: a.i, note: a.cases ? `信誉分 ${a.rep}，过往评语靠谱` : '新人，给个机会' }));
  if (applicants.length <= n) return { picks: applicants.map((a) => ({ i: a.i, note: a.cases ? `信誉分 ${a.rep}` : '新人陪审员' })), by: 'all' };
  if (hasKey()) {
    try {
      const d = await chatJson(SELECT_SYSTEM, `案件：${c.title}（${c.category}）\n需要 ${n} 位陪审员。\n报名者：\n${applicants.map((a) => `${a.i}. 信誉分 ${a.rep} / 已陪审 ${a.cases} 次 / 理由：${a.reason}`).join('\n')}`, { temperature: 0.2 });
      const valid = new Set(applicants.map((a) => a.i));
      const seen = new Set();
      const picks = (d.picks || []).filter((p) => valid.has(+p.i) && !seen.has(+p.i) && seen.add(+p.i)).map((p) => ({ i: +p.i, note: String(p.note || '') })).slice(0, n);
      if (picks.length >= Math.min(n, 5)) {
        // 不够的名额按信誉分补齐
        for (const a of byRep()) if (picks.length < n && !seen.has(a.i)) { picks.push(a); seen.add(a.i); }
        return { picks, by: 'ai' };
      }
    } catch (e) {
      console.error('[遴选] AI 失败，改按信誉分：', e.message);
    }
  }
  return { picks: byRep(), by: 'rule' };
}

// ---------------- 工具 ----------------

function trim(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 50)));
}

// 三种票型的占比，合计 100
function percentages(t) {
  const total = t.A + t.MID + t.B;
  if (!total) return { A: 0, MID: 0, B: 0, total: 0 };
  const keys = ['A', 'MID', 'B'];
  const raw = keys.map((k) => (t[k] * 100) / total);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
  return { A: out[0], MID: out[1], B: out[2], total };
}

module.exports = { reviewPrivacy, ruleRedact, generateIntake, generateVerdict, evaluateJurors, ruleEvaluate, selectJury, percentages, CHOICE_TEXT };
