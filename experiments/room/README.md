# M1：成熟 MIDI 渲染与有限阶房间响应

范围为12个短 fixture：3种乐句 × dry/room × clean/10dB。这是 **GM 吉他集成基线，不是高保真或真实琴验收**。音源/房间都只有一个家族，所有样本均为 development，没有独立 holdout。

## 来源与复现

- 系统 FluidSynth 2.4.4（Debian `libfluidsynth3` 2.4.4+dfsg-1+deb13u3），LGPL；[官方接口](https://www.fluidsynth.org/api/)。通过 pyfluidsynth 1.3.4 离线渲染，不启动音频设备。
- 系统 TimGM6mb.sf2，program 25（零基编号，GM steel-string acoustic guitar）。[Debian 许可](https://metadata.ftp-master.debian.org/changelogs/main/t/timgm6mb-soundfont/unstable_copyright)为 GPL-2，作者 Tim Brechbill / David Bolton。不提交音源或衍生 WAV；源文件 SHA256/大小在 manifest。该小型 GM bank 无法替代后续多力度、round-robin、演奏法更丰富的音源。
- [pyroomacoustics](https://github.com/LCAV/pyroomacoustics) 0.10.1（MIT），使用官方 PyPI Python3.12 wheel。先前0.10.0源码安装失败，报 C++11 compiler 检测失败；没有更改系统编译器，改用更新版本官方 wheel。此结果固定0.10.1。

在 Linux / Python3.12，准备上述系统音源和 FluidSynth shared library，安装隔离环境：

```sh
python3 -m venv /tmp/muisa-room
/tmp/muisa-room/bin/pip install -r experiments/room/requirements-linux-py312.lock
/tmp/muisa-room/bin/python experiments/room/generate.py /usr/share/sounds/sf2/TimGM6mb.sf2
/tmp/muisa-room/bin/python experiments/room/prepare-comparison.py
```

可选手动工作流 **Optional MIDI room fixtures** 只检查生成流水线，不自动拉取三个识别模型；本轮完整识别复跑在云端本地完成。工作流使用runner的系统包，若版本不同，manifest会记录变化，不能宣称hash应与当前机器一致。

生成目录 `reports/room` 被 Git 忽略。脚本不下载采样库；换音源、渲染器版本或系统后应视为新实验，不能默认为原结果可重复。manifest 同时记录 MIDI 语义、源音色/干声/RIR/最终 PCM hashes。

按 Y1、C1、B1 README 准备各独立环境后，依次执行（以下 `$YIN_PY` 等指相应 Python 路径）：

```sh
MUISA_INPUT=reports/room/mono "$YIN_PY" experiments/yin/compare.py
MUISA_INPUT=reports/room/mono MUISA_OUTPUT=reports/room/crepe "$CREPE_PY" experiments/crepe/compare.py "$CREPE_SOURCE" tiny
MUISA_INPUT=reports/room/all MUISA_OUTPUT=reports/room/basic-pitch.json "$BASIC_PY" experiments/basic-pitch/compare.py
node experiments/room/report.js
```

只跑 CREPE tiny：上一阶段 small 没有明显收益。YIN/pYIN/JS/CREPE 仅评8组单音乐句，Basic Pitch 评全部12组含多音；不让单音标签任意代表和弦。

## 空间、时间与测试语义

FluidSynth reverb/chorus 关闭，固定gain0.6；22,050Hz双声道平均为mono，三种乐句都用同一增益，禁止每组独立归一化。MIDI tempo500000μs/beat、480ticks/beat；实际回读时间/排序与事件表逐项比较。同音重复在同一tick先note-off后note-on，力度45/65/90。每次渲染后保留1秒释放，两次新建synth渲染必须逐样本一致。

房间固定4×5×2.7m、声源[1.2,1.3,1.2]、麦克风[1.7,1.3,1.2]，均匀能量吸收0.35，ISM阶数6，不启用随机ISM/ray tracing。这是直达/早期反射基线，**不是完整晚混响、实测RT60或低频模态模型**。卷积用full，不裁尾。独立order0 RIR验证距离/声速与峰位置（±1sample），算法fractional-delay FIR延迟单独记录；不使用room最大反射峰当起音。

噪声为seed123的高斯传感器噪声，在room之后加入；active mask按已知MIDI gate加传播/FIR延迟，保存请求/实测SNR与gain，无能量时拒绝。clean零噪声。无环境人声、伴奏、话筒频响/压缩模型。SNR指标在量化前验证；PCM16量化后的比值可能轻微变化。

生成时检查delta-RIR identity、full长度、物理/FIR延迟、重复渲染一致性、MIDI时间/排序、有限值/不削波和SNR。renderAttackMs明确为null：还没有测定采样音色真正attack，不能把MIDI note-on当作真实声学标注。note-off后的采样释放/房间尾音也可能在当前gate指标里计作false voicing；报告不是完美声学真值。

## 结果

机器可读结果在 `results.json`，所有条件保留；运行耗时为同一Linux机器的探索性测量，模型最终顺序执行，非浏览器性能承诺。声学attack/offset标注与更丰富音源是下一轮优先改进项；不据此把任何模型换入实时主干。

本次关键结果（MIDI gate 参考，非真琴准确率）：

| 条件 | JS RPA50 | pYIN RPA50 | CREPE tiny 0.5 RPA50 |
| --- | --- | --- | --- |
| 分离单音 dry clean | 0.864 | 0.932 | 0.970 |
| 分离单音 room 10dB | 0.390 | 0.661 | 0.978 |
| 弱到强重复 dry clean | 0.356 | 1.000 | 0.895 |
| 弱到强重复 room 10dB | 0.222 | 0.000 | 0.886 |

pYIN 最后一组 coverage 0.889 却 RPA50=0，说明判为有音不等于正确音高；JS 部分弱音被静音阈值拒绝。CREPE 的阈值0.8结果、各自coverage/false voicing与stable帧结果也全部在JSON中。不要跨不同帧网格直接汇总。

Basic Pitch 三和弦 dry/room 的clean均输出8音（目标6音，F1=0.857），10dB均输出9音（F1=0.8）。分离单音 room clean多1音，重复音 room clean多2音。当前证据支持继续比较，不支持直接替换实时算法。

开发工作区可选择启用 `git config core.hooksPath scripts/hooks`，其pre-commit只允许本次代理工作的Codex noreply身份；这是避免再次误用环境默认身份的本地保护，不要求项目贡献者采用该身份。已测试非预期身份会被拒绝，公开历史不改写。
