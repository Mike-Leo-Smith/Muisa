# B1：Basic Pitch ONNX 离线音符转录

已实际运行六个数学 PCM 条件；没有真实吉他录音，没有浏览器或实时集成。采用官方 [Basic Pitch 0.4.0](https://github.com/spotify/basic-pitch) 的 ONNX 模型和原生解码器，[Apache 2.0](https://github.com/spotify/basic-pitch/blob/main/LICENSE)。不提交模型、音频或上游源码。

## 复现

Linux x86_64 / Python 3.12，单独环境。这里有意测试 ONNX-only 后端：官方包在此 Python 版本的依赖元数据仍要求 TensorFlow，而对应旧版 TensorFlow 不支持 Python 3.12。完整冻结依赖使用 `--no-deps` 安装；这不是默认 pip 安装路径，`pip check` 会指出缺失 TensorFlow，不能宣称满足全部包元数据。主 Web App 无这些依赖。

```sh
python3 -m venv /tmp/muisa-basic-pitch
/tmp/muisa-basic-pitch/bin/python -m pip install --no-deps -r experiments/basic-pitch/requirements-linux-py312.lock
node experiments/yin/generate.js
node experiments/basic-pitch/generate.js
/tmp/muisa-basic-pitch/bin/python experiments/basic-pitch/compare.py
```

固定 ONNX Runtime 1.23.2、mir_eval 0.8.2；setuptools 80.9.0 保留 pretty_midi 需要的 pkg_resources。包内 nmp.onnx 为 230,444 字节，SHA256 `2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec`，执行时强制校验。CPUExecutionProvider，线程 intra/inter 2/1。禁用未安装的 TensorFlow/CoreML/TFLite 后端提示是预期行为，不影响 ONNX。

生成 WAV、MIDI、完整标签和输入 hash 留在忽略的 `reports/basic-pitch/`；摘要提交于 `results.json`。依赖锁为 Linux Python 3.12，尚未验证其他平台。可选手动 Actions 与主应用快 CI 分开。

## 方法与结果

四个单音条件复用 Y1 的相同 PCM16 WAV；两个多音条件为先后 C、G 三和弦，共六个目标音。clean 真正零噪声，10 dB 采用有效发声区间能量加 seeded noise；不是采样吉他或音乐背景噪声。固定原生阈值 onset 0.5、frame 0.3、最短音符 127.7ms；modelAmplitude 不是校准后的正确概率。

使用 mir_eval 一对一 note matching：起音 ±50ms、音高 ±50 cents；另报终止时间容差 max(50ms, 20%目标时长)。本次两个匹配条件得到相同 P/R/F1，但 overlap 不同于精确边界正确率。

| 条件 | 目标 / 输出音符 | Precision | Recall | F1 |
| --- | --- | --- | --- | --- |
| 单音 clean | 3 / 3 | 1 | 1 | 1 |
| 单音 10 dB | 3 / 3 | 1 | 1 | 1 |
| 三和弦 clean | 6 / 7 | 0.857 | 1 | 0.923 |
| 三和弦 10 dB | 6 / 8 | 0.750 | 1 | 0.857 |

纯噪声和静音各输出 0 音符（仅2.4秒，各自 false notes/min=0，不能外推长期误报率）。静音时原生解码器出现 `invalid value encountered in divide` 警告，已保存在 JSON；模型输出张量保持有限值，最终无音符。没有掩盖此数值边界问题。

每段2.4–3秒音频重复3次，链路墙钟中位数约45–54ms，加载19ms，首次 warmup713ms；进程峰值约297 MiB，含 Python/ONNX 等依赖，非模型增量内存。加载与 warmup 不包含 import 时间，三次不足以估计可靠 p95。原生窗口43,844点/22,050Hz≈1.99秒；离线计算快于实时并不证明低延迟因果识别。

结论：值得保留为离线多音对照，但简单三和弦已经产生额外音符；音符转录不等于和弦名称识别，更不等于逐弦诊断。接下来需要成熟乐器渲染、房间与真实录音验证。GuitarSet 曾用于 Basic Pitch 训练，后续不能把任意 GuitarSet 子集称为未见测试集。
