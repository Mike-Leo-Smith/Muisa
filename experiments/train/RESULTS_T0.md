# T0 首次管线结果

在提交 `cbdc9a1ef984058f8faf321c058483e7be411b03` 的独立 Linux CPU 环境运行，完整记录见 [results-t0.json](results-t0.json)。这是自造谐波PCM的同一训练batch，**没有真实录音/真实采样训练、独立准确率或泛化结果**；未使用N1冻结输入。网页仍用既有DSP。

- 可训练参数19,667；固定DFT另有1,050,624个非训练buffer值。
- 2CPU线程，120步，训练段wall time约1.60秒；训练loop未超预设120秒上限，没有追加步数追结果。
- 同batch总loss 5.30184→0.45876；activity 0.68604→0.24995，pitch 3.91545→0.01773，onset 0.70035→0.19108。pitch loss明显下降，但activity/onset尚未完全拟合；不将这称为完整过拟合成功，更不能当测试准确率。
- 三项模型测试通过：shape/梯度及空mask、未来后缀不改变前缀/逐hop与批chunk状态一致、unknown pitch不产生该头监督梯度。依赖pip check兼容。
- ONNX opset17通过checker与CPU Runtime；连续1/3/7/1/4-hop chunk的logits最大绝对误差7.63e-6，PCM state误差0、feature state最大1.91e-6，均低于固定1e-4容差。
- ONNX为4,293,283字节，主要来自固定DFT矩阵；参数少不等于导出小。进程peak RSS411,408KiB包含训练与导出/Runtime，不是模型增量内存或浏览器峰值。

64ms尾随前端窗、16ms更新，TCN历史14帧，约288ms历史感受野；没有未来lookahead，但初始前三hop无完整前端历史，应mask。模型输出代表当前hop结束时刻，计算/采集/设备延迟另计。

导出日志存在legacy ONNX exporter的Slice constant-folding提示：部分Slice未折叠，不是导出失败，完整数值/状态检查通过。没有测试ONNX Runtime Web、WASM、WebGPU或真实浏览器流；固定DFT卷积的资源占用仍需后续评估。checkpoint/ONNX留本地reports，不把大二进制加入公共仓库。

下一步先完成N1 baseline诊断与数据标签接口，再决定是否独立扩充T0采样训练或T1同预算研究。不能用N1调参后再报告其为独立验收，也不能把已经看过的R1/R2重新命名为untouched test。
