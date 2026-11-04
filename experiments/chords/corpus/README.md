# C4 数据覆盖优先：导入、审核、冻结与固定评估

**没有取得新真实音频，没有新准确率结果；没有再对R1调参。** C3的召回/误报折衷见[结果](../RESULTS_C3.md)。此目录准备下一轮独立数据流程，默认仍不部署C3。

## 来源核查（2026-11-04）

| 来源 | 已核实事实 | 选用边界 |
|---|---|---|
| [Guitar-TECHS作者站](https://guitar-techs.github.io/)及[官方Zenodo](https://zenodo.org/records/14963133) | CC BY4；P1/P2有三音和四音和弦，P3仅音乐片段；DI/多麦克风同步MIDI；官方提醒≤100ms偏移 | 首选较干净DI的七类与OOV；P1开发、P2保持未观察。先核对实际文件和标签，不把P3算第三个和弦演奏者。乐器/房间和演奏者混杂，不能拆成独立因果结论 |
| [severyn-k/isolated-guitar-chords](https://huggingface.co/datasets/severyn-k/isolated-guitar-chords) | CC BY4；单人单琴，WAV、大小三和弦与Noise类；源train/test有不同拨法 | 可补声学吉他和非和弦例；来源split不是独立演奏者。Noise包含静音/动作/环境，不全叫静音；约1s前导也不能硬标每条都静音 |
| [IDMT-SMT-Guitar](https://www.idmt.fraunhofer.de/en/publications/datasets/guitar.html) | 第四子集真实吉他和弦，evaluation、CC BY-NC-ND4 | 不混同MIDI合成Chords数据；不为本app打包/发布音频。当前未取得，演奏者分组仍需核实 |

不采用未经来源核验的混合镜像去解决访问问题。GuitarSet现有6名玩家都已看过，新的原录音只能叫录音/乐句留出，不能恢复成未见玩家。

官方Guitar-TECHS资产清单（仅元数据，未下载）：P1_chords.zip约981.7MB，MD5 `be9ef8bbdceb1912d565254e607a6d94`；P2_chords.zip约1.2GB，MD5 `eb6f74dd19162237189281688ad7ad2e`。从官方record页面下载链接获取，不猜storage地址。只需要这两个和弦包，不需要4.1GB全库。下载前执行环境检查空间/网络；公开repo不放素材本体。

本容器一次普通HTTPS GET `https://huggingface.co/api/datasets/severyn-k/isolated-guitar-chords` 返回 `URLError: Tunnel connection failed: 403 Forbidden`，尚无metadata文件或音频落地。已停止，不重试/换地址绕过；历史Zenodo CLI拒绝也未重试。公开网页文字可读不代表二进制下载已成功。原始文件需在受支持且授权的来源获取后，以受支持文件传递进入评测环境。

## 先盘点，不推理

```bash
python experiments/chords/corpus/inventory_zip.py /local/P1_chords.zip /local/NEW-inventory-p1.json
python experiments/chords/corpus/inventory_zip.py /local/P2_chords.zip /local/NEW-inventory-p2.json
```

校验官方MD5，记录SHA256、成员名/大小/CRC字段，不自动解压、不推断和弦、不运行算法。列出CRC不等于已逐成员CRC验证。需要先看真实目录/MIDI或标签结构才能写专用映射，当前不猜命名规则或冒称完成Guitar-TECHS标签转换。识别音频实际编码；初版本地导入仅接受PCM16 WAV，其他编码先记录有来源哈希的显式转换，不能静默读错。

## 审核标签与分组

manifest schema=`muisa-chord-corpus-v1`，recordings数组。可执行完整结构见test_corpus.py。每条记录需：

- id/datasetId；performerId/sessionId/performanceId（同一演奏的DI、amp、ego/exo及所有裁剪共享performanceId）；split为development或heldout；previouslyEvaluated显式布尔。
- performerIdentityVerified及performerEvidence（官方来源或采集记录）；不能只通过任意改匿名ID制造独立玩家。已观察记录不能进入heldout。
- license.id/sourceUrl/attribution；audio相对path/SHA256/channel/sampleRateHz/samples/channels。选择声道须显式，不自动混合。
- annotation相对path/SHA256；标注JSON.binding绑定源audio hash/长度/采样率/声道，timeBasis=clip-local-seconds，reviewerId。
- segments：start/end/label/audited/basis/uncertaintySeconds；label只为七类、N、OOV或X，OOV另存rawLabel。不能把未知音乐当N；无审核、残响归属不明或错误演奏不明保留X，不能按模型输出改真值。

逐段检查听感与来源符号注释，不把MIDI onset当精确声学起音。官方≤100ms是风险提示，不是每条真实校准值；更大不确定性应标X或先独立校准并记录。窗口341.33ms，冻结guard250ms；标签转换不通过修改guard追分。

## 覆盖与冻结

```bash
python experiments/chords/corpus/audit.py MANIFEST --root ROOT
python experiments/chords/corpus/audit.py MANIFEST --root ROOT --freeze-out NEW_FROZEN
```

开发/留出各需七类每类≥5s保守稳定时长、N≥5s、OOV≥5s，至少2名有证据的不同演奏者；缺失就只给审计，不准冻结。这个最低量只用于防止再次缺类，不代表统计上充分。最终仍报实际逐类/逐人分母，不按片段数量推独立样本数。

原始WAV hash、声道解码后的prepared PCM hash、演奏者/场次/performance不能跨split。N和OOV要真实独立录音/已审核区间，不用数字零假装真实环境。冻结不会下载或推理。48k PCM16转换只用标准库；其他采样率需本地numpy/scipy resample_poly，记录版本、Kaiser5/constant且不归一化；不自动安装依赖。所有prepared PCM与frozen.json hash锁定，保存引擎源码锁（C3固定提交45f35c2，含C2门限对照）。

## 固定评估，不新增候选选参

```bash
node experiments/chords/corpus/evaluate.js FROZEN NEW_DEVELOPMENT_OUTPUT development
# 留出仅在预注册评估时执行，访问后应在外部台账标记已观察。
node experiments/chords/corpus/evaluate.js FROZEN NEW_HELDOUT_OUTPUT heldout
```

三路固定：baseline、rawThresholdOnly、C3 contrastExpanded。拒绝改变引擎源码/hash；输出逐录音、宏平均、等时网格pooled混淆、coverage、含OOV/N错误的precision，保留X/gap和转换窗口。不输出设备延迟，不训练，不自动发布音频。输出逐窗private文件不可整体提交公共repo。工具不能物理阻止使用者事后调参，留出访问日志/外部来源身份仍需真实审核。

合理的下一算法候选暂不编写或跑分：在数据完整后，单独评估“两次连续同标签才显示、unknown立即清空”的因果持续证据机制，测误触发与额外一个hop（85.33ms）等待/召回损失；它不会修复持续的和弦混淆，可能进一步漏识，只有完整新数据对照有益才值得引入。当前优先固定现有三个引擎做数据基线，避免继续盲调一条轨。

六项标准库/Node回归涵盖覆盖缺失、身份/泄漏、标注绑定/不确定性、选声道产生相同PCM泄漏、freeze→实际评估→篡改拒绝。fixture是数学构造的低电平PCM和假身份，仅验证工程契约；不是实际听审或独立演奏者验收。
