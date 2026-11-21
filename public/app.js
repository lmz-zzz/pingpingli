// 评评理 · 前端逻辑：把后端数据填进带 data-bind 的地方
// 视觉同学改样式不用动这个文件；只要保留 data-bind、id、name 就行。

(function () {
  const page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
  const params = new URLSearchParams(location.search);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const bind = (name) => $(`[data-bind="${name}"]`);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const here = () => encodeURIComponent(location.pathname.slice(1) + location.search);
  const CHOICE = { A: '支持 A', MID: '各退一步', B: '支持 B' };

  async function api(path, data) {
    const res = await fetch('/api' + path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) {
      location.href = 'login.html?next=' + here();
      throw new Error(json.error || '请先登录');
    }
    if (!res.ok) throw new Error(json.error || '出错了，请重试');
    return json;
  }
  const fail = (err) => { busy(); alert(err.message); };

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
    el.innerHTML = `<div><div style="font-size:40px;animation:ppl-swing 1s ease-in-out infinite">🍉</div><p style="margin-top:12px">${esc(text)}</p></div><style>@keyframes ppl-swing{0%,100%{transform:rotate(-15deg)}50%{transform:rotate(15deg)}}</style>`;
  }

  // 三色票型条
  function bar(pct, big) {
    if (!pct || !pct.total) return '<div class="ratio" style="margin:8px 0"><span style="width:100%;background:var(--line);color:var(--muted)">还没有人投票</span></div>';
    const label = (key, text) => (pct[key] >= 12 ? `${text} ${pct[key]}%` : '');
    const full = { A: 'A', MID: '各退一步', B: 'B' };
    return `<div class="ratio" style="margin:8px 0${big ? ';height:40px;font-size:14px' : ''}"><span class="A" style="width:${pct.A}%">${label('A', full.A)}</span><span class="mid" style="width:${pct.MID}%">${label('MID', full.MID)}</span><span class="B" style="width:${pct.B}%">${label('B', full.B)}</span></div>`;
  }
  function statusBadge(c) {
    if (c.status === 'recruiting') return `<span class="badge blue">招募陪审员 ${c.seatsFilled}/${c.seats}</span>`;
    if (c.status === 'voting') return '<span class="badge blue">投票中</span>';
    if (c.status === 'waiting') return '<span class="badge">等室友应诉</span>';
    return c.reconciled ? '<span class="badge green">已握手言和</span>' : '<span class="badge green">已判决</span>';
  }
  const caseHref = (c) => (c.status === 'done' ? 'verdict.html' : 'case.html') + '?id=' + esc(c.id);

  // 顶栏右侧：登录状态
  async function topbarUser() {
    const inner = $('.topbar .inner');
    if (!inner) return;
    const { user } = await api('/me');
    inner.insertAdjacentHTML('beforeend', user
      ? `<a class="me-chip" data-bind="user-chip" href="me.html"><span class="avatar">${esc(user.nickname.slice(0, 1))}</span><span>${esc(user.nickname)}</span></a>`
      : `<a class="me-chip btn" data-bind="user-chip" href="login.html?next=${here()}">登录 / 注册</a>`);
  }
  function needLogin(me) {
    if (me.user) return false;
    location.href = 'login.html?next=' + here();
    return true;
  }

  // ---------------- 注册 / 登录 ----------------
  function login() {
    const form = $('form');
    const next = params.get('next') || 'index.html';
    const seg = $$('.seg a', form);
    const codeBox = bind('demo-code');
    const submit = $('button[type=submit]', form);
    let sent = null;
    const regOnly = [];
    for (let el = codeBox.nextElementSibling; el && el !== submit; el = el.nextElementSibling) regOnly.push(el);
    codeBox.textContent = '演示版不发真邮件：点「发验证码」后，验证码会直接显示在这里。';

    seg.forEach((a, i) => a.addEventListener('click', (e) => {
      e.preventDefault();
      seg.forEach((x) => x.classList.toggle('on', x === a));
      regOnly.forEach((el) => (el.style.display = i === 0 ? '' : 'none'));
      $$('label', form).filter((l) => l.textContent.trim() === '昵称').forEach((l) => (l.style.display = i === 0 ? '' : 'none'));
      submit.textContent = i === 0 ? '进来吃瓜' : '登录';
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
    const sendBtn = $('#send-code');
    if (sendBtn) sendBtn.addEventListener('click', (e) => { e.preventDefault(); sendCode().catch((err) => alert(err.message)); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        if (sent !== form.email.value.trim()) await sendCode(); // 演示捷径：没点“发验证码”也能直接进
        await api('/register', { email: form.email.value, code: form.code.value, nickname: form.nickname.value });
        location.href = /^[\w.\-]+\.html/.test(next) ? next : 'index.html';
      } catch (err) { alert(err.message); }
    });
  }

  // ---------------- 吃瓜广场 ----------------
  async function index() {
    const CATS = ['全部', '空调', '作息', '卫生', '外卖', '借东西'];
    const filters = bind('filters');
    let cat = '全部';
    async function load() {
      const { items } = await api('/cases?category=' + encodeURIComponent(cat));
      bind('feed').innerHTML = items.length ? items.map((c) => `
        <a class="card" href="${caseHref(c)}" style="display:block">
          <div class="row"><span class="tag">${esc(c.category)}</span><span class="spacer"></span>${statusBadge(c)}</div>
          <h3 style="margin-top:6px">${esc(c.title)}</h3>
          ${c.votes ? bar(c.pct) : `<p class="muted" style="margin:8px 0">${c.status === 'recruiting' ? '正在招募陪审员，欢迎报名' : '陪审员正在评理'}</p>`}
          ${c.quote ? `<p class="quote">${c.status === 'done' ? '寝室公约：' : '热评：'}${esc(c.quote)}</p>` : `<p class="muted">${esc(c.focus || '')}</p>`}
          <div class="actions"><span>🍉 ${c.watchers} 人吃瓜</span><span>💬 ${c.commentCount} 条意见</span></div>
        </a>`).join('') : '<p class="muted card">这个分类还没有案子。</p>';
    }
    filters.innerHTML = CATS.map((c) => `<a href="#" data-cat="${c}"${c === cat ? ' class="on"' : ''}>${c}</a>`).join('');
    filters.addEventListener('click', (e) => {
      const a = e.target.closest('[data-cat]');
      if (!a) return;
      e.preventDefault();
      cat = a.dataset.cat;
      $$('a', filters).forEach((x) => x.classList.toggle('on', x === a));
      load();
    });
    await load();
  }

  // ---------------- 立案 + 室友应诉 ----------------
  async function file() {
    const form = $('#case-form');
    const status = bind('respond-status');
    const respondId = params.get('respond');

    // 室友通过邀请链接进来：只写自己的说法
    if (respondId) {
      const c = await api('/cases/' + respondId);
      $('.steps .on').classList.remove('on');
      $$('.steps div')[1].classList.add('on');
      form.innerHTML = `<h1>写下你的说法</h1>
        <p class="muted">你的室友想请大家评评“${esc(c.title)}”。不是告状，是一起找个办法。</p>
        <div class="card" style="background:var(--bg)"><div class="row"><span class="who A">A</span><b>室友 A 的说法</b></div><p class="quote">${esc(c.claimA)}</p></div>
        <label>我的说法</label>
        <textarea name="claimB" placeholder="说说你的难处，也说说你愿意怎么让一步"></textarea>
        <button class="btn primary block" style="margin-top:16px" type="submit">同意开庭，提交我的说法</button>`;
      if (c.status !== 'waiting') form.querySelector('button').disabled = true, form.querySelector('button').textContent = '这个案子已经开庭了';
      status.innerHTML = '<h3>室友应诉</h3><p class="muted">你同意后，AI 书记员会整理案情，并开始招募陪审员。</p>';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        busy('AI 书记员正在整理案情…（约 10~30 秒）');
        try {
          const r = await api(`/cases/${respondId}/respond`, { claimB: form.claimB.value });
          location.href = 'case.html?id=' + r.id;
        } catch (err) { fail(err); }
      });
      return;
    }

    status.innerHTML = '<h3>室友应诉</h3><p class="muted">提交后这里会出现邀请链接，发给室友，Ta 同意并写下说法，案子就开庭。</p>';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        const c = await api('/cases', { category: fd.get('category'), title: fd.get('title'), claimA: fd.get('claimA'), chat: fd.get('chat') });
        const link = new URL(c.inviteLink, location.href).href;
        btn.textContent = '✅ 已立案，等室友应诉';
        status.innerHTML = `<h3>室友应诉</h3>
          <p class="muted">把这条邀请链接发给室友，Ta 同意并写下说法，案子才会开庭。</p>
          <input type="text" readonly value="${esc(link)}" id="invite-link" style="margin:6px 0">
          <a class="btn block" href="#" id="copy-link">复制邀请链接</a>
          <div class="stat"><span><span class="who B">B</span> 室友 B</span><span>⏳ 等待中</span></div>
          <p class="demo-note">演示用：<a href="#" id="sim-agree"><u>模拟室友同意 → 开庭</u></a></p>`;
        $('#copy-link').addEventListener('click', async (e) => { e.preventDefault(); try { await navigator.clipboard.writeText(link); e.target.textContent = '✅ 已复制'; } catch (_) { $('#invite-link').select(); } });
        $('#sim-agree').addEventListener('click', async (e) => {
          e.preventDefault();
          busy('室友同意了，AI 书记员正在整理案情…（约 10~30 秒）');
          try {
            await api(`/cases/${c.id}/respond`, { demo: true });
            location.href = 'case.html?id=' + c.id;
          } catch (err) { fail(err); }
        });
        status.scrollIntoView({ behavior: 'smooth' });
      } catch (err) { alert(err.message); btn.disabled = false; }
    });
  }

  // ---------------- 案件详情 + 陪审 ----------------
  async function caseDetail() {
    const id = params.get('id') || 'air';
    const c = await api('/cases/' + id);
    if (c.status === 'done') return (location.href = 'verdict.html?id=' + c.id);
    const v = c.viewer || {};

    const tags = $$('section.card .tag');
    if (tags[0]) tags[0].textContent = c.category;
    if (tags[1]) tags[1].textContent = `评字第 ${c.no} 号`;
    bind('watchers').textContent = `🍉 ${c.watchers} 人吃瓜`;
    bind('title').textContent = c.title;
    bind('summary').textContent = c.summary || '室友还没有应诉，案子还没开庭。';
    bind('focus').textContent = c.focus || '—';
    bind('claimA').textContent = c.claimA;
    bind('claimB').textContent = c.claimB || '（室友还没写）';
    $$('.side .card b').forEach((b) => (b.textContent = b.closest('.card').querySelector('.who').textContent === 'A' ? '室友 A 的说法' : '室友 B 的说法'));

    // 步骤条：招募/投票 都算“大家评理”
    const applyForm = bind('apply');
    const voteForm = $('#vote-form');
    const seats = bind('seats');
    seats.textContent = `陪审席 ${c.jury.filled} / ${c.jury.seats}`;

    // 陪审团投票结果 + 12 个席位
    const slots = c.jury.slots.map((s) => `<span${s.voted ? ' class="voted"' : ''}${s.filled ? '' : ' style="opacity:.35"'}>${s.no}</span>`).join('');
    const result = bind('vote-result');
    result.innerHTML = `<h3>陪审团投票 · ${c.jury.voted} / ${c.jury.seats}</h3><div class="jurors" style="margin:8px 0">${slots}</div>${bar(c.tally.pct)}
      <p class="muted">${c.status === 'recruiting' ? `陪审席还没坐满（${c.jury.filled}/${c.jury.seats}），AI 正在遴选报名者。` : `${c.jury.seats} 票到齐或 24 小时后，AI 法官开始写判决。`}</p>`;

    // 意见 + 点赞
    function renderComments(list) {
      bind('comments').innerHTML = `<h3>🔥 陪审员意见 <span class="muted">（围观群众可以点赞）</span></h3>` +
        (list.length ? list.map((x) => `<p class="quote">${x.no} 号 · ${CHOICE[x.choice]}：${esc(x.comment)} <span class="muted"><a href="#" data-like="${x.no}">${x.liked ? '👍' : '👍'} ${x.likes}</a></span></p>`).join('') : '<p class="muted">陪审员还没有发表意见。</p>');
    }
    renderComments(c.comments);
    bind('comments').addEventListener('click', async (e) => {
      const a = e.target.closest('[data-like]');
      if (!a) return;
      e.preventDefault();
      try { renderComments((await api(`/cases/${c.id}/like`, { no: +a.dataset.like })).comments); } catch (err) { alert(err.message); }
    });

    // 报名区
    const notice = (html) => applyForm.insertAdjacentHTML('beforebegin', `<div class="card">${html}</div>`);
    if (c.status === 'waiting') {
      applyForm.style.display = voteForm.style.display = 'none';
      notice('<h3>等室友应诉中</h3><p class="muted">室友同意并写下说法后，才会开始招募陪审员。</p>');
    } else if (v.canApply) {
      voteForm.style.display = 'none';
      applyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        busy('AI 正在遴选陪审团…');
        try {
          const r = await api(`/cases/${c.id}/apply`, { reason: applyForm.reason.value, pledge: applyForm.pledge.checked });
          location.href = 'case.html?id=' + r.id;
        } catch (err) { fail(err); }
      });
    } else {
      applyForm.style.display = 'none';
      if (v.applied === 'pending') notice('<h3>已报名，等待 AI 遴选</h3><p class="muted">席位有限，AI 会参考你的陪审信用和报名理由，结果会推送给你。</p>');
      else if (v.applied === 'rejected') notice('<h3>这次没选上</h3><p class="muted">陪审团已满，欢迎围观点赞，下次再来。</p>');
      else if (!v.isMember && !(v.isCreator || v.isRespondent)) notice('<h3>陪审团已满</h3><p class="muted">投票只交给 12 位陪审员，你可以围观，并给喜欢的意见点赞。</p>');
      else if (v.isCreator || v.isRespondent) notice('<h3>你是当事人</h3><p class="muted">当事人不参与投票，等大家评理就好。</p>');
    }

    // 投票区
    if (v.canVote || (v.isMember && c.status === 'recruiting')) {
      voteForm.style.display = '';
      $('.tag', voteForm).textContent = `你是本案第 ${v.seatNo} 号陪审员`;
      if (v.voted) {
        const r = $(`input[name=choice][value=${v.myChoice}]`, voteForm);
        if (r) r.checked = true;
        voteForm.comment.value = v.myComment || '';
        $('button[type=submit]', voteForm).textContent = '已投票，点击可修改';
      }
      voteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api(`/cases/${c.id}/votes`, { choice: voteForm.choice.value, comment: voteForm.comment.value });
          location.href = 'case.html?id=' + c.id;
        } catch (err) { alert(err.message); }
      });
    } else if (!(c.status === 'waiting')) {
      voteForm.style.display = 'none';
    }

    // 演示捷径：生成判决
    const gen = $('a[href="verdict.html"]', voteForm);
    if (gen) {
      gen.addEventListener('click', async (e) => {
        e.preventDefault();
        busy('AI 法官正在写判决书，并点评每位陪审员…（约 10~30 秒）');
        try {
          const r = await api(`/cases/${c.id}/verdict`, {});
          location.href = 'verdict.html?id=' + r.id;
        } catch (err) { fail(err); }
      });
      if (!v.isMember) gen.closest('.demo-note').style.display = 'none';
    }
  }

  // ---------------- 判决书 + 寝室公约 ----------------
  async function verdict() {
    const id = params.get('id');
    if (!id) return (location.href = 'index.html');
    const c = await api('/cases/' + id);
    if (!c.verdict) {
      bind('verdict-text').innerHTML = '<h1>判决书尚未作出</h1><p class="muted">陪审团还没有投完票。</p>';
      return;
    }
    const v = c.verdict;
    bind('result').innerHTML = `<h2>陪审团意见 · ${v.result.total} 票</h2>${bar(v.result, true)}`;
    bind('verdict-text').innerHTML = `<h1>判 决 书</h1><p class="no">（2026）评字第 ${esc(c.no)} 号 · ${esc(c.title)}</p>${v.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}<div class="seal"><b>评评理<br>AI 法庭</b></div>`;

    bind('pact').innerHTML = `<h3>📜 寝室公约（AI 起草）</h3><ol>${v.pact.map((p) => `<li>${esc(p)}</li>`).join('')}</ol><a class="btn block" style="margin-top:10px" href="#" id="copy-pact">复制公约文字</a>`;
    $('#copy-pact').addEventListener('click', async (e) => {
      e.preventDefault();
      const text = `📜 ${c.title} · 寝室公约\n` + v.pact.map((p, i) => `${i + 1}. ${p}`).join('\n');
      try { await navigator.clipboard.writeText(text); e.target.textContent = '✅ 已复制，可以发到寝室群'; } catch (_) { prompt('复制下面这段：', text); }
    });

    function renderReconcile(r) {
      const row = (k) => `<div class="stat"><span><span class="who ${k}">${k}</span> ${r[k] ? '已确认' : '等待确认'}</span><span>${r[k] ? '🤝' : '⏳'}</span></div>`;
      const both = r.A && r.B;
      bind('reconcile').innerHTML = `<h3>${both ? '🤝 已握手言和' : '握手言和'}</h3>${row('A')}${row('B')}
        ${both ? '<p class="muted">两位室友都接受了判决，案子圆满结束。</p>' : '<a class="btn primary block" style="margin-top:8px" href="#" id="shake">我接受，握手言和</a><p class="demo-note">演示用：<a href="#" id="sim-shake"><u>模拟另一位室友也确认</u></a></p>'}`;
      const go = (extra) => async (e) => {
        e.preventDefault();
        try { renderReconcile((await api(`/cases/${c.id}/reconcile`, extra)).reconciled); } catch (err) { alert(err.message); }
      };
      const a = $('#shake'); if (a) a.addEventListener('click', go(c.viewer && c.viewer.isRespondent ? {} : { who: 'A', demo: true }));
      const b = $('#sim-shake'); if (b) b.addEventListener('click', go({ who: r.A ? 'B' : 'A', demo: true }));
    }
    renderReconcile(c.reconciled);

    const rv = bind('juror-review');
    rv.innerHTML = `<h3>🏅 AI 陪审员点评</h3><p class="muted">AI 按“讲理、有建设性、友善”给每位陪审员的意见打分，计入陪审信用。</p>` +
      v.jurorReview.slice(0, 6).map((r) => `<div class="stat"><span>${r.best ? `<b>最佳陪审员 · ${r.no} 号</b>` : `${r.no} 号`}<br><span class="muted">${esc(r.best || r.comment ? (r.comment ? '“' + r.comment + '”' : '') : '')}${r.note ? ' · ' + esc(r.note) : ''}</span></span><span class="badge ${r.delta > 0 ? 'green' : r.delta < 0 ? 'red' : ''}" style="align-self:center;height:fit-content">${r.delta > 0 ? '+' : ''}${r.delta}</span></div>`).join('');

    const btns = $$('a.btn');
    const share = btns.find((a) => a.textContent.includes('分享图'));
    if (share) share.addEventListener('click', (e) => { e.preventDefault(); alert('分享图功能开发中'); });
    const appeal = btns.find((a) => a.textContent.includes('上诉'));
    if (appeal) appeal.addEventListener('click', (e) => { e.preventDefault(); alert('上诉功能开发中：将重新招募一组陪审员复审。'); });
  }

  // ---------------- 陪审员中心 ----------------
  async function hall() {
    const me = await api('/me');
    if (needLogin(me)) return;
    const j = await api('/me/jury');
    const row = (c, btn) => `<a class="list-item" href="case.html?id=${esc(c.id)}"><span class="main"><b>${esc(c.title)}</b><span class="muted">${esc(c.category)} · 陪审席 ${c.seatsFilled} / ${c.seats} · ${c.watchers} 人围观</span></span>${btn}</a>`;

    const inviteCard = bind('invites').closest('.card');
    $('h3', inviteCard).textContent = `📣 你收到 ${j.invites.length} 个陪审邀请`;
    bind('invites').innerHTML = j.invites.length
      ? j.invites.map((c) => `<div class="list-item"><span class="main"><b>${esc(c.title)}</b><span class="muted">AI 根据你以往的陪审表现邀请你 · 陪审席 ${c.seatsFilled} / ${c.seats}</span></span><a class="btn primary" href="#" data-accept="${esc(c.id)}">接受</a></div>`).join('')
      : '<p class="muted" style="padding:8px 0">暂时没有新邀请。多参与陪审、写出靠谱的意见，AI 会更常邀请你。</p>';
    bind('invites').addEventListener('click', async (e) => {
      const a = e.target.closest('[data-accept]');
      if (!a) return;
      e.preventDefault();
      try { const r = await api(`/cases/${a.dataset.accept}/accept-invite`, {}); location.href = 'case.html?id=' + r.id; } catch (err) { alert(err.message); }
    });

    bind('open-cases').innerHTML = j.openCases.length ? j.openCases.map((c) => row(c, '<span class="btn">去报名</span>')).join('') : '<p class="muted" style="padding:8px 0">现在没有在招陪审员的案子。</p>';

    bind('jury-history').innerHTML = j.history.length ? j.history.map((c) => {
      const href = (c.status === 'done' ? 'verdict' : 'case') + '.html?id=' + esc(c.id);
      let sub, badge = '';
      if (c.applied === 'rejected') { sub = '报名未入选'; badge = '<span class="badge">未入选</span>'; }
      else if (c.applied === 'pending' && !c.isMember) { sub = '已报名，等待 AI 遴选'; badge = '<span class="badge blue">待遴选</span>'; }
      else {
        sub = c.myChoice ? `我投：${CHOICE[c.myChoice]}${c.myComment ? ' · “' + esc(c.myComment) + '”' : ''}` : '还没投票';
        if (c.review) badge = `<span class="badge ${c.review.delta > 0 ? 'green' : c.review.delta < 0 ? 'red' : ''}">${c.review.best ? '最佳陪审员' : (c.review.delta > 0 ? '+' : '') + c.review.delta}</span>`;
        else badge = c.status === 'done' ? '' : '<span class="badge blue">陪审中</span>';
      }
      return `<a class="list-item" href="${href}"><span class="main"><b>${esc(c.title)}</b><span class="muted">${sub}</span></span>${badge}</a>`;
    }).join('') : '<p class="muted" style="padding:8px 0">还没有陪审记录。</p>';

    const s = j.score;
    const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
    bind('juror-score').innerHTML = `<h3>我的陪审信用</h3>
      <div class="row" style="margin:8px 0"><b style="font-size:32px;color:var(--accent)">${s.value}</b><span class="muted">/ 100 · ${esc(s.title)}</span></div>
      <div class="stat"><span>讲理</span><span>${stars(s.stars.reason)}</span></div>
      <div class="stat"><span>有建设性</span><span>${stars(s.stars.constructive)}</span></div>
      <div class="stat"><span>友善</span><span>${stars(s.stars.kind)}</span></div>
      <p class="hint">每次结案后，AI 会点评你的意见。AI 挑陪审员时会参考这个分数：信用越高，越容易被邀请、报名越容易入选。</p>`;

    if (j.notifs.length) bind('juror-score').closest('aside').insertAdjacentHTML('beforeend', `<div class="card"><h3>🔔 最新通知</h3>${j.notifs.slice(0, 4).map((n) => `<p class="muted"><a href="case.html?id=${esc(n.caseId)}">${esc(n.text)}</a></p>`).join('')}</div>`);
  }

  // ---------------- 我的 ----------------
  async function me() {
    const m = await api('/me');
    if (needLogin(m)) return;
    const u = m.user;
    const inv = bind('respond-invites');
    const badge = $('h3 .badge', inv.closest('.card'));
    if (badge) badge.textContent = m.respondInvites.length;
    inv.innerHTML = m.respondInvites.length
      ? m.respondInvites.map((c) => `<div class="list-item"><span class="main"><b>${esc(c.title)}</b><span class="muted">你的室友想请大家评评理</span></span><a class="btn primary" href="file.html?respond=${esc(c.id)}">写我的说法</a></div>`).join('')
      : '<p class="muted" style="padding:8px 0">暂时没有室友邀请你应诉。</p>';

    bind('my-cases').innerHTML = m.myCases.length
      ? m.myCases.map((c) => `<a class="list-item" href="${c.status === 'waiting' ? 'file.html' : caseHref(c)}"><span class="main"><b>${esc(c.title)}</b><span class="muted">我是室友 ${c.role}${c.votes ? ' · ' + c.votes + ' 票' : ''}</span></span>${statusBadge(c)}</a>`).join('')
      : '<p class="muted" style="padding:8px 0">还没有案子。</p>';

    const profile = bind('my-stats').closest('.card');
    $('.avatar', profile).textContent = u.nickname.slice(0, 1);
    $('b', $('.row', profile)).textContent = u.nickname;
    $('.muted', $('.row', profile)).textContent = `已验证 · ${u.email}`;
    bind('my-stats').innerHTML = `<div><b>${m.stats.cases}</b><span class="muted">我的案子</span></div><div><b>${m.stats.voted}</b><span class="muted">陪审过的案子</span></div><div><b>${m.stats.likes}</b><span class="muted">意见获赞</span></div>`;

    const out = $$('a').find((a) => a.textContent.includes('退出登录'));
    if (out) out.addEventListener('click', async (e) => { e.preventDefault(); await api('/logout', {}); location.href = 'login.html'; });
  }

  const pages = { index, file, case: caseDetail, verdict, hall, me, login };
  if (page !== 'login') topbarUser().catch((err) => console.error(err));
  if (pages[page]) Promise.resolve(pages[page]()).catch((err) => console.error(err));
})();
