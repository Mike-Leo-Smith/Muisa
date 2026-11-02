# N1：非平稳干扰评测预注册草案与输入契约

状态：固定输入与runner已由独立执行端完成六条件评测，见 [N1结果](RESULTS_N1.md)。以下保留预注册设计；原config哈希不变，executionStatus字段仍是冻结前值，实际执行状态以结果顶层字段为准。未调参或改变线上默认，不增加模型家族或训练。

## 有界比较

复用I1完整Emily rr1短乐句（约8.684秒干声）、同一bounded ISM房间/源位置/seed123及已经取得许可的两段真实朗读、键盘human录音、脚步。只有一个场景、一个固定分析器，不做SIR、房间、音源或阈值扫描。朗读安排在合成声场，不能称现场多人谈话；结果只是小规模合成场景诊断，不是真实练琴准确率。

| condition | guitar target | speech | keyboard/footsteps |
|---|---|---|---|
| room-only | 相同room target | 无 | 无 |
| room-speech | 相同room target | 固定speech stem | 无 |
| room-speech-transients | 相同room target | 同一speech stem | 固定transient stem |
| speech-only | 无 | 同一speech stem | 无 |
| transients-only | 无 | 无 | 同一transient stem |
| speech-transients-only | 无 | 同一speech stem | 同一transient stem |

干声可以保留给听感检查，但不纳入上述抗噪成对结论。加入room-only避免把房间差异归因于讲话。干扰负样本使用与正样本完全相同的幅度、时间和尾音，移除目标后绝不重新校准增益。

## 输入冻结契约

每组必须包括版本化manifest、float PCM stems、六个mix、MIDI/performance timeline及来源许可表。公开默认仅代码、hash和聚合结果；第三方波形/原始许可文本留执行端私有资产。

- `sceneId, pairId, seed, codeRevision, configSha256, inputManifestSha256`；源npz/源SFZ/音源bank commit/renderer版本与hash、每个PCM/WAV的SHA256、采样率/声道/样本数/浮点格式。
- 源波形 `targetDry, targetRoom, speechRoom, transientsRoom`；每个干扰asset的源URL、作者、license、原文件hash、解码后hash、片段起止、mono/resample/边缘fade修改声明。作者按实际许可原文记录，不推断或省略CC BY署名。
- 每声源位置、mic位置、room几何/吸收/order、RIR hash；`physicalDelaySeconds` 与 `fractionalDelaySeconds` 分列，不能用最大反射峰代替直达起音。静态声源，不宣称移动距离模拟。
- 每事件id、sourceId、start、excerpt duration、full-convolved end、sourceGain、calibrationRegion、requested/achievedCalibrationSirDb、activeOverlapSamples、achievedActiveOverlapSirDb、eventLocalSirDb、peak和null原因。不要静默移动事件以制造重叠。
- target effective-note mask来自固定performed MIDI gate加直达/算法传播时延。speech按active-overlap标定10dB，transient按完整有限event-local标定0dB。另报组合active SIR和各事件局部值；整组不能命名“10dB噪声”。空/零能量校准拒绝；只用于诊断的空重叠SIR为null+原因，严格JSON不允许NaN/Infinity。
- 使用full convolution和真实渲染release。所有stem在同一时轴上补齐长度仅用于对齐；不能用补零修复已截断释放。共用一个headroom gain（最大峰值≤0.9），不逐文件归一化、不限幅；记录缩放前后peak和clip count。

先在原room采样率构造固定事件stem，再用同一个已锁定resample_poly版本/参数转到48kHz；在48kHz float stems上形成六个mix并确定公共gain。提交前验证正样本减去room-only等于对应干扰stem（float舍入容差声明），负样本等于同一干扰stem；PCM16只作试听，不替代float评价输入。

## 固定分析与评分

调用现有 `Analyzer` / `frames`：48kHz、4096窗/1024hop，默认预处理关闭、noiseRms=null，pitch接受阈值0.8。一次只运行这一配置，不把W1离线2048@22.05k的收益当作线上减窗依据。采样率相关内部平均降采样与起音状态沿用源码，不根据谱面纠正观测。不做自动背景估计，以免各条件估出的profile成为另一个变量；噪声门控/双窗等消融留到后续另注册。

- pitch输出按窗口中心标时，availability为窗口结束；保持10ms网格、首100ms/尾150ms、50ms边界guard，所有条件共享target reference/mask。中心映射仅作离线评价，不声称零前视因果反馈。报告各类帧数、RPA50、coverage、accepted precision、octave errors及无音误报；不只报接受后的准确率。
- primary target标签为performed MIDI onset/gate加直达和FIR延迟，pitch为目标MIDI。若补充dry-render acoustic attack proxy，须在推理前固定算法/参数、同时保留原标签并另报onset偏差；不按模型输出对齐标签。采样器attack/release、声学尾音与MIDI gate不同，尤其“标注无音”不保证麦克风端无琴声，因此正样本无音误报也保留尾音诊断，不能宣称已证明是环境误检。
- onset/note采用现有一对一匹配，±50ms onset、±50cents pitch，报告P/R/F1、signed bias、unknown和事件接受coverage，不评offset。固定标签即使不利也不事后平移。漏观测不直接解释为漏弹。
- 三个negative条件没有目标音符，报告accepted false events/min、all onset events/min、voiced frame fraction。保留全部负样本，不挑“安静”区间。分母为实际分析到的完整PCM窗覆盖时长，明确不足尾窗长度；不能把未分析padding加进每分钟分母。
- 每condition存逐事件/逐帧缓存供执行端检查；公开聚合及相对room-only的绝对差、分母和失败案例。一个乐句不构成独立统计样本，不提供独立帧CI或泛化宣称。记录compute p50/p95、deadline、观测RSS、window/等待时间；共享主机单次不是设备端到端latency。

## 运行前验收

1. 冻结manifest和6输入hash，人工核对许可、对应源/事件、tail未截断、零削波、相同gain/时轴；不听模型结果选素材。
2. 全mixer回归覆盖full/tiny/zero overlap和zero/nonfinite保护；新增成对stem恒等式、负样本无target、重采样时轴/时延、严格JSON检查。
3. 用自造PCM先验证runner、匹配和分母，明确它不是人声测试。冻结代码SHA与configSHA后，独立执行端对真实素材合成的6输入串行运行；保留所有结果，不因坏结果删条件。

## 冻结输入执行接口

`frozen-input.json`记录生产端冻结的六条件/config/manifest/lock哈希。runner在推理前校验lock中的payload、float WAV采样率/长度/有限性/削波、三组stem线性恒等式。标签明确读取`labels/performed-and-delayed.json`的`targetOnsetSeconds/targetGateEndSeconds`，它们已经加physical/FIR延迟，不重复加；检查performed时间与delay关系、48k取整样本索引以及负样本空reference。duration来自真实SMF gate（例如0.480208333秒），不是旧nominal0.480秒。

```
node experiments/nonstationary/run.js BUNDLE NEW_WORK --validate-only
node experiments/nonstationary/run.js BUNDLE NEW_WORK
```

只用Node≥22，无新模型/重依赖。输出`inspection.json`、六个私有frame/event cache和可公开脱敏`report.json`。同一validate-only目录可继续推理；已存在report则拒绝覆盖。执行前固定checkout SHA，输出记录它与原builder SHA，配置内容/哈希保持预注册版本不变。`config.executionStatus`保留冻结时状态，实际是否运行看report.status。

测试用自建float WAV、模拟delayed标签和payload lock跑完整读取→校验→六条件评分链路；另测实际note schema和双加delay拒绝。该测试不代表真实N1输入已在源码环境执行。只读`inspect_bundle.py`可用于结构排错，不执行推理。N1输入禁止用于T0训练。
