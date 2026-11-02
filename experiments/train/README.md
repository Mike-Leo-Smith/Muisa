# T0：小型因果三头模型 CPU 管线试验

独立研究目录，不加入网页/快CI依赖，不加载在线。先阅读 [数据与时序契约](CONTRACT.md)。当前只用自造谐波PCM的单batch训练，不是实际吉他准确率比较；没有私人用户录音，没有使用N1冻结输入。

环境：Linux Python3.12，官方PyTorch2.7.1 CPU，ONNX1.18.0、ONNXRuntime1.22.0。完整依赖见lock。使用独立虚拟环境；安装torch需官方CPU源，其余依赖使用标准PyPI；不安装CUDA或GPU服务。

```
python3 -m venv /path/to/t0-env
/path/to/t0-env/bin/pip install torch==2.7.1+cpu --index-url https://download.pytorch.org/whl/cpu
# 全部精确版本在lock；torch已经安装，其他包无需重新解析它的依赖。
/path/to/t0-env/bin/pip install --no-deps -r experiments/train/requirements-cpu-linux-py312.lock
/path/to/t0-env/bin/pip check
/path/to/t0-env/bin/python -m unittest discover -s experiments/train -p 'test_*.py'
/path/to/t0-env/bin/python experiments/train/run.py --output reports/train-t0
```

限制：配置最多120步、训练loop120秒、2CPU线程、batch4；不自动扩大训练预算。测试包括shape/gradient、无标签mask零损失、prefix因果性、逐hop与整chunk状态一致性；run导出显式状态ONNX并用CPU Runtime比较多个chunk长度的logits和下一状态。仅保存本次自训练state_dict，不能加载不可信pickle。

生成weights/ONNX/日志留本地reports，不提交大权重。`results.json`包含参数数、固定DFT buffer体积、实际步数/时长、训练batch初末loss、每头loss、ONNX大小/哈希与误差。固定DFT矩阵可能让导出文件远大于可训练参数；训练成功不意味着浏览器/WASM能高效执行该前端。所有真实准确率、泛化、平台延迟和教学效果均未验证。

## 原模型冻结与审计修复

首次120步权重按 [frozen-t0.json](frozen-t0.json) 固定，私有交付，未重训。第一轮真实音频诊断遵守 [固定帧级协议](FRAME_EVALUATION.md)：activity阈值0.5、argmax MIDI、右对齐hop结束时刻、latest-available≤grid、无未来插值；没有已定义event decoder，不报告note F1。跨ORT版本先用私有固定向量检查数值/状态，不静默放宽容差。

后续源码分别修复：精确hop边界onset归属；先选有效mask再计算loss（忽略非法/NaN占位，监督区非法目标拒绝）；拒绝空/非整hop chunk与非法state。ONNX图自身不含Python断言，`inference.py`提供同等host校验和warmup时标。八项独立T0回归通过，包括临时随机模型导出/host检查；该临时模型不是新训练checkpoint，也未覆盖原模型。

原始冻结模型的真实诊断已完成：[失败分析](RESULTS_T0_REAL.md)、[18 条脱敏结果](results-t0-real.json)。ORT 1.23.2 parity 通过，但真实 pitch 迁移失败；不部署、不以 activity F1 代替 pitch 准确率。后续仅准备 [T1 数据契约](t1/README.md)。
