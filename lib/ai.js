// 两处真接 AI 的地方：① 书记员生成卷宗 ② 法官写判决书
// 每处都有“兜底”：模型没配或出错时，用简单规则生成，保证演示不断。

const { chatJson, hasKey } = require('./llm');

// ---------------- ① 卷宗 ----------------

const DOSSIER_SYSTEM = `你是「评评理」AI 法庭的书记员。小组作业交完后，组员对贡献比例有分歧，你要根据群聊记录和共享文档修改记录，客观整理一份「贡献卷宗」。

规则：
- 组员一律用代号（A、B、C……）称呼，绝不出现真名。
- 只写证据里有的事，不推测、不评判对错，语气中立克制。
- "被催次数"= 别人在群里催这个人交东西/问进度的次数（@他问进度、"在吗"之类都算）。
- 时间线按时间排序，8~12 条为宜；被催、拖延、深夜才回复这类事件 warn 设为 true。
- quote 摘录此人在群聊里最能代表其表现的一句原话（不超过 20 字）。
- 另外模拟 6 位不认识当事人的大学生陪审员（演示用预置票），各自读完卷宗后给出贡献比例（整数，合计 100）和一句口语化、略带幽默但讲理的意见（不超过 25 字），6 人观点要有差异。

只输出 JSON，格式：
{
  "summary": "一段 80~150 字的案情摘要",
  "persons": [
    {"id": "A", "role": "负责的部分（4~8 字）", "promised": "承诺了什么", "delivered": "实际完成了什么", "nudged": 0, "edits": "文档修改情况，如 32 处；无记录写 无记录", "quote": "原话"}
  ],
  "timeline": [ {"time": "11-02 21:14", "text": "发生了什么", "warn": false} ],
  "mock_jurors": [ {"ratio": {"A": 40, "B": 40, "C": 20}, "comment": "一句意见"} ]
}`;

async function generateDossier(c) {
  const ids = c.members.map((m) => m.id);
  const user = `课程：${c.course}
作业：${c.assignment}
组员代号：${ids.join('、')}

【群聊记录】
${c.chat || '（无）'}

【共享文档修改记录】
${c.doc_log || '（无）'}

【原告 ${c.plaintiff} 的诉求】
${c.claim || '（无）'}`;

  if (hasKey()) {
    try {
      const d = await chatJson(DOSSIER_SYSTEM, user, { temperature: 0.5 });
      return { ...cleanDossier(d, ids), by: 'ai' };
    } catch (e) {
      console.error('[卷宗] AI 失败，改用规则兜底：', e.message);
    }
  }
  return { ...ruleDossier(c), by: 'rule' };
}

function cleanDossier(d, ids) {
  const persons = ids.map((id) => {
    const p = (d.persons || []).find((x) => x.id === id) || {};
    return {
      id,
      role: p.role || '未分工',
      promised: p.promised || '—',
      delivered: p.delivered || '—',
      nudged: Number.isFinite(+p.nudged) ? +p.nudged : 0,
      edits: p.edits || '无记录',
      quote: p.quote || '',
    };
  });
  const jurors = (d.mock_jurors || []).slice(0, 6).map((j) => ({ ratio: normalize(j.ratio || {}, ids), comment: String(j.comment || '') }));
  while (jurors.length < 6) jurors.push({ ratio: normalize({}, ids), comment: '证据就这些，平均分吧。' });
  return {
    summary: String(d.summary || ''),
    persons,
    timeline: (d.timeline || []).map((t) => ({ time: String(t.time || ''), text: String(t.text || ''), warn: Boolean(t.warn) })),
    mock_jurors: jurors,
  };
}

// 规则兜底：从“[时间] X：内容”格式的群聊里数发言、数被 @ 次数；从“X 编辑了 N 处”里数修改
function ruleDossier(c) {
  const ids = c.members.map((m) => m.id);
  const lines = (c.chat || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const stat = Object.fromEntries(ids.map((id) => [id, { said: 0, nudged: 0, first: '', quote: '', edits: 0 }]));
  const timeline = [];
  for (const line of lines) {
    const m = line.match(/^\[?([\d\-\/ :]+)\]?\s*([A-Z])\s*[：:]\s*(.*)$/);
    if (!m) continue;
    const [, time, who, text] = m;
    if (!stat[who]) continue;
    stat[who].said++;
    if (!stat[who].quote) stat[who].quote = text.slice(0, 20);
    const at = [...text.matchAll(/@([A-Z])/g)].map((x) => x[1]).filter((x) => stat[x]);
    at.forEach((x) => stat[x].nudged++);
    timeline.push({ time: time.trim(), text: `${who}：${text}`, warn: at.length > 0 });
  }
  for (const line of (c.doc_log || '').split('\n')) {
    const m = line.match(/([A-Z])\s*编辑了\s*(\d+)\s*处/);
    if (m && stat[m[1]]) stat[m[1]].edits += +m[2];
  }
  const persons = ids.map((id) => ({
    id,
    role: '见群聊',
    promised: '见群聊',
    delivered: stat[id].edits ? `文档修改 ${stat[id].edits} 处` : '无文档记录',
    nudged: stat[id].nudged,
    edits: stat[id].edits ? `${stat[id].edits} 处` : '无记录',
    quote: stat[id].quote,
  }));
  // 用“修改数 + 发言数 - 被催数”粗估一个比例，给预置陪审票当中心
  const score = Object.fromEntries(ids.map((id) => [id, Math.max(1, stat[id].edits + stat[id].said * 3 - stat[id].nudged * 3)]));
  const base = normalize(score, ids);
  const comments = ['看卷宗说话，干得多就多拿。', '被催的那位，下次早点出现。', '文档修改记录不会骗人。', '都有付出，差距别拉太大。', '发起分工的人值得加分。', '凌晨回消息不等于干了活。'];
  const mock_jurors = comments.map((comment, i) => ({ ratio: jitter(base, ids, i), comment }));
  return {
    summary: `本组共 ${ids.length} 人。群聊中共 ${lines.length} 条记录，${ids.map((id) => `${id} 发言 ${stat[id].said} 次、被催 ${stat[id].nudged} 次`).join('；')}。`,
    persons,
    timeline: timeline.slice(0, 12),
    mock_jurors,
  };
}

// ---------------- ② 判决书 ----------------

const VERDICT_SYSTEM = `你是「评评理」AI 法庭的法官，专门审理大学小组作业的贡献比例纠纷。请根据卷宗和 7 位陪审员的投票，写一份判决书。

风格：模仿正式民事判决书的腔调（"本院查明""本院认为""综上"），但内容是大学生小组作业，要好笑、有梗，同时每个结论都要有卷宗里的证据支撑，讲理不刻薄，不人身攻击。对认真干活的人要明确肯定。
规则：
- 组员只用代号 A、B、C……，绝不出现真名。
- 判决的建议比例必须严格使用给定的「建议比例」，不得修改。
- 4~6 段，每段 40~120 字。第一段写原告诉称和被告辩称，中间写查明的事实和本院认为，倒数第二段以"综上，参考陪审团七人之意见，判决如下："开头给出比例，并附一句温和好笑的"判后寄语"，最后一段固定为"如不服本判决，可于三日内提出上诉。"
- 再起一个适合在判例广场展示的案件标题（不超过 20 字，有悬念或梗，如"“我在调字体”：C 同学的三天"）。

只输出 JSON：{"title": "案件标题", "paragraphs": ["第一段", "第二段", "..."]}`;

async function generateVerdict(c, ratio) {
  const ids = c.members.map((m) => m.id);
  const d = c.dossier;
  const user = `案号：（2026）评字第 ${c.no} 号 · ${c.course}《${c.assignment}》
原告：${c.plaintiff}；诉求：${c.claim || '（无）'}
${c.defense ? `被告说法：${c.defense}` : ''}

【卷宗摘要】${d.summary}
【每人情况】
${d.persons.map((p) => `${p.id}：负责${p.role}；承诺${p.promised}；实际${p.delivered}；被催${p.nudged}次；文档修改${p.edits}；原话“${p.quote}”`).join('\n')}
【时间线】
${d.timeline.map((t) => `${t.time} ${t.text}`).join('\n')}

【陪审团 7 票】
${c.votes.map((v, i) => `${i + 1} 号：${ids.map((id) => `${id} ${v.ratio[id]}%`).join(' / ')}；意见：${v.comment || '无'}`).join('\n')}

【建议比例（取 7 票中位数，已归一化，必须照用）】${ids.map((id) => `${id} ${ratio[id]}%`).join('、')}`;

  if (hasKey()) {
    try {
      const v = await chatJson(VERDICT_SYSTEM, user, { temperature: 0.9 });
      const paragraphs = (v.paragraphs || []).map(String).filter(Boolean);
      if (paragraphs.length >= 3) return { title: String(v.title || defaultTitle(c, ratio)), paragraphs, by: 'ai' };
    } catch (e) {
      console.error('[判决] AI 失败，改用模板兜底：', e.message);
    }
  }
  return { ...templateVerdict(c, ratio), by: 'rule' };
}

function defaultTitle(c, ratio) {
  const low = Object.entries(ratio).sort((a, b) => a[1] - b[1])[0][0];
  return `${c.course}：${low} 同学的贡献之谜`;
}

function templateVerdict(c, ratio) {
  const ids = c.members.map((m) => m.id);
  const d = c.dossier;
  const most = d.persons.slice().sort((a, b) => b.nudged - a.nudged)[0];
  const top = Object.entries(ratio).sort((a, b) => b[1] - a[1])[0][0];
  return {
    title: defaultTitle(c, ratio),
    paragraphs: [
      `原告 ${c.plaintiff} 诉称：${(c.claim || '本组贡献分配不公').replace(/[。.！!]+$/, '')}。`,
      `本院查明：${d.summary}`,
      most && most.nudged > 0
        ? `本院认为，${most.id} 在群聊中被催促 ${most.nudged} 次，按时交付意识有待加强；${top} 的付出有据可查，本院予以肯定。`
        : `本院认为，各方均有付出，${top} 的付出有据可查，本院予以肯定。`,
      `综上，参考陪审团七人之意见，判决如下：本组贡献比例建议为 ${ids.map((id) => `${id} ${ratio[id]}%`).join('、')}。望各位下次分工时把 ddl 写进群公告。`,
      '如不服本判决，可于三日内提出上诉。',
    ],
  };
}

// ---------------- 工具 ----------------

// 把任意比例归一化成合计 100 的整数
function normalize(r, ids) {
  const vals = ids.map((id) => Math.max(0, +r[id] || 0));
  const sum = vals.reduce((a, b) => a + b, 0);
  if (!sum) return Object.fromEntries(ids.map((id, i) => [id, Math.floor(100 / ids.length) + (i < 100 % ids.length ? 1 : 0)]));
  const raw = vals.map((v) => (v * 100) / sum);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
  return Object.fromEntries(ids.map((id, i) => [id, out[i]]));
}

function jitter(base, ids, seed) {
  const r = {};
  ids.forEach((id, i) => { r[id] = Math.max(1, base[id] + (((seed * 7 + i * 3) % 11) - 5)); });
  return normalize(r, ids);
}

// 每人取 7 票中位数，再归一化
function medianRatio(votes, ids) {
  const r = {};
  for (const id of ids) {
    const xs = votes.map((v) => +v.ratio[id] || 0).sort((a, b) => a - b);
    const mid = Math.floor(xs.length / 2);
    r[id] = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  }
  return normalize(r, ids);
}

module.exports = { generateDossier, generateVerdict, medianRatio, normalize };
