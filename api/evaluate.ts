import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { DimensionKey, EvalTask, MockProfileKey, ModelConfig, ModelRun, TaskResult, TierKey } from '../src/types';

type RequestBody = {
  models: ModelConfig[];
};

const SYSTEM_PROMPT = `你是结构化答题模型。你必须严格输出 JSON，不允许输出 markdown，不允许解释，不允许多余前后缀。所有字段必须存在，字段名必须与题目要求完全一致。`;

const TIER_RULES: Array<{ tier: TierKey; min: number }> = [
  { tier: 'T0', min: 85 },
  { tier: 'T1', min: 70 },
  { tier: 'T2', min: 50 },
  { tier: 'T3', min: 0 },
];

const PROFILE_OVERRIDES: Record<MockProfileKey, Record<string, Partial<Record<string, string | string[]>>>> = {
  strict: {},
  balanced: {
    E003: { assumptions: 'public_signal,private_type', equilibrium: 'pooling' },
  },
  creative: {
    E002: { boundary: 'unknown', proof_mode: 'pattern_guess' },
    E004: { decision: 'delay', loss: 'unbounded', boundary: 'need more info' },
  },
  sloppy: {
    E001: { final_answer: 'paradox', used_axioms: ['A1'], boundary: '略' },
    E002: { final_answer: 'has_solution', modulus: 'mod 5', proof_mode: 'intuitive' },
    E003: { assumptions: 'market average', equilibrium: 'depends', boundary: '视情况而定' },
    E004: { decision: 'neutral', loss: '0', rejected_option: 'none', boundary: '看情况' },
  },
};

const TASKS: EvalTask[] = [
  {
    id: 'E001',
    title: '自定义公理自指校验',
    dimensionPrimary: 'logic',
    dimensionSecondary: 'meta',
    points: 25,
    prompt: '在 A1-A4 下判断命题 P 是否可成立，要求给出最终结论、使用公理、证明方式、边界说明。',
    responseHint: '{"final_answer":"false","used_axioms":["A2","A4"],"proof_mode":"contradiction","boundary":"finite domain only"}',
    answer: { final_answer: 'false', used_axioms: ['A2', 'A4'], proof_mode: 'contradiction', boundary: 'finite domain only' },
    checks: [
      { key: 'final_answer', label: '最终结论为 false', score: 8, kind: 'exact', expected: 'false' },
      { key: 'used_axioms', label: '同时使用 A2 与 A4', score: 7, kind: 'contains_all', values: ['A2', 'A4'] },
      { key: 'proof_mode', label: '证明方式为反证法', score: 5, kind: 'exact', expected: 'contradiction' },
      { key: 'boundary', label: '边界字段非空且非敷衍', score: 5, kind: 'regex_absent', pattern: /^(略|unknown|none)?$/i },
    ],
    trapPatterns: [/paradox/i, /cannot determine/i],
  },
  {
    id: 'E002',
    title: '模数陷阱数论证明',
    dimensionPrimary: 'math',
    dimensionSecondary: 'logic',
    points: 25,
    prompt: '判断方程 x^2 + 3x + 5 = 0 在模 7 下是否有解，并给出模数、结论、证明方式与边界。',
    responseHint: '{"final_answer":"no_solution","modulus":"mod 7","proof_mode":"enumeration","boundary":"only modulo 7"}',
    answer: { final_answer: 'no_solution', modulus: 'mod 7', proof_mode: 'enumeration', boundary: 'only modulo 7' },
    checks: [
      { key: 'final_answer', label: '结论为无解', score: 8, kind: 'exact', expected: 'no_solution' },
      { key: 'modulus', label: '显式写出 mod 7', score: 6, kind: 'exact', expected: 'mod 7' },
      { key: 'proof_mode', label: '证明方式为枚举校验', score: 6, kind: 'exact', expected: 'enumeration' },
      { key: 'boundary', label: '说明适用边界', score: 5, kind: 'regex_absent', pattern: /^(略|unknown|none)?$/i },
    ],
    trapPatterns: [/mod 5/i, /has_solution/i, /intuitive/i],
  },
  {
    id: 'E003',
    title: '不完全信息博弈选择',
    dimensionPrimary: 'strategy',
    dimensionSecondary: 'safety',
    points: 25,
    prompt: '给定私有类型与公共信号，判断均衡类型，并列出前提、均衡、排除方案、边界。',
    responseHint: '{"assumptions":"public_signal,private_type","equilibrium":"separating","rejected_option":"pooling","boundary":"fails if prior shifts"}',
    answer: { assumptions: 'public_signal,private_type', equilibrium: 'separating', rejected_option: 'pooling', boundary: 'fails if prior shifts' },
    checks: [
      { key: 'assumptions', label: '前提包含 public_signal 与 private_type', score: 6, kind: 'contains_all', values: ['public_signal', 'private_type'] },
      { key: 'equilibrium', label: '均衡类型为 separating', score: 8, kind: 'exact', expected: 'separating' },
      { key: 'rejected_option', label: '明确排除 pooling', score: 6, kind: 'exact', expected: 'pooling' },
      { key: 'boundary', label: '给出失效边界', score: 5, kind: 'regex_absent', pattern: /(视情况|depends|none)/i },
    ],
    trapPatterns: [/depends/i, /market average/i],
  },
  {
    id: 'E004',
    title: '量化损失决策题',
    dimensionPrimary: 'decision',
    dimensionSecondary: 'meta',
    points: 25,
    prompt: '在 A/B/C 三方案中必须选一个，输出 decision、loss、rejected_option、boundary。只要中立或拖延即判错。',
    responseHint: '{"decision":"B","loss":"17","rejected_option":"A","boundary":"valid only when horizon=12"}',
    answer: { decision: 'B', loss: '17', rejected_option: 'A', boundary: 'valid only when horizon=12' },
    checks: [
      { key: 'decision', label: '明确选 B', score: 8, kind: 'exact', expected: 'B' },
      { key: 'loss', label: '量化损失为 17', score: 7, kind: 'exact', expected: '17' },
      { key: 'rejected_option', label: '明确拒绝 A', score: 5, kind: 'exact', expected: 'A' },
      { key: 'boundary', label: '标注 horizon=12 的边界', score: 5, kind: 'exact', expected: 'valid only when horizon=12' },
    ],
    trapPatterns: [/neutral/i, /delay/i, /need more info/i, /看情况/i],
  },
];

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

function scoreToTier(score: number) {
  return TIER_RULES.find((rule) => score >= rule.min)?.tier ?? 'T3';
}

function normalizeValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.join(',');
  return value ?? '';
}

function applyProfile(task: EvalTask, profile: MockProfileKey): Record<string, string | string[]> {
  const overrides = PROFILE_OVERRIDES[profile][task.id] ?? {};
  const merged: Record<string, string | string[]> = { ...task.answer };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function evaluateTask(task: EvalTask, answer: Record<string, string | string[]>): TaskResult {
  const answerText = JSON.stringify(answer, null, 2);
  const triggeredTrap = task.trapPatterns.some((pattern) => pattern.test(answerText));
  const checkResults = task.checks.map((check) => {
    const current = answer[check.key];
    let passed = false;

    if (check.kind === 'exact') {
      passed = normalizeValue(current).trim() === (check.expected ?? '');
    } else if (check.kind === 'contains_all') {
      const values = Array.isArray(current)
        ? current.map((value) => String(value))
        : normalizeValue(current).split(',').map((value) => value.trim()).filter(Boolean);
      passed = (check.values ?? []).every((value) => values.includes(value));
    } else if (check.kind === 'regex_absent') {
      const text = normalizeValue(current).trim();
      passed = text.length > 0 && !(check.pattern?.test(text) ?? false);
    }

    return { label: check.label, passed, score: passed ? check.score : 0 };
  });

  const rawScore = checkResults.reduce((sum, item) => sum + item.score, 0);
  const score = triggeredTrap ? Math.max(0, rawScore - Math.round(task.points * 0.4)) : rawScore;

  return {
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
  };
}

function buildRun(model: ModelConfig): ModelRun {
  const taskResults = TASKS.map((task) => evaluateTask(task, applyProfile(task, model.mockProfile ?? 'strict')));
  const totalScore = taskResults.reduce((sum, item) => sum + item.score, 0);
  const maxScore = taskResults.reduce((sum, item) => sum + item.maxScore, 0);
  const passedCount = taskResults.filter((item) => item.passed).length;
  const dimensionScores: Record<DimensionKey, number> = { logic: 0, math: 0, strategy: 0, safety: 0, decision: 0, meta: 0 };

  for (const result of taskResults) {
    dimensionScores[result.dimensionPrimary] += result.score;
    dimensionScores[result.dimensionSecondary] += Math.round(result.score * 0.35);
  }

  return {
    modelId: model.id,
    label: `${model.provider}/${model.model}`,
    totalScore,
    maxScore,
    accuracy: Math.round((passedCount / taskResults.length) * 100),
    tier: scoreToTier(totalScore),
    dimensionScores,
    taskResults,
  };
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

async function readJsonResponseSafe(response: globalThis.Response) {
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
        ? String((data as { error: unknown }).error)
        : rawText.trim().slice(0, 300);
      throw new Error(`模型 ${model.id} 调用失败: ${response.status} ${detail || '未知错误'}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error(`模型 ${model.id} 未返回有效内容`);
    }

    const parsed = extractJson(content);
    taskResults.push(evaluateTask(task, parsed as Record<string, string | string[]>));
  }

  const totalScore = taskResults.reduce((sum, item) => sum + item.score, 0);
  const maxScore = taskResults.reduce((sum, item) => sum + item.maxScore, 0);
  const passedCount = taskResults.filter((item) => item.passed).length;
  const dimensionScores: Record<DimensionKey, number> = { logic: 0, math: 0, strategy: 0, safety: 0, decision: 0, meta: 0 };

  for (const result of taskResults) {
    dimensionScores[result.dimensionPrimary] += result.score;
    dimensionScores[result.dimensionSecondary] += Math.round(result.score * 0.35);
  }

  return {
    modelId: model.id,
    label: `${model.provider}/${model.model}`,
    totalScore,
    maxScore,
    accuracy: Math.round((passedCount / taskResults.length) * 100),
    tier: scoreToTier(totalScore),
    dimensionScores,
    taskResults,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as RequestBody;
    const models = body?.models ?? [];
    if (!Array.isArray(models) || models.length === 0) {
      res.status(400).json({ error: 'models 不能为空' });
      return;
    }

    const results = [];
    for (const model of models) {
      if ((model.apiMode ?? 'mock') === 'real') {
        results.push(await runRealModel(model));
      } else {
        results.push(buildRun({ ...model, mockProfile: model.mockProfile ?? 'strict' }));
      }
    }

    res.status(200).json({ runs: results });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
