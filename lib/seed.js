// 预置数据（每次启动都会重置，保证演示稳定）：
//  - air     《值日表上的隐形人》 招募陪审员中：11/12 席位，11 票，另有 4 人报名；现场报名→AI 遴选→投第 12 票→生成判决（演示主案，id 仍叫 air）
//  - clean   《地到底谁来拖？》          招募陪审员中（8/12），系统向所有用户推送邀请
//  - alarm   《闹钟响 5 次才起》        招募陪审员中（5/12）
//  - voice   《12 点后能不能开游戏语音》  已判决、已握手言和
//  - takeout 《拼单外卖没吃完的那份》     已判决、已握手言和
//  - garbage 《垃圾到底谁来倒？》        等待室友应诉（“我的”页里的应诉邀请样例）

const SEATS = 12;

const SEED_USERS = Array.from({ length: 30 }, (_, i) => ({
  id: `seed${i + 1}`,
  email: `seed${i + 1}@seed.local`,
  nickname: `陪审员${i + 1}`,
  seed: true,
  jurorScore: 55 + ((i * 7) % 40), // 55~94
  jurorCases: 1 + (i % 6),
  notifs: [],
  createdAt: '2026-11-01T00:00:00Z',
}));

const REASONS = [
  '我也有过空调之争，知道两边都不容易，保证只看事实。',
  '室友关系处得不错，想分享一点经验，不认识当事人。',
  '之前陪审过两次，评语被点赞，愿意继续做客观的那个人。',
  '学心理学的，喜欢看人怎么协商，会对事不对人。',
  '想帮忙出点具体办法，不站队。',
  '我怕冷，但我会尽量站在另一边想。',
  '宿舍调解员出身，擅长找折中方案。',
  '这事我室友也吵过，想看看别人怎么解决。',
  '就想看热闹，谁吵得凶我投谁。',
  '大四了，见过各种室友矛盾，想给学弟学妹一点建议。',
];

function apps(from, to, status = 'pending') {
  return SEED_USERS.slice(from, to).map((u, i) => ({ userId: u.id, reason: REASONS[(from + i) % REASONS.length], pledge: true, status, at: '2026-11-21T10:00:00Z' }));
}
function members(from, to) {
  return SEED_USERS.slice(from, to).map((u, i) => ({ userId: u.id, source: i % 3 === 0 ? 'invite' : 'apply', no: i + 1 }));
}
// list: [choice, comment, likes][] -> 从第 from 位种子用户开始依次投票
function votes(list, from = 0) {
  return list.map(([choice, comment, likes], i) => ({ userId: `seed${from + i + 1}`, choice, comment, likes, likedBy: [] }));
}

function base(o) {
  return {
    seed: true, chat: '', claimB: '', respondentId: null, summary: '', focus: '', watchers: 0,
    jury: { seats: SEATS, members: [], applications: [] },
    votes: [], verdict: null, reconciled: { A: false, B: false }, invitedIds: [], inviteAll: false,
    ...o,
  };
}

const air = base({
  id: 'air', no: '0042', createdAt: '2026-11-21T09:00:00Z', category: '卫生',
  title: '值日表上的隐形人',
  claimA: '四人宿舍，我每次都按值日表扫地拖地，可小B 轮到他的那天总是“刚好有事”，地一直是我在扫。我不想吵架，就想知道这样公平吗？',
  claimB: '我不是不想扫，是每次轮到我都刚好有课或者在忙。宿舍断网是我去找的宽带师傅，饮水机换水、帮大家取快递也大多是我在跑，只是这些没写在值日表上。',
  chat: '[20:12] A：今天又是我拖的地……\n[20:15] B：抱歉抱歉，今天实验室走不开\n[20:16] A：（已读）',
  creatorId: 'seed20', respondentId: 'seed21', status: 'recruiting', watchers: 236,
  summary: '四人宿舍的值日表只记了“扫地”。小A 一直按时打扫，觉得小B 总是缺席；小B 虽然没扫地，但断网找师傅、换水、取快递都是他在跑。两人其实都在为宿舍付出，只是值日表没把这些算进去。',
  focus: '值日表只记“扫地”，别的付出该怎么算？',
  jury: { seats: SEATS, members: members(0, 11), applications: apps(0, 11, 'selected').concat(apps(11, 15)) },
  votes: votes([
    ['MID', '把值日表升级成“家务清单”：扫地、倒垃圾、换水、修网、取快递，按次数轮换。', 88],
    ['MID', '换水、修网也是活，应该折算成次数，不能只认扫地。', 61],
    ['MID', '每个人每周至少认领 3 件事，做完在群里打卡。', 40],
    ['A', '按时打扫的人最辛苦，A 的感受值得被看见。', 9],
    ['MID', '清单里把每件事写清楚频率，谁也不吃亏。', 27],
    ['B', 'B 其实一直在付出，只是没被记录。', 11],
    ['MID', '小B 轮到扫地没空，可以换成多跑一次取快递。', 18],
    ['MID', '每月底宿舍开 10 分钟小会，看看清单要不要调整。', 22],
    ['A', '先把地扫了，再谈折算。', 5],
    ['MID', '家务清单贴在门后，谁做了谁划一笔，一目了然。', 15],
    ['MID', '以后宿舍里的“看不见的活”也要写进清单。', 10],
  ]),
});

const clean = base({
  id: 'clean', no: '0041', createdAt: '2026-11-21T08:00:00Z', category: '卫生', inviteAll: true,
  title: '地到底谁来拖？',
  claimA: '我每周拖两次，感觉一直是我在拖。想轮流来。',
  claimB: '我最近在赶论文，不是不想拖，是真没空。可以我多倒几次垃圾换吗？',
  creatorId: 'seed22', respondentId: 'seed23', status: 'recruiting', watchers: 98,
  summary: '室友 A 觉得拖地总是自己在做，室友 B 最近赶论文腾不出手，愿意用别的家务来换。两人都想把寝室弄干净，只是还没商量出分工。',
  focus: '家务能不能“以物易物”？',
  jury: { seats: SEATS, members: members(0, 8), applications: apps(0, 8, 'selected').concat(apps(8, 11)) },
});

const alarm = base({
  id: 'alarm', no: '0040', createdAt: '2026-11-21T07:00:00Z', category: '作息',
  title: '闹钟响 5 次才起，算不算扰民？',
  claimA: '我设了 5 个闹钟才能起床，每个隔 5 分钟，我知道有点吵但我真的起不来。',
  claimB: '我每次都被吵醒 5 次，早上 7 点就睡不着了，希望能少响几次。',
  creatorId: 'seed24', respondentId: null, solo: true, status: 'recruiting', watchers: 118,
  summary: '室友 A 靠 5 个闹钟叫醒自己，担心吵到室友，但室友暂未回应。A 想知道怎么开口聊，又不伤和气。（单方面展示，仅供参考）',
  focus: '怎么起得来，又不吵醒别人？',
  jury: { seats: SEATS, members: members(0, 5), applications: apps(0, 5, 'selected').concat(apps(5, 7)) },
});

const voice = base({
  id: 'voice', no: '0038', createdAt: '2026-11-20T12:00:00Z', category: '作息',
  title: '晚上 12 点后还能不能开游戏语音？',
  claimA: '我晚上 12 点后想和朋友开语音打完这把再睡，不是故意吵。',
  claimB: '我 12 点就得睡，隔着床帘还是能听到声音，睡眠很浅。',
  creatorId: 'seed26', respondentId: 'seed27', status: 'done', watchers: 512,
  summary: '室友 A 夜里爱和朋友开语音打游戏，室友 B 睡眠浅，12 点后被声音吵醒。两人都觉得对方“不是故意的”，只是缺一个约定。',
  focus: '夜里的快乐，怎么不打扰另一个人的睡眠？',
  jury: { seats: SEATS, members: members(0, 12), applications: apps(0, 12, 'selected') },
  votes: votes([
    ['MID', '12 点后戴耳机、关麦打字，游戏体验和睡眠两不误。', 58],
    ['MID', '周末放宽到 1 点，提前在群里说一声。', 41],
    ['MID', '买个降噪耳机，成本比吵架低多了。', 36],
    ['A', '周末晚上是自由的，不该管太严。', 5],
    ['MID', '第二天有早八的人拥有一次“静音券”。', 29],
    ['MID', '语音可以，声音小一点，大家都能活。', 7],
    ['B', '睡眠比游戏重要，12 点后就该安静。', 8],
    ['MID', '约定工作日 11:30，周末 1:00。', 14],
    ['MID', '打字交流也很快乐，试试。', 5],
    ['A', '都是年轻人，别太严。', 2],
    ['MID', '麦克风换成指向性的，声音小很多。', 11],
    ['MID', '一起设一个“静音时段”小闹钟。', 9],
  ]),
  verdict: {
    paragraphs: [
      '本院查明：室友 A 热爱夜间语音，室友 B 睡眠清浅，双方均称对方“不是故意的”，本院深受感动。',
      '本院认为：快乐不应以失眠为代价，睡眠也不该以扼杀快乐为前提。七成陪审员主张各退一步，本院采纳。',
      '判决如下：工作日 12 点后 A 戴耳机、关麦打字；周末可语音至凌晨 1 点，提前在群里招呼一声；次日有早八者可凭“静音券”要求提前收工。',
      '愿二位一个赢游戏，一个赢好梦。',
    ],
    pact: ['工作日 12 点后戴耳机、关麦打字', '周末语音到 1 点，提前在群里说', '早八的人有一次“静音券”'],
    by: 'preset',
  },
  reconciled: { A: true, B: true },
});

const takeout = base({
  id: 'takeout', no: '0035', createdAt: '2026-11-19T12:00:00Z', category: '外卖',
  title: '拼单的外卖，没吃完的那份算谁的？',
  claimA: '拼单是 B 提议的，我只想吃一半，剩下的那份凭什么我付钱？',
  claimB: '我以为你会吃完，点都点了，扔了太浪费。',
  creatorId: 'seed28', respondentId: 'seed29', status: 'done', watchers: 189,
  summary: '两位室友拼单点了一份大份外卖，A 只吃了一半，剩下的那份谁来买单成了小小的悬案。两人其实只是都不想浪费。',
  focus: '剩饭的钱，该怎么算才不尴尬？',
  jury: { seats: SEATS, members: members(0, 12), applications: apps(0, 12, 'selected') },
  votes: votes([
    ['MID', '下次点个小份，剩下的给楼下猫。', 66],
    ['MID', '拼单前先问一句“你吃多少”。', 38],
    ['A', '没吃完的不该让 A 承担。', 6],
    ['MID', '剩饭当明天午饭，AA 没有损失。', 22],
    ['B', 'B 愿意不浪费粮食是美德。', 5],
    ['MID', '这次各付一半，下次先说好。', 14],
    ['MID', '建一个“拼单规则”备忘录。', 9],
    ['A', '各点各的最省事。', 4],
    ['MID', '以后拼单先约好份量。', 7],
    ['MID', '这次请对方吃，下次对方请。', 8],
    ['MID', '剩下的放冰箱，明天微波炉。', 6],
    ['B', '不浪费最重要。', 3],
  ], 3),
  verdict: {
    paragraphs: [
      '本院查明：一份外卖，两颗不想浪费的心。室友 A 只想吃一半，室友 B 舍不得扔，双方的出发点都值得点赞。',
      '本院认为：悬案的真正凶手是“拼单前没有商量份量”。陪审团多数主张各退一步，其中“下次点小份，剩下的给楼下猫”获得最高赞，本院深以为然。',
      '判决如下：本次费用 AA；今后拼单前先在群里报一句“我吃多少”；吃不完的就明天当午饭，或者交给楼下的猫。',
      '愿二位从此点单有数，吃饭有伴。',
    ],
    pact: ['拼单前先报“我吃多少”', '吃不完的当明天午饭', '实在吃不完，给楼下猫'],
    by: 'preset',
  },
  reconciled: { A: true, B: true },
});

const garbage = base({
  id: 'garbage', no: '0043', createdAt: '2026-11-21T11:00:00Z', category: '卫生', demoInvite: true,
  title: '垃圾到底谁来倒？',
  claimA: '垃圾桶每次都是我倒，我想我们轮流来，可以吗？',
  creatorId: 'seed30', status: 'waiting',
});

module.exports = { SEATS, SEED_USERS, seedCases: [air, clean, alarm, voice, takeout, garbage] };
