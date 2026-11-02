# Y1：JS / 标准 YIN / pYIN 成对比较

已实际运行的第一项离线对照。**只有数学合成数据，不是真实吉他准确率。** 不改变在线 App 的识别器。

## 复现

Linux x86_64 / Python 3.12 / Node 22+；Python 依赖单独安装，主 App 仍零依赖。librosa 0.11.0 采用 [ISC](https://github.com/librosa/librosa/blob/0.11.0/LICENSE.md)，固定解析出的版本见 lock。无模型权重、真实音频或付费服务。

```sh
python3 -m venv /tmp/muisa-yin
/tmp/muisa-yin/bin/python -m pip install -r experiments/yin/requirements-linux-py312.lock
node experiments/yin/generate.js
/tmp/muisa-yin/bin/python experiments/yin/compare.py
node experiments/yin/report.js
```

可通过 GitHub Actions 的 **Optional YIN comparison** 手动运行。它不属于快速 CI 或部署依赖，输出 JSON artifact，不上传 WAV。临时输入、逐帧预测在 `reports/yin/`，摘要保存在本目录 `results.json`。保存 WAV SHA256、seed、gain、标签与实际版本，不提交采样库。

## 配置

7 个输入：clean、20/10/0 dB 平稳均匀噪声、noise-only、silence、弱音（clean ×0.02）。每个 2.4 秒，22,050 Hz；三个分离的泛音单音 MIDI 52/64/67。噪声 seed 123，SNR 按目标发声区间。clean 真正不加噪声。

所有算法读取同一个量化 PCM16 WAV。4096 点窗口（185.76 ms）、512 点步进（23.22 ms），70–1000 Hz。按窗口中心标注，并另报完全处于单一音符/静音内部的 stable frames，避免把转换边界结果藏进总体均值。

- Muisa JS：当前 energy/confidence 门控，逐窗因果，不使用未来窗口。
- librosa YIN：原始输出与相同 RMS≥0.008 的额外门控分别报告。原始 YIN 本身不负责判定有没有音乐音，因此不能直接把全部输出当作可信音符。
- librosa pYIN：`center=False`，使用库的原生 HMM voiced flag。仍然是整段 HMM/Viterbi，使用未来窗口，**不是流式识别**。

这里只评价逐帧 pitch/voicing；不以预测序列构造虚假的 onset、和弦或在线跟谱成绩。部署的 AudioWorklet/权限/谱对齐未接入 Python。

## 实际观察（本次单个合成集合）

- clean 三者的目标发声帧 RPA@50 cents 均为 1；这只是简单合成例，不能代表真实琴性能。
- 10 dB：JS RPA / coverage 均约 0.941，YIN/pYIN 为 1；但无目标音的帧，YIN 和 pYIN 仍有明显 voiced false alarms。算法并非单一分数可排序。
- 0 dB：JS 与 pYIN 拒识（coverage 0）；原始 YIN RPA 约 0.627，但 coverage 1、非发声帧全部报有声。不能把有输出等同识别可靠。
- noise-only：JS voiced false alarm 0，原始和门控 YIN 为 1，pYIN 约 0.313。这是保留的负结果，不因模型更复杂就替换主干。
- weak：JS 和 RMS-gated YIN 全拒识，原始 YIN/pYIN 恢复目标音高，但付出静音/边界误报代价。后续应研究自适应置信度与弱音，而非仅降低固定门限。
- clean 的非发声**中心**帧也可因窗口跨越 attack/release 被判有声；stable 指标单独给出，不能把它们都当纯噪声误报。

该机器上 JS clean 每窗 p50≈1.09 ms、p95≈1.34 ms，无 hop deadline miss；librosa YIN/pYIN clean 整段 p50≈35/173 ms，首次 kernel/JIT 预热合计约16.5秒。整段三次计时只是探索，不是稳定 p95 或首音延迟。Python 进程 peak RSS 约422–437 MiB，包含解释器、依赖和 JIT；JS 进程 RSS 约51–62 MiB。两者不是增量模型内存的公平比较，也不是手机基准。

## 决策与下一项

保留 JS 实时主干；YIN/pYIN 作为离线比较器。先用合法真实小子集验证弱音/噪声/边界，再考虑新增置信度策略。下一项可独立比较 CREPE tiny/small；不会因为本次 synthetic RPA 就默认采用。更长窗口、低频音、不同噪声家族、房间反射、拨弦技巧及模型实测延迟仍待后续实验。
