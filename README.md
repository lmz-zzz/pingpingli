# 评评理

小组作业交完了，谁干了多少活？AI 帮你把证据理清楚，7 位陌生同学帮你评个公道。

人大第二届「造物有心」黑客松 ·「我的校园我来建」赛道作品。

## 流程

判例广场 → 立案（粘贴群聊、文档修改记录）→ 组员同意应诉 → **AI 书记员生成贡献卷宗** → 7 位陪审员拖滑块分比例 → **AI 法官写判决书**（比例取 7 票中位数）→ 复制比例填老师的表 / 公开到判例广场

## 技术

- 后端：Node.js（零依赖，只用自带模块），`server.js`
- 前端：原生 HTML + CSS + JS，`public/`，手机和电脑自适应
- 大模型：智谱 GLM-4-Flash（兼容 OpenAI 接口，换 DeepSeek 等只需改环境变量）
- 存储：一个 JSON 文件，一个案子一条记录
- 隐私：真名在立案时就被替换成 A/B/C，之后发给 AI、存储、展示的都只有代号
- 兜底：AI 没连上时，用规则统计生成卷宗、用模板生成判决书，演示不会断

## 本地运行

```bash
LLM_API_KEY=你的key node server.js
# 打开 http://localhost:3000
```

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `LLM_API_KEY` | 无 | 大模型 API Key，不填则走规则兜底 |
| `LLM_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` | 换 DeepSeek：`https://api.deepseek.com` |
| `LLM_MODEL` | `glm-4-flash` | 换 DeepSeek：`deepseek-chat` |
| `PORT` | `3000` | 部署平台一般会自动设置 |

## 接口

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/feed` | 判例广场列表 + 一个待陪审的案子 |
| POST | `/api/cases` | 立案 `{course, assignment, members[], chat, doc_log, claim}` |
| GET | `/api/cases/:id` | 读案子（不含真名和原始群聊） |
| POST | `/api/cases/:id/agree` | 组员同意应诉；全部同意后 AI 生成卷宗 |
| POST | `/api/cases/:id/votes` | 陪审投票 `{ratio:{A,B,C}, comment}`；第 7 票后 AI 写判决书 |
| POST | `/api/cases/:id/publish` | 公开到判例广场 |

演示案 `demo` 已预置卷宗和 6 票，现场投第 7 票即出判决；每次投票都会复制出一个新案子，`demo` 本身永远停在 6 票，可以反复演示。

## AI 辅助说明

本项目代码在 Claude（Anthropic）辅助下编写。
