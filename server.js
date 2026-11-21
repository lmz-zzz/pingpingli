// 评评理 · 后端
// 零依赖：只用 Node.js 自带的模块，`node server.js` 就能跑。
// 页面放在 public/，案子存在 data/cases.json（一个案子一条记录）。

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateDossier, generateVerdict, medianRatio } = require('./lib/ai');
const { MODEL, hasKey } = require('./lib/llm');
const seed = require('./lib/seed');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'cases.json');
const JURY_SIZE = 7;
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

// ---------------- 存储 ----------------

let db = { nextNo: 43, cases: {}, users: {}, sessions: {} };
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
} catch (_) {}
// 预置数据每次启动都覆盖成最新版本
db.cases.demo = JSON.parse(JSON.stringify(seed.demo));
for (const c of seed.feed) db.cases[c.id] = JSON.parse(JSON.stringify(c));

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 1));
}

function newId() {
  return Math.random().toString(36).slice(2, 8);
}

// ---------------- 账号 ----------------
// 学校邮箱 + 验证码注册/登录（无密码）；登录后用 HttpOnly cookie 记住身份。
// 同一个人既能立案，也能被抽中当陪审员。学院+年级用来回避：不会把案子派给同班同学。
// 演示版不真发邮件：验证码直接返回给页面显示。设 DEMO_MODE=off 时只接受真实发出的码（需另接邮件服务）。

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
  return u && { id: u.id, nickname: u.nickname, email: u.email.replace(/^(.{2}).*(@.*)$/, '$1***$2'), college: u.college, grade: u.grade, juror: u.juror, verified: true };
}
function sameClass(a, b) {
  return a && b && a.college && a.college === b.college && a.grade && a.grade === b.grade;
}

// ---------------- 匿名化 ----------------

// 把群聊、文档记录、诉求里的真名替换成 A/B/C
function anonymize(text, members) {
  let out = String(text || '');
  const named = members.filter((m) => m.name && !/^[A-E]$/.test(m.name) && !/^我/.test(m.name));
  named.sort((a, b) => b.name.length - a.name.length); // 长名字先换，避免“小周周”被换成“B周”
  for (const m of named) out = out.split(m.name).join(m.id);
  // 原告自己可能填“我”，群聊里“[时间] 我：……”这种发言人位置也换成 A
  out = out.replace(/^(\s*\[?[\d\-\/ :]*\]?\s*)我(\s*[：:])/gm, `$1${members[0].id}$2`);
  return out;
}

// 返回给前端前去掉真名
function publicCase(c, user) {
  const { chat, doc_log, creatorId, invited, ...rest } = c;
  return {
    ...rest,
    members: c.members.map((m) => ({ id: m.id, agreed: m.agreed })),
    votes: c.votes.map((v, i) => ({ seat: i + 1, ratio: v.ratio, comment: v.comment, preset: !!v.preset })),
    juryProgress: { voted: c.votes.length, total: JURY_SIZE },
    viewer: user
      ? { isCreator: creatorId === user.id, invited: (invited || []).includes(user.id), hasVoted: c.votes.some((v) => v.userId === user.id) }
      : null,
  };
}

function caseCard(c) {
  return { id: c.id, no: c.no, course: c.course, assignment: c.assignment, status: c.status, createdAt: c.createdAt, votes: c.votes.length, ratio: c.verdict?.ratio || null, title: c.verdict?.title || null };
}

// ---------------- 业务 ----------------

async function openCourt(c) {
  c.status = 'drafting';
  save();
  const d = await generateDossier(c);
  const { mock_jurors, ...dossier } = d;
  c.dossier = dossier;
  // 演示：预置 6 票（标记为 preset），现场投第 7 票
  c.votes = mock_jurors.slice(0, JURY_SIZE - 1).map((j) => ({ ratio: j.ratio, comment: j.comment, preset: true }));
  // 从注册且愿意当陪审员的同学里随机抽 7 位（排除立案人）发邀请
  const creator = db.users[c.creatorId];
  const pool = Object.values(db.users).filter((u) => u.juror !== false && u.id !== c.creatorId && !sameClass(u, creator)).map((u) => u.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  c.invited = pool.slice(0, JURY_SIZE);
  c.status = 'jury';
  save();
}

async function closeJury(c) {
  const ids = c.members.map((m) => m.id);
  const ratio = medianRatio(c.votes, ids);
  c.status = 'deliberating';
  save();
  const v = await generateVerdict(c, ratio);
  c.verdict = { ...v, ratio };
  c.status = 'done';
  save();
}

// ---------------- 路由 ----------------

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'cases', id, action]
  const method = req.method;
  const user = currentUser(req);

  // ---- 账号 ----
  if (method === 'POST' && url.pathname === '/api/send-code') {
    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return send(res, 400, { error: '请填写正确的学校邮箱' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    codes[email] = { code, exp: Date.now() + 10 * 60 * 1000 };
    return send(res, 200, { ok: true, demoCode: process.env.DEMO_MODE === 'off' ? undefined : code });
  }
  // 注册和登录是同一个动作：邮箱+验证码通过后，没账号就建，有就登录
  if (method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    const rec = codes[email];
    if (!rec || rec.exp < Date.now() || rec.code !== String(b.code || '').trim()) return send(res, 400, { error: '验证码不对或已过期，请重新获取' });
    delete codes[email];
    let u = Object.values(db.users).find((x) => x.email === email);
    if (!u) {
      u = { id: newId(), email, nickname: '', college: '', grade: '', juror: true, createdAt: new Date().toISOString() };
      db.users[u.id] = u;
    }
    if (b.nickname) u.nickname = String(b.nickname).trim().slice(0, 20);
    if (!u.nickname) u.nickname = email.split('@')[0].slice(0, 20);
    if (b.college) u.college = String(b.college).slice(0, 30);
    if (b.grade) u.grade = String(b.grade).slice(0, 20);
    if (typeof b.jurorOptIn === 'boolean') u.juror = b.jurorOptIn;
    login(res, u);
    return send(res, 200, { user: publicUser(u) });
  }
  if (method === 'POST' && url.pathname === '/api/logout') {
    res.setHeader('Set-Cookie', 'ppl=; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }
  // 我的：我立的案 + 邀请我陪审的案 + 我投过的案
  if (method === 'GET' && url.pathname === '/api/me') {
    if (!user) return send(res, 200, { user: null });
    const all = Object.values(db.cases).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const myCases = all.filter((c) => c.creatorId === user.id).map(caseCard);
    const invites = all.filter((c) => c.status === 'jury' && (c.invited || []).includes(user.id) && !c.votes.some((v) => v.userId === user.id)).map(caseCard);
    // 陪审记录：我投的比例 vs 最终判决；每人差距都在 10 个百分点以内算“和判决接近”
    const juryHistory = all
      .filter((c) => c.votes.some((v) => v.userId === user.id))
      .map((c) => {
        const mine = c.votes.find((v) => v.userId === user.id).ratio;
        const final = c.verdict?.ratio || null;
        const close = final ? Object.keys(final).every((k) => Math.abs((mine[k] || 0) - final[k]) <= 10) : null;
        return { ...caseCard(c), myVote: mine, close };
      });
    const judged = juryHistory.filter((h) => h.close !== null);
    return send(res, 200, {
      user: publicUser(user),
      myCases,
      invites,
      juryHistory,
      juried: juryHistory,
      respondInvites: [], // 演示版组员不绑定账号；“等我应诉”暂用示例
      stats: {
        cases: myCases.length,
        juried: juryHistory.length,
        published: all.filter((c) => c.creatorId === user.id && c.public).length,
        closeRate: judged.length ? Math.round((judged.filter((h) => h.close).length / judged.length) * 100) : null,
      },
    });
  }
  if (method === 'POST' && url.pathname === '/api/me') {
    if (!user) return send(res, 401, { error: '请先登录' });
    const b = await body(req);
    if (typeof b.juror === 'boolean') user.juror = b.juror;
    if (b.college !== undefined) user.college = String(b.college).slice(0, 30);
    if (b.grade !== undefined) user.grade = String(b.grade).slice(0, 20);
    save();
    return send(res, 200, { user: publicUser(user) });
  }

  if (method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, { ok: true, model: MODEL, aiReady: hasKey() });
  }

  // 判例广场：已公开的判决，最新在前；顺带给出一个等你陪审的案子
  if (method === 'GET' && url.pathname === '/api/feed') {
    const all = Object.values(db.cases);
    const items = all
      .filter((c) => c.public && c.verdict)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => ({
        id: c.id,
        course: c.course,
        title: c.verdict.title,
        ratio: c.verdict.ratio,
        quote: c.votes.find((v) => v.comment)?.comment || '',
        createdAt: c.createdAt,
        stats: c.stats,
      }));
    const mine = user && all.filter((c) => c.status === 'jury' && (c.invited || []).includes(user.id) && !c.votes.some((v) => v.userId === user.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const pending = mine || all.filter((c) => c.status === 'jury' && c.id !== 'demo' && c.creatorId !== user?.id && !c.votes.some((v) => user && v.userId === user.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || db.cases.demo;
    return send(res, 200, { items, user: publicUser(user), invite: { id: pending.id, course: pending.course, assignment: pending.assignment, forYou: Boolean(mine) } });
  }

  // 立案
  if (method === 'POST' && parts.length === 2 && parts[1] === 'cases') {
    if (!user) return send(res, 401, { error: '请先登录再立案' });
    const b = await body(req);
    const members = (Array.isArray(b.members) ? b.members : [])
      .slice(0, LETTERS.length)
      .map((name, i) => ({ id: LETTERS[i], name: String(name || '').slice(0, 20), agreed: i === 0 }));
    if (members.length < 2) return send(res, 400, { error: '至少要有 2 位组员' });
    if (!String(b.chat || '').trim()) return send(res, 400, { error: '请粘贴群聊记录' });
    const c = {
      id: newId(),
      no: String(db.nextNo++).padStart(4, '0'),
      createdAt: new Date().toISOString(),
      course: String(b.course || '未命名课程').slice(0, 40),
      assignment: String(b.assignment || '小组作业').slice(0, 80),
      plaintiff: 'A',
      creatorId: user.id,
      invited: [],
      members,
      chat: anonymize(String(b.chat).slice(0, 20000), members),
      doc_log: anonymize(String(b.doc_log || '').slice(0, 5000), members),
      claim: anonymize(String(b.claim || '').slice(0, 500), members),
      defense: '',
      status: 'waiting',
      dossier: null,
      votes: [],
      verdict: null,
      public: false,
      stats: { views: 0, agree: 0, comments: 0 },
    };
    db.cases[c.id] = c;
    save();
    return send(res, 200, publicCase(c, user));
  }

  const c = parts[1] === 'cases' && parts[2] ? db.cases[parts[2]] : null;
  if (parts[1] === 'cases' && parts[2] && !c) return send(res, 404, { error: '案子不存在' });

  if (c && method === 'GET' && parts.length === 3) {
    return send(res, 200, publicCase(c, user));
  }

  // 组员同意应诉（演示里“模拟全部同意”会一次把所有人都设为同意），全部同意后开庭、生成卷宗
  if (c && method === 'POST' && parts[3] === 'agree') {
    const b = await body(req);
    if (b.defense) c.defense = anonymize(String(b.defense).slice(0, 500), c.members);
    if (b.member) {
      const m = c.members.find((x) => x.id === b.member);
      if (m) m.agreed = true;
    } else {
      c.members.forEach((m) => (m.agreed = true));
    }
    save();
    if (c.members.every((m) => m.agreed) && c.status === 'waiting') await openCourt(c);
    return send(res, 200, publicCase(c, user));
  }

  // 陪审员投票；第 7 票到齐后写判决书
  if (c && method === 'POST' && parts[3] === 'votes') {
    if (!user) return send(res, 401, { error: '请先登录再陪审' });
    if (c.status !== 'jury') return send(res, 400, { error: '这个案子现在不能投票' });
    const b = await body(req);
    // 演示模式下允许立案人点“演示用”按钮替陪审员投第 7 票，录屏不用来回切账号；设 DEMO_MODE=off 可关闭
    const demoVote = b.asDemoJuror && process.env.DEMO_MODE !== 'off';
    if (!demoVote && c.creatorId === user.id) return send(res, 400, { error: '不能给自己的案子当陪审员' });
    if (!demoVote && c.votes.some((v) => v.userId === user.id)) return send(res, 400, { error: '你已经投过票了' });
    const ids = c.members.map((m) => m.id);
    const ratio = {};
    let sum = 0;
    for (const id of ids) {
      ratio[id] = Math.max(0, Math.min(100, Math.round(+b.ratio?.[id] || 0)));
      sum += ratio[id];
    }
    if (sum !== 100) return send(res, 400, { error: `比例合计要等于 100%，现在是 ${sum}%` });
    // demo 案永远停在 6 票：投票时复制一份新案子，方便反复演示
    let target = c;
    if (c.id === 'demo') {
      target = JSON.parse(JSON.stringify(c));
      target.id = newId();
      target.no = String(db.nextNo++).padStart(4, '0');
      target.createdAt = new Date().toISOString();
      db.cases[target.id] = target;
    }
    target.votes.push({ ratio, comment: String(b.comment || '').slice(0, 60), userId: demoVote ? 'demo-juror' : user.id });
    save();
    if (target.votes.length >= JURY_SIZE) await closeJury(target);
    return send(res, 200, publicCase(target, user));
  }

  // 公开到判例广场 / 围观点“同判”
  if (c && method === 'POST' && parts[3] === 'publish') {
    if (!c.verdict) return send(res, 400, { error: '还没有判决' });
    if (!user || user.id !== c.creatorId) return send(res, 403, { error: '只有立案人可以公开' });
    c.public = true;
    save();
    return send(res, 200, publicCase(c, user));
  }
  if (c && method === 'POST' && parts[3] === 'agree-verdict') {
    c.stats.agree++;
    save();
    return send(res, 200, { agree: c.stats.agree });
  }

  return send(res, 404, { error: '没有这个接口' });
}

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
    console.log(`评评理已启动：http://localhost:${PORT}  模型：${MODEL}  ${hasKey() ? 'AI 已接通' : '未配置 LLM_API_KEY，使用规则兜底'}`);
  });
