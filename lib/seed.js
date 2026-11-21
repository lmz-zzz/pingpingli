// 预置数据（每次启动都会重置，保证演示稳定）：
//  - air     《空调该开 22°C 还是 28°C？》 招募陪审员中：9/12 席位，另有 5 人报名；现场报名→AI 遴选→投第 10 票→生成判决
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
  id: 'air', no: '0042', createdAt: '2026-11-21T09:00:00Z', category: '空调',
  title: '空调该开 22°C 还是 28°C？',
  claimA: '我特别怕热，晚上 28°C 根本睡不着，第二天早八起不来。我想开 22°C。',
  claimB: '我怕冷，22°C 我得盖两床被子，上个月还感冒了一次。',
  chat: '[22:41] A：今晚能开低一点吗，热得睡不着\n[22:43] B：我已经盖了两床被子了……\n[23:10] A：（默默调到 24）\n[23:12] B：（默默调回 27）',
  creatorId: 'seed20', respondentId: 'seed21', status: 'recruiting', watchers: 236,
  summary: '室友 A 怕热，室友 B 怕冷。两人围绕遥控器“暗中较量”了两周：A 调到 24，B 默默调回 27，谁也没说破。其实两人都不想吵架，只是想睡个好觉。',
  focus: '夜里空调温度，谁说了算？',
  jury: { seats: SEATS, members: members(0, 9), applications: apps(0, 9, 'selected').concat(apps(9, 14)) },
  votes: votes([
    ['MID', '建议 A 睡靠空调那边，B 睡离空调远的那边。', 88],
    ['MID', '睡眠模式了解一下，后半夜自动升温。', 61],
    ['MID', 'A 买个小风扇，B 买条电热毯，各自解决各自的。', 40],
    ['A', '怕热真的会失眠，A 的需求也很合理。', 9],
    ['MID', '26°C 是个大家都能接受的数。', 27],
    ['B', 'B 感冒过，健康优先。', 11],
    ['MID', '周末轮流定温度，这周 A，下周 B。', 18],
    ['MID', '试试凉感被 + 厚被子，一个房间两种温度。', 22],
    ['A', '先试 24°C，不行再调。', 5],
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
  creatorId: 'seed24', respondentId: 'seed25', status: 'recruiting', watchers: 118,
  summary: '室友 A 靠 5 个闹钟叫醒自己，室友 B 每次都被连续吵醒。A 不是故意的，B 也不是挑剔，都在为早上的一点点安宁努力。',
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
