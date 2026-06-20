import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ModelConfig } from '../src/types';

type RequestBody = {
  models: ModelConfig[];
};

function normalizeConfigs(raw: unknown): ModelConfig[] {
  if (!Array.isArray(raw)) {
    throw new Error('配置必须是 JSON 数组');
  }

  return raw.map((item, index) => {
    const current = typeof item === 'object' && item !== null ? (item as Partial<ModelConfig>) : {};
    return {
      id: current.id?.trim() || `model-${index + 1}`,
      provider: current.provider?.trim() || '',
      model: current.model?.trim() || '',
      apiMode: 'real',
      baseUrl: current.baseUrl?.trim() || '',
      apiKey: current.apiKey?.trim() || '',
    };
  });
}

function validateConfigs(configs: ModelConfig[]) {
  if (!configs.length) throw new Error('至少需要一个模型配置');

  for (const config of configs) {
    if (!config.id?.trim()) throw new Error('每个模型都需要 id');
    if (!config.provider?.trim()) throw new Error(`模型 ${config.id} 的 provider 不能为空`);
    if (!config.model?.trim()) throw new Error(`模型 ${config.id} 的 model 不能为空`);
    if (!config.baseUrl?.trim()) throw new Error(`模型 ${config.id} 的 baseUrl 不能为空`);
    if (!config.apiKey?.trim()) throw new Error(`模型 ${config.id} 的 apiKey 不能为空`);
  }
}

async function readJsonResponseSafe(response: globalThis.Response) {
  const text = await response.text();
  try {
    return { data: text ? JSON.parse(text) : null, rawText: text };
  } catch {
    return { data: null, rawText: text };
  }
}

async function testSingleModel(model: ModelConfig) {
  const payload = {
    model: model.model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: '你必须只返回 JSON。' },
      { role: 'user', content: '请只返回 {"ok":true,"pong":"pong"}' },
    ],
  };

  const response = await fetch(`${model.baseUrl?.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${model.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const { data, rawText } = await readJsonResponseSafe(response);
  if (!response.ok) {
    const detail = data && typeof data === 'object' && 'error' in data
      ? String((data as { error: unknown }).error)
      : rawText.trim().slice(0, 220);
    return {
      ok: false,
      modelId: model.id,
      detail: `${response.status} ${detail || '未知错误'}`,
    };
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    return {
      ok: false,
      modelId: model.id,
      detail: '响应成功，但未返回 message.content',
    };
  }

  return {
    ok: true,
    modelId: model.id,
    detail: '接口可达，模型已返回内容',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as RequestBody;
    const models = normalizeConfigs(body?.models ?? []);
    validateConfigs(models);

    const results = [];
    for (const model of models) {
      results.push(await testSingleModel(model));
    }

    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
