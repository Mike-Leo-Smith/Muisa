# 识别与抗噪研究及逐项实验计划

这是公开文档研究与可执行路线，不是这些模型已经在 Muisa 跑通的声明。当前实现仍是 JS 单音 DSP baseline；不下载不明许可音频、不训练大模型、不引入付费服务。

## 候选与边界

| 方案 | 用途 / 研究依据 | 必须验证的边界 |
| --- | --- | --- |
| [YIN](https://pubmed.ncbi.nlm.nih.gov/12002874/) / pYIN | 单音基频；pYIN 的概率候选和 HMM 为后续比较方向 | 当前是 YIN 风格简化实现；整段 Viterbi 不是在线，必须单列离线和因果版本 |
| [CREPE](https://github.com/marl/crepe) tiny / small | 神经单音基频对照 | 默认 centered frame 的前视等待计入延迟；不把模型推理速度当首音响应 |
| [Basic Pitch](https://github.com/spotify/basic-pitch) / [TypeScript](https://github.com/spotify/basic-pitch-ts) | 离线多音音符对照 | 音符转录不等于和弦标签；faster-than-real-time 不等于 causal |
| RNNoise / DeepFilterNet / DNS | 语音增强对照背景 | 默认目标是 speech，不能假设保留吉他的瞬态、弱音和尾音；先验证 clean 退化 |
| [Zoom 音乐模式](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059985) | 工业产品公开的音乐处理选项 | 只能引用公开行为，不猜专有算法 |

[CREPE 论文噪声实验](https://arxiv.org/html/1802.06182)包含真实 pubnoise 与 white/pink/brown、多档 SNR；算法排序随噪声类型变化。单一种子白噪声上成功不能替代人声、房间混响和伴奏测试。

## 测试分层与当前命令

1. **确定性 DSP / 指标单元**：`npm run test:report`，JUnit 在 `reports/unit.xml`。音高/八度、门限、噪声校准域、事件匹配、时间契约。
2. **PCM 端到端合成**：同一测试命令包含错漏额外音、重复、弱音衰减、加速、掉帧、纯噪声和 prefix invariance。`npm run fixtures` → `node benchmark/run.js fixtures/manifest.json` 生成成对 bypass/DC 指标报告。它们是可解释的回归，不是真琴准确率。
3. **浏览器生命周期**：`npm run build && npm run test:browser`；实际断言匹配音高/索引、采样时钟、stop/restart 隔离与 tracks/context 释放，使用假麦克风。真实插拔、Safari/Firefox/手机仍未覆盖。
4. **可选真实录音 benchmark**：本地提供 PCM16 WAV 与合法来源标注，`node benchmark/run.js /local/path/manifest.json`。本轮未下载或宣称测试真实数据。

`benchmark/run.js` 接受 `{version:1,cases:[{id,audioPath,groupId,split,license,kind,notes:[{onsetMs,midi,durationMs}]}]}`。audioPath 相对 manifest，kind 为 music/noise。groupId 是原录音身份，切片/增强/不同麦克风版本必须一致；runner 拒绝同 group 跨 split，拒绝多音重叠标签。当前 runner 只支持单音 PCM16 WAV，第一个声道；报告逐录音结果，不把相邻帧当独立样本。播放器/谱面 holdout 的完整校验与分组宏平均尚未实现，不能声称已解决数据泄漏。

## 指标契约

采用 [mir_eval transcription](https://mir-eval.readthedocs.io/latest/api/transcription.html) 的评估习惯；这里是自有轻量实现，并未声称与 mir_eval 数值逐项等价。

- 帧音高：RPA@50 cents，并报 25/10、octave errors、voicing false alarm；accepted precision 必须配 voiced coverage。
- 起音：最大基数的一对一匹配 ±50 ms，报告 P/R/F1、signed bias。起音检测与音高可信度分开；未知音高也仍可算起音。
- 音符：起音 ±50 ms、音高 ±50 cents；offset 应用 max(50 ms, 20% duration)，当前检测器没有 offset，因此明确 `offsetEvaluated:false`。
- 纯噪声：false notes/min 与 false onsets/min，另测未知事件能否错误推进 live follower。
- 和弦：未来以时长加权 root / quality / bass 分开统计，词表外必须计 coverage/unknown；当前本地 runner 明确 `chordEvaluated:false`，不把七个候选测试称和弦 benchmark。
- 延迟：报告每帧计算 p50/p95 和超 hop deadline 次数；窗长/前视/平滑等待、first/stable/UI、硬件链路延迟分开。当前 runner 只测计算墙钟和窗口，未测真实设备端到端延迟。
- 因果性：同一 prefix 接不同 future，已输出事件不变；在线跟谱仍需更长的停顿、跳段和恢复集，不能用目标谱把错误音强行修正。

## 合成与噪声

当前数学音源是正弦、二/三次谐波、简单 attack/release；无 SoundFont 或物理建模库。后续可单列 Karplus–Strong 拨弦模型，再引入许可清楚的采样/真实录音，三层分别报告。

`fixtures.noise` 使用固定 seed 123；`metrics.mixAtSnr` 用标注发声区间定义 SNR 并返回实际 noiseGain。`scripts/noise-benchmark.js` 是 **7 个合成条件 × bypass/处理开关 = 14 行**，不是 14 个真实场景。clean 为真正零噪声；伴奏混入单列 SIR。保存 gain、seed、参数，输入与标签成对。当前噪声门控 benchmark 使用生成噪声的 oracle RMS；UI 实际背景校准由独立端到端回归覆盖，二者不能混为一谈。去 DC 与置信度门控不等于语音增强或音源分离。

## 数据与实验里程碑

[GuitarSet](https://guitarset.weebly.com/)优先考察：6 位演奏者、相同 30 谱、360 录音，microphone/hex 版本必须归同一原录音组。需要 player holdout 及另行谱面 holdout。[发布包](https://zenodo.org/records/3371780)音频许可尚待核验，本轮不下载、不放进公共仓库。[IDMT Guitar](https://www.idmt.fraunhofer.de/en/publications/datasets/guitar.html)有 evaluation / CC BY-NC-ND 限制，不默认允许训练、修改或再分发。

后续逐项做，不一次安装全部依赖：

1. 固定依赖版本的标准 YIN / pYIN 与现有 JS 对照，区分离线/流式。
2. 核实许可后接 CREPE tiny/small 独立适配器，测准确、误报、覆盖、CPU/内存与完整延迟。
3. Basic Pitch 离线 poly 对照，单列转录与和弦评估。
4. raw / DSP / 模型抗噪消融，clean 退化与负结果同样保存。
5. 在线 DTW/HMM 跟谱候选，测试恢复、前视与谱先验偏差。

每阶段有固定版本、可复现命令、机器可读结果和结论后，才决定接入实时主干。快 CI 与重 benchmark 分离；模型/音频不得被默认上传到公开仓库。
