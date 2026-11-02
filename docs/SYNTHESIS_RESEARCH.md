# MIDI、乐器与空间合成研究

状态：已完成 [M1 GM MIDI / 有限阶 ISM 实验](../experiments/room/README.md)，12组fixture与三类算法复跑结果已保存；尚未实现高保真多演奏法音源或真实琴验收。现有回归仍用精确数学 PCM。目标是提高个人练琴场景的可解释测试覆盖，而不是让生成音听起来更好就声称检测更准。

## M1 范围

先建立一个成熟离线 MIDI renderer、一套许可清楚的音源、clean bypass 和有限阶镜像源房间模型，生成 12–24 个短 fixture。精确数学单测、较逼真渲染集成、真实录音验收各自保留，不能互相替代。

| 候选 | 已知信息 | 接入条件 |
| --- | --- | --- |
| [FluidSynth CLI](https://www.fluidsynth.org/wiki/usage/using-synth/) | 成熟 MIDI/SF2 离线方案；引擎 LGPL 2.1 不代表 SF2 采样许可 | 核实音源许可与大小；关闭 synth.reverb.active / synth.chorus.active，GM 仅作基线 |
| [Karoryfer Emily guitar](https://github.com/sfzinstruments/karoryfer.emilyguitar) | [作者免费采样页](https://shop.karoryfer.com/pages/free-samples)声明 CC0；clean SFZ 有力度层、三组随机 attack，以及 muted/pick-rest 等映射 | 先检查具体包、映射和音域，试听小样本；不把映射丰富自动当作真实演奏验证 |
| [sfizz](https://github.com/sfztools/sfizz) | BSD 2；官方仓库 2026-06-21 已归档 | 若采用则固定离线实验版本并记录维护风险，不默认成为生产核心 |
| STK Plucked / Karplus–Strong | 可解释的简化拨弦模型 | 非完整吉他，琴体耦合/演奏法需校准，不首轮自研 |

SFZ 内部随机 attack 未必受外部 seed 控制；要记录可控策略、预解析选择或缓存 dry PCM hash。模型重复性与实际随机采样策略都要记录。

## 空间方案

[pyroomacoustics Room](https://pyroomacoustics.readthedocs.io/en/stable/pyroomacoustics.room.html) 的 shoebox image-source model 先覆盖直达和早期反射。hybrid ray tracing 晚混响是实验性方向；directivity 仅限 ISM（source 仅 shoebox），不能承诺同时开启 directivity 与 ray tracing。inverse_sabine 是初始参数估计，不保证实测 RT60。

PRA fractional-delay 滤波包含 `constants.get('frac_delay_length') // 2` samples 的额外 FIR 延迟；必须单独记录并扣除后验证 distance/c。几何声学不充分模拟低频房间模态。未来合法 measured RIR 作为独立 room family，不混成已验证的同一模型。

卷积用 full 模式保留尾音（例如 scipy fftconvolve）；不能裁掉晚混响后报告房间鲁棒性。

## 数据流与标签

Score + performance → MIDI + event timeline → dry render → target / interferer 各自 RIR → post-room SNR mixing → mic frequency response / capture imperfections → WAV + MIDI + metadata / hashes。

环境干扰在其自己的源位置通过 RIR；传感器噪声在 room 后加入。SNR 用 post-room target/noise 的标注 active mask 算，保存 requested/achieved SNR、gain，零能量拒绝。不能对每个 ablation 独立归一化后再比较。

标签分别保留：score time、performed note-on、render attack、physical propagation delay、algorithmic delay、capture delay。不把 MIDI note-on、最强反射峰或录音起音视为同一时间。

## 验收与实验输出

- MIDI tempo / 事件排序 / repeated-note note-off 的语义正确。
- delta RIR 等同 bypass；full tail 保留；物理/算法延迟分别核对。
- 波形有限、无意外削波；seed/参数/hash 重现；无法控制的随机性显式说明。
- 同一 dry source / labels 成对跑 clean、room、noise；报告识别、unknown、误报和延迟，而不只听感。
- 按 instrument bank、room family 分组；holdout 整个音源/空间家族，不能把同一次渲染的相邻切片随机分 train/test。
- 提交脚本、固定版本、manifest 和指标；音源本体先查许可/体积，不购买、不接受需额外确认的新条款，不默认提交大采样。

M1 终态应给出可复现命令、12–24 fixture 的覆盖清单、机器可读结果和失败案例，再决定下一种音源或 RIR。识别模型实验与合成工具各自隔离，保持主干可运行。
