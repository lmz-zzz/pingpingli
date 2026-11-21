// 调用大模型（任何兼容 OpenAI 接口的服务都行：智谱、DeepSeek、通义、Kimi……）
// 换模型只要改环境变量 LLM_BASE_URL / LLM_MODEL / LLM_API_KEY，不用改代码。

const BASE_URL = process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
const MODEL = process.env.LLM_MODEL || 'glm-4-flash';
const API_KEY = process.env.LLM_API_KEY || '';

function hasKey() {
  return Boolean(API_KEY);
}

// 从模型回复里抠出 JSON（模型有时会包一层 ```json ``` 代码块）
function parseJson(text) {
  try { return JSON.parse(text); } catch (_) {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('模型没有返回 JSON');
}

async function chatJson(system, user, { timeoutMs = 60000, temperature = 0.7 } = {}) {
  if (!API_KEY) throw new Error('没有配置 LLM_API_KEY');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`模型接口报错 ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return parseJson(data.choices[0].message.content);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chatJson, hasKey, MODEL };
