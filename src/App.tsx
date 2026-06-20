import { useMemo, useState } from 'react';
import { BarChart3, Brain, CheckCircle2, ClipboardList, Cpu, Gauge, Layers3, ShieldAlert, Trophy, XCircle } from 'lucide-react';
import { DEFAULT_MODELS, DIMENSION_META, PROFILE_LABELS, TASKS } from './data';
import { buildRun, serializeDefaultModels } from './scoring';
import type { ModelConfig } from './types';

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="muted">{hint}</div>
    </div>
  );
}

export default function App() {
  const [configText, setConfigText] = useState(serializeDefaultModels());
  const [models, setModels] = useState<ModelConfig[]>(DEFAULT_MODELS);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_MODELS[0].id);

  const runs = useMemo(() => models.map((model) => buildRun(model)), [models]);
  const bestRun = [...runs].sort((a, b) => b.totalScore - a.totalScore || b.accuracy - a.accuracy)[0];
  const selectedRun = runs.find((item) => item.modelId === selectedModelId) ?? runs[0];

  function handleRun() {
    try {
      const parsed = JSON.parse(configText) as ModelConfig[];
      setModels(parsed);
      setSelectedModelId(parsed[0]?.id ?? '');
      setParseError(null);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="app-shell">
      <div className="hero">
        <div>
          <h1>Model Eval Workbench</h1>
          <p>
            一个可以直接演示的多模型评测工作台：输入多个模型配置，跑同一套固化题库，输出每题对错、检查项得分、维度分、总分和梯队。
            这一版先用 mock profile 模拟不同模型表现，但输入协议、评分结构、报表形式都已经按真实系统来搭。
          </p>
        </div>
        <div className="hero-actions">
          <button className="button" onClick={handleRun}>运行模拟评分</button>
          <button className="button secondary" onClick={() => { setConfigText(serializeDefaultModels()); setModels(DEFAULT_MODELS); setSelectedModelId(DEFAULT_MODELS[0].id); setParseError(null); }}>恢复默认配置</button>
        </div>
      </div>

      <div className="panel-grid">
        <div className="card">
          <div className="card-header">
            <h2><Layers3 size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />多模型配置输入</h2>
          </div>
          <div className="muted" style={{ marginBottom: 12 }}>
            当前建议字段固定为 `provider / model / temperature / maxTokens / mockProfile`。后续把 `mockProfile` 换成 `apiKeyRef / baseUrl` 就能接真实模型。
          </div>
          <textarea className="textarea mono" value={configText} onChange={(e) => setConfigText(e.target.value)} spellCheck={false} />
          {parseError ? (
            <div className="badge warn" style={{ marginTop: 12 }}><ShieldAlert size={14} />JSON 解析失败：{parseError}</div>
          ) : (
            <div className="footer-note">这版的核心不是“写个漂亮页面”，而是先把评分规则固化成可重复执行的数据契约。</div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h2><Brain size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />评分系统骨架</h2>
          </div>
          <div className="tip-list">
            <div className="tip">
              <div><strong>评分原则</strong></div>
              <div className="muted">每题都拆成固定字段 + 固定检查项，只判达标/不达标，拒绝人工软判断。</div>
            </div>
            <div className="tip">
              <div><strong>当前维度</strong></div>
              <div className="muted">{Object.values(DIMENSION_META).map((item) => `${item.short} ${item.label}`).join(' · ')}</div>
            </div>
            <div className="tip">
              <div><strong>当前题型</strong></div>
              <div className="muted">唯一答案题、约束满足题、结构化决策题、有限枚举题。</div>
            </div>
            <div className="tip">
              <div><strong>当前梯队</strong></div>
              <div className="muted">T0: 85-100 ｜ T1: 70-84 ｜ T2: 50-69 ｜ T3: 0-49</div>
            </div>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="当前冠军" value={bestRun ? bestRun.label : '-'} hint={bestRun ? `${bestRun.totalScore}/${bestRun.maxScore} · ${bestRun.tier}` : '尚未运行'} />
        <StatCard label="题目数量" value={String(TASKS.length)} hint="每题都带固定检查项与陷阱扣分" />
        <StatCard label="模型数" value={String(runs.length)} hint="可一次性跑多个配置" />
        <StatCard label="总维度" value={String(Object.keys(DIMENSION_META).length)} hint="主维 + 副维双映射" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2><Trophy size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />模型排行榜</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>模型</th>
                <th>档位</th>
                <th>总分</th>
                <th>正确率</th>
                <th>画像</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice().sort((a, b) => b.totalScore - a.totalScore || b.accuracy - a.accuracy).map((run) => {
                const model = models.find((item) => item.id === run.modelId);
                return (
                  <tr key={run.modelId}>
                    <td>
                      <div>{run.label}</div>
                      <div className="muted">temp {model?.temperature ?? '-'} · max {model?.maxTokens ?? '-'}</div>
                    </td>
                    <td><span className="badge">{run.tier}</span></td>
                    <td>{run.totalScore}/{run.maxScore}</td>
                    <td>{run.accuracy}%</td>
                    <td>{model ? PROFILE_LABELS[model.mockProfile] : '-'}</td>
                    <td><button className="button secondary" onClick={() => setSelectedModelId(run.modelId)}>查看明细</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRun ? (
        <div className="two-col">
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
            <div className="footer-note">
              后续接真实模型时，runner 只要把模型回答转成固定 JSON，当前这套 scorer 就能直接复用。
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2><ClipboardList size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />任务结果明细</h2>
            </div>
            {selectedRun.taskResults.map((result) => (
              <div className="task-card" key={result.taskId}>
                <div className="card-header">
                  <div>
                    <div><strong>{result.taskId} · {result.title}</strong></div>
                    <div className="muted">{DIMENSION_META[result.dimensionPrimary].label} / {DIMENSION_META[result.dimensionSecondary].label}</div>
                  </div>
                  <div>
                    {result.passed ? (
                      <span className="badge ok"><CheckCircle2 size={14} />全对</span>
                    ) : (
                      <span className="badge fail"><XCircle size={14} />未满分</span>
                    )}
                    {result.triggeredTrap ? <span className="badge warn" style={{ marginLeft: 8 }}>触发陷阱扣分</span> : null}
                    <div style={{ marginTop: 8, textAlign: 'right' }}>{result.score}/{result.maxScore}</div>
                  </div>
                </div>

                <div className="check-grid">
                  {result.checkResults.map((check) => (
                    <div className="check-item" key={check.label}>
                      <span className="muted">{check.label}</span>
                      <strong style={{ color: check.passed ? '#86efac' : '#fda4af' }}>{check.passed ? `+${check.score}` : '+0'}</strong>
                    </div>
                  ))}
                </div>
                <div className="code-block mono">{result.answerText}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h2><Cpu size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />下一步接真实模型建议</h2>
        </div>
        <div className="tip-list">
          <div className="tip"><strong>1. 固化输入协议</strong><div className="muted">把 `mockProfile` 换成 `apiKeyRef / baseUrl / provider / model`，统一由 runner 调用。</div></div>
          <div className="tip"><strong>2. 固化输出协议</strong><div className="muted">强制模型返回 JSON，字段名与 scorer 完全对齐，避免自由文本难解析。</div></div>
          <div className="tip"><strong>3. 固化判分 DSL</strong><div className="muted">把 `exact / contains_all / regex_absent` 抽成独立规则，前后端共用。</div></div>
        </div>
      </div>
    </div>
  );
}
