# C1：干净吉他和弦识别，先固定真实基线

状态：基线/标签协议已冻结，独立私有环境已完成C1真实推理，见[结果](RESULTS_C1.md)。本执行环境没有真实 GuitarSet WAV/JAMS，没有在本机重跑。不是网络训练，不是谱面对齐；网页现有 DSP 未改。不能用数学和弦测试、单音正确率或 activity F1 代替这里的和弦正确率。

## 目标与基线

首轮目标是“PCM 中正在形成的和弦根音+精确大/小三和弦质量”，unknown 是合法输出；不判断手型、每根弦是否正确，不推断具体琴或线材故障。目标教学词表先维持 C/Am/G/Em/D/Dm/F。转位映射同一根音/质量，但保留 slash-bass 标签供分层，**不声称识别低音或转位**。七和弦、挂留、增减、显式缺音/扩展与其余调的三和弦均列为 OOV，不硬降级成支持的 triad。N（无和弦）和 X/未解析（不确定真值）分别统计，后者不当错误真值。

原始基线为 `src/dsp.js::chord`（源 SHA 绑定 `09c0dea`）：MIDI40–83 Goertzel 能量汇总 chroma，七模板，evidence>.85、weakest>.07、margin>.10。48kHz/16384=341.333ms 窗，4096=85.333ms hop；不加去噪、归一化或谱面先验。每窗结果在尾端才可用。时间窗已有等待不等于真实端到端延迟。无稳定输出状态机，**本阶段不提供 stable-detection latency 数字**。

## 数据与标签口径

优先已有本地 GuitarSet comp 麦克风轨，各冻结 R1/R2 清单六条；完整录音不挑“好看的和弦”。R1=已观察开发，R2=已观察验证/同玩家；两者都不是未见测试。当前所有衍生/切片继承整录音身份，选择清单绑定原始 manifest+JAMS hash。未来新测试需另按玩家/曲目/录音分组冻结，本轮不下载新数据。

[官方说明](https://guitarset.weebly.com/)明确 instructed 是谱面，performed 从音符标签推导、仍使用谱面的根音与分段。因此选 performed 不会变成独立人工听辨真值。先 inspect 实际轨 metadata，再用显式 selection 指定 trackIndex，禁止猜数组顺序。保留边界、残响、缺音与 instructed/performed 差异供人工审核，不能暗改标签。`annotation.time` 不加到 clip-local chord observation；越界或轨重叠先报错审核。此前官方 Zenodo API 已确认 GuitarSet 1.1.0 为 CC BY 4.0（DOI10.5281/zenodo.3371780）；此次只读取既有私有副本、不新增音频再分发。

[IDMT-SMT-Guitar](https://www.idmt.fraunhofer.de/en/publications/datasets/guitar.html)第4子集是实际吉他和弦/节奏录音，官方标为 evaluation、CC BY-NC-ND4.0；不是 MIDI 合成的 IDMT-SMT-Chords。本阶段不下载、不改编打包其音频进入 app。现有 GuitarSet 无额外噪声增强，只能称较干净录音；尚需听检，不声称绝对无串音或环境噪声。

## 可复现命令（在已有数据的私有执行环境）

Python 准备复用已有真实评测环境 numpy2.2.6/scipy1.15.3；inspect 本身只用标准库。Node22，无新增 npm 依赖。所有 WORK 必须是新目录；输出含私有逐窗缓存，不整体提交仓库。

```bash
# 1. 不推理，只读标签轨；R2 同理替换 split/index。
python experiments/chords/prepare.py --dataset DATASET --index MANIFEST --split R1 --work INVENTORY_NEW
# 2. 审核 INVENTORY_NEW/inventory.json，写 SELECTION。
python experiments/chords/prepare.py --dataset DATASET --index MANIFEST --split R1 --selection SELECTION --work PREPARED_NEW
# 3. 未改门限的原始基线。
node experiments/chords/run.js PREPARED_NEW
```

SELECTION 是 `{ "inputManifestSha256": "...", "recordings": { "recording-id": { "jamsSha256": "...", "trackIndex": 14, "role": "performed", "reviewBasis": "实际 metadata 中说明 performed 的字段和值" } } }`；14 只是 schema 示例，**不是指定真实轨号**。六条记录都须存在。准备过程验证 WAV/JAMS hash、排除既有 errata、按固定清单过滤 comp；scipy resample_poly 默认 Kaiser5/constant 转48k，无逐文件增益。输出记录 PCM hash、原始标签、来源 metadata 和选择文件 hash。

`baseline-report.json`：每录音、逐类混淆（含 OOV 原标签）、支持类正确率/coverage/accepted precision、OOV和N误接受，unknown输出计数与定义；固定 hop 等时权重，提供纳入时长，另报逐录音等权 macro（不能与 pooled duration weighting 混淆）。stable 要求整个窗口处于同一标签段且两侧150ms guard；其他为 transition，缺标为 annotation-gap，全部保留，不靠删样本抬分。短段可能无 stable 分母，null 保留。初始未纳入时长/末尾余样本和每帧compute p50/p95/deadline均记录，单次共享CPU不是浏览器延迟。

## 实测基线之后的有界非神经方案

先查看 coverage、C/Am等相邻模板混淆、OOV误接受和 transitions，再冻结一个候选：24个大小三和弦共同竞争后映射教学词表，加谐波/频谱背景抑制、非和弦音惩罚与 top2 分差；必要时因果持续证据降低切换抖动，明确额外稳定等待。先开发集定参数，锁代码/config后再跑已观察验证；不把先验目标谱塞给分类器。NNLS chroma可留后续，不先堆网络。

诊断分离：转位/音区（标签可支持的范围）；音色（数据没有明确不同琴来源时不能假装有音色留出）；缺弦/弱三音/残响只能结合声学与标签人工分析，不能由模板误判直接认定演奏错误。缺音、重复泛音、失谐、扫弦进入和换和弦的可控 PCM 回归用于定位机制；真实改善必须由上述基线对照证明。

执行分工：该代码容器 r1/r1-retry 目录为空，历史 materialization/下载问题未重试；真实推理由已有私有评测环境完成并回传脱敏结果。后续改进继续使用同一哈希绑定输入。

更新：C1已由独立私有环境完成，[真实结果与限制](RESULTS_C1.md)。已完成结果以 results-c1.json 为准，原config hash不改。下一阶段为独立[C2非神经候选](CANDIDATE.md)，尚未接入线上，真实C2开发结果待执行。

C2真实R1结果已回传，泛音分解未胜出：[负结果](RESULTS_C2.md)。[C3固定开发候选](C3.md)继续原始chroma的幅度压缩/扩展模板对照，仍不部署，不读取R2反馈选参。

[C3真实结果](RESULTS_C3.md)：提高R1召回同时增加OOV误接受，不部署。下一阶段优先[C4数据覆盖与固定导入评估](corpus/README.md)，暂停对单条录音继续选参。
