# I1：独立真实干扰事件层

`prepare.py` 使用已有受控 CC0 Emily rr1 音源渲染 12 音完整乐句，保留自然释放；创建目标、人声1、人声2、键盘、脚步各自位置的 bounded ISM RIR。`mix.py` 只接受有 SHA256、来源、许可证和署名的真实 WAV，不用噪声替代缺少的素材。

使用 M1/M2 room 环境（固定锁中的 numpy/scipy/mido/PRA）：

```
python experiments/interference/prepare.py /path/to/controlled-rr1.sfz /path/to/sfizz_render /path/to/scene
python experiments/interference/mix.py /path/to/scene /path/to/assets.json /path/to/output
```

assets.json 是数组，每项包括 `id,kind,path,sha256,sourceUrl,license,attribution`，kind 为 speech/keyboard/footstep；需要两个 speech 和至少各一个 keyboard/footstep。path 是 PCM16/32 或 float WAV，转换后哈希需重新记录；原素材的哈希、文本许可证和转换说明也应保留。相对路径以 assets.json 目录为基准。音频与许可证表独立于模型代码，不提交第三方录音。

两段朗读分别从 1.0/5.1 秒进入，各取最多3秒；稀疏真实响动由 seed123 排程六次，各最多1秒。各源单独卷积后才混合。10ms边界淡入淡出只是截取处理，不合成语音动态。保留 full convolution 尾音；固定位置尚不模拟距离变化。

讲话在与目标有效音符重叠区间标定 SIR（10dB）；键盘/脚步在完整有限事件窗口（包含卷积尾音）标定 SIR（0dB）。这样少量/零 active overlap 不会把短瞬态的增益人为放大。分别报告 calibrationRegion、requested/achievedCalibrationSirDb、achievedActiveOverlapSirDb、eventLocalSirDb、峰值与组合 active-region SIR。零重叠或零能量的诊断 SIR 为 null 并带原因；校准区域为空、零能量或非有限则明确拒绝，不移动事件。不是所有声音都具有同一个全局10dB。三版输出共享同一 headroom scale，不逐文件归一化、削波或限幅。dry 末尾补齐仅使三版长度相同，乐器释放已真实渲染，补齐不作尾音修复。

拟用来源（下载后逐文件核对）：librosa 示例的 LibriSpeech 真实朗读，CC BY 4.0，需保存各 basename.txt 原署名；OpenGameArt Keyboard Soundpack 1 的 human 样本与 Footsteps，CC0。朗读分时/重叠混合属于合成场景，不能称真实多人谈话。代码执行环境对官方下载的 HTTPS CONNECT 返回403，未取得字节且不重试；独立交付执行环境通过正常下载完成真实素材混音试听。当前仓库修正版的全 mixer 回归使用明确标注的数学测试素材，不冒充再次运行真实素材评测。

本模块不改在线识别器；新 fixture 用于后续成对评估。固定 MIDI、音源、房间、事件时间线、来源和哈希应连同输出报告一起保存。

## 署名与验证

真实朗读源：librosa examples `5703-47212-0000`（Garth Comira）、`3436-172162-0000`（Heather Barnett），CC BY 4.0；下载时保留官方同名txt许可/署名，并记录截取、转换与混音修改。键盘：unicaegames，OpenGameArt Keyboard Soundpack 1，CC0，选human录音而非generated variants；脚步：GboxMikeFozzy，OpenGameArt Footsteps，CC0。实际音频与完整许可文本留私有交付，不随源码发布。

`python -m unittest discover -s experiments/interference -p 'test_*.py'` 使用已锁定 room 环境运行整个CLI：生成本地测试WAV/RIR→读取hash→事件排程/卷积/增益→三版WAV→严格JSON。验证full/tiny/zero overlap瞬态增益一致、speech语义不变、零能量/空speech校准拒绝、配对时长和共享headroom；不是只调用校准局部函数。无需下载音源。
