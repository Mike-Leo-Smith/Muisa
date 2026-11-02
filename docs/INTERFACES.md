# 架构与软硬件接口契约 v0.1

通用音频源 → 操作系统/文件适配器 → PCM → 可选预处理 → DSP → 演奏事件 → 对齐 → 实验台 UI。原始 PCM 保留旁路。未来课程/复习只消费事件及证据，不读设备 API。

## 输入能力与适配

没有设备白名单。麦克风、USB 音频、板载输入、数字乐器的音频输出及文件回放都在抽象范围内；能否接入取决于操作系统、浏览器暴露和权限。浏览器只在用户点击时请求 getUserMedia。数字乐器输出音频与 MIDI 是不同适配器；本次不实现 MIDI。

设备能力用 supported / unsupported / unknown，未知延迟用 null。普通浏览器没有通用硬件增益控制，也不能从混合 PCM 确定真实弦/品。具体设备的型号、数字输出、驱动和通道能力均不预设。

`PcmFrame`：streamId、sequence、startSample、sampleRateHz、channels（分平面 Float32Array）、hopSize。源采样率由适配器报告，不硬编码成 48 kHz。实际实现发送重叠 4096 点窗口、1024 点步进，消费方不可把重叠窗口当连续新音频拼接。起点单位为采样索引，时间 = startSample / sampleRateHz；文件从零计，系统适配器从首个完整窗口归零。当前仅传入第一个声道；契约允许未来保留全部声道。文件解码重采样到解码 AudioContext 的采样率并报告该值，不冒充原始文件采样率。

系统接口 `start(deviceId?) / stop() / devices()`，回调 onFrame/onStatus。状态 requesting/running/stopped/interrupted/denied/error；停止会释放 tracks、节点和 AudioContext。异步授权晚到时用 generation 丢弃并释放旧流。track ended、mute、上下文挂起会报告异常；恢复后需重新确认校准。浏览器可能无法即时报告所有物理断线，仍需用户现场测试。

请求 noiseSuppression / echoCancellation / autoGainControl=false，同时显示 supportedConstraints 与 track.getSettings()；请求不等于设备遵从。采集节点输出始终为零，不监听原琴。只有主动点击文件播放器才发声，发声前停止采集。

高延迟输入也可用于演后分析。实时（因果）与离线（完整序列可回看）是不同运行模式，不因无法低延迟判分就拒绝文件/设备接入。

## 时钟、CPU 与延迟

AudioWorklet 提供采样时钟，UI 的 performance.now 仅统计 CPU 墙钟耗时，不用于判断起音。单音窗口 4096 点（48k 时 85.3 ms），步进 1024 点（21.3 ms）；起音按末尾 hop 的 RMS 上升估计，等待完整后续窗口才确定音高，约增加一窗口等待。和弦窗口 16384 点（341.3 ms），每 4 hop 更新一次，用更长窗口分辨低频。它是延迟较高的探索结果，不能冒充低延迟精准和弦判分。

DSP 在 Worker，Worklet 只采集。若 Worker 忙，实时适配会丢分析窗口并显示计数；采样时间不重写，DSP 检测到缺口后重置起音/和弦累积，并清除旧和弦证据；缺口首窗不制造新起音。重复/倒退采样时间拒绝；切换流或采样率必须新建 Analyzer。当前要求 4096 点有限数值窗口。丢帧不当成漏弹，实时跟随仍是试验性质。离线不丢窗，当前上限 60 秒。窗口复制与逐频 Goertzel 仍有 CPU 成本，移动端性能尚未验证。

校准扩展 `offsetMs = observedOnsetMs - referenceMs`，正确时间 `observed - offset`，未知不能按 0 代替。需记录设备、采样率、测量方法与不确定度；换设备/挂起恢复失效。当前尚未实现链路校准或节拍器，因此 UI 不作节奏准错判断，只输出检测时间与估计平均速度。

## DSP 与事件

单音：70–1000 Hz 范围的 YIN 风格累积归一化差分，平均降采样降低计算量，抛物线插值。简单平均不是完整抗混叠滤波；低调弦低于范围、强泛音、复音和音乐串音可能失败。pitch confidence 是周期性启发值，不是校准后的正确概率。

起音：hop 能量上升比 1.8 + RMS 下限 + 160 ms 不应期。对带停顿单音有效，弱拨、持续换音、连音、快速重复可能漏掉；不以“没有检测到”证明没有弹。削波事件输出未知。持续音时长尚不估计。

和弦：Hann 窗 + 半音频点 Goertzel，汇成 chroma，候选仅 C/Am/G/Em/D/Dm/F。证据需覆盖率 >0.85、最弱和弦音 >0.07、前两名差 >0.10。比例是候选证据，不是概率；某些未知和弦仍可能误报熟悉三和弦。不能识别任意复音、逐弦指法或低音转位。本次纯音三和弦成功不代表扫弦成功。

事件 `PerformanceEvent { onsetMs, midi: number|null, confidence }`。midi 为连续音高，不跨八度折叠。未来扩展 durationMs/quality/streamId/uncertainty。低置信度 / null 保留 unknown；不判错音。未来 Coverage（连续有效区间）需来自采集和检测质量；只有完整可靠覆盖、匹配窗关闭、分析水位已到才可判 missed，当前从不输出 missed，仅 unobserved。

可关闭预处理：逐窗去均值保留原始 PCM；可用约 48 个采集窗口去 DC 后的 RMS 中位数估计背景噪声。若处理后的 RMS 不到背景两倍，仅降低判定置信度，不把 PCM 置零。不固定高通、不硬切噪声门、不使用语音增强器。估计时须保持不弹琴，否则会把琴声当噪声。背景估计只是平稳噪声启发式，不能分离说话或伴奏。神经网络以后可通过 `Preprocessor.process` 插槽接入，必须声明 lookahead、算法延迟、采样率并用 PCM 对照证明收益；尚未选型/接入模型。

## 谱对齐与未来课程

`score.js` 声明八个目标音（自制 E4 F4 G4 F4 E4 G4 F4 E4），每音两拍，不与 UI 写死。实时 LiveAligner 只消费当前事件，最多向前找两个目标，遇到不确定不推进；额外音 explicit extra。重复音和错误后的歧义会误配，不回改历史。未实现依据时间超时判漏音。

离线编辑距离用完整序列做 match/wrong/unknown/unobserved/extra。它对全局匀速变化不设固定节奏门，但重复音的最佳路径可能不唯一；不支持反复、跳段、可靠的局部速度曲线与节奏评分。estimatedBpm 只由首末匹配算平均速度，不能用来评价局部节拍。

课程接口以后定义 Lesson(id/version/notes/explanations)、Attempt(mode/events/calibration/coverage)、SkillEvidence(skillId/attemptIds/dueAt)。跟弹→填空→无提示通过提示策略控制，不删除评分目标。练习可等待/暂停，挑战连续；无提示结束才反馈。记忆、识谱、听辨、节奏、隔天保留分别记录。目前不实现课程状态机或持久化。

浏览器 API 依据：[getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)、[AudioWorkletNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode)、[decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)。
