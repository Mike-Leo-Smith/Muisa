# W1 预注册：仅改变 JS pitch 窗长

目的：诊断 R1 长窗上下文与换音边界的关系，观察减少上下文是否损害低音、coverage 或无音误报。不改在线默认，不同时调阈值、预处理或模型。

## 代码核对

- R1 `experiments/real/config.json` 将 PCM 重采样到22050Hz，4096样本窗=185.760ms，512 hop=23.220ms。`run_js.js` 直接调用 `pitch`，没有在线 `Analyzer` 的其他处理。
- 在线 `SystemInput` 创建未指定采样率的 AudioContext，worklet 使用4096窗/1024 hop，并把实际 `sampleRate` 传给分析器。48kHz 时为85.333ms/21.333ms；44.1kHz 时为92.880ms/23.220ms。不能假定所有设备48kHz，也不能把R1的186ms上下文误差直接归于线上。
- `pitch` 内部整数平均降采样：22050时step=1，48000时step=4。这也使本试验不能被称为完整线上等效对照。

## 固定设计（运行真实数据前锁定）

仅比较同一22050Hz PCM的4096和2048窗（185.760与92.880ms）。阈值0.8、内置RMS门限0.008、检测范围、hop512均不变。两者用同一中心时间序列：首中心2048样本，之后每512样本；短窗以这些中心截取，避免中心网格相位变化成为额外变量。只计算两者共同覆盖的长窗帧，不因短窗增加首尾样本。baseline应与R1 JS逐预测一致（相同源PCM及pitch实现时）。

评价继续使用R1的10ms网格、首100ms/尾150ms范围、50ms guard、最近中心映射，以及相同多音/同音高多弦排除。所有录音保留，不能因为comp只剩22/27个mono帧就删掉。每clip显示mono/unvoiced/poly/guard分母，汇总整录音等权、solo/comp和玩家宏平均，附每项实际可定义的分母。保留全部低音分段、octave error、RPA50、coverage、FA和边界距离50–105/≥105ms分层，不更改评分guard。没有稳定mono的分组用null而非0，也不隐藏其录音数。

两种窗都是以中心标时的离线评价；实际可用时刻为中心+半窗，不能把中心时间直接当因果输出时刻。记录每帧compute p50/p95和预算超限，但共享机器单次值不是端到端实时延迟。

R1为开发诊断；代码和两个配置锁定后，同一执行端分别运行R1与冻结R2，禁止依据R2再选阈值后称最终验证。R2是录音/曲目留出，不是新玩家；BasicPitch的GuitarSet训练重叠背景仍存在，不过本试验不运行BasicPitch。无需模型权重或新依赖。

## 执行

使用已有YIN环境的numpy/scipy/soundfile锁；Node≥22。为两个split各创建全新work目录。输入manifest必须由持有冻结数据的一方提供精确SHA256，不猜哈希。

```
python experiments/window/prepare.py --dataset DATA --index DATA/manifest.json --expected-index-sha256 HASH --split R1 --work WORK
node experiments/window/run.js WORK
python experiments/window/report.py WORK
```

R2只改输入、manifest哈希、split和新work目录。prepare输出inspection.json供核对；run拒绝不同代码/配置/PCM绑定；report.json不含原始音频或逐帧预测，原始cache留执行端。所有公开报告需保留codeRevision/configSha256/inputManifestSha256和split。合成接口验证用 `--split synthetic`，不当真实准确率。
