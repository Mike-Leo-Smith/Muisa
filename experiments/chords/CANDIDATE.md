# C2：固定泛音字典非负分解，仅开发候选

实现于 harmonic.js，纯 JS FFT/非负坐标下降，无训练模型、无网络调用、无谱面目标输入，不修改 src/dsp.js 或网页默认。16,384尾随Hann窗、48kHz、4096hop与C1一致；去DC后幅度谱，40–83 MIDI候选，每个基音6阶泛音和3种固定衰减(.8/1.4/2)，归一化稀疏字典，32轮非负坐标下降。固定谱峰带宽容忍频率误差。系数汇总为音级证据；24大小三和弦共同竞争，最高类不在教学词表则unknown。evidence/weakest/margin/residual四项检查加quiet/clipped保护；不是逐弦诊断。没有平滑或额外lookahead，也没有稳定延迟实测。

所有参数在candidate-config.json，真实C2运行前冻结。模型只解释到4kHz，固定谐波模板不匹配所有琴体、拨弦、失谐、残响；相关字典列会导致分解歧义。不可把系数叫真实音符概率。NNLS是每窗优化非负系数，不是训练神经网络。

## 受控开发证据，不是实琴成绩

`node experiments/chords/controlled.js NEW_REPORT.json`，52个确定性数学PCM：七种和弦×纯正弦/泛音/弱三音/转位/扫弦/20c失谐，另缺三音、单音、强/弱七音七和弦、sus、词表外F#、静音/弱音、seed123噪声、中途换和弦。它们不是成熟采样音色，更不是真实吉他测试；本轮不拿数学声音作产品试听。

记录 results-controlled-c2.json：原基线44/52、只换门限44/52、raw24竞争44/52、泛音候选46/52。候选恢复7个弱三音case，但在G/Em/D/Dm/F的20c失谐上比基线多5个拒识。**明确存在退化，不能据总数宣布赢家**。单次本容器计算耗时仅诊断，非浏览器延迟。另加弱七音(振幅25%)时，原基线和候选都会把C7误接受成C，属于重要OOV失败，原样保留。合成泛音衰减1.4与字典一列匹配，存在明显有利于候选的模型匹配，不能估计泛化。当前参数未为解决这些失败继续调节；先看真实开发结果。

## R1开发执行，R2保持关闭

```bash
node experiments/chords/compare.js EXISTING_C1_R1_PREPARED NEW_OUTPUT
```

无需git CLI；校验DSP源hash、C1config、已回传R1的六个PCM hash（必须复用既有48kPCM，不重新重采样）。只接受 development-observed，R2入口拒绝，避免用其反馈迭代当前候选。逐窗baseline、rawThresholdOnly、raw24、harmonic24使用相同信号/标签/时刻，baseline特征返回的门限反事实单列。三条counterfactual不能当独立实验样本。报告全部已知真值接受精度（含OOV/N错误）与unknown真值排除数；原supported内精度也保留。输入PCM、逐窗privateJSON留私有环境，不公开。

comparison.json含source hashes、config/PCM身份、每录音和pooled指标、原基线拒识联合分布、两算法compute p50/p95/deadline。缺少的音色/类别不能编造分层，下一真实素材需覆盖7目标和弦、静音/OOV和不同转位，按原始录音/演奏者/乐句及所有后代分组，先冻结再推理。已有R1/R2均为已观察资料，不能重新命名为独立测试。未获得合法新数据前，不宣称新材料已准备。
