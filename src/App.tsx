import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  Cpu,
  Gauge,
  KeyRound,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trophy,
  XCircle,
} from 'lucide-react';
import { DEFAULT_MODELS, DIMENSION_META, TASKS } from './data';
import type { ModelConfig, ModelRun } from './types';

type ConfigDraft = {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: string;
  maxTokens: string;
};

const DEFAULT_DRAFT: ConfigDraft = {
  provider: DEFAULT_MODELS[0]?.provider ?? 'openrouter',
  model: DEFAULT_MODELS[0]?.model ?? '',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  temperature: '0.2',
  maxTokens: '1200',
};

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card stat-card">
      <div className="muted">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="muted">{hint}</div>
    </div>
  );
}

function StepCard({
  index,
  title,
  text,
  active,
}: {
  index: number;
  title: string;
  text: string;
  active?: boolean;
}) {
  return (
    <div className={`step-card${active ? ' active' : ''}`}>
      <div className="step-index">{index}</div>
      <div>
        <div className="step-title">{title}</div>
        <div className="muted step-text">{text}</div>
      </div>
    </div>
  );
}

function buildConfigFromDraft(draft: ConfigDraft): ModelConfig {
  return {
    id: 'primary-model',
    provider: draft.provider.trim(),
    model: draft.model.trim(),
    temperature: Number(draft.temperature || '0'),
    maxTokens: Number(draft.maxTokens || '0'),
    apiMode: 'real',
    baseUrl: draft.baseUrl.trim(),
    apiKey: draft.apiKey.trim(),
  };
}

export default function App() {
  const [draft, setDraft] = useState<ConfigDraft>(DEFAULT_DRAFT);
  const [configText, setConfigText] = useState(JSON.stringify([buildConfigFromDraft(DEFAULT_DRAFT)], null, 2));
  const [advancedMode, setAdvancedMode] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runs, setRuns] = useState<ModelRun[]>([]);
  const [showOnlyIssues, setShowOnlyIssues] = useState(true);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);

  const hasResults = runs.length > 0;
  const bestRun = useMemo(() => [...runs].sort((a, b) => b.totalScore - a.totalScore || b.accuracy - a.accuracy)[0], [runs]);
  const selectedRun = runs.find((item) => item.modelId === selectedModelId) ?? runs[0];
  const visibleTasks = useMemo(() => {
    if (!selectedRun) return [];
    return showOnlyIssues ? selectedRun.taskResults.filter((item) => !item.passed || item.triggeredTrap) : selectedRun.taskResults;
  }, [selectedRun, showOnlyIssues]);
  const failedCount = selectedRun?.taskResults.filter((item) => !item.passed).length ?? 0;
  const trapCount = selectedRun?.taskResults.filter((item) => item.triggeredTrap).length ?? 0;

  function syncJsonFromDraft(nextDraft: ConfigDraft) {
    setConfigText(JSON.stringify([buildConfigFromDraft(nextDraft)], null, 2));
  }

  function updateDraft<K extends keyof ConfigDraft>(key: K, value: ConfigDraft[K]) {
    setDraft((current) => {
      const nextDraft = { ...current, [key]: value };
      if (!advancedMode) syncJsonFromDraft(nextDraft);
      return nextDraft;
    });
  }

  function loadExample() {
    setDraft(DEFAULT_DRAFT);
    setAdvancedMode(false);
    setParseError(null);
    setRunError(null);
    setRuns([]);
    setSelectedModelId('');
    setExpandedTaskIds([]);
    setShowOnlyIssues(true);
    setConfigText(JSON.stringify([buildConfigFromDraft(DEFAULT_DRAFT)], null, 2));
  }

  function validateConfigs(configs: ModelConfig[]) {
    if (!configs.length) throw new Error('至少需要一个模型配置');

    for (const config of configs) {
      if (!config.provider?.trim()) throw new Error('provider 不能为空');
      if (!config.model?.trim()) throw new Error('model 不能为空');
      if (!config.baseUrl?.trim()) throw new Error('baseUrl 不能为空');
      if (!config.apiKey?.trim()) throw new Error('apiKey 不能为空');
      if (!Number.isFinite(config.temperature)) throw new Error('temperature 必须是数字');
      if (!Number.isFinite(config.maxTokens) || config.maxTokens <= 0) throw new Error('maxTokens 必须大于 0');
    }
  }

  async function handleRun() {
    try {
      const rawText = advancedMode ? configText : JSON.stringify([buildConfigFromDraft(draft)]);
      const parsed = JSON.parse(rawText) as ModelConfig[];
      validateConfigs(parsed);

      setParseError(null);
      setRunError(null);
      setIsRunning(true);

      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          models: parsed.map((model, index) => ({
            ...model,
            id: model.id?.trim() || `model-${index + 1}`,
            apiMode: 'real',
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? '真实评测调用失败');
      }

      const nextRuns = data.runs ?? [];
      setRuns(nextRuns);
      setSelectedModelId(nextRuns[0]?.modelId ?? '');
      setExpandedTaskIds(nextRuns[0]?.taskResults.filter((item: { passed: boolean; triggeredTrap: boolean }) => !item.passed || item.triggeredTrap).map((item: { taskId: string }) => item.taskId) ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('JSON')) {
        setParseError(message);
      } else {
        setRunError(message);
      }
    } finally {
      setIsRunning(false);
    }
  }

  async function copyConfig() {
    const text = advancedMode ? configText : JSON.stringify([buildConfigFromDraft(draft)], null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setRunError('复制失败，请手动复制配置');
    }
  }

  function toggleTask(taskId: string) {
    setExpandedTaskIds((current) => (current.includes(taskId) ? current.filter((item) => item !== taskId) : [...current, taskId]));
  }

  return (
    <div className="app-shell">
      <div className="hero compact-hero">
        <div>
          <div className="eyebrow">真实模型评测工作台</div>
          <h1>直接接 API，快速跑出清晰结果</h1>
          <p>
            不再区分 mock。你只需要填模型接口信息，点一次运行，就能看到总分、通过率、错题位置和每题失分原因。
          </p>
        </div>
        <div className="hero-actions">
          <button className="button" onClick={handleRun} disabled={isRunning}>
            {isRunning ? <><LoaderCircle size={16} className="spin" /> 正在评测</> : <><Send size={16} /> 开始评测</>}
          </button>
          <button className="button secondary" onClick={loadExample}><RefreshCw size={16} /> 恢复示例</button>
        </div>
      </div>

      <div className="steps-grid">
        <StepCard index={1} title="填接口信息" text="先填 provider、model、baseUrl、apiKey。" active />
        <StepCard index={2} title="发起真实评测" text="点击开始评测，系统会调用真实模型接口。" active={isRunning} />
        <StepCard index={3} title="看清结果" text="先看总分与错题，再展开看每题原因。" active={hasResults} />
      </div>

      <div className="panel-grid single-focus">
        <div className="card">
          <div className="card-header">
            <h2><KeyRound size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />模型接入信息</h2>
            <div className="toolbar-inline">
              <button className={`button secondary small${advancedMode ? ' active-mode' : ''}`} onClick={() => setAdvancedMode((value) => !value)}>
                <Sparkles size={14} /> {advancedMode ? '切回简洁模式' : '高级 JSON'}
              </button>
              <button className="button secondary small" onClick={copyConfig}><Copy size={14} /> 复制配置</button>
            </div>
          </div>

          {!advancedMode ? (
            <div className="form-grid">
              <label className="field">
                <span>Provider</span>
                <input value={draft.provider} onChange={(e) => updateDraft('provider', e.target.value)} placeholder="如 openrouter / openai / anthropic" />
              </label>
              <label className="field">
                <span>Model</span>
                <input value={draft.model} onChange={(e) => updateDraft('model', e.target.value)} placeholder="如 openai/gpt-4.1-mini" />
              </label>
              <label className="field field-full">
                <span>Base URL</span>
                <input value={draft.baseUrl} onChange={(e) => updateDraft('baseUrl', e.target.value)} placeholder="如 https://openrouter.ai/api/v1" />
              </label>
              <label className="field field-full">
                <span>API Key</span>
                <input type="password" value={draft.apiKey} onChange={(e) => updateDraft('apiKey', e.target.value)} placeholder="输入真实 API Key" />
              </label>
              <label className="field">
                <span>Temperature</span>
                <input value={draft.temperature} onChange={(e) => updateDraft('temperature', e.target.value)} placeholder="0.2" />
              </label>
              <label className="field">
                <span>Max Tokens</span>
                <input value={draft.maxTokens} onChange={(e) => updateDraft('maxTokens', e.target.value)} placeholder="1200" />
              </label>
            </div>
          ) : (
            <textarea className="textarea mono compact-textarea" value={configText} onChange={(e) => setConfigText(e.target.value)} spellCheck={false} />
          )}

          {parseError ? (
            <div className="badge warn block-badge"><ShieldAlert size={14} /> JSON 解析失败：{parseError}</div>
          ) : runError ? (
            <div className="badge warn block-badge"><AlertCircle size={14} /> 运行失败：{runError}</div>
          ) : (
            <div className="footer-note">
              建议先接入一个模型跑通，再扩展成多个模型。手机上默认使用简洁表单，只有需要批量配置时再切到高级 JSON。
            </div>
          )}
        </div>

        <div className="card quick-guide-card">
          <div className="card-header">
            <h2><Brain size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />使用说明</h2>
          </div>
          <div className="tip-list compact-list">
            <div className="tip">
              <strong>适合谁</strong>
              <div className="muted">想直接比较一个或多个真实模型表现，而不是看演示数据的人。</div>
            </div>
            <div className="tip">
              <strong>最短路径</strong>
              <div className="muted">填 6 个字段 → 点击开始评测 → 看总分、错题数、陷阱触发。</div>
            </div>
            <div className="tip">
              <strong>结果怎么看</strong>
              <div className="muted">先看冠军和通过率，再看失败题；只有错题才值得展开读细节。</div>
            </div>
            <div className="tip">
              <strong>当前题量</strong>
              <div className="muted">共 {TASKS.length} 题，覆盖 {Object.keys(DIMENSION_META).length} 个维度，强调结构化输出和可判定结果。</div>
            </div>
          </div>
        </div>
      </div>

      <div className="stat-grid compact-stats">
        <StatCard label="当前冠军" value={bestRun ? bestRun.label : '尚未评测'} hint={bestRun ? `${bestRun.totalScore}/${bestRun.maxScore} · ${bestRun.tier}` : '先运行一次才会出现'} />
        <StatCard label="通过率" value={selectedRun ? `${selectedRun.accuracy}%` : '-'} hint={selectedRun ? `${selectedRun.taskResults.filter((item) => item.passed).length}/${selectedRun.taskResults.length} 题满分` : '暂无结果'} />
        <StatCard label="失败题数" value={selectedRun ? String(failedCount) : '-'} hint="优先看这些题的扣分原因" />
        <StatCard label="陷阱触发" value={selectedRun ? String(trapCount) : '-'} hint="触发后会有额外扣分" />
      </div>

      {hasResults ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header stack-mobile">
              <h2><Trophy size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />模型结果总览</h2>
              <div className="toolbar-inline wrap-mobile">
                <button className={`button secondary small${showOnlyIssues ? ' active-mode' : ''}`} onClick={() => setShowOnlyIssues((value) => !value)}>
                  <ShieldAlert size={14} /> {showOnlyIssues ? '当前仅看问题题目' : '显示全部题目'}
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>模型</th>
                    <th>总分</th>
                    <th>通过率</th>
                    <th>档位</th>
                    <th>问题题数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.slice().sort((a, b) => b.totalScore - a.totalScore || b.accuracy - a.accuracy).map((run) => {
                    const issueCount = run.taskResults.filter((item) => !item.passed || item.triggeredTrap).length;
                    return (
                      <tr key={run.modelId}>
                        <td>
                          <div>{run.label}</div>
                          <div className="muted">{run.modelId}</div>
                        </td>
                        <td>{run.totalScore}/{run.maxScore}</td>
                        <td>{run.accuracy}%</td>
                        <td><span className="badge">{run.tier}</span></td>
                        <td>{issueCount}</td>
                        <td><button className="button secondary small" onClick={() => setSelectedModelId(run.modelId)}>查看详情</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {selectedRun ? (
            <div className="two-col results-layout">
              <div className="card">
                <div className="card-header">
                  <h2><Gauge size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />维度得分</h2>
                </div>
                {Object.entries(DIMENSION_META).map(([key, meta]) => {
                  const value = selectedRun.dimensionScores[key as keyof typeof selectedRun.dimensionScores];
                  const width = Math.min(100, Math.round((value / 35) * 100));
                  return (
                    <div className="bar-row" key={key}>
                      <div className="bar-head">
                        <span>{meta.short} {meta.label}</span>
                        <span className="muted">{value}</span>
                      </div>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${width}%` }} /></div>
                    </div>
                  );
                })}
                <div className="footer-note">这部分适合看模型强弱结构；真正排查问题时，优先看右侧的问题题目。</div>
              </div>

              <div className="card">
                <div className="card-header stack-mobile">
                  <h2><ClipboardList size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />题目结果明细</h2>
                  <div className="muted">{showOnlyIssues ? `当前显示 ${visibleTasks.length} 道问题题` : `当前显示全部 ${visibleTasks.length} 道题`}</div>
                </div>

                {visibleTasks.length === 0 ? (
                  <div className="empty-state">
                    <CheckCircle2 size={18} /> 当前没有问题题，说明这个模型在这套题上表现完整通过。
                  </div>
                ) : visibleTasks.map((result) => {
                  const expanded = expandedTaskIds.includes(result.taskId);
                  return (
                    <div className="task-card issue-first" key={result.taskId}>
                      <button className="task-toggle" onClick={() => toggleTask(result.taskId)}>
                        <div>
                          <div><strong>{result.taskId} · {result.title}</strong></div>
                          <div className="muted">{DIMENSION_META[result.dimensionPrimary].label} / {DIMENSION_META[result.dimensionSecondary].label}</div>
                        </div>
                        <div className="task-toggle-right">
                          {result.passed ? <span className="badge ok"><CheckCircle2 size={14} />满分</span> : <span className="badge fail"><XCircle size={14} />未满分</span>}
                          {result.triggeredTrap ? <span className="badge warn">触发陷阱</span> : null}
                          <span className="score-chip">{result.score}/{result.maxScore}</span>
                          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </button>

                      {expanded ? (
                        <>
                          <div className="check-grid mobile-single">
                            {result.checkResults.map((check) => (
                              <div className="check-item" key={check.label}>
                                <span className="muted">{check.label}</span>
                                <strong style={{ color: check.passed ? '#86efac' : '#fda4af' }}>{check.passed ? `+${check.score}` : '+0'}</strong>
                              </div>
                            ))}
                          </div>
                          <div className="code-block mono">{result.answerText}</div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="card empty-results-card">
          <div className="empty-state large">
            <Cpu size={20} /> 还没有评测结果。先填好真实模型配置，再点击“开始评测”。
          </div>
        </div>
      )}
    </div>
  );
}
