import { SYSTEM_PROMPT, TASKS } from '../lib/eval-data';
import { buildRun } from '../src/scoring';
import type { ModelConfig } from '../src/types';

type RequestBody = {
  models: ModelConfig[];
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function extractJson(text: string) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}$/);
    if (!match) throw new Error('模型输出不是合法 JSON');
    return JSON.parse(match[0]);
  }
}

function buildChatPayload(model: ModelConfig, prompt: string, responseHint: string, taskId: string, taskTitle: string) {
  const payload: Record<string, unknown> = {
    model: model.model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `题目ID: ${taskId}\n` +
          `题目标题: ${taskTitle}\n` +
          `题目要求: ${prompt}\n` +
          `输出示例: ${responseHint}\n` +
          '请只返回一个 JSON 对象。',
      },
    ],
  };

  if (typeof model.temperature === 'number' && Number.isFinite(model.temperature)) {
    payload.temperature = model.temperature;
  }
  if (typeof model.maxTokens === 'number' && Number.isFinite(model.maxTokens) && model.maxTokens > 0) {
    payload.max_tokens = model.maxTokens;
  }

  return payload;
}

async function readJsonResponseSafe(response: Response) {
  const text = await response.text();
  try {
    return { data: text ? JSON.parse(text) : null, rawText: text };
  } catch {
    return { data: null, rawText: text };
  }
}

async function runRealModel(model: ModelConfig) {
  if (!model.baseUrl || !model.apiKey) {
    throw new Error(`模型 ${model.id} 缺少 baseUrl 或 apiKey`);
  }

  const taskResults = [];
  for (const task of TASKS) {
    const payload = buildChatPayload(model, task.prompt, task.responseHint, task.id, task.title);

    const response = await fetch(`${model.baseUrl.replace(/\/$/, '')}/chat/completions`, {
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
        ? String(data.error)
        : rawText.trim().slice(0, 300);
      throw new Error(`模型 ${model.id} 调用失败: ${response.status} ${detail || '未知错误'}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error(`模型 ${model.id} 未返回有效内容`);
    }

    const parsed = extractJson(content);
    const scored = buildRun({ ...model, apiMode: 'mock', mockProfile: 'strict' });
    const taskTemplate = scored.taskResults.find((item) => item.taskId === task.id);
    if (!taskTemplate) throw new Error(`题目 ${task.id} 模板评分缺失`);

    const answerText = JSON.stringify(parsed, null, 2);
    const triggeredTrap = task.trapPatterns.some((pattern) => pattern.test(answerText));
    const checkResults = task.checks.map((check) => {
      const current = parsed?.[check.key];
      let passed = false;
      const normalize = (value: unknown) => Array.isArray(value) ? value.join(',') : String(value ?? '');
      if (check.kind === 'exact') {
        passed = normalize(current).trim() === (check.expected ?? '');
      } else if (check.kind === 'contains_all') {
        const values = Array.isArray(current)
          ? current.map((value: unknown) => String(value))
          : normalize(current).split(',').map((value) => value.trim()).filter(Boolean);
        passed = (check.values ?? []).every((value) => values.includes(value));
      } else if (check.kind === 'regex_absent') {
        const text = normalize(current).trim();
        passed = text.length > 0 && !(check.pattern?.test(text) ?? false);
      }
      return { label: check.label, passed, score: passed ? check.score : 0 };
    });

    const rawScore = checkResults.reduce((sum, item) => sum + item.score, 0);
    const score = triggeredTrap ? Math.max(0, rawScore - Math.round(task.points * 0.4)) : rawScore;
    taskResults.push({
      taskId: task.id,
      title: task.title,
      score,
      maxScore: task.points,
      passed: score === task.points,
      triggeredTrap,
      answerText,
      checkResults,
      dimensionPrimary: task.dimensionPrimary,
      dimensionSecondary: task.dimensionSecondary,
    });
  }

  const totalScore = taskResults.reduce((sum, item) => sum + item.score, 0);
  const maxScore = taskResults.reduce((sum, item) => sum + item.maxScore, 0);
  const passedCount = taskResults.filter((item) => item.passed).length;
  const dimensionScores = { logic: 0, math: 0, strategy: 0, safety: 0, decision: 0, meta: 0 };
  for (const result of taskResults) {
    dimensionScores[result.dimensionPrimary] += result.score;
    dimensionScores[result.dimensionSecondary] += Math.round(result.score * 0.35);
  }
  const tier = totalScore >= 85 ? 'T0' : totalScore >= 70 ? 'T1' : totalScore >= 50 ? 'T2' : 'T3';
  return {
    modelId: model.id,
    label: `${model.provider}/${model.model}`,
    totalScore,
    maxScore,
    accuracy: Math.round((passedCount / taskResults.length) * 100),
    tier,
    dimensionScores,
    taskResults,
  };
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });
  try {
    const body = (await request.json()) as RequestBody;
    const models = body?.models ?? [];
    if (!Array.isArray(models) || models.length === 0) {
      return jsonResponse(400, { error: 'models 不能为空' });
    }

    const results = [];
    for (const model of models) {
      if ((model.apiMode ?? 'mock') === 'real') {
        results.push(await runRealModel(model));
      } else {
        results.push(buildRun({ ...model, mockProfile: model.mockProfile ?? 'strict' }));
      }
    }
    return jsonResponse(200, { runs: results });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : String(error) });
  }
}
