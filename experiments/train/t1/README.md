# T1 数据接入准备（尚未训练）

T0 失败后先验证数据契约，不通过增加训练时间掩盖数据域问题。本目录只依赖 Python 标准库，没有模型下载、训练循环或云服务调用。现有 R1/R2 均已查看；N1 只做冻结评测。没有私人用户录音，公开 GuitarSet 的私有工作副本仍受来源与署名记录约束。

```bash
python -m unittest discover -s experiments/train/t1 -p 'test_*.py'
python experiments/train/t1/dataset.py /local/manifest.json --root /local/prepared-assets
```

准备后的 manifest 使用 `schema: muisa-t1-data-v1`、非空 `items`。每条包括：

- `id`、原始 `sourceId`、增强祖先 `lineageRoot`、`split`（train/development/validation/test）、`previouslyInspected` 布尔值、`evaluationOnly`。
- `kind`：real-guitar/rendered-guitar/speech/nonmusical/unknown-music；`negativeTarget` 仅 speech/nonmusical 可为 true。来源类别与标签真实性须人工审查，验证器不能听音证明标签正确。
- `license`：id/source/attribution 三个非空字符串，记录资产许可，不继承渲染引擎许可。音频不随代码发布。
- `groups` 的完整七维：player/session/recording/midiPiece/instrumentBank/noiseSource/rirSource，每维为稳定、带数据集命名空间的 ID 列表；不适用为 null。真实琴必须有前三维，渲染必须有曲目和音源 bank，其他素材必须有 noiseSource。未知 session 不应随机分组，应保守合并或留在开发数据。
- `pcm`：相对 path、sha256、sampleRateHz=16000、channels=1、samples。文件是有限 little-endian float32 原始 PCM，校验字节数/哈希/数值；不执行重采样或独立幅度归一化。生成端另保留原音频哈希、重采样/混音参数和修改记录。

初始分组策略保守：任何共享 source、lineage、文件哈希或上述 group 不能跨 split；共享 noise/RIR 会连通多个样本，验证器拒绝，而不悄悄放宽留出条件。先分配源组，再做裁剪、混音与增强。若以后分不同泛化轴评价，须另立明确协议，不能修改此契约后仍称同一个 holdout。previouslyInspected 缺失/不为 false 的资产不能放 validation/test，evaluationOnly 不能进入 train。

`frame_labels` 接收样本索引 note（startSample/endSample/midi/reliable）、完整标注覆盖区间 reliable_intervals。它不接受“谱子期望音”，因此弹错谱的可听吉他仍是正目标。没有完整标注的区域全 mask，不把缺标当静音。每 hop 标签右对齐；起音落在 `[hopStart, hopEnd)`，精确边界不会提前一帧。前 3 帧 warmup 无效。pitch 仅监督整个尾随窗内唯一可靠、有效音域的 note；同音高两根弦仍算复音。复音有 activity 正例而无 pitch 标签；未知可靠性 mask。半音类别仅对 MIDI 均值量化，不代表连续 F0 或调音真值。

可靠区间须由后续数据适配器结合标注覆盖和 attack/release 不确定性明确生成；当前尚未实现 GuitarSet/渲染资产到 T1 标签的完整转换，也未读取真实数据测试这些转换。Speech/nonmusical 负例必须提供来源证据与完整覆盖，未知音乐不能强标负例。测试使用自造元数据/小 PCM，检验泄漏拒绝、NaN/哈希检查、poly/unknown/负例、因果边界与前缀；它们不是识别准确率测试。

下一里程碑：先审核实际来源清单、保留声学与 MIDI 标签差异，生成逐源分组及监督覆盖审计报告；锁定训练预算与数据组成后，再考虑 real-only / synth+real / augmentation 等预算比较。当前没有启动 T1 训练，没有使用 N1 调参，没有改线上模型。
