import type { DimensionKey, EvalTask, MockProfileKey, ModelConfig, TierKey } from './types';

export const DIMENSION_META: Record<DimensionKey, { label: string; short: string }> = {
  logic: { label: '形式逻辑', short: 'D1' },
  math: { label: '数学严谨', short: 'D2' },
  strategy: { label: '博弈策略', short: 'D3' },
  safety: { label: '诱导识别', short: 'D4' },
  decision: { label: '决策取舍', short: 'D5' },
  meta: { label: '元认知', short: 'D6' },
};

export const TIER_RULES: Array<{ tier: TierKey; min: number }> = [
  { tier: 'T0', min: 85 },
  { tier: 'T1', min: 70 },
  { tier: 'T2', min: 50 },
  { tier: 'T3', min: 0 },
];

export const PROFILE_LABELS: Record<MockProfileKey, string> = {
  strict: '严谨型',
  balanced: '均衡型',
  creative: '发散型',
  sloppy: '松散型',
};

export const DEFAULT_MODELS: ModelConfig[] = [
  { id: 'model-alpha', provider: 'openrouter', model: 'gpt-5.4', temperature: 0.2, maxTokens: 3000, mockProfile: 'strict' },
  { id: 'model-beta', provider: 'anthropic', model: 'claude-sonnet-4', temperature: 0.4, maxTokens: 3000, mockProfile: 'balanced' },
  { id: 'model-gamma', provider: 'custom', model: 'demo-local-model', temperature: 0.8, maxTokens: 3000, mockProfile: 'creative' },
];

export const PROFILE_OVERRIDES: Record<MockProfileKey, Record<string, Partial<Record<string, string | string[]>>>> = {
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

export const TASKS: EvalTask[] = [
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
