# C1：官方 CREPE tiny / small 离线对照

已实际运行，输入沿用 Y1 的 7 个精确数学 PCM 条件。没有真实琴数据、没有在线集成，没有以合成结果宣称真实准确率。官方 [CREPE](https://github.com/marl/crepe) 的代码/预训练包采用 [MIT](https://github.com/marl/crepe/blob/master/LICENSE)；此仓库只提交适配器、依赖锁和结果，不复制上游代码/权重。

## 复现

Linux x86_64 / Python 3.12；依赖含 TensorFlow CPU，单独环境运行，主 App 零依赖不变。无需 GPU、API 密钥或服务账号。

```sh
python3 -m venv /tmp/muisa-crepe
/tmp/muisa-crepe/bin/python -m pip install -r experiments/crepe/requirements-linux-py312.lock
/tmp/muisa-crepe/bin/python experiments/crepe/prepare.py /tmp/muisa-model-cache
node experiments/yin/generate.js
/tmp/muisa-crepe/bin/python experiments/crepe/compare.py /tmp/muisa-model-cache/crepe-source tiny
/tmp/muisa-crepe/bin/python experiments/crepe/compare.py /tmp/muisa-model-cache/crepe-source small
node experiments/crepe/report.js
```

准备脚本在新的空缓存目录也已运行成功。固定源码 commit `c9b71ce61491454125a0693f584f7244f29d9884`（0.0.16），官方模型分支 commit `bb29b8d99a89924476d112d27ed470e4ac5617c0`。sparse checkout 只选择 tiny/small；解压权重分别验证 SHA256：

- tiny：`409254d6a537cc432061112b7ec5f6fd283658f108fc2abc24db9c25858b42df`，2,011,144 字节，487,096 参数。
- small：`67cff9f4bf1f3b63496fdcb631b830f994f2904705401cd208d2b86a0d16654a`，6,579,224 字节，1,629,192 参数。

模型与 raw predictions 留在外部缓存/`reports/crepe`；结果摘要及输入 hash 在 `results.json`。GitHub Actions **Optional CREPE comparison** 可手动复现，不加入每次 push 的快 CI，也不上传音频/权重。

## 设置与计时语义

同一量化 WAV；CREPE 按官方路径重采样到16 kHz，1024点窗口（64ms），10ms hop，`center=False`、`viterbi=False`。返回时间是窗口起点，评估标签移到中心 +32ms。这个批量适配器不是实时实现，重采样的等待/边界和首帧发出延迟不能只用64ms代替。

预先列两档 confidence：0.5 / 0.8，均保留结果。每片段重复3次，计时包含重采样+推理+后处理，不含独立报告的模型加载与首次 warmup；同时保存 process CPU time、墙钟时间和进程 peak RSS。3次计时不足以给稳健 p95。tiny/small 分别独立进程运行，限制 TF intra/inter线程为2/1、OMP为2。

Y1 的窗口185.76ms、hop23.22ms，本实验64/10ms，所以不能把两份报告的帧分母直接汇总或认定模型优劣来自网络本身。stable frames 指标仍单独报告。

## 本次结果与负结果

仅7个合成条件、三个音高：

| 模型 / 阈值 | clean RPA50 | 0dB RPA50 / coverage | noise-only voiced FA | 弱音 RPA50 |
| --- | --- | --- | --- | --- |
| tiny / 0.5 | 0.983 | 0.992 / 0.992 | 0.0043 | 0.983 |
| tiny / 0.8 | 0.917 | 0.642 / 0.642 | 0 | 0.917 |
| small / 0.5 | 0.983 | 0.983 / 0.983 | 0 | 0.983 |
| small / 0.8 | 0.925 | 0.625 / 0.625 | 0 | 0.925 |

提高 confidence 门限降低误报，也明显增加漏识；不隐藏 coverage。tiny 在一个噪声帧仍误报；clean 的 attack/release 边界也不是全对。此小集合不足以证明低门限适用于真实房间、人声和吉他。

每2.4秒音频的推理链路墙钟 p50：tiny约0.32–0.36秒、small约1.01–1.06秒。small在此集合没有稳定收益但耗时约3倍。加载约134/128ms，首次warmup约347/452ms；不包含 Python/TensorFlow import 冷启动。进程峰值约760/773 MiB，主要包含 TensorFlow 等运行时，不能用2/6MB权重文件大小代替设备内存预算。

结论：**tiny 值得进一步在真实琴和空间/干扰集合验证；small 暂无足够收益理由。** 两者均不替换当前在线 JS。faster-than-real-time 的离线批量速度不证明低延迟单窗推理，更不代表浏览器/WASM性能。下一项应保留本基准，独立试 Basic Pitch 多音转录；真实琴评测仍等待合法音频取得，不能将此结果作为验收。
