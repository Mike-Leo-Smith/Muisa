# T1 数据接入准备（尚未训练）

T0 失败后先验证数据契约，不通过增加训练时间掩盖数据域问题。本目录只依赖 Python 标准库，没有模型下载、训练循环或云服务调用。现有 R1/R2 均已查看；N1 只做冻结评测。没有私人用户录音，公开 GuitarSet 的私有工作副本仍受来源与署名记录约束。

```bash
python -m unittest discover -s experiments/train/t1 -p 'test_*.py'
python experiments/train/t1/audit.py bound /local/manifest-v2.json --root /local/prepared-assets
python experiments/train/t1/audit.py guitarset /local/manifest.json --root /local/guitarset
```

以下 v1 字段说明仅保留历史背景，v1 CLI 已退役，不能授权训练。当前入口要求下文 v2 绑定契约。原始元数据包括：

- `id`、原始 `sourceId`、增强祖先 `lineageRoot`、`split`（train/development/validation/test）、`previouslyInspected` 布尔值、`evaluationOnly`。
- `kind`：real-guitar/rendered-guitar/speech/nonmusical/unknown-music；`negativeTarget` 仅 speech/nonmusical 可为 true。来源类别与标签真实性须人工审查，验证器不能听音证明标签正确。
- `license`：id/source/attribution 三个非空字符串，记录资产许可，不继承渲染引擎许可。音频不随代码发布。
- `groups` 的完整七维：player/session/recording/midiPiece/instrumentBank/noiseSource/rirSource，每维为稳定、带数据集命名空间的 ID 列表；不适用为 null。真实琴必须有前三维，渲染必须有曲目和音源 bank，其他素材必须有 noiseSource。未知 session 不应随机分组，应保守合并或留在开发数据。
- `pcm`：相对 path、sha256、sampleRateHz=16000、channels=1、samples。文件是有限 little-endian float32 原始 PCM，校验字节数/哈希/数值；不执行重采样或独立幅度归一化。生成端另保留原音频哈希、重采样/混音参数和修改记录。

初始分组策略保守：任何共享 source、lineage、文件哈希或上述 group 不能跨 split；共享 noise/RIR 会连通多个样本，验证器拒绝，而不悄悄放宽留出条件。先分配源组，再做裁剪、混音与增强。若以后分不同泛化轴评价，须另立明确协议，不能修改此契约后仍称同一个 holdout。previouslyInspected 缺失/不为 false 的资产不能放 validation/test，evaluationOnly 不能进入 train。

`frame_labels` 接收样本索引 note（startSample/endSample/midi/reliable）、完整标注覆盖区间 reliable_intervals。它不接受“谱子期望音”，因此弹错谱的可听吉他仍是正目标。没有完整标注的区域全 mask，不把缺标当静音。每 hop 标签右对齐；起音落在 `[hopStart, hopEnd)`，精确边界不会提前一帧。前 3 帧 warmup 无效。pitch 仅监督整个尾随窗内唯一可靠、有效音域的 note；同音高两根弦仍算复音。复音有 activity 正例而无 pitch 标签；未知可靠性 mask。半音类别仅对 MIDI 均值量化，不代表连续 F0 或调音真值。

可靠区间须由后续数据适配器结合标注覆盖和 attack/release 不确定性明确生成；当前尚未实现 GuitarSet/渲染资产到 T1 标签的完整转换，也未读取真实数据测试这些转换。Speech/nonmusical 负例必须提供来源证据与完整覆盖，未知音乐不能强标负例。测试使用自造元数据/小 PCM，检验泄漏拒绝、NaN/哈希检查、poly/unknown/负例、因果边界与前缀；它们不是识别准确率测试。

下一里程碑：先审核实际来源清单、保留声学与 MIDI 标签差异，生成逐源分组及监督覆盖审计报告；锁定训练预算与数据组成后，再考虑 real-only / synth+real / augmentation 等预算比较。当前没有启动 T1 训练，没有使用 N1 调参，没有改线上模型。


## v2 绑定契约与本轮边界

`contract.audit` 要求 `schema=muisa-t1-data-v2`、`sources` 父源字典和 `items`。完整可执行示例见 `test_bound.py` 的 fixture。来源清单包含资产路径/hash、format、采样率/长度、来源类型、七维分组、许可、显式布尔 previouslyInspected/evaluationOnly。item.parents 逐一绑定 sourceId/hash/target 或 interference 角色；不能仅凭 lineage 字符串改变祖先。

每条 item.annotation 指向有哈希的 JSON；JSON.binding 必须逐值匹配 PCM hash/长度、kind、timeMapping 和所有 parentHashes。notes/完整标注覆盖/帧数也位于该文件。时间映射包含原始采样率、输出采样率、sourceId、cropStart/EndSample、additionalDelaySamples=0。范围、整数类型、PCM 文件长度、有限值、notes/intervals 越界和帧数均检查。未知音乐不得声明完整全负监督；完整标注的吉他无音区可产生 activity 负标签。音频本身是否真的被完整标注仍需来源审核，哈希不能证明语义正确。

transform 显式记录 resample 方法/版本/window/padtype/normalization、每个混音父源 gain/offset，以及 augmentation 列表。**本版本只支持原生 16k float32 单父源、单位增益、零偏移的裁剪 replay**，比对父源与输出 PCM 字节；非空 augmentation、实际重采样和多父源混音拒绝进入监督流程。参数缺失同样拒绝。以后必须实现对应 replay 和测试才可扩展，不因字段存在就接受未经验证的增强。

检查继承 inspected/evaluationOnly，不能把 true 改 false。已观察输入只可 development/observed-validation（或 train 若非 evaluationOnly）；不能是未见 validation/test。冻结 evaluationOnly 只能 test/observed-validation，purpose=training/selection 一律拒绝；这明确包括模型与阈值选择，不以 development 名义绕过。跨 split 检查祖先 ID/hash 和所有来源组，实际 session 不明时不能伪造独立性。

`collate` 输出纯数值标签 batch，masked pitch None 变为 -100，pitchMask=0；变长 padding 同样 mask。当前修复后的 loss 已先选择有效项，不存在此处重报旧 loss bug。collator 不调用 torch/优化器；PCM 批处理、重采样与训练加载器尚未实现。

GuitarSet audit 命令复用已审计的本地 WAV/JAMS reader，核对文件 hash/PCM 元数据、注释范围，保留 clip-local observation time（不把 annotation.time 加到 note 上）。输出不含绝对路径、不写训练标签；R1/R2 强制 previouslyInspected=true、development，session 采用保守 player 合并并提示实际来源审核。任何越出 PCM 的注释要求显式审核，不截断或改标签。合成 fixture 验证了该全链路，但本容器未访问真实 GuitarSet 副本。本轮不下载资产、不训练、不导出新权重。

15 项测试包含 7 项历史底层检查和 8 项 v2/adapter 回归，覆盖绑定篡改、历史/冻结限制、数值 sentinel、边界、父源泄漏、失败关闭及自造 WAV/JAMS 端到端审计。实际 source registry 的真实性、完整标注证据、session 和 R1/R2 玩家重叠仍须在私有数据环境审核后才能准备训练数据。
