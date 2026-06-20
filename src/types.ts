export type DimensionKey = 'logic' | 'math' | 'strategy' | 'safety' | 'decision' | 'meta';
export type TierKey = 'T0' | 'T1' | 'T2' | 'T3';
export type MockProfileKey = 'strict' | 'balanced' | 'creative' | 'sloppy';

export type ModelConfig = {
  id: string;
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  mockProfile?: MockProfileKey;
  apiMode?: 'mock' | 'real';
  baseUrl?: string;
  apiKey?: string;
};

export type TaskCheck = {
  key: string;
  label: string;
  score: number;
  kind: 'exact' | 'contains_all' | 'regex_absent';
  expected?: string;
  values?: string[];
  pattern?: RegExp;
};

export type EvalTask = {
  id: string;
  title: string;
  dimensionPrimary: DimensionKey;
  dimensionSecondary: DimensionKey;
  points: number;
  prompt: string;
  responseHint: string;
  answer: Record<string, string | string[]>;
  checks: TaskCheck[];
  trapPatterns: RegExp[];
};

export type TaskResult = {
  taskId: string;
  title: string;
  score: number;
  maxScore: number;
  passed: boolean;
  triggeredTrap: boolean;
  answerText: string;
  checkResults: Array<{ label: string; passed: boolean; score: number }>;
  dimensionPrimary: DimensionKey;
  dimensionSecondary: DimensionKey;
};

export type ModelRun = {
  modelId: string;
  label: string;
  totalScore: number;
  maxScore: number;
  accuracy: number;
  tier: TierKey;
  dimensionScores: Record<DimensionKey, number>;
  taskResults: TaskResult[];
};
