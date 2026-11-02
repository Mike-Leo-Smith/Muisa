# M2：受控 Emily 采样分支、声学起音代理与预处理消融

已实际运行16组PCM × raw/DC/DC+背景门控，共48行。重点是增加输入可信度并量化标注局限；不宣称完成高保真，更不把直录电吉他等同木吉他。

## 固定资产和构建

[Emily 官方采样仓库](https://github.com/sfzinstruments/karoryfer.emilyguitar) commit `b4920dc662fd9cad6dcaccdeecffdd91c8725d8c`，文件合计125,538,510字节（Git存储另计）。仓库LICENSE为CC0-1.0，作者D. Smolken / Karoryfer；readme说明四层力度、三组round-robin，直录Epiphone电吉他、flatwound琴弦。使用 `emily_clean.sfz`，不含note-off弦静音样本；它仍保留采样器释放包络。

[sfizz](https://github.com/sfztools/sfizz) BSD-2-Clause，固定1.2.3 tag对应源码commit `4e70dc0bef53b41f2853ed46e26f5911114c92d0`（tag对象f8b8281）。该仓库已于2026-06-21归档，维护风险明确；这里只作离线工具，不加入主App依赖。各submodule由固定源码记录其commit。源码和样本不复制进本仓库。

Linux/Python3.12/C++编译器环境，以下路径可自行调整：

```sh
python3 -m venv /tmp/muisa-sampled
/tmp/muisa-sampled/bin/pip install -r experiments/sampled/requirements-linux-py312.lock
git clone https://github.com/sfzinstruments/karoryfer.emilyguitar.git /tmp/muisa-emily
git -C /tmp/muisa-emily checkout b4920dc662fd9cad6dcaccdeecffdd91c8725d8c
git clone --branch 1.2.3 --recurse-submodules https://github.com/sfztools/sfizz.git /tmp/muisa-sfizz
git -C /tmp/muisa-sfizz rev-parse HEAD
/tmp/muisa-sampled/bin/cmake -S /tmp/muisa-sfizz -B /tmp/muisa-sfizz/build -DSFIZZ_JACK=OFF -DSFIZZ_SHARED=OFF -DSFIZZ_RENDER=ON -DCMAKE_BUILD_TYPE=Release
/tmp/muisa-sampled/bin/cmake --build /tmp/muisa-sfizz/build --target sfizz_render -j 2
/tmp/muisa-sampled/bin/python experiments/sampled/test_calibration.py
/tmp/muisa-sampled/bin/python experiments/sampled/generate.py /tmp/muisa-emily /tmp/muisa-sfizz/build/library/bin/sfizz_render
node experiments/sampled/compare.js
```

实际构建使用CMake3.31.6、GCC14.2.0，无安装系统服务或音频驱动。renderer二进制hash存入manifest，跨编译器不保证二进制或渲染hash完全一致。生成PCM、MIDI、受控SFZ在忽略的 `reports/sampled`，不发布原始采样/生成音频。

## 控制与标签

从原SFZ保持音域、力度映射和包络，分别只保留rr1或rr2的notes region，删除随机选择限制；不以伪seed冒充控制了SFZ内部随机数。每个分支保留72个映射采样、约40.4MB，逐文件hash在manifest。实验实际只弹MIDI52/64/67和力度35/90，未覆盖所有音域/力度/演奏法。每个乐句以新renderer进程重复两次，逐样本必须一致。sfizz 256sample块、22050Hz、原生PCM16输出，双声道平均为mono，未独立归一化。

12个音高/力度/分支组合各自独立渲染，先测**干声**声学起音代理：相对前150ms峰值的-40/-30/-20dB阈值、尾随1ms RMS，中心取-30dB，另存三阈值最早/最晚时刻。范围是阈值敏感性，**不是统计置信区间或人工听觉真值**；采样量化、前置噪声、阈值和包络均可能影响测量。测试覆盖已知延迟阶跃、增益缩放不变、静音拒绝。

同一乐句同时保留midiOnsetMs、传播/FIR延迟后的onsetMs、acousticOnsetMs、acousticBoundsMs。声学起音来自独立干声校准后平移，不根据带噪或混响检测器的输出生成标签。房间沿用M1 order6 ISM，单独记录0.5m传播/FIR延迟；尚未标注人耳感知起音、真实房间攻击或释放终点。offset仍为MIDI gate，尾音区false voicing不能直接当作实际错音。

4个乐句（两档力度×两个分支）×dry/room×clean/10dB=16组。噪声在room后按声学起音到MIDI gate末端的active mask混入，seed123，实际gain/SNR保存；clean真零噪声。所有数据是同一bank/room家族的development，不是holdout。

## 识别与结果

使用原JS Analyzer，4096窗/1024hop；逐帧比较raw、去DC、去DC+实测噪声门控。噪声从开头4096samples（185.8ms，首音300ms之前）测量，属于实际校准，不使用oracle noiseRms。门控仅降低置信度，不滤除噪声波形；没有神经网络增强器。

本次三种模式的音高与音符指标相同：16个case等权平均RPA50=0.634、note F1=0.625；这只是描述小开发集合，不是实际准确率估计。所有case的coverage、MIDI与声学代理两套评分、尾音区false voicing、单帧计算时间和原始事件保留在results.json。

负结果：rr1力度35 dry clean的RPA50=0，room clean为0.933。room有距离衰减和反射叠加，与dry的单位增益并不等响，现有绝对电平门限是重要混杂因素；不能说混响改善了识别。当前数据没有人为加DC，所以去DC无收益并不意外；该门控也没解决弱音拒绝。

12个干声起音代理比MIDI晚约0.18–1.09ms，三阈值全范围最宽约1.95ms。这个差异远小于当前窗口/起音定位误差，不能通过“校准”掩盖算法的几十毫秒偏移。后续应补等响对照、释放标签和其他合法音源，再评估更强降噪或跟谱方法。实时网页未改动。


## Release 截断勘误

历史 M2/M3 输入使用 sfizz `--use-eot`，实际在最后 note-off 附近结束：MIDI 的末尾 EOT delta 未带来预期尾音。隔离样本也受影响，因此历史 release 统计和依赖其结束标签的评价不能作为完整释放验证。已发布 JSON 保留为历史结果，不静默改写；起音/音高结果也只能解释为对这些旧输入的结果。

生成器现移除该选项，让 sfizz 渲染至自身功率停止条件，并检查末尾量化电平、超时及削波。已有输出不会自动变成新结果，需重新生成、校准和评价。两条固定样本的实际渲染回归见 `experiments/sampled/results-release-fix.json`：旧前缀逐样本一致，新增尾段具有非零能量，并非补零。

使用 room 环境运行：`python experiments/sampled/test_release.py /path/to/sfizz_render`（先有 M2 本地素材）。这是可选重实验，不向快 CI 添加音源或编译器依赖。
