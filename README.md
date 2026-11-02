# Muisa

面向个人练琴的 Web 原型：输入校准、六根空弦检查与一根弦三个音的第一课，保留 Debug 音频实验台。识别基础仍在验证中。

当前是可以运行的算法原型，不是已验证的完整吉他教师。所有音频处理在本地浏览器进行，不上传录音；没有账号、付费服务或硬件白名单。

## 本地启动

最低 Node.js 22，零第三方运行或开发依赖。不需要 Python、编译器或 npm install。

```sh
git clone https://github.com/Mike-Leo-Smith/Muisa.git
cd Muisa
npm test
npm run build
npm start
```

在**运行服务的同一台电脑**打开 http://localhost:8000 。Windows、macOS、Linux 使用相同命令。也可解压源码 ZIP 后进入含 package.json 的目录运行。云端开发机的 `127.0.0.1` 不能直接在另一台电脑打开；远程使用需要安全端口转发或 HTTPS 托管，也可通过配置好的 GitHub Pages 流程发布。

浏览器麦克风需要 localhost 或 HTTPS，并由用户点击授权。系统音频输入能否使用取决于操作系统、驱动和浏览器暴露；不保证自动访问任意硬件。

## 校准与练习

先选择系统输入并主动授权，按向导完成安静段、空弦音准和三种力度检查，再尝试第一课的跟弹、填空与无提示。每步可以跳过，跳过与识别通过分开记录。无硬件可用“合成演示”验证流程；它是测试信号，不是吉他音色示范。详见 [校准与第一课边界](docs/PRACTICE_GUIDE.md)。

## Debug 实验流程

1. 无硬件时点击“分析生成的单音示例 / C 大三和弦示例”。
2. 选择本地音频文件（20 MB / 解码后 60 秒以内），在浏览器解码并演后分析；回放需主动点击播放器。
3. 选择系统输入，点击授权并开始，观察波形、电平、音高、和弦候选与实时谱位置。原琴监听始终关闭，避免反馈。
4. 可开启 DC 去除、在不弹琴时测背景噪声。它只作保守的置信度处理，不是已验证的通用降噪器。

当前分析第一个声道，不自动合并立体声。重复/漏观测、未知、错误分开呈现；无可靠覆盖证据时只标 unobserved，不断言漏弹。未实现链路延迟校准，不作节奏准错判分。

## 测试与 CI

```sh
npm test                   # PCM 算法、生命周期与指标：44 项
npm run build              # JS 语法检查 + dist 静态应用
npm run fixtures           # 生成 6 个本地 PCM16 WAV
npm run test:report         # JUnit 报告写入 reports/unit.xml
npm run test:browser        # Linux Chromium/Chrome：自动启动 dist 测试服务器
node scripts/noise-benchmark.js  # 14 组原始/预处理对照
```

浏览器测试需安装 Chromium/Chrome，可通过 `CHROMIUM_PATH` 指定可执行文件；默认 `/usr/bin/chromium`。它使用假麦克风和生成 WAV，不访问真实麦克风。结果与已知失败见 [验证记录](docs/VALIDATION.md)。

GitHub Actions 在 Linux / Windows / macOS + Node 22 执行构建、核心测试与 fixture 生成；Linux Chrome 另测构建产物的生成 PCM、和弦、文件解码、假麦克风到实时对齐、拒绝权限和页面异常。工作流使用固定 SHA 的官方 [checkout](https://github.com/actions/checkout) 与 [setup-node](https://github.com/actions/setup-node)，测试权限仅 contents:read；部署 job 单独使用 pages:write 与 id-token:write，无自定义密钥。

跨平台 Node 测试通过不等于真实硬件通过。当前真实琴、Windows/macOS 麦克风、Safari、Firefox 和手机音频链路均未验证；实际 CI 状态以仓库 Actions 为准。

已运行的可选研究：[Y1：YIN/pYIN 成对比较](experiments/yin/README.md)，[C1：CREPE tiny/small](experiments/crepe/README.md)，以及 [B1：Basic Pitch ONNX](experiments/basic-pitch/README.md)，以及 [M1：MIDI / 房间响应](experiments/room/README.md)，以及 [M2：受控采样、起音校准与预处理](experiments/sampled/README.md)，以及 [A1：因果事件级跟谱](experiments/following/README.md)，以及 [M3：同输入电平/起止校准对照](experiments/calibrated/README.md)，均包含负结果与局限，未接入在线识别器。

真实数据执行端使用 [R1 本地数据接口与固定协议](experiments/real/README.md)。已完成固定协议的 12 条真实录音开发诊断，见 [R1 结果与局限](experiments/real/RESULTS_R1.md)。稳定单音仅覆盖网格的 17.984%，不代表所有吉他演奏准确率。

## 技术路线

原生 ES modules，WebAudio / AudioWorklet 采集，Web Worker 做 DSP，UI 与 PCM/事件接口解耦。构建只检查语法并拷贝静态文件，不做转译；Node 仅用于开发服务和测试。

先保留可读的 JS baseline。只有目标设备的性能、延迟或跨端复用证据显示需要时，再评估把 DSP 换成 Rust/C++ WASM；预处理、时钟、音频权限和 UI 接口仍留在各自层。判定依据是同一 PCM 集上的准确率、unknown、处理时间、丢分析窗与端到端延迟，不能只比较一个微基准。当前没有 WASM 依赖或未完成的迁移承诺。

## 目录与下一步

- [产品/课程草案](docs/PLAN.md)、[接口契约](docs/INTERFACES.md)、[竞品参考](docs/competitors.md)、[识别研究与实验计划](docs/RECOGNITION_RESEARCH.md)、[MIDI/空间合成研究](docs/SYNTHESIS_RESEARCH.md)。
- `src/input.js` / `capture-worklet.js`：设备授权、PCM、停止/异常。
- `src/dsp.js` / `preprocess.js`：单音、起音、和弦候选与可关闭预处理。
- `src/score.js`：声明式短谱、因果跟随、离线编辑距离。
- `src/contracts.d.ts`：设计契约；当前没有 TypeScript 类型检查。
- `scripts/`、`test/`：构建、服务、生成器、浏览器和 PCM 测试。

下一步用主动提供的真实琴录音完善标注集，优先改进连续换音、重复拨弦、弱音和噪声误判。和弦仅限 C/Am/G/Em/D/Dm/F 候选，不能诊断实际弦品或任意复音。录音保存如后续加入，应默认本地并由用户主动操作；不后台收集。

## GitHub Pages

同一 CI 的 deploy job 依赖三平台 core 与 browser 全部成功；只 master 的 push / 手动触发可发布，PR 不部署。browser job 在 `/` 与 `/Muisa/` 两个路径运行同样检查，然后上传它实际测试过的 dist；发布 job 不重新构建。首次需仓库管理员将 Settings → Pages → Build and deployment → Source 设为 GitHub Actions。普通 GITHUB_TOKEN 不能首次启用站点，本项目不要求生成 PAT。

部署后工作流使用官方返回的 page_url 验证 HTTPS、version.json 提交 SHA 以及每个静态资源 hash。麦克风仍必须用户主动授权，音频不上传；远端假麦克风测试不代表用户设备已通过。没有 WASM / SharedArrayBuffer，也不需要额外 COOP/COEP 或 service worker。

独立训练管线试验见 [T0](experiments/train/README.md) 与 [首次结果](experiments/train/RESULTS_T0.md)：只验证有限CPU训练和ONNX一致性，尚无真实准确率改进，不接入网页。
