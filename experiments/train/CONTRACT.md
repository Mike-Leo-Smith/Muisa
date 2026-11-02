# T0 数据、标签与时序契约

T0仅CPU有限步数管线验证，不是部署识别器或准确率改进。当前没有私人用户录音；已有真实录音资源是公开GuitarSet的私有工作副本。N1冻结输入不得用于训练/阈值选择后再宣称独立验收。

每个训练item需要schema/version、原始sourceId、所有衍生augmentationId、分组（player/session/recording/MIDI曲/音源bank/noise source/RIR source）、split、许可证与修改/署名、PCM/hash/sampleRate/channel、音量与增强参数、可用标签及掩码。原始录音与所有切片/增强后代同split。未知音乐目标不能把所有未标注音强标negative；偏离练习曲谱的真实吉他音仍是正例。讲话/非音乐negative要有合法来源与明确目标定义。

三头输出为目标吉他activity、49类半音pitch（MIDI36–84）、onset logits。activity/pitch/onset各有独立mask；pitch只在可靠mono、有效音域和标注稳定区域监督，poly/unknown pitch不监督、不宣称六弦转谱。可听吉他poly的activity可为1，但必须有可靠标签；不能因为不支持poly就标成噪声。未知activity和onset同样mask。当前没有精细微分音头；GuitarSet note_midi均值不是瞬时F0或调音真值，未来仅有效contour或精确合成truth才监督精细音高。

输入16kHz mono float32。每hop256样本（16ms）更新，尾随窗1024样本（64ms），左侧只用历史；初始768样本zero history，前3个输出为warmup-invalid。代表时刻与最早available均为当前hop结束样本；输出不回标成中心零延迟。训练onset目标在声学已可见的下一hop，误差上限一个hop；真实渲染attack与MIDI note-on不同，需记录代理标签和不确定性。序列结束不偷偷读取未来或反射补齐；source change必须清零两种state。

前端为固定Hann窗DFT实/虚卷积+log magnitude（非centered STFT），频率CNN保留绝对频率位置，32通道因果TCN的dilation1/2/4提供14个历史feature帧。有效历史感受野约64+14×16=288ms，不额外等待未来。可导出一步或多hopchunk，显式PCM state768样本和feature state32×14；没有BatchNorm时间统计、双向层或未来归一化。计算耗时另外计，不把64ms窗说成真实端到端延迟。

loss：独立masked BCE activity/onset及masked CE pitch，onset positive weight8，三头等权；无有效标签时返回可反传零损失。训练seed/config固定，最多120步、训练loop120秒、2CPU线程、batch4，梯度norm上限5，不付费GPU。超时报告实际步数，不扩预算追结果。T0可先只用数学PCM验证；任何单batch过拟合仅说明管线能学习，不能当holdout/test成绩。

T1后续应预注册同预算real-only、synth+real、再加augmentation比较。按上述source groups隔离，音源bank/noise/RIR也留出；R1/R2已看过，只能开发集。BasicPitch与GuitarSet训练重叠背景需保留。参考 [SynthTab](https://arxiv.org/abs/2309.09085)的合成预训练/真实微调思路和 [BasicPitch](https://arxiv.org/abs/2203.09893)的轻量多任务输出，不能照搬其任务、数据或成绩。

训练CPU、ONNX数值/状态一致性、WASM支持和浏览器真实流式表现是不同验收；本轮只做前两项，网页不自动加载T0权重。
