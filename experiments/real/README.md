# R1：GuitarSet 私有本地开发诊断接口

**当前交付是已验证的runner，不含真实12条运行结果。** 生产者容器无法落地私有音频；另一获得授权的云工作区应检出固定提交执行。代码唯一主写者维护修复，执行端不改参数或源代码。当前只用自建3秒WAV/JAMS跑通全链路，报告status为`synthetic-interface-test-only`。

## 固定协议

`config.json`在真实子集执行之前声明：12完整录音、6玩家、5风格、约287.6144秒、1612音符。若实际schema/数量不符立即停止并回传，不裁剪、补标签或隐性放宽检查。

- 来源[GuitarSet1.1.0](https://zenodo.org/records/3371780)，CC-BY4.0；Basic Pitch训练使用过GuitarSet，明确是in-dataset development diagnostic，不是unseen test。无参数调优与统计独立测试集声明。
- 排除[已知时间偏移](https://github.com/marl/GuitarSet/issues/5)的`04_BN3-154-E_comp`/`04_Jazz1-200-B_comp`，以及[重复标注](https://github.com/marl/GuitarSet/issues/4)的`02_Funk2-119-G_comp`；不自动修正这些文件。
- 按[官方reader](https://github.com/marl/GuitarSet/blob/master/visualize/interpreter.py)读取`note_midi`，不存在时才选`pitch_midi`。浮点value和null confidence保留；不合并同音弦、不去重、不四舍五入。其他JAMS namespace只计数，不混作音符真值。
- 帧参考是标注音符的浮点目标音高，**不是逐时刻pitch_contour**；振音/弯音会影响其解释。只有恰好一条活动note时评单音；两弦同音也算重叠并排除。无活动note评voicing false alarm，任一起止±50ms边界统一排除。50ms是评估约定，不是标注者给出的置信区间。
- 公共10ms网格从100ms到末尾前150ms；各方法按最近原生窗口中心映射。全录音仍完整送入模型。原始mono PCM16 WAV只重采样到22050Hz，scipy resample_poly，**不归一化、不降噪、不裁剪**；f32和FLOAT WAV逐样本验证相同，所有模型校验同一PCM hash。
- JS/YIN/pYIN：4096窗/512hop，70–1000Hz；JS置信度0.8；YIN native与RMS0.008门控两档；pYIN whole-clip HMM，非因果。CREPE tiny64ms窗/10ms hop，center=False、viterbi=False，阈值0.5/0.8。检测范围外的参考音仍保留并单列计数，不偷偷删掉难例。
- Basic Pitch ONNX0.4.0：onset0.5/frame0.3/minimum note127.7ms，全部标注音符参与poly评估，短于127.7ms也不删。mir_eval起音50ms/音高50cents；offset另报max(50ms,20%)。音符分音区以**匹配后的参考音索引**计recall分子/分母，避免两侧分箱边界改变匹配。
- 报每录音、每玩家、风格、solo/comp；整体同时给录音宏均值、等玩家宏均值。音区分below40/40–51/52–63/64–83/above83。相邻帧不视为独立样本，不生成虚假的窄置信区间。

## 输入契约

CLI输入为本地目录，无网络下载。推荐用已校验私有ZIP重新做安全解包和显式index：

```sh
python3 experiments/real/index_dataset.py --zip "$R1_ZIP" --sha256 "$TRUSTED_ZIP_SHA256" --destination /tmp/muisa-r1/data
```

必须提供事先可信的完整ZIP SHA，不能用刚算出的未知ZIP hash自证来源。脚本验证SHA、全部成员CRC和路径，再按唯一stem匹配`NAME_mic.wav`/`NAME.jams`。通过标准GuitarSet命名解析匿名玩家、风格、solo/comp；不匹配时停止。原包manifest/provenance原样保留；新index的逐文件SHA是对已固定完整ZIP的inventory，不声称重新解析了未知格式的原包manifest。执行端已有逐文件校验仍应保留其记录。

也可将已核验目录配一个显式`muisa-index.json`（不需要修改源码）：

```json
{
  "schema": "muisa-r1-local-v1",
  "license": "CC-BY-4.0",
  "provenance": {"dataset":"GuitarSet1.1.0","doi":"10.5281/zenodo.3371780"},
  "recordings": [{
    "id":"00_BN1-129-Eb_comp", "player":"00", "style":"BN", "mode":"comp",
    "wav":"audio/00_BN1-129-Eb_comp_mic.wav", "jams":"annotation/00_BN1-129-Eb_comp.jams",
    "wavSha256":"<64 lowercase hex characters>", "jamsSha256":"<64 lowercase hex characters>"
  }]
}
```

示例不是本次实际文件清单。路径必须在dataset根内，哈希必须来自已核验文件；不会猜其他位置或跳过缺文件。非mono/非PCM16、有重复basename、精确重复note、无效时长、超WAV边界note均拒绝，异常先回传。

## 依赖和模型准备（Linux x86_64/Python3.12）

复用已跑通Y1/C1/B1的精确依赖锁，避免混装TF和ONNX。Node≥22。

```sh
python3 -m venv /tmp/muisa-r1-yin
python3 -m venv /tmp/muisa-r1-crepe
python3 -m venv /tmp/muisa-r1-basic
/tmp/muisa-r1-yin/bin/pip install -r experiments/yin/requirements-linux-py312.lock
/tmp/muisa-r1-crepe/bin/pip install -r experiments/crepe/requirements-linux-py312.lock
/tmp/muisa-r1-basic/bin/pip install --no-deps -r experiments/basic-pitch/requirements-linux-py312.lock
/tmp/muisa-r1-crepe/bin/python experiments/crepe/prepare.py /tmp/muisa-r1-models
```

Basic Pitch是已测试的ONNX-only实验安装：官方元数据在Python3.12仍要求不适配的旧TensorFlow，因此完整freeze用`--no-deps`；pip check会报告缺TF，不能称满足全部官方默认依赖。原生ONNX后端可用，setuptools80.9保留pretty_midi所需pkg_resources。无外部服务/密钥。

CREPE prepare固定源码/权重commit并校验tiny/small权重；R1仅使用tiny。tiny SHA `409254d6a537cc432061112b7ec5f6fd283658f108fc2abc24db9c25858b42df`，Basic Pitch包内ONNX SHA `2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec`；runner再次强制验证。

## 顺序执行（固定checkout，勿在中途改代码）

```sh
python3 experiments/real/test_dataset.py
/tmp/muisa-r1-yin/bin/python experiments/real/prepare.py --dataset /tmp/muisa-r1/data --index /tmp/muisa-r1/data/muisa-index.json --work /tmp/muisa-r1/work
# 先检查work/inspection.json：12条/6玩家/5风格/1612音符、287.6144秒及schemaWarnings。
node experiments/real/run_js.js /tmp/muisa-r1/work
/tmp/muisa-r1-yin/bin/python experiments/real/run_model.py --work /tmp/muisa-r1/work --model yin
/tmp/muisa-r1-crepe/bin/python experiments/real/run_model.py --work /tmp/muisa-r1/work --model crepe --crepe-source /tmp/muisa-r1-models/crepe-source
/tmp/muisa-r1-basic/bin/python experiments/real/run_model.py --work /tmp/muisa-r1/work --model basic
/tmp/muisa-r1-basic/bin/python experiments/real/report.py --work /tmp/muisa-r1/work
```

prepare拒绝覆盖现有prepared工作目录；要恢复只重跑model命令。每录音原子缓存绑定输入hash、config hash、checkout SHA、模型标识；不一致时拒绝复用。预估约51MB转换PCM缓存（f32+FLOAT WAV），另有模型与预测；单模型进程可能超过1GB，必须串行，不承诺具体耗时。每条首次运行计时一次，不把1次样本包装成可靠p95。JS报每帧p50/p95；librosa记录YIN+pYIN组合wall/CPU（不能当各自独立耗时）；模型窗口、整段compute、RSS分开，不声称真实设备延迟。

输出：`work/inspection.json`、`work/prepared.json`、`work/{js,yin,crepe,basic}/ID.json`和最终`work/report.json`。prepared和模型缓存含完整标注/预测，保持私有；父任务仅回传`report.json`及必要错误信息，审查后才将聚合结果提交repo。report只保留公开dataset ID、输入hash、汇总schema/metrics，不复制真实WAV/JAMS、音符序列或消费端绝对路径。未得到report之前不填写真实准确率。

## 本地验证证据

六项stdlib接口测试已执行：浮点音高/null confidence、拒绝重复/非法时长、共用边界/重叠mask、路径越界、hash失败、errata拒绝。三平台快CI运行这些测试；不会安装模型或拉数据。

完整模型接口用自建3秒混合单音/重叠片段跑通，独立命令：

```sh
python3 experiments/real/smoke_fixture.py /tmp/r1-synthetic-data
/tmp/muisa-r1-yin/bin/python experiments/real/prepare.py --dataset /tmp/r1-synthetic-data --index /tmp/r1-synthetic-data/muisa-index.json --work /tmp/r1-synthetic-work --synthetic-smoke
```

然后对synthetic-work执行相同四个inference/report命令。最终status必须为`synthetic-interface-test-only`，不能改名成真实结果。
