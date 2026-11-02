# N1：真实干扰波形的单场景基线诊断

独立云执行端按提交 `c1617ea524472b499c15d0792e01aa56808c5aca` 完成六个冻结条件，未经调参/重缩放/重新生成输入。完整脱敏结果见 [results-n1.json](results-n1.json)。源码整理环境未重跑该真实输入。原config中的 `executionStatus:not-run` 是冻结前字段，原配置哈希保持不变；顶层status与executionValidation记录实际执行完成。

这是一个采样吉他乐句、一个模拟房间、真实朗读/键盘/脚步波形构造的场景，不是现场交谈、真人练琴验证或泛化测试。三个正条件使用同一room target和标签，区别仅在固定干扰stem；T0训练没有使用N1。

| 条件 | 稳定mono RPA50 | coverage | 八度错帧 | onset TP/FP/FN | accepted note F1 | unknown事件 |
|---|---:|---:|---:|---|---:|---:|
| room-only | 100.00% | 100.00% | 0 | 12/0/0 | 90.91% | 2 |
| room+speech | 83.53% | 87.95% | 16 | 12/0/0 | 76.19% | 3 |
| room+speech+transients | 61.65% | 65.66% | 18 | 9/8/3 | 55.56% | 11 |

后两条件accepted precision仍约93%，但覆盖和召回明显下降；只看接受后的精度会掩盖漏听。讲话主要损害音高/音符接受，叠加瞬态还造成额外onset及漏起音。这里只有12个参考音，不宣称普遍因果结论。

| 负样本 | accepted false notes | 全部false onsets | unknown | accepted notes/min | onsets/min |
|---|---:|---:|---:|---:|---:|
| speech-only | 1 | 3 | 2 | 6.84 | 20.53 |
| transients-only | 0 | 12 | 12 | 0 | 82.12 |
| speech+transients-only | 0 | 12 | 12 | 0 | 82.12 |

**零接受音符不等于没有误触发**：两个瞬态负条件各12个起音保留为unknown。speech+transients负样本还有约4.34%的评价网格被报有声，尽管没有接受成note事件。

正条件共享498 mono、115 unvoiced、240 boundary-guard帧；mono覆盖58.38%，guard排除28.14%。参考来自实际SMF gate加physical/FIR延迟，不重复加delay；MIDI gate之后可能仍有声学释放，因此正条件的“无音”误报不等于已确认的环境错判。

每条件408分析窗，有效处理8768ms，尾部7.4375ms未处理；负例每分钟指标用8.768秒分母。共享主机单次compute p95约10.17–13.03ms，无超过21.33ms hop预算的观测；不是设备/浏览器端到端延迟保证。46个payload hash与配对恒等式验证通过，最大配对float误差约2.85e-8；音频不公开。

这些结果支持继续研究非平稳干扰下的拒识与起音可靠性，不支持自动换模型或宣布抗噪已解决。当前线上配置与冻结N1协议保持不变。
