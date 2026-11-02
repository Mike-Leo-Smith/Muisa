# I1：独立真实干扰事件层（尚未完成真实素材混音）

`prepare.py` 使用已有受控 CC0 Emily rr1 音源渲染 12 音完整乐句，保留自然释放；创建目标、人声1、人声2、键盘、脚步各自位置的 bounded ISM RIR。`mix.py` 只接受有 SHA256、来源、许可证和署名的真实 WAV，不用噪声替代缺少的素材。

使用 M1/M2 room 环境（固定锁中的 numpy/scipy/mido/PRA）：

```
python experiments/interference/prepare.py /path/to/controlled-rr1.sfz /path/to/sfizz_render /path/to/scene
python experiments/interference/mix.py /path/to/scene /path/to/assets.json /path/to/output
```

assets.json 是数组，每项包括 `id,kind,path,sha256,sourceUrl,license,attribution`，kind 为 speech/keyboard/footstep；需要两个 speech 和至少各一个 keyboard/footstep。path 是 PCM16/32 或 float WAV，转换后哈希需重新记录；原素材的哈希、文本许可证和转换说明也应保留。相对路径以 assets.json 目录为基准。音频与许可证表独立于模型代码，不提交第三方录音。

两段朗读分别从 1.0/5.1 秒进入，各取最多3秒；稀疏真实响动由 seed123 排程六次，各最多1秒。各源单独卷积后才混合。10ms边界淡入淡出只是截取处理，不合成语音动态。保留 full convolution 尾音；固定位置尚不模拟距离变化。

每事件在与目标有效音符重叠区间标定 SIR（speech10dB，瞬态0dB），另报事件局部 SIR、峰值、组合 active-region SIR。不是所有声音都具有同一个全局10dB。三版输出共享同一 headroom scale，不逐文件归一化、削波或限幅。dry 末尾补齐仅使三版长度相同，乐器释放已真实渲染，补齐不作尾音修复。

拟用来源（下载后逐文件核对）：librosa 示例的 LibriSpeech 真实朗读，CC BY 4.0，需保存各 basename.txt 原署名；OpenGameArt Keyboard Soundpack 1 的 human 样本与 Footsteps，CC0。朗读分时/重叠混合属于合成场景，不能称真实多人谈话。当前执行环境对这些官方下载的 HTTPS CONNECT 返回403，未取得字节，未运行真实素材混音或宣称听音验证。

本模块不改在线识别器；新 fixture 用于后续成对评估。固定 MIDI、音源、房间、事件时间线、来源和哈希应连同输出报告一起保存。
