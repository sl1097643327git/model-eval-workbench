import { DEFAULT_MODELS, PROFILE_OVERRIDES, TASKS, TIER_RULES } from './data';
import type { EvalTask, MockProfileKey, ModelConfig, ModelRun, TaskResult } from './types';

function scoreToTier(score: number) {
  return TIER_RULES.find((rule) => score >= rule.min)?.tier ?? 'T3';
}

function toAnswerText(answer: Record<string, string | string[]>) {
  return JSON.stringify(answer, null, 2);
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
  const answerText = toAnswerText(answer);
  const triggeredTrap = task.trapPatterns.some((pattern) => pattern.test(answerText));

  const checkResults = task.checks.map((check) => {
    const current = answer[check.key];
    let passed = false;

    if (check.kind === 'exact') {
      passed = normalizeValue(current).trim() === (check.expected ?? '');
    } else if (check.kind === 'contains_all') {
      const values = Array.isArray(current)
        ? current.map((value) => String(value))
        : normalizeValue(current)
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
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

export function buildRun(model: ModelConfig): ModelRun {
  const taskResults = TASKS.map((task) => evaluateTask(task, applyProfile(task, model.mockProfile)));
  const totalScore = taskResults.reduce((sum, item) => sum + item.score, 0);
  const maxScore = taskResults.reduce((sum, item) => sum + item.maxScore, 0);
  const passedCount = taskResults.filter((item) => item.passed).length;
  const dimensionScores = { logic: 0, math: 0, strategy: 0, safety: 0, decision: 0, meta: 0 };

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

export function serializeDefaultModels() {
  return JSON.stringify(DEFAULT_MODELS, null, 2);
}
