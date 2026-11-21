// 评评理 · 后端（室友吃瓜版）
// 零依赖：只用 Node.js 自带的模块，`node server.js` 就能跑。
// 页面放在 public/，数据存在 data/db.json（一个案子一条记录，不需要正经数据库）。
//
// 案子的一生：
//   waiting（等室友应诉）→ recruiting（AI 书记员出案情速览，招募 12 位陪审员）
//   → voting（席位满了，陪审员投票）→ done（AI 法官判决 + 寝室公约 + AI 点评陪审员）

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ai = require('./lib/ai');
const { MODEL, hasKey } = require('./lib/llm');
const seed = require('./lib/seed');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const SEATS = seed.SEATS;
const DEMO = () => process.env.DEMO_MODE !== 'off'; // 演示模式：放开几个只为录屏方便的捷径，正式运营设 DEMO_MODE=off

// ---------------- 存储 ----------------

let db = { nextNo: 44, users: {}, sessions: {}, cases: {} };
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
} catch (_) {}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db));
}
const newId = () => Math.random().toString(36).slice(2, 8);
const clone = (o) => JSON.parse(JSON.stringify(o));

// 预置的已判决案例：算出票数结果和（规则版）陪审员点评
function finishSeed(c) {
  c.verdict.result = ai.percentages(tally(c));
  c.verdict.jurorReview = buildReview(c, ai.ruleEvaluate(c.votes.map((v, i) => ({ i, comment: v.comment }))));
}

// ---------------- 小工具 ----------------

const tally = (c) => {
  const t = { A: 0, MID: 0, B: 0 };
  for (const v of c.votes) if (t[v.choice] !== undefined) t[v.choice]++;
  return t;
};
const members = (c) => c.jury.members;
const seatOf = (c, uid) => (members(c).find((m) => m.userId === uid) || {}).no || 0;
const isRealUser = (u) => u && !u.seed;
const likesOf = (v) => (v.likes || 0) + (v.likedBy || []).length; // 预置点赞数 + 真实用户点赞

// ---------------- 账号 ----------------
// 学校邮箱 + 验证码注册/登录（无密码）；登录后用 HttpOnly cookie 记住身份。
// 演示版不真发邮件：验证码直接返回给页面显示；DEMO_MODE=off 时不返回（需另接邮件服务）。

const codes = {}; // email -> { code, exp }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function currentUser(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)ppl=([a-f0-9]+)/);
  const uid = m && db.sessions[m[1]];
  return (uid && db.users[uid]) || null;
}
function login(res, user) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = user.id;
  save();
  res.setHeader('Set-Cookie', `ppl=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
}
function publicUser(u) {
  return u && { id: u.id, nickname: u.nickname, email: u.email.replace(/^(.{2}).*(@.*)$/, '$1***$2'), jurorScore: u.jurorScore, verified: true };
}
function notify(uid, text, caseId) {
  const u = db.users[uid];
  if (!u || u.seed) return;
  (u.notifs = u.notifs || []).unshift({ id: newId(), text, caseId, at: new Date().toISOString(), read: false });
  u.notifs = u.notifs.slice(0, 30);
}

// ---------------- 陪审信用 ----------------

function scoreInfo(u) {
  const s = u.jurorScore ?? 60;
  const star = (x) => Math.max(1, Math.min(5, Math.round(x / 20)));
  return {
    value: s,
    title: s >= 85 ? '金牌陪审员' : s >= 70 ? '银牌陪审员' : u.jurorCases ? '靠谱陪审员' : '新晋陪审员',
    stars: { reason: star(s), constructive: star(s - 5), kind: star(s + 5) },
    cases: u.jurorCases || 0,
  };
}

// ---------------- 对外的案子（去掉真名、聊天原文和所有用户 id） ----------------

function publicVote(c, v, user) {
  return {
    no: seatOf(c, v.userId),
    choice: v.choice,
    comment: v.comment,
    likes: likesOf(v),
    liked: Boolean(user && (v.likedBy || []).includes(user.id)),
  };
}

function viewerOf(c, user) {
  if (!user) return null;
  const mine = c.votes.find((v) => v.userId === user.id);
  const app = c.jury.applications.find((a) => a.userId === user.id);
  const isMember = members(c).some((m) => m.userId === user.id);
  return {
    isCreator: c.creatorId === user.id,
    isRespondent: c.respondentId === user.id,
    isMember,
    seatNo: seatOf(c, user.id),
    voted: Boolean(mine),
    myChoice: mine && mine.choice,
    myComment: mine && mine.comment,
    applied: app ? app.status : null,
    invited: (c.invitedIds || []).includes(user.id) || Boolean(c.inviteAll),
    canApply: c.status === 'recruiting' && !isMember && !app && c.creatorId !== user.id && c.respondentId !== user.id,
    canVote: c.status === 'voting' && isMember,
  };
}

function publicCase(c, user) {
  const t = tally(c);
  const total = t.A + t.MID + t.B;
  const votes = c.votes.map((v) => publicVote(c, v, user)).sort((a, b) => b.likes - a.likes);
  const v = c.verdict;
  return {
    id: c.id,
    no: c.no,
    category: c.category,
    title: c.title,
    status: c.status,
    claimA: c.claimA,
    claimB: c.solo ? '（室友 B 暂未回应，本案为单方面展示）' : c.claimB,
    solo: Boolean(c.solo),
    privacy: user && c.creatorId === user.id ? c.privacy : undefined,
    summary: c.summary,
    focus: c.focus,
    watchers: c.watchers || 0,
    tally: { ...t, total, pct: ai.percentages(t) },
    jury: {
      seats: SEATS,
      filled: members(c).length,
      voted: total,
      slots: Array.from({ length: SEATS }, (_, i) => ({ no: i + 1, filled: i < members(c).length, voted: c.votes.some((x) => seatOf(c, x.userId) === i + 1) })),
      applications: c.jury.applications.length,
      reasons: c.jury.applications.slice(0, 6).map((a, i) => ({ who: `报名者 ${i + 1}`, reason: a.reason, status: a.status })),
    },
    comments: votes.filter((x) => x.comment),
    verdict: v && { type: v.type || 'judgment', result: v.result, paragraphs: v.paragraphs, script: v.script, pact: v.pact, jurorReview: v.jurorReview.map(({ userId, ...r }) => r), by: v.by },
    reconciled: c.reconciled,
    viewer: viewerOf(c, user),
    inviteLink: user && c.creatorId === user.id ? `file.html?respond=${c.id}` : undefined,
  };
}

function caseCard(c) {
  const t = tally(c);
  const hot = c.votes.filter((v) => v.comment).sort((a, b) => likesOf(b) - likesOf(a))[0];
  return {
    id: c.id,
    no: c.no,
    category: c.category,
    title: c.title,
    status: c.status,
    createdAt: c.createdAt,
    pct: ai.percentages(t),
    votes: t.A + t.MID + t.B,
    solo: Boolean(c.solo),
    seatsFilled: members(c).length,
    seats: SEATS,
    watchers: c.watchers || 0,
    commentCount: c.votes.filter((v) => v.comment).length,
    quote: (c.verdict && c.verdict.pact && c.verdict.pact[0]) || (hot && hot.comment) || '',
    reconciled: Boolean(c.reconciled.A && c.reconciled.B),
    focus: c.focus,
  };
}

// ---------------- 业务 ----------------

// 室友应诉后开庭：AI 书记员出速览，系统推送邀请给信用高的陪审员
async function openCourt(c) {
  const d = await ai.generateIntake(c);
  c.summary = d.summary;
  c.focus = d.focus;
  c.status = 'recruiting';
  const pool = Object.values(db.users)
    .filter((u) => isRealUser(u) && u.id !== c.creatorId && u.id !== c.respondentId)
    .sort((a, b) => (b.jurorScore ?? 60) - (a.jurorScore ?? 60))
    .slice(0, SEATS);
  c.invitedIds = pool.map((u) => u.id);
  for (const u of pool) notify(u.id, `AI 根据你的陪审信用，邀请你担任《${c.title}》的陪审员`, c.id);
  save();
}

function addMember(c, userId, source) {
  if (members(c).some((m) => m.userId === userId) || members(c).length >= SEATS) return false;
  members(c).push({ userId, source, no: members(c).length + 1 });
  if (members(c).length >= SEATS) {
    c.status = 'voting';
    for (const a of c.jury.applications) if (a.status === 'pending') a.status = 'rejected';
  }
  return true;
}

// 报名后 AI 遴选：在所有待选报名者里，按陪审信用和报名理由挑满空位
async function runSelection(c, newcomer) {
  const open = SEATS - members(c).length;
  const pending = c.jury.applications.filter((a) => a.status === 'pending');
  if (open <= 0 || !pending.length) return;
  const list = pending.map((a, i) => {
    const u = db.users[a.userId] || {};
    return { i, rep: u.jurorScore ?? 60, cases: u.jurorCases || 0, reason: a.reason };
  });
  const { picks } = await ai.selectJury(c, list, open);
  let chosen = picks.map((p) => pending[p.i]).filter(Boolean);
  // 演示保险：真人报名者不会被预置的“陪审员”挤掉，免得现场录屏时抽不到自己
  if (DEMO() && newcomer && !chosen.includes(newcomer) && open > 0) chosen = [newcomer, ...chosen].slice(0, open);
  for (const a of chosen) {
    a.status = 'selected';
    addMember(c, a.userId, 'apply');
    notify(a.userId, `AI 遴选结果：你入选了《${c.title}》的陪审团`, c.id);
  }
  for (const a of pending) if (!chosen.includes(a) && c.status === 'voting') a.status = 'rejected';
  for (const a of pending) if (a.status === 'rejected') notify(a.userId, `《${c.title}》陪审团已满，这次没选上，下次再来`, c.id);
}

// 把 AI 的评分换成加减分：最佳 +5，其余按分数 +3 / +1 / 0 / -2
function buildReview(c, scores) {
  const arr = c.votes.map((v, i) => ({ i, userId: v.userId, no: seatOf(c, v.userId), comment: v.comment, likes: likesOf(v), score: (scores[i] || { score: 60 }).score, note: (scores[i] || {}).note || '' }));
  const best = arr.slice().sort((a, b) => b.score - a.score || b.likes - a.likes)[0];
  return arr
    .map((x) => ({
      no: x.no,
      delta: x === best ? 5 : x.score >= 85 ? 3 : x.score >= 65 ? 1 : x.score >= 45 ? 0 : -2,
      note: x.note,
      best: x === best,
      comment: x.comment,
      userId: x.userId,
    }))
    .sort((a, b) => b.delta - a.delta || a.no - b.no);
}

async function finalize(c) {
  c.status = 'judging';
  const t = tally(c);
  const hot = c.votes.filter((v) => v.comment).sort((a, b) => likesOf(b) - likesOf(a)).slice(0, 6).map((v) => ({ ...v, likes: likesOf(v) }));
  const [verdict, scores] = await Promise.all([ai.generateVerdict(c, { ...t, total: t.A + t.MID + t.B }, hot), ai.evaluateJurors({ ...c, applications: c.jury.applications })]);
  const review = buildReview(c, scores);
  for (const r of review) {
    const u = db.users[r.userId];
    if (!u || u.seed) continue;
    u.jurorScore = Math.max(0, Math.min(100, (u.jurorScore ?? 60) + r.delta));
    u.jurorCases = (u.jurorCases || 0) + 1;
    notify(u.id, `《${c.title}》结案了，AI 点评了你的意见：${r.delta > 0 ? '+' : ''}${r.delta} 分${r.best ? '（最佳陪审员！）' : ''}`, c.id);
  }
  c.verdict = { type: verdict.type || 'judgment', result: ai.percentages(t), paragraphs: verdict.paragraphs, script: verdict.script, pact: verdict.pact, jurorReview: review, by: verdict.by };
  c.status = 'done';
  save();
}

// 演示模式下，用户对预置案例的操作（报名、接受邀请）会落在一份复制品上：预置案例永远保持原样，可以反复录屏
function forFork(c) {
  if (!(c.seed && DEMO())) return c;
  const t = clone(c);
  Object.assign(t, { id: newId(), no: String(db.nextNo++).padStart(4, '0'), seed: false, createdAt: new Date().toISOString() });
  db.cases[t.id] = t;
  return t;
}

// ---------------- 路由 ----------------

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'cases', id, action]
  const method = req.method;
  const user = currentUser(req);
  const need = () => { if (!user) { send(res, 401, { error: '请先登录' }); return false; } return true; };

  if (method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, model: MODEL, aiReady: hasKey(), demo: DEMO() });

  // ---- 账号 ----
  if (method === 'POST' && url.pathname === '/api/send-code') {
    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return send(res, 400, { error: '请填写正确的学校邮箱' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    codes[email] = { code, exp: Date.now() + 10 * 60 * 1000 };
    return send(res, 200, { ok: true, demoCode: DEMO() ? code : undefined });
  }
  // 注册和登录是同一个动作：邮箱 + 验证码通过后，没账号就建，有就登录
  if (method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    const rec = codes[email];
    if (!rec || rec.exp < Date.now() || rec.code !== String(b.code || '').trim()) return send(res, 400, { error: '验证码不对或已过期，请重新获取' });
    delete codes[email];
    let u = Object.values(db.users).find((x) => x.email === email);
    if (!u) {
      u = { id: newId(), email, nickname: '', jurorScore: 60, jurorCases: 0, notifs: [], createdAt: new Date().toISOString() };
      db.users[u.id] = u;
    }
    if (b.nickname) u.nickname = String(b.nickname).trim().slice(0, 20);
    if (!u.nickname) u.nickname = email.split('@')[0].slice(0, 20);
    login(res, u);
    return send(res, 200, { user: publicUser(u) });
  }
  if (method === 'POST' && url.pathname === '/api/logout') {
    res.setHeader('Set-Cookie', 'ppl=; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }

  // ---- 我的 ----
  if (method === 'GET' && url.pathname === '/api/me') {
    if (!user) return send(res, 200, { user: null });
    const all = Object.values(db.cases).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const mine = all.filter((c) => c.creatorId === user.id || c.respondentId === user.id);
    const likes = all.reduce((n, c) => n + c.votes.filter((v) => v.userId === user.id).reduce((s, v) => s + likesOf(v), 0), 0);
    return send(res, 200, {
      user: publicUser(user),
      respondInvites: all.filter((c) => c.status === 'waiting' && c.demoInvite && c.creatorId !== user.id).map(caseCard),
      myCases: mine.map((c) => ({ ...caseCard(c), role: c.creatorId === user.id ? 'A' : 'B' })),
      stats: { cases: mine.length, voted: all.filter((c) => c.votes.some((v) => v.userId === user.id)).length, likes },
      notifs: (user.notifs || []).slice(0, 10),
    });
  }

  // ---- 陪审员中心 ----
  if (method === 'GET' && url.pathname === '/api/me/jury') {
    if (!need()) return;
    const all = Object.values(db.cases).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const recruiting = all.filter((c) => c.status === 'recruiting' && c.creatorId !== user.id && c.respondentId !== user.id);
    const isMember = (c) => members(c).some((m) => m.userId === user.id);
    const applied = (c) => c.jury.applications.some((a) => a.userId === user.id);
    const history = all
      .filter((c) => isMember(c) || applied(c))
      .filter((c) => c.status === 'voting' || c.status === 'done' || applied(c))
      .map((c) => {
        const mine = c.votes.find((v) => v.userId === user.id);
        const review = c.verdict && c.verdict.jurorReview.find((r) => r.userId === user.id);
        const app = c.jury.applications.find((a) => a.userId === user.id);
        return { ...caseCard(c), myChoice: mine && mine.choice, myComment: mine && mine.comment, review: review && { delta: review.delta, best: review.best, note: review.note }, applied: app && app.status, isMember: isMember(c) };
      });
    return send(res, 200, {
      invites: recruiting.filter((c) => !isMember(c) && !applied(c) && ((c.invitedIds || []).includes(user.id) || c.inviteAll)).map(caseCard),
      openCases: recruiting.filter((c) => !isMember(c) && !applied(c)).map(caseCard),
      applications: history.filter((h) => h.applied),
      history,
      score: scoreInfo(user),
      notifs: (user.notifs || []).slice(0, 10),
    });
  }

  // ---- 案子列表（吃瓜广场）----
  if (method === 'GET' && url.pathname === '/api/cases') {
    const cat = url.searchParams.get('category');
    const items = Object.values(db.cases)
      .filter((c) => c.status !== 'waiting' && c.status !== 'judging')
      .filter((c) => !cat || cat === '全部' || c.category === cat)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(caseCard);
    return send(res, 200, { items, user: publicUser(user), stats: { reconcileRate: 82 } }); // 握手言和率：演示用固定值（来源是一周回访）
  }

  // ---- 立案 ----
  if (method === 'POST' && parts.length === 2 && parts[1] === 'cases') {
    if (!need()) return;
    const b = await body(req);
    if (!String(b.title || '').trim() || !String(b.claimA || '').trim()) return send(res, 400, { error: '请填写标题和你的说法' });
    // 隐私审核 + 降火：进入案子之前，先隐去可识别信息、把情绪化措辞改平和；不合适的内容直接拒收
    const rv = await ai.reviewPrivacy({ title: String(b.title).trim().slice(0, 60), claim: String(b.claimA).trim().slice(0, 600), chat: String(b.chat || '').slice(0, 8000) });
    if (!rv.ok) return send(res, 400, { error: rv.reason });
    const c = {
      id: newId(),
      no: String(db.nextNo++).padStart(4, '0'),
      createdAt: new Date().toISOString(),
      category: String(b.category || '其他').slice(0, 10),
      title: rv.title.slice(0, 60),
      claimA: rv.claim.slice(0, 600),
      claimB: '',
      chat: rv.chat.slice(0, 8000),
      privacy: { redactions: rv.redactions, softened: rv.softened, by: rv.by, before: String(b.claimA).trim().slice(0, 600), after: rv.claim.slice(0, 600) },
      solo: false,
      creatorId: user.id,
      respondentId: null,
      status: 'waiting',
      summary: '',
      focus: '',
      jury: { seats: SEATS, members: [], applications: [] },
      votes: [],
      verdict: null,
      reconciled: { A: false, B: false },
      invitedIds: [],
      watchers: 0,
    };
    db.cases[c.id] = c;
    save();
    return send(res, 200, publicCase(c, user));
  }

  const c = parts[1] === 'cases' && parts[2] ? db.cases[parts[2]] : null;
  if (parts[1] === 'cases' && parts[2] && !c) return send(res, 404, { error: '案子不存在' });

  if (c && method === 'GET' && parts.length === 3) {
    if (!user || c.creatorId !== user.id) c.watchers = (c.watchers || 0) + 1;
    return send(res, 200, publicCase(c, user));
  }

  // 室友应诉：写下自己的说法，案子开庭
  if (c && method === 'POST' && parts[3] === 'respond') {
    if (!need()) return;
    const b = await body(req);
    // 单方面展示的案子，室友可以随时来“认领”并补充说法，转成双方案
    if (c.status !== 'waiting' && !c.solo) return send(res, 400, { error: '这个案子已经开庭了' });
    const demo = DEMO() && b.demo;
    if (c.creatorId === user.id && !demo) return send(res, 400, { error: '请让你的室友来写他的说法' });
    const raw = String(b.claimB || '').trim().slice(0, 600) || '我也有自己的难处，愿意和室友一起找个办法。';
    const rv = await ai.reviewPrivacy({ title: c.title, claim: raw });
    if (!rv.ok) return send(res, 400, { error: rv.reason });
    c.claimB = rv.claim.slice(0, 600);
    c.privacyB = { redactions: rv.redactions, softened: rv.softened };
    c.respondentId = c.creatorId === user.id ? 'demo-roommate' : user.id;
    if (c.solo) {
      c.solo = false;
      const d = await ai.generateIntake(c); // 补充说法后，书记员重新整理一次速览
      c.summary = d.summary;
      c.focus = d.focus;
      save();
    } else {
      await openCourt(c);
    }
    return send(res, 200, publicCase(c, user));
  }

  // 单方面展示：室友不愿应诉时，立案人可以让案子直接上广场（隐私已在立案时由 AI 审核并匿名）
  if (c && method === 'POST' && parts[3] === 'solo') {
    if (!need()) return;
    if (c.creatorId !== user.id && !DEMO()) return send(res, 403, { error: '只有立案人可以选择单方面展示' });
    if (c.status !== 'waiting') return send(res, 400, { error: '这个案子已经开庭了' });
    // 单方面展示会把内容公开给全校，隐私必须由 AI 严格审核过；规则只能识别手机号、宿舍号这类固定格式，认不出真名
    if ((!c.privacy || c.privacy.by !== 'ai') && !process.env.ALLOW_SOLO_WITHOUT_AI) return send(res, 400, { error: 'AI 隐私审核暂时没连上，为了保护你和室友的隐私，暂时不能单方面展示，请稍后再试。' });
    c.solo = true;
    c.claimB = '';
    c.respondentId = null;
    await openCourt(c);
    return send(res, 200, publicCase(c, user));
  }

  // 报名当陪审员：写理由 + 勾客观承诺，AI 遴选
  if (c && method === 'POST' && parts[3] === 'apply') {
    if (!need()) return;
    const b = await body(req);
    const v = viewerOf(c, user);
    const demo = DEMO();
    if (c.status !== 'recruiting') return send(res, 400, { error: '这个案子现在不招陪审员了' });
    if (v.isMember || v.applied) return send(res, 400, { error: '你已经报过名了' });
    if (!demo && (v.isCreator || v.isRespondent)) return send(res, 400, { error: '当事人不能当本案的陪审员' });
    if (!b.pledge) return send(res, 400, { error: '请勾选客观承诺' });
    const reason = String(b.reason || '').trim().slice(0, 100);
    if (reason.length < 4) return send(res, 400, { error: '请写一句报名理由（至少 4 个字）' });
    const t = forFork(c);
    const app = { userId: user.id, reason, pledge: true, status: 'pending', at: new Date().toISOString() };
    t.jury.applications.push(app);
    await runSelection(t, app);
    save();
    return send(res, 200, publicCase(t, user));
  }

  // 接受系统的陪审邀请
  if (c && method === 'POST' && parts[3] === 'accept-invite') {
    if (!need()) return;
    const v = viewerOf(c, user);
    if (c.status !== 'recruiting' || v.isMember || !v.invited) return send(res, 400, { error: '这个邀请已经失效了' });
    const t = forFork(c);
    addMember(t, user.id, 'invite');
    save();
    return send(res, 200, publicCase(t, user));
  }

  // 陪审员投票（再投一次会覆盖上一次）
  if (c && method === 'POST' && parts[3] === 'votes') {
    if (!need()) return;
    const b = await body(req);
    if (c.status !== 'voting' && !(DEMO() && c.status === 'recruiting' && members(c).some((m) => m.userId === user.id))) return send(res, 400, { error: '现在还不能投票，等陪审席坐满' });
    if (!members(c).some((m) => m.userId === user.id)) return send(res, 403, { error: '只有本案陪审员可以投票。你可以围观、点赞，或者去报名' });
    b.choice = { mine: 'A', both: 'MID', other: 'B' }[b.choice] || b.choice; // 单方面展示的三个选项：你有道理 / 双方都有道理 / 换位想想
    if (!['A', 'MID', 'B'].includes(b.choice)) return send(res, 400, { error: '请先选一个选项' });
    const comment = String(b.comment || '').trim().slice(0, 80);
    const old = c.votes.find((v) => v.userId === user.id);
    if (old) Object.assign(old, { choice: b.choice, comment });
    else c.votes.push({ userId: user.id, choice: b.choice, comment, likes: 0, likedBy: [] });
    save();
    return send(res, 200, publicCase(c, user));
  }

  // 围观群众给陪审员意见点赞
  if (c && method === 'POST' && parts[3] === 'like') {
    if (!need()) return;
    const b = await body(req);
    const v = c.votes.find((x) => seatOf(c, x.userId) === +b.no);
    if (!v || v.userId === user.id) return send(res, 400, { error: '不能给自己点赞哦' });
    v.likedBy = v.likedBy || [];
    const i = v.likedBy.indexOf(user.id);
    if (i >= 0) v.likedBy.splice(i, 1);
    else v.likedBy.push(user.id);
    save();
    return send(res, 200, publicCase(c, user));
  }

  // 生成判决：投票席全部投完，或者创案人/演示模式手动触发（预置案例会复制一份，原案例保持可重复演示）
  if (c && method === 'POST' && parts[3] === 'verdict') {
    if (!need()) return;
    if (c.status === 'done') return send(res, 200, publicCase(c, user));
    const voted = c.votes.length;
    const all = voted >= SEATS || (members(c).length >= SEATS && voted >= members(c).length);
    if (!all && !(DEMO() && voted >= 1) && c.creatorId !== user.id) return send(res, 400, { error: `陪审团还没投完（${voted} / ${SEATS}）` });
    if (voted < 1) return send(res, 400, { error: '还没有人投票' });
    let target = c;
    if (c.seed) {
      target = clone(c);
      Object.assign(target, { id: newId(), no: String(db.nextNo++).padStart(4, '0'), seed: false, createdAt: new Date().toISOString(), creatorId: user.id, watchers: c.watchers });
      db.cases[target.id] = target;
    }
    await finalize(target);
    return send(res, 200, publicCase(target, user));
  }

  // 握手言和：A、B 各自确认
  if (c && method === 'POST' && parts[3] === 'reconcile') {
    if (!need()) return;
    const b = await body(req);
    if (c.status !== 'done') return send(res, 400, { error: '判决之后才能握手言和' });
    let who = c.creatorId === user.id ? 'A' : c.respondentId === user.id ? 'B' : null;
    if (DEMO() && b.demo && (b.who === 'A' || b.who === 'B')) who = b.who; // 演示捷径：模拟另一位室友也确认
    if (!who) return send(res, 403, { error: '只有案子的两位室友可以确认' });
    c.reconciled[who] = true;
    save();
    return send(res, 200, publicCase(c, user));
  }

  return send(res, 404, { error: '没有这个接口' });
}

// ---------------- 静态页面 ----------------

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: '页面不存在' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (d) => {
      s += d;
      if (s.length > 100000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(new Error('请求格式不对')); }
    });
  });
}

// 预置数据每次启动都覆盖成最新版本
for (const u of seed.SEED_USERS) db.users[u.id] = clone(u);
for (const c of seed.seedCases) {
  const cc = clone(c);
  if (cc.status === 'done') finishSeed(cc);
  db.cases[cc.id] = cc;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method === 'GET') return serveStatic(req, res, url);
      send(res, 405, { error: 'method not allowed' });
    } catch (e) {
      console.error(e);
      send(res, 500, { error: e.message });
    }
  })
  .listen(PORT, () => {
    console.log(`评评理已启动：http://localhost:${PORT}  模型：${MODEL}  ${hasKey() ? 'AI 已接通' : '未配置 LLM_API_KEY，使用规则兜底'}${DEMO() ? '  [演示模式]' : ''}`);
  });
