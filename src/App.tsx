import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  Cpu,
  Gauge,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Trophy,
  Wifi,
  XCircle,
} from 'lucide-react';
import { DEFAULT_MODELS, DIMENSION_META } from './data';
import type { ModelConfig, ModelRun } from './types';

type ConfigDraft = {
  id: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
};

type ConnectionStatus = {
  ok: boolean;
  modelId: string;
  detail: string;
};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const UI_VERSION = 'v2026.06.21-2';

function createDraft(seed?: Partial<ConfigDraft>, index = 1): ConfigDraft {
  return {
    id: seed?.id ?? `model-${index}`,
    provider: seed?.provider ?? DEFAULT_MODELS[0]?.provider ?? 'openrouter',
    model: seed?.model ?? DEFAULT_MODELS[0]?.model ?? '',
    baseUrl: seed?.baseUrl ?? DEFAULT_BASE_URL,
    apiKey: seed?.apiKey ?? '',
  };
}

const DEFAULT_DRAFTS: ConfigDraft[] = [createDraft(undefined, 1)];

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card stat-card">
      <div className="muted">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="muted">{hint}</div>
    </div>
  );
}

function buildConfigFromDraft(draft: ConfigDraft): ModelConfig {
  return {
    id: draft.id.trim(),
    provider: draft.provider.trim(),
    model: draft.model.trim(),
    apiMode: 'real',
    baseUrl: draft.baseUrl.trim(),
    apiKey: draft.apiKey.trim(),
  };
}

function buildJsonFromDrafts(drafts: ConfigDraft[]) {
  return JSON.stringify(drafts.map(buildConfigFromDraft), null, 2);
}

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

async function readResponseJsonSafe(response: Response) {
  const text = await response.text();
  try {
    return { data: text ? JSON.parse(text) : null, rawText: text };
  } catch {
    const compactText = text.trim().slice(0, 220) || '空响应';
    throw new Error(`服务端返回的不是 JSON：${compactText}`);
  }
}

export default function App() {
  const [drafts, setDrafts] = useState<ConfigDraft[]>(DEFAULT_DRAFTS);
  const [configText, setConfigText] = useState(buildJsonFromDrafts(DEFAULT_DRAFTS));
  const [advancedMode, setAdvancedMode] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isSavingJson, setIsSavingJson] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [jsonDirty, setJsonDirty] = useState(false);
  const [connectionResults, setConnectionResults] = useState<ConnectionStatus[]>([]);
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

  function syncJsonFromDrafts(nextDrafts: ConfigDraft[]) {
    setConfigText(buildJsonFromDrafts(nextDrafts));
    setJsonDirty(false);
  }

  function clearMessages() {
    setParseError(null);
    setRunError(null);
  }

  function updateDraft(index: number, key: keyof ConfigDraft, value: string) {
    setDrafts((current) => {
      const nextDrafts = current.map((draft, currentIndex) => (
        currentIndex === index ? { ...draft, [key]: value } : draft
      ));
      if (!advancedMode) syncJsonFromDrafts(nextDrafts);
      return nextDrafts;
    });
  }

  function addDraft() {
    setDrafts((current) => {
      const nextDrafts = [...current, createDraft({}, current.length + 1)];
      if (!advancedMode) syncJsonFromDrafts(nextDrafts);
      return nextDrafts;
    });
  }

  function removeDraft(index: number) {
    setDrafts((current) => {
      if (current.length === 1) return current;
      const nextDrafts = current.filter((_, currentIndex) => currentIndex !== index);
      if (!advancedMode) syncJsonFromDrafts(nextDrafts);
      return nextDrafts;
    });
  }

  function loadExample() {
    const nextDrafts = DEFAULT_DRAFTS.map((draft, index) => createDraft(draft, index + 1));
    setDrafts(nextDrafts);
    setAdvancedMode(false);
    clearMessages();
    setConnectionResults([]);
    setRuns([]);
    setSelectedModelId('');
    setExpandedTaskIds([]);
    setShowOnlyIssues(true);
    setConfigText(buildJsonFromDrafts(nextDrafts));
    setJsonDirty(false);
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

  function getConfigsForSubmit() {
    const requestConfigText = advancedMode ? configText : buildJsonFromDrafts(drafts);
    const parsed = normalizeConfigs(JSON.parse(requestConfigText));
    validateConfigs(parsed);
    return parsed;
  }

  async function handleSaveJson() {
    try {
      setIsSavingJson(true);
      clearMessages();
      const parsed = getConfigsForSubmit();
      const nextDrafts = parsed.map((config, index) => createDraft(config, index + 1));
      setDrafts(nextDrafts);
      setConfigText(buildJsonFromDrafts(nextDrafts));
      setJsonDirty(false);
      setAdvancedMode(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setParseError(message);
    } finally {
      setIsSavingJson(false);
    }
  }

  async function handleRun() {
    try {
      const parsed = getConfigsForSubmit();
      clearMessages();
      setIsRunning(true);

      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ models: parsed }),
      });

      const { data, rawText: responseText } = await readResponseJsonSafe(response);
      if (!response.ok) {
        const detail = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : responseText.trim();
        throw new Error(detail || '真实评测调用失败');
      }

      const nextRuns = Array.isArray(data?.runs) ? data.runs : [];
      setRuns(nextRuns);
      setSelectedModelId(nextRuns[0]?.modelId ?? '');
      setExpandedTaskIds(nextRuns[0]?.taskResults.filter((item: { passed: boolean; triggeredTrap: boolean }) => !item.passed || item.triggeredTrap).map((item: { taskId: string }) => item.taskId) ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('JSON') || message.includes('配置必须是 JSON 数组')) {
        setParseError(message);
      } else {
        setRunError(message);
      }
    } finally {
      setIsRunning(false);
    }
  }

  async function handleTestConnection() {
    try {
      const parsed = getConfigsForSubmit();
      clearMessages();
      setIsTestingConnection(true);
      setConnectionResults([]);

      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ models: parsed }),
      });

      const { data, rawText: responseText } = await readResponseJsonSafe(response);
      if (!response.ok) {
        const detail = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : responseText.trim();
        throw new Error(detail || '测试连通失败');
      }

      const nextResults = Array.isArray(data?.results) ? data.results as ConnectionStatus[] : [];
      setConnectionResults(nextResults);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('JSON') || message.includes('配置必须是 JSON 数组')) {
        setParseError(message);
      } else {
        setRunError(message);
      }
    } finally {
      setIsTestingConnection(false);
    }
  }

  async function copyConfig() {
    const text = advancedMode ? configText : buildJsonFromDrafts(drafts);
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
          <div className="hero-topline">
            <div className="eyebrow">真实模型评测工作台</div>
            <div className="version-chip">{UI_VERSION}</div>
          </div>
          <h1>模型评测</h1>
        </div>
        <div className="hero-actions">
          <button className="button" onClick={handleRun} disabled={isRunning || isTestingConnection || isSavingJson}>
            {isRunning ? <><LoaderCircle size={16} className="spin" /> 评测中</> : <><Send size={16} /> 开始评测</>}
          </button>
          <button className="button secondary" onClick={loadExample} disabled={isRunning || isTestingConnection || isSavingJson}><RefreshCw size={16} /> 重置</button>
        </div>
      </div>

      <div className="panel-grid single-focus compact-panel-grid">
        <div className="card">
          <div className="card-header">
            <h2><KeyRound size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />模型配置</h2>
            <div className="toolbar-inline wrap-mobile">
              <button className={`button secondary small${advancedMode ? ' active-mode' : ''}`} onClick={() => setAdvancedMode((value) => !value)} disabled={isRunning || isTestingConnection || isSavingJson}>
                <Sparkles size={14} /> {advancedMode ? '表单模式' : 'JSON 模式'}
              </button>
              {!advancedMode ? (
                <button className="button secondary small" onClick={addDraft} disabled={isRunning || isTestingConnection || isSavingJson}><Plus size={14} /> 添加模型</button>
              ) : (
                <button className="button secondary small" onClick={handleSaveJson} disabled={isRunning || isTestingConnection || isSavingJson}>
                  {isSavingJson ? <><LoaderCircle size={14} className="spin" /> 保存中</> : <><Save size={14} /> 保存到表单</>}
                </button>
              )}
              <button className="button secondary small" onClick={handleTestConnection} disabled={isRunning || isTestingConnection || isSavingJson}>
                {isTestingConnection ? <><LoaderCircle size={14} className="spin" /> 测试中</> : <><Wifi size={14} /> 测试连通</>}
              </button>
              <button className="button secondary small" onClick={copyConfig} disabled={isRunning || isTestingConnection || isSavingJson}><Copy size={14} /> 复制</button>
            </div>
          </div>

          {!advancedMode ? (
            <div className="model-form-list">
              {drafts.map((draft, index) => (
                <div className="model-form-card" key={`${draft.id}-${index}`}>
                  <div className="model-form-head">
                    <div>
                      <strong>模型 {index + 1}</strong>
                    </div>
                    <button className="button secondary small" onClick={() => removeDraft(index)} disabled={drafts.length === 1 || isRunning || isTestingConnection || isSavingJson}>
                      <Trash2 size={14} /> 删除
                    </button>
                  </div>

                  <div className="form-grid">
                    <label className="field">
                      <span>ID</span>
                      <input value={draft.id} onChange={(e) => updateDraft(index, 'id', e.target.value)} placeholder="gpt-4o-mini" />
                    </label>
                    <label className="field">
                      <span>Provider</span>
                      <input value={draft.provider} onChange={(e) => updateDraft(index, 'provider', e.target.value)} placeholder="openrouter / openai / anthropic" />
                    </label>
                    <label className="field field-full">
                      <span>Model</span>
                      <input value={draft.model} onChange={(e) => updateDraft(index, 'model', e.target.value)} placeholder="openai/gpt-4.1-mini" />
                    </label>
                    <label className="field field-full">
                      <span>Base URL</span>
                      <input value={draft.baseUrl} onChange={(e) => updateDraft(index, 'baseUrl', e.target.value)} placeholder="https://openrouter.ai/api/v1" />
                    </label>
                    <label className="field field-full">
                      <span>API Key</span>
                      <input type="password" value={draft.apiKey} onChange={(e) => updateDraft(index, 'apiKey', e.target.value)} placeholder="API Key" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <textarea
                className="textarea mono compact-textarea"
                value={configText}
                onChange={(e) => {
                  setConfigText(e.target.value);
                  setJsonDirty(true);
                }}
                spellCheck={false}
              />
              <div className="editor-hint muted">{jsonDirty ? 'JSON 已修改，点击“保存到表单”后会同步回表单模式。' : 'JSON 与表单已同步。'}</div>
            </>
          )}

          {parseError ? (
            <div className="badge warn block-badge"><ShieldAlert size={14} /> JSON 解析失败：{parseError}</div>
          ) : runError ? (
            <div className="badge warn block-badge"><AlertCircle size={14} /> 运行失败：{runError}</div>
          ) : null}

          {!advancedMode && (parseError || runError) ? (
            <div className="inline-error-actions">
              <button className="button secondary small" onClick={() => setAdvancedMode(true)}>
                <AlertCircle size={14} /> 去 JSON 模式排查
              </button>
            </div>
          ) : null}

          {connectionResults.length > 0 ? (
            <div className="connection-results">
              {connectionResults.map((result) => (
                <div className={`connection-item ${result.ok ? 'ok' : 'fail'}`} key={result.modelId}>
                  <div className="connection-title">
                    {result.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                    <strong>{result.modelId}</strong>
                  </div>
                  <div className="muted">{result.detail}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="stat-grid compact-stats">
        <StatCard label="当前冠军" value={bestRun ? bestRun.label : '-'} hint={bestRun ? `${bestRun.totalScore}/${bestRun.maxScore} · ${bestRun.tier}` : ''} />
        <StatCard label="通过率" value={selectedRun ? `${selectedRun.accuracy}%` : '-'} hint={selectedRun ? `${selectedRun.taskResults.filter((item) => item.passed).length}/${selectedRun.taskResults.length}` : ''} />
        <StatCard label="失败题数" value={selectedRun ? String(failedCount) : '-'} hint="" />
        <StatCard label="陷阱触发" value={selectedRun ? String(trapCount) : '-'} hint="" />
      </div>

      {hasResults ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header stack-mobile">
              <h2><Trophy size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />结果</h2>
              <div className="toolbar-inline wrap-mobile">
                <button className={`button secondary small${showOnlyIssues ? ' active-mode' : ''}`} onClick={() => setShowOnlyIssues((value) => !value)}>
                  <ShieldAlert size={14} /> {showOnlyIssues ? '仅问题题' : '全部题目'}
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
                        <td><button className="button secondary small" onClick={() => setSelectedModelId(run.modelId)}>查看</button></td>
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
              </div>

              <div className="card">
                <div className="card-header stack-mobile">
                  <h2><ClipboardList size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />题目明细</h2>
                  <div className="muted">{showOnlyIssues ? `${visibleTasks.length} 道问题题` : `${visibleTasks.length} 道题`}</div>
                </div>

                {visibleTasks.length === 0 ? (
                  <div className="empty-state">
                    <CheckCircle2 size={18} /> 无问题题
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
                          {result.triggeredTrap ? <span className="badge warn">陷阱</span> : null}
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
            <Cpu size={20} /> 暂无结果
          </div>
        </div>
      )}
    </div>
  );
}
