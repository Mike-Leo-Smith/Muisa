# M3：电平控制、释放校准与同输入三方法对照

本轮只改善可比性，不新增算法家族，不改实时主干。沿用M2的CC0 Emily受控分支与M1房间，32个fixture，分别保持物理电平和显式等RMS，JS/CREPE tiny/Basic Pitch读取相同PCM并核对SHA256。

## 预先固定的定义

**电平两条独立报告。** 每种音色/力度/房间有physical和equal-rms两个版本。physical保留渲染器与RIR增益；equal-rms将干净目标在麦克风端确定活动区间的RMS调到0.03，记录实际gain，再加噪。每种电平分别clean/10dB，seed123。SNR mask为麦克风端确定活动区间的并集，不等于逐帧评估mask；加噪前验证实际SNR。PCM16量化后会有轻微误差。不会把两种电平合成一个“总准确率”，也不把equal-rms解释成实际设备自动增益。

**起止双标签。** 每个独立音符同时分析源端干声与麦克风端无噪声full卷积。以首150ms峰值为基准，对尾随1ms RMS取-40/-30/-20dB阈值，首次/最后一次过阈值为声学起止代理；中心定义-30dB，另外两档构成敏感范围。MIDI note-on/off原样保留。范围不是统计置信区间，也不是人工听觉真值；周期谷值不会被当成终点，因为使用最后一次过阈值。未模拟踏板/机械噪声或真实话筒底噪。

**同分母逐帧评估。** 源端与麦克风端各建一套10ms网格，开始100ms，结束距片尾150ms。阈值起止敏感带和多个音符尾音重叠区统一排除，确定有声与确定无声保留。所有pitch方法在同一side使用完全相同reference/eligible，结果保存mask hash及排除数；不要将source与microphone的分母合并。原生预测映射到最近窗口中心，属于离线评估，不是把未来窗口当作在线输出。

**事件指标单独报告。** Basic Pitch以同一源端/麦克风端声学代理分别匹配；mir_eval起音50ms、音高50cents，另加offset容差max(50ms,20%目标时长)。note precision/recall/F1与pitch RPA不是同一种分母，禁止混成模型排名。当前终点敏感范围可与容差相当，终点分数也不是无争议真值。

## 复现

先按[M2](../sampled/README.md)生成 `reports/sampled`，沿用M2隔离Python环境；CREPE和Basic Pitch依赖分别按对应实验README安装。无新依赖、无需下载另一音源或模型。依次执行，避免CPU计时互相竞争：

```sh
"$ROOM_PY" experiments/calibrated/test_labels.py
"$ROOM_PY" experiments/calibrated/generate.py
MUISA_INPUT=reports/calibrated MUISA_OUTPUT=reports/calibrated/crepe "$CREPE_PY" experiments/crepe/compare.py "$CREPE_SOURCE" tiny
MUISA_INPUT=reports/calibrated MUISA_OUTPUT=reports/calibrated/basic-pitch.json "$BASIC_PY" experiments/basic-pitch/compare.py
node experiments/calibrated/report.js
"$BASIC_PY" experiments/calibrated/note_report.py
node experiments/calibrated/summarize.js
```

`manifest.json`保存资产标识、两端校准、各PCM hash和显式gain/SNR；结果包含192行pitch（32×2端×3设置）和64行音符评分。所有生成音频、原生预测、完整mask留在忽略的reports目录。CREPE两档阈值0.5/0.8均保留，没有事后挑最好档。

校准测试覆盖已知延迟及释放、增益缩放不变、源/麦克风时移、静音拒绝、边界不确定和尾音重叠排除。源与麦克风标签来自独立干声/卷积，不从带噪预测倒推。

## 本次结果

下表是16个相关开发case的等权描述性平均，不是独立样本置信区间。每档电平各16个case。

| 指标 | 物理电平：源 / 麦克风 | 等RMS：源 / 麦克风 |
| --- | --- | --- |
| JS RPA50 / coverage（本次两值相同） | 0.664 / 0.657 | 0.894 / 0.889 |
| CREPE tiny 0.5 RPA50 / coverage | 1.000 / 1.000 | 1.000 / 1.000 |
| CREPE tiny 0.8 RPA50 / coverage | 0.985 / 0.981 | 0.985 / 0.981 |
| Basic Pitch onset+pitch F1 | 0.929 / 0.929 | 0.938 / 0.938 |
| Basic Pitch 加offset F1 | 0.643 / 0.714 | 0.646 / 0.717 |

麦克风端确定无声区间的有声误报率（case均值）也必须一起看：

| 方法 | 物理电平 | 等RMS |
| --- | --- | --- |
| JS | 0.098 | 0.199 |
| CREPE tiny 0.5 | 0.347 | 0.350 |
| CREPE tiny 0.8 | 0.120 | 0.122 |

提高电平改善JS覆盖率，同时增加无声区误报；CREPE低阈值的RPA=1也伴随大量有声误报，不能据此宣布胜出。每档电平的源端网格3136点全部可评，麦克风端3136点中3070可评、66点因敏感带/重叠排除；这些相邻网格点不独立。

RPA表中两个数表示source/microphone，不是precision/recall。每行完整coverage、voicing false alarm、额外音符与计时都保留在JSON。CREPE在确定标签区域达到1，不代表所有边界、所有演奏或真实琴都正确；有边界mask、有固定三音、同一bank和房间，不能与Y1/C1/M2不同分母直接纵向宣称提升。

声学停止比MIDI note-off晚4.6–67.1ms，释放阈值范围最宽56.2ms。JS物理/等RMS差异确认了绝对电平门限混杂，不能把M2的room收益直接归因于抗混响。Basic Pitch加入释放终点约束后分数降低，可能同时包含模型终点误差与代理标签的不确定性；不能只挑较高的onset F1。

## 时间与剩余限制

JS原生4096/22050≈185.8ms窗，1024/22050≈46.4ms hop；CREPE64ms窗、10ms hop，中心+32ms；Basic Pitch约1.99秒原生窗口，整段离线解码。共同10ms网格不会让JS拥有10ms时间分辨率。JSON分别保存JS每帧compute、模型整段wall/CPU、运行时RSS和模型load/warmup；它们不是直接等价的实时延迟指标。没有测浏览器端模型首输出、排队或音频设备延迟。

当前输入仍是合法采样渲染，未取得真实GuitarSet mic音频。本校准里程碑完成后等待真实数据，不新增算法家族，不替换在线算法。A1的重复同音歧义/回跳限制仍独立保留。


## Release 截断勘误

历史 M2/M3 输入使用 sfizz `--use-eot`，实际在最后 note-off 附近结束：MIDI 的末尾 EOT delta 未带来预期尾音。隔离样本也受影响，因此历史 release 统计和依赖其结束标签的评价不能作为完整释放验证。已发布 JSON 保留为历史结果，不静默改写；起音/音高结果也只能解释为对这些旧输入的结果。

生成器现移除该选项，让 sfizz 渲染至自身功率停止条件，并检查末尾量化电平、超时及削波。已有输出不会自动变成新结果，需重新生成、校准和评价。两条固定样本的实际渲染回归见 `experiments/sampled/results-release-fix.json`：旧前缀逐样本一致，新增尾段具有非零能量，并非补零。

使用 room 环境运行：`python experiments/sampled/test_release.py /path/to/sfizz_render`（先有 M2 本地素材）。这是可选重实验，不向快 CI 添加音源或编译器依赖。
