// 预置数据：
// - demo：《传播学概论》期中展示案，卷宗已生成、已有 6 票，现场投第 7 票（每次投票都会复制一份新案子，demo 本身永远停在 6 票，可以反复录屏）
// - 广场里的 3 个已公开判例

const M3 = [
  { id: 'A', name: '原告', agreed: true },
  { id: 'B', name: '小周', agreed: true },
  { id: 'C', name: '阿凯', agreed: true },
];

const pptDossier = {
  by: 'preset',
  summary: '本组三人于 11 月 2 日分工：A 负责文献综述，B 负责数据和图表，C 负责 PPT。A、B 均在 11 月 7 日前完成；C 被催促 2 次，于展示前一晚 1:47 回复“在调字体”，文档中共有 3 处修改。',
  persons: [
    { id: 'A', role: '文献综述', promised: '文献综述', delivered: '综述 + 发起分工', nudged: 0, edits: '32 处', quote: '大家分一下工吧，我做文献综述' },
    { id: 'B', role: '数据和图表', promised: '数据和图表', delivered: '4 张图表', nudged: 0, edits: '18 处', quote: '我来做数据和图表' },
    { id: 'C', role: 'PPT', promised: 'PPT', delivered: '调整字体（存疑）', nudged: 2, edits: '3 处', quote: '在弄了在弄了，在调字体' },
  ],
  timeline: [
    { time: '11-02 21:14', text: 'A 发起分工，认领文献综述', warn: false },
    { time: '11-02 21:20', text: 'B 认领数据和图表', warn: false },
    { time: '11-02 23:05', text: 'C 认领 PPT', warn: false },
    { time: '11-05', text: 'A 编辑文档 32 处', warn: false },
    { time: '11-06 22:31', text: 'A 第 1 次催促 C', warn: true },
    { time: '11-07', text: 'B 编辑 18 处，插入 4 张图表', warn: false },
    { time: '11-08 20:12', text: 'A 第 2 次催促 C', warn: true },
    { time: '11-09 01:47', text: 'C 首次回复：“在调字体”', warn: true },
    { time: '11-09', text: 'C 编辑文档 3 处', warn: false },
  ],
};

const pptVotes = [
  { ratio: { A: 42, B: 40, C: 18 }, comment: 'A 发起分工还写综述，多给一点。', preset: true },
  { ratio: { A: 45, B: 40, C: 15 }, comment: '被 @ 两次才出现，这已经不是划水，是潜水。', preset: true },
  { ratio: { A: 40, B: 40, C: 20 }, comment: 'A 和 B 不分上下，C 少拿点。', preset: true },
  { ratio: { A: 40, B: 42, C: 18 }, comment: '四张图表很实在，B 不能比 A 少。', preset: true },
  { ratio: { A: 43, B: 40, C: 17 }, comment: '调字体也算工作量，但调三天就不算了。', preset: true },
  { ratio: { A: 38, B: 38, C: 24 }, comment: 'C 至少做了，别给太低。', preset: true },
];

const demo = {
  id: 'demo',
  no: '0042',
  createdAt: '2026-11-20T12:00:00Z',
  course: '传播学概论',
  assignment: '期中小组展示：短视频平台的算法推荐',
  plaintiff: 'A',
  members: M3,
  chat: `[11-02 21:14] A：大家分一下工吧，我做文献综述
[11-02 21:20] B：我来做数据和图表
[11-02 23:05] C：我做 PPT！
[11-06 22:31] A：@C PPT 有进度了吗
[11-08 20:12] A：@C 在吗，周一就要讲了
[11-09 01:47] C：在弄了在弄了，在调字体`,
  doc_log: `11-05 A 编辑了 32 处
11-07 B 编辑了 18 处，插入 4 张图表
11-09 C 编辑了 3 处`,
  claim: '我觉得自己和 B 做了大部分工作，不想和 C 平分。',
  defense: '',
  status: 'jury',
  dossier: pptDossier,
  votes: pptVotes,
  verdict: null,
  public: false,
  stats: { views: 0, agree: 0, comments: 0 },
};

function done(id, no, ago, course, title, ratio, quote, paragraphs, stats) {
  return {
    id, no, createdAt: ago, course, assignment: '小组作业', plaintiff: 'A', members: M3,
    chat: '', doc_log: '', claim: '', defense: '', status: 'done', dossier: null,
    votes: [{ ratio, comment: quote, preset: true }],
    verdict: { title, ratio, paragraphs, by: 'preset' },
    public: true, stats,
  };
}

const feed = [
  done('font', '0039', '2026-11-21T10:00:00Z', '传播学概论 · 3 人组', '“我在调字体”：C 同学的三天', { A: 42, B: 40, C: 18 }, '陪审员 5 号：调字体也算工作量，但调三天就不算了。', [
    '原告 A 诉称，其与 B 承担了本组大部分工作，不愿与 C 平分贡献。被告 C 辩称，自己“一直在弄”。',
    '本院查明：C 于 11 月 2 日主动认领 PPT，此后七日内于群聊中无一言、于文档中无一改，经 A 两次 @ 催促，方于展示前夜凌晨一点四十七分现身，自述“在调字体”。本院认为，调整字体确属 PPT 制作之组成部分，但以三日之功仅成三处修改，难谓尽职。',
    '另查明，B 全程未被催促，按时交付图表四张，本院予以表扬。',
    '综上，参考陪审团七人之意见，判决如下：本组贡献比例建议为 A 42%、B 40%、C 18%。C 同学下次认领任务时，请先确认自己知道 PPT 在哪。',
    '如不服本判决，可于三日内提出上诉。',
  ], { views: 1200, agree: 318, comments: 46 }),
  done('3am', '0035', '2026-11-20T08:00:00Z', '数据结构 · 3 人组', '凌晨三点交作业的人，和凌晨三点才回消息的人', { A: 55, B: 30, C: 15 }, '陪审员 2 号：被 @ 了 11 次才出现，这已经不是划水，是潜水。', [
    '原告 A 诉称，本组大作业代码几乎由其一人完成，最后一晚独自调试至凌晨三点。',
    '本院查明：C 在作业周期内被 @ 共计 11 次，首次回复时间为提交当晚凌晨三点零二分，内容为“啊？今天交吗”。B 完成了测试用例和报告，按时交付。',
    '本院认为，凌晨三点交作业是一种付出，凌晨三点才回消息是另一种状态，二者不可同日而语。',
    '综上，参考陪审团七人之意见，判决如下：本组贡献比例建议为 A 55%、B 30%、C 15%。建议 C 同学把群消息免打扰关掉。',
    '如不服本判决，可于三日内提出上诉。',
  ], { views: 860, agree: 201, comments: 33 }),
  done('survey', '0031', '2026-11-18T08:00:00Z', '社会学研究方法 · 3 人组', '反转：被告其实一个人做完了全部问卷', { A: 28, B: 47, C: 25 }, '陪审员 7 号：不说话的人未必没干活，卷宗里都写着。', [
    '原告 A 诉称，B 在群里几乎不发言，疑似划水，要求降低其贡献比例。',
    '本院查明：B 在群聊中发言仅 4 次，但问卷星后台记录显示，全部 312 份问卷由 B 一人发放、催收并清洗数据。A 在群中发言 87 次，其中 61 次为“收到”与表情包。',
    '本院认为，发言多不等于干活多，沉默者的付出同样应当被看见。',
    '综上，参考陪审团七人之意见，判决如下：本组贡献比例建议为 A 28%、B 47%、C 25%。原告诉求不予支持，建议原告当面向 B 道谢。',
    '如不服本判决，可于三日内提出上诉。',
  ], { views: 2400, agree: 590, comments: 88 }),
];

module.exports = { demo, feed };
