# Model Eval Workbench

一个可直接部署到 Vercel 的独立演示项目。

## 这个版本能做什么

- 输入多个模型配置
- 运行一套固化题库
- 输出每题对错
- 输出检查项得分、维度分、总分、梯队
- 用 mock profile 模拟不同模型行为，方便先看评测系统本身是否成立

## 下一步怎么接真实模型

把 `mockProfile` 替换成：

- `provider`
- `model`
- `baseUrl`
- `apiKeyRef`

然后增加一个 `runner`，把每题 prompt 发给真实模型，要求它返回固定 JSON，再复用当前 scorer 即可。
