// 评评理 · 前端逻辑：把后端数据填进带 data-bind 的地方
// 视觉同学改样式不用动这个文件；只要保留 data-bind、id、name 就行。

(function () {
  const page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
  const params = new URLSearchParams(location.search);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const bind = (name) => $(`[data-bind="${name}"]`);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // 当前案子：网址里的 ?id=，否则用上次看的，否则用演示案
  function caseId() {
    const id = params.get('id') || store('lastCase') || 'demo';
    store('lastCase', id);
    return id;
  }
  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (_) { return null; }
  }

  async function api(path, data) {
    const res = await fetch('/api' + path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) {
      location.href = 'login.html?next=' + encodeURIComponent(location.pathname.slice(1) + location.search);
      throw new Error(json.error || '请先登录');
    }
    if (!res.ok) throw new Error(json.error || '出错了，请重试');
    return json;
  }

  // 全屏“AI 正在工作”提示
  function busy(text) {
    let el = $('#ppl-busy');
    if (!text) return el && el.remove();
    if (!el) {
      el = document.createElement('div');
      el.id = 'ppl-busy';
      el.style.cssText = 'position:fixed;inset:0;z-index:99;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;text-align:center;padding:24px';
      document.body.appendChild(el);
    }
    el.innerHTML = `<div><div style="font-size:40px;animation:ppl-swing 1s ease-in-out infinite">🔨</div><p style="margin-top:12px">${esc(text)}</p></div><style>@keyframes ppl-swing{0%,100%{transform:rotate(-20deg)}50%{transform:rotate(20deg)}}</style>`;
  }

  function ratioBar(ratio) {
    return Object.entries(ratio).map(([id, v]) => `<span class="${id}" style="width:${v}%">${v >= 8 ? `${id} ${v}%` : ''}</span>`).join('');
  }
  function ratioText(ratio) {
    return Object.entries(ratio).map(([id, v]) => `${id} ${v}%`).join(' / ');
  }
  function ago(iso) {
    const m = (Date.now() - new Date(iso)) / 60000;
    if (m < 60) return `${Math.max(1, Math.round(m))} 分钟前`;
    if (m < 1440) return `${Math.round(m / 60)} 小时前`;
    if (m < 2880) return '昨天';
    return `${Math.round(m / 1440)} 天前`;
  }
  function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n; }

  // 把站内链接带上 ?id=，这样在各页之间跳转不会丢案子
  function linkCase(id) {
    $$('a[href$="dossier.html"], a[href$="jury.html"], a[href$="verdict.html"]').forEach((a) => {
      if (!a.closest('[data-bind="feed"]')) a.href = a.getAttribute('href') + '?id=' + id;
    });
  }

  // 顶栏右侧：登录状态
  async function topbarUser() {
    const inner = $('.topbar .inner');
    if (!inner) return;
    const { user } = await api('/me');
    const next = encodeURIComponent(location.pathname.slice(1) + location.search);
    inner.insertAdjacentHTML('beforeend', user
      ? `<a class="me-chip" data-bind="user-chip" href="me.html"><span class="avatar">${esc(user.nickname.slice(0, 1))}</span><span>${esc(user.nickname)}</span></a>`
      : `<a class="me-chip btn" data-bind="user-chip" href="login.html?next=${next}">登录 / 注册</a>`);
  }
  function needLogin(me) {
    if (me.user) return false;
    location.href = 'login.html?next=' + encodeURIComponent(location.pathname.slice(1) + location.search);
    return true;
  }
  function toggleStyle() {
    if ($('#ppl-toggle-css')) return;
    document.head.insertAdjacentHTML('beforeend', '<style id="ppl-toggle-css">.toggle{cursor:pointer}.toggle.off{background:var(--line)}.toggle.off::after{right:auto;left:3px}</style>');
  }

  // ---------------- 注册 / 登录 ----------------
  function login() {
    const form = $('form');
    const next = params.get('next') || 'index.html';
    const seg = $$('.seg a', form);
    const codeBox = bind('demo-code');
    const submit = $('button[type=submit]', form);
    let sent = null; // 本次发出的验证码对应的邮箱
    // 注册专用的字段：验证码提示之后、按钮之前的所有元素
    const regOnly = [];
    for (let el = codeBox.nextElementSibling; el && el !== submit; el = el.nextElementSibling) regOnly.push(el);
    codeBox.textContent = '演示版不发真邮件：点「发验证码」后，验证码会直接显示在这里。';

    seg.forEach((a, i) => a.addEventListener('click', (e) => {
      e.preventDefault();
      seg.forEach((x) => x.classList.toggle('on', x === a));
      regOnly.forEach((el) => (el.style.display = i === 0 ? '' : 'none'));
      submit.textContent = i === 0 ? '进入评评理' : '登录';
    }));

    async function sendCode() {
      const email = form.email.value.trim();
      const r = await api('/send-code', { email });
      sent = email;
      if (r.demoCode) {
        form.code.value = r.demoCode;
        codeBox.textContent = `演示版：验证码是 ${r.demoCode}（已自动填好）`;
      } else {
        codeBox.textContent = '验证码已发送到你的学校邮箱';
      }
    }
    const sendBtn = $$('a.btn', form).find((a) => a.textContent.includes('验证码'));
    if (sendBtn) sendBtn.addEventListener('click', (e) => { e.preventDefault(); sendCode().catch((err) => alert(err.message)); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        // 演示捷径：没点“发验证码”就直接进入时，自动拿一个
        if (sent !== form.email.value.trim()) await sendCode();
        const fd = new FormData(form);
        await api('/register', {
          email: fd.get('email'),
          code: fd.get('code'),
          nickname: fd.get('nickname'),
          college: fd.get('college'),
          grade: fd.get('grade'),
          jurorOptIn: fd.get('jurorOptIn') === 'on',
        });
        location.href = /^[\w.\-]+\.html/.test(next) ? next : 'index.html';
      } catch (err) { alert(err.message); }
    });
  }

  // ---------------- 列表行（大厅 / 我的共用） ----------------
  const STATUS = {
    waiting: ['待应诉', ''],
    drafting: ['书记员整理中', 'blue'],
    jury: ['陪审中', 'blue'],
    deliberating: ['法官撰写中', 'blue'],
    done: ['已判决', 'green'],
  };
  const short = (r) => Object.entries(r).map(([k, v]) => `${k} ${v}`).join(' / ');
  const empty = (text) => `<p class="muted" style="padding:12px 0">${text}</p>`;

  // ---------------- 陪审大厅 ----------------
  async function hall() {
    const me = await api('/me');
    if (needLogin(me)) return;
    const invites = me.invites;
    const badge = $('h3 .badge');
    if (badge) badge.textContent = invites.length;
    bind('invites').innerHTML = invites.length
      ? invites.map((c) => `
        <a class="list-item" href="jury.html?id=${esc(c.id)}">
          <span class="avatar">⚖️</span>
          <span class="main"><b>《${esc(c.course)}》${esc(c.assignment)}</b><span class="muted">你是第 ${c.votes + 1} 号陪审员 · 已有 ${c.votes} 人投票 · 还剩 23 小时</span></span>
          <span class="btn primary">去陪审</span>
        </a>`).join('')
      : empty('暂时没有抽到你。') + '<p class="demo-note">演示用：<a href="jury.html?id=demo"><u>去陪审《传播学概论》期中展示案 →</u></a></p>';

    const h = me.juryHistory;
    bind('jury-history').innerHTML = h.length
      ? h.map((c) => `
        <a class="list-item" href="${c.status === 'done' ? 'verdict' : 'jury'}.html?id=${esc(c.id)}">
          <span class="main"><b>《${esc(c.course)}》${esc(c.assignment)}</b><span class="muted">我投的：${short(c.myVote)}${c.ratio ? ` · 最终判决：${short(c.ratio)}` : ' · 等其他陪审员'}</span></span>
          <span class="badge ${c.close ? 'green' : ''}">${c.close === null ? '陪审中' : c.close ? '和判决接近' : '已结案'}</span>
        </a>`).join('')
      : empty('还没有陪审过。');

    bind('juror-stats').innerHTML = `
      <div><b>${me.stats.juried}</b><span class="muted">陪审次数</span></div>
      <div><b>${me.stats.closeRate === null ? '—' : me.stats.closeRate + '%'}</b><span class="muted">和判决接近</span></div>
      <div><b>${me.stats.cases}</b><span class="muted">我的案子</span></div>`;

    toggleStyle();
    const t = $('.switch .toggle');
    if (t) {
      t.classList.toggle('off', !me.user.juror);
      t.addEventListener('click', async () => {
        const r = await api('/me', { juror: t.classList.contains('off') });
        t.classList.toggle('off', !r.user.juror);
      });
    }
  }

  // ---------------- 我的 ----------------
  async function me() {
    const m = await api('/me');
    if (needLogin(m)) return;
    const u = m.user;

    const rBadge = $$('h3 .badge')[0];
    if (rBadge) rBadge.textContent = m.respondInvites.length;
    bind('respond-invites').innerHTML = m.respondInvites.length ? '' : empty('暂时没有组员邀请你应诉。');

    bind('my-cases').innerHTML = m.myCases.length
      ? m.myCases.map((c) => {
        const [label, color] = STATUS[c.status] || ['', ''];
        const href = c.status === 'done' ? 'verdict.html' : c.status === 'waiting' ? 'file.html' : 'dossier.html';
        const sub = c.ratio ? `判决：${short(c.ratio)}` : c.status === 'jury' ? `陪审 ${c.votes} / 7` : c.status === 'waiting' ? '等组员同意' : '';
        return `<a class="list-item" href="${href}?id=${esc(c.id)}">
          <span class="main"><b>《${esc(c.course)}》${esc(c.assignment)}</b><span class="muted">我是原告 A · ${sub}</span></span>
          <span class="badge ${color}">${label}</span>
        </a>`;
      }).join('')
      : empty('还没有立过案。');

    const cards = $$('aside .card');
    if (cards[0]) cards[0].innerHTML = `
      <div class="row"><span class="avatar lg">${esc(u.nickname.slice(0, 1))}</span><div><b>${esc(u.nickname)}</b><p class="muted">${esc([u.college, u.grade].filter(Boolean).join(' · ') || u.email)} · 已验证</p></div></div>
      <div class="stats3" style="margin-top:12px">
        <div><b>${m.stats.cases}</b><span class="muted">我的案子</span></div>
        <div><b>${m.stats.juried}</b><span class="muted">陪审次数</span></div>
        <div><b>${m.stats.published}</b><span class="muted">公开判例</span></div>
      </div>
      <a class="btn block" style="margin-top:12px" href="hall.html">去陪审大厅 →</a>`;
    if (cards[1]) {
      const rows = $$('.stat', cards[1]);
      const juror = rows.find((r) => r.textContent.includes('陪审邀请'));
      if (juror) {
        const val = juror.lastElementChild;
        val.textContent = u.juror ? '开' : '关';
        val.style.cursor = 'pointer';
        val.addEventListener('click', async () => {
          const r = await api('/me', { juror: val.textContent !== '开' });
          val.textContent = r.user.juror ? '开' : '关';
        });
      }
      const out = $$('a', cards[1]).find((a) => a.textContent.includes('退出'));
      if (out) out.addEventListener('click', async (e) => { e.preventDefault(); await api('/logout', {}); location.href = 'login.html'; });
    }
  }

  // ---------------- 判例广场 ----------------
  async function index() {
    const { items, invite } = await api('/feed');
    const feed = bind('feed');
    $$('.card', feed).forEach((el) => el.remove());
    feed.insertAdjacentHTML('beforeend', items.map((c) => `
      <a class="card" href="verdict.html?id=${esc(c.id)}" style="display:block">
        <div class="row"><span class="tag">${esc(c.course)}</span><span class="spacer"></span><span class="muted">${ago(c.createdAt)}</span></div>
        <h3>${esc(c.title)}</h3>
        <div class="ratio" style="margin:8px 0">${ratioBar(c.ratio)}</div>
        <p class="quote">${esc(c.quote)}</p>
        <div class="actions"><span>👀 ${fmt(c.stats.views)} 围观</span><span>🔨 同判 ${fmt(c.stats.agree)}</span><span>💬 ${fmt(c.stats.comments)}</span></div>
      </a>`).join(''));
    const inv = bind('invite');
    if (inv && invite) {
      inv.href = `jury.html?id=${invite.id}`;
      const b = $('b', inv);
      if (b) b.textContent = invite.forYou ? '⚖️ 你被抽中担任陪审员' : '⚖️ 有案子正在等陪审员';
      const muted = $('.muted', inv);
      if (muted) muted.textContent = `案件：《${invite.course}》${invite.assignment} · 还剩 23 小时`;
    }
  }

  // ---------------- 立案 ----------------
  function file() {
    const form = $('#case-form');
    const status = bind('respond-status');
    let current = null;

    // “＋ 添加组员”
    const add = $$('a', form).find((a) => a.textContent.includes('添加组员'));
    if (add) add.addEventListener('click', (e) => {
      e.preventDefault();
      const n = $$('input[name^="m_"]', form).length;
      const id = 'ABCDE'[n];
      if (!id) return alert('最多 5 位组员');
      add.insertAdjacentHTML('beforebegin', `<div class="row" style="margin-bottom:6px"><span class="who ${id}">${id}</span><input type="text" name="m_${id}" placeholder="组员昵称" style="flex:1"></div>`);
    });

    function renderStatus(c) {
      const rows = c.members.filter((m) => m.id !== 'A').map((m, i) => `<div class="stat"><span><span class="who ${m.id}">${m.id}</span> ${esc(names[i + 1] || '')}</span><span>${m.agreed ? '✅ 已同意' : '⏳ 等待中'}</span></div>`).join('');
      status.innerHTML = `<h3>应诉状态</h3><p class="muted">案号 2026 评字第 ${esc(c.no)} 号。双方都同意，才会开庭。</p>${rows}<p class="demo-note">演示用：<a href="#" id="agree-all"><u>模拟组员全部同意 → 开庭</u></a></p>`;
      $('#agree-all').addEventListener('click', async (e) => {
        e.preventDefault();
        busy('组员已全部同意，AI 书记员正在整理卷宗…（约 10~30 秒）');
        try {
          const done = await api(`/cases/${c.id}/agree`, {});
          location.href = `dossier.html?id=${done.id}`;
        } catch (err) { busy(); alert(err.message); }
      });
    }

    let names = [];
    // 演示捷径没立案就点：直接用演示案
    const shortcut = $('a[href="dossier.html"]', status);
    if (shortcut) shortcut.href = 'dossier.html?id=demo';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      names = $$('input[name^="m_"]', form).map((i) => i.value.trim()).filter(Boolean);
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      btn.textContent = '提交中…';
      try {
        current = await api('/cases', {
          course: fd.get('course'),
          assignment: fd.get('assignment'),
          members: names,
          chat: fd.get('chat'),
          doc_log: fd.get('doc_log'),
          claim: fd.get('claim'),
        });
        store('lastCase', current.id);
        renderStatus(current);
        btn.textContent = '✅ 已立案，等待组员应诉';
        status.scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = '提交立案，邀请组员应诉';
      }
    });
  }

  // ---------------- 卷宗 ----------------
  async function dossier() {
    const id = caseId();
    const c = await api(`/cases/${id}`);
    linkCase(c.id);
    if (!c.dossier) {
      bind('summary').textContent = '组员还没有全部同意应诉，卷宗尚未生成。';
      return;
    }
    const d = c.dossier;
    const tags = $$('section.card .tag');
    if (tags[0]) tags[0].textContent = `案号 2026 评字第 ${c.no} 号`;
    if (tags[1]) tags[1].textContent = `${c.course} · ${c.assignment}`;
    bind('summary').textContent = d.summary;
    bind('persons').innerHTML = d.persons.map((p) => `
      <div class="card">
        <div class="row"><span class="who ${p.id}">${p.id}</span><b>${esc(p.role)}</b></div>
        <div class="stat"><span>承诺</span><span>${esc(p.promised)}</span></div>
        <div class="stat"><span>实际完成</span><span>${esc(p.delivered)}</span></div>
        <div class="stat"><span>被催次数</span><span${p.nudged ? ' style="color:var(--accent)"' : ''}>${p.nudged}</span></div>
        <div class="stat"><span>文档修改</span><span>${esc(p.edits)}</span></div>
        ${p.quote ? `<p class="quote">“${esc(p.quote)}”</p>` : ''}
      </div>`).join('');
    bind('timeline').innerHTML = d.timeline.map((t) => `<li${t.warn ? ' class="warn"' : ''}><time>${esc(t.time)}</time>${esc(t.text)}</li>`).join('');
    // 双方说法
    const sides = $$('aside .card').find((el) => el.textContent.includes('双方说法'));
    if (sides) sides.innerHTML = `<h3>双方说法</h3><p><b>${c.plaintiff}：</b>${esc(c.claim || '（未填写）')}</p><p><b>被告：</b>${c.defense ? esc(c.defense) : '<span class="muted">（被告补充的说法会显示在这里）</span>'}</p>`;
    if (d.by === 'rule') bind('summary').insertAdjacentHTML('afterend', '<p class="hint">（AI 暂时没连上，这份卷宗由规则自动统计生成）</p>');
  }

  // ---------------- 陪审 ----------------
  async function jury() {
    const id = caseId();
    const c = await api(`/cases/${id}`);
    linkCase(c.id);
    if (c.status === 'done') return (location.href = `verdict.html?id=${c.id}`);
    const ids = c.members.map((m) => m.id);
    const seat = c.votes.length + 1;
    const tag = $('.card .tag');
    if (tag) tag.textContent = `你是本案第 ${seat} 号陪审员`;

    // 按组员人数生成滑块
    const form = $('#vote');
    $$('.slider', form).forEach((el) => el.remove());
    const even = Math.floor(100 / ids.length);
    const h2 = $('h2', form);
    h2.insertAdjacentHTML('afterend', ids.map((m, i) => {
      const v = even + (i === 0 ? 100 - even * ids.length : 0);
      return `<div class="slider"><span class="who ${m}">${m}</span><input type="range" min="0" max="100" value="${v}" data-m="${m}"><b data-out="${m}">${v}%</b></div>`;
    }).join(''));
    const inputs = $$('input[type=range]', form);
    const sum = $('#sum');
    const update = () => {
      let total = 0;
      inputs.forEach((i) => { total += +i.value; $(`[data-out=${i.dataset.m}]`).textContent = i.value + '%'; });
      sum.textContent = total + '%';
      sum.classList.toggle('bad', total !== 100);
      return total;
    };
    inputs.forEach((i) => i.addEventListener('input', update));
    update();

    // 进度
    const prog = bind('jury-progress');
    const total = c.juryProgress.total;
    prog.innerHTML = `<h3>陪审进度 ${c.votes.length} / ${total}</h3><div class="jurors" style="margin:8px 0">${Array.from({ length: total }, (_, i) => `<span${i < c.votes.length ? ' class="voted"' : ''}>${i + 1}</span>`).join('')}</div><p class="muted">${total} 票到齐后，AI 法官开始写判决书。投票前看不到别人的选择。</p>`;

    // 卷宗速览
    const quick = $$('aside .card').find((el) => el.textContent.includes('卷宗速览'));
    if (quick && c.dossier) quick.innerHTML = '<h3>本案卷宗速览</h3>' + c.dossier.persons.map((p) => `<div class="stat"><span><span class="who ${p.id}">${p.id}</span> ${esc(p.role)}</span><span>改 ${esc(p.edits)}${p.nudged ? ` · 被催 ${p.nudged} 次` : ''}</span></div>`).join('');

    // 投票按钮
    const btn = $$('.btn.primary', form).pop();
    const v = c.viewer;
    const asDemoJuror = Boolean(v && (v.isCreator || v.hasVoted));
    if (asDemoJuror) {
      btn.insertAdjacentHTML('afterend', `<p class="demo-note">${v.isCreator ? '这是你自己的案子，正式使用时不能自己陪审。' : '你已经投过这个案子了。'}演示用：点上面按钮会以第 ${seat} 号陪审员的身份投票。</p>`);
    }
    btn.removeAttribute('href');
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (update() !== 100) return alert('比例合计要等于 100%');
      const ratio = Object.fromEntries(inputs.map((i) => [i.dataset.m, +i.value]));
      const last = c.votes.length + 1 >= total;
      busy(last ? '7 票到齐！AI 法官正在写判决书…（约 10~30 秒）' : '投票中…');
      try {
        const after = await api(`/cases/${c.id}/votes`, { ratio, comment: $('input[name=comment]', form).value, asDemoJuror });
        store('lastCase', after.id);
        location.href = after.status === 'done' ? `verdict.html?id=${after.id}` : `jury.html?id=${after.id}`;
      } catch (err) { busy(); alert(err.message); }
    });
  }

  // ---------------- 判决书 ----------------
  async function verdict() {
    const id = caseId();
    const c = await api(`/cases/${id}`);
    linkCase(c.id);
    if (!c.verdict) {
      bind('verdict-text').innerHTML = '<h1>判决书尚未作出</h1><p class="muted">陪审团还没投完票。</p>';
      return;
    }
    const v = c.verdict;
    bind('ratio').innerHTML = ratioBar(v.ratio);
    const paras = v.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('');
    bind('verdict-text').innerHTML = `<h1>民 事 判 决 书</h1><p class="no">（2026）评字第 ${esc(c.no)} 号 · ${esc(c.course.replace(/ · .*/, ''))}贡献纠纷案</p>${paras}<div class="seal"><b>评评理<br>AI 法庭</b></div>`;

    const comments = c.votes.filter((x) => x.comment);
    const box = bind('jury-comments');
    if (box) box.innerHTML = '<h3>陪审团意见</h3>' + (comments.length ? comments.map((x) => `<p class="quote">${x.seat} 号：${esc(x.comment)}</p>`).join('') : '<p class="muted">陪审员没有留言。</p>');

    const btns = $$('a.btn');
    const copy = btns.find((a) => a.textContent.includes('复制比例'));
    if (copy) copy.addEventListener('click', async (e) => {
      e.preventDefault();
      const text = `${c.course}《${c.assignment}》组内贡献比例：${ratioText(v.ratio)}`;
      try { await navigator.clipboard.writeText(text); copy.textContent = '✅ 已复制'; } catch (_) { prompt('复制下面这段：', text); }
    });
    const pub = btns.find((a) => a.textContent.includes('公开到判例广场'));
    if (pub) {
      if (c.public) pub.textContent = '✅ 已公开到判例广场';
      pub.addEventListener('click', async (e) => {
        e.preventDefault();
        await api(`/cases/${c.id}/publish`, {});
        pub.textContent = '✅ 已公开到判例广场';
      });
    }
    const appeal = btns.find((a) => a.textContent.includes('上诉'));
    if (appeal) appeal.addEventListener('click', (e) => { e.preventDefault(); alert('上诉功能开发中：将重新抽取 7 位陪审员复审。'); });
    const share = btns.find((a) => a.textContent.includes('分享图'));
    if (share) share.addEventListener('click', (e) => { e.preventDefault(); alert('分享图功能开发中'); });
  }

  const pages = { index, file, dossier, jury, verdict, login, hall, me };
  topbarUser().catch((err) => console.error(err));
  if (pages[page]) {
    Promise.resolve(pages[page]()).catch((err) => console.error(err));
  }
})();
