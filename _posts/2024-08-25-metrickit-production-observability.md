---
layout:         post
title:          MetricKit 实战：把卡顿、崩溃与性能数据带回线上
date:           2024-08-25
tags:           [iOS]
categories:
comments: false
---

线上性能治理最容易陷入一个误区：把 Xcode Instruments 里的结果当成真实用户的全貌。Instruments 很适合定位一次可复现的问题，却不能告诉我们“哪个版本、哪类设备、哪段使用周期”正在发生退化。MetricKit 的价值正在这里：由系统在设备上收集聚合指标和诊断，App 在之后收到报告，再把它送入自己的分析链路。

它不是替代崩溃平台，也不是实时埋点。更准确的理解是：聚合指标属于低频的系统质量信号，而可用的诊断会更早投递。本文以 iOS 14 及以上可用的能力为背景，整理从接收、脱敏、入库到排查的实践路径；示例字段和阈值仅用于说明，不对应任何线上项目或结果。

## 先理解报告的时间尺度

`MXMetricPayload` 是一段时间内的聚合指标，适合观察启动、CPU、内存、磁盘 I/O、网络传输、耗电和响应性等趋势；系统至多每日投递一次，且可能带来先前未送达的报告。`MXDiagnosticPayload` 则包含崩溃、卡顿、CPU 异常、磁盘写入异常和启动诊断等可供定位的样本；在 iOS 15 及以上，诊断可在可用时投递。两者都不对应某一次用户点击的同步回调，因此不能把它接在“用户点击后立刻告警”的链路上。

这也决定了看数方式。聚合指标回答的是“这一版整体是否变差”；诊断回答的是“值得回到哪条调用栈继续看”。启动耗时升高而没有启动诊断，不代表没有问题；反过来，一条 hang 诊断也不等于所有用户都卡住。先用趋势决定优先级，再用诊断缩小路径，才不会把偶然样本当成版本结论。

## 注册要早，接收对象要活得够久

MetricKit 使用订阅者模式。订阅通常放在应用启动后一个生命周期稳定的位置，并且订阅者需要被强引用；若临时创建对象就离开作用域，回调自然无处可去。以下为 Objective-C 骨架，网络上报部分故意留在独立组件中：接收回调不应直接混入业务请求代码。

```objc
@import MetricKit;

@interface AppMetricsReporter : NSObject <MXMetricManagerSubscriber>
@end

@implementation AppMetricsReporter

- (void)start {
    [[MXMetricManager sharedManager] addSubscriber:self];
}

- (void)stop {
    [[MXMetricManager sharedManager] removeSubscriber:self];
}

- (void)didReceiveMetricPayloads:(NSArray<MXMetricPayload *> *)payloads {
    for (MXMetricPayload *payload in payloads) {
        NSData *json = payload.JSONRepresentation;
        [self uploadReportData:json kind:@"metric"];
    }
}

- (void)didReceiveDiagnosticPayloads:(NSArray<MXDiagnosticPayload *> *)payloads {
    for (MXDiagnosticPayload *payload in payloads) {
        NSData *json = payload.JSONRepresentation;
        [self uploadReportData:json kind:@"diagnostic"];
    }
}

@end
```

`JSONRepresentation` 让客户端不必为每一个系统字段手写一套易碎的编码逻辑，也便于服务端随报告结构演进逐步兼容。不过“原样转发”不是最终方案：它只适合一条受控、加密、可审计的采集通道。发送前应补齐 App 版本、构建号、系统版本、设备分组等分析维度；不要拼入账号、搜索词、订单内容或其他业务正文。

开发期也别只靠等待。MetricKit 的报告在真机上才有意义，模拟器不能代表系统采样和投递。可以在测试版本中验证订阅是否注册、请求是否可达、服务端能否识别 `metric` 与 `diagnostic`，但把“今天没有收到回调”直接等价为功能失效，常常会误判。

灰度阶段更适合先验证链路质量，而非追求指标结论：检查同一报告是否被重复写入、App 版本是否完整、未知字段是否被保留、上传失败是否会在下次启动后恢复。等这些基础条件成立，再把版本间的数值差异交给足够长的观察窗口判断。否则仪表盘看似有数据，实际上是在比较采集策略的变化。

## 把原始载荷变成可查询的事件

一个实用的服务端模型至少分成三层。第一层保存原始 JSON，并记录接收时间、schema 版本和校验结果，方便将来回放解析器；第二层提取稳定的维度与统计值，供趋势图和告警使用；第三层把诊断中的调用栈、终止原因和聚合计数做成可检索的关联记录。这样系统增加字段时，不会迫使客户端先发版。

建议把每一份报告写成不可变的 envelope，而不是以“设备 + 日期”直接覆盖：报告可能重传，服务端需要用 payload 内容摘要或服务端生成的幂等键去重。下面是示意的上传包；`payload` 是 MetricKit 返回 JSON 经过压缩或加密后的内容，字段名称可以按自己的协议调整。

```json
{
  "kind": "diagnostic",
  "receivedAt": "2024-08-25T09:30:00Z",
  "appVersion": "3.8.0",
  "build": "420",
  "osVersion": "17.6",
  "payloadSHA256": "演示摘要",
  "payload": "演示数据"
}
```

原始数据的保留期也要提前定好。调用栈可能暴露内部符号和实现细节；即使其中不含直接身份标识，也应按敏感运行数据处理，限制访问权限、设置过期策略，并让隐私说明和数据治理规则覆盖这条链路。若公司已有崩溃平台，应明确谁是主数据源，避免同一问题被两套系统反复计数。

## 三类信号怎样进入排查

**响应性与卡顿。** `MXAppResponsivenessMetric` 的 hang 时间直方图适合做版本对比。不要只看平均值：少量长尾卡顿会被均值稀释。先按版本和系统版本比较桶分布，再看 `MXHangDiagnostic` 的调用栈是否集中于同一条主线程路径。若集中在图片解码、数据库迁移或同步 I/O，下一步应回到代码和 trace 验证，而不是立刻把直方图当作根因。

**崩溃与异常退出。** `MXCrashDiagnostic` 提供异常类型、信号和调用栈；`MXAppExitMetric` 则能帮助观察前后台退出类别。两者不是一一对应：诊断是可供定位的个体样本，退出指标是聚合视角。建立聚类键时，优先使用脱敏后的栈帧签名、异常类别和 App 版本，而不是把整段文本当作唯一键；符号表与构建号要能对应，否则栈再完整也难以行动。

**启动、资源与能耗。** `MXAppLaunchMetric` 可用于观察冷启动、从后台恢复等启动阶段的趋势；在 iOS 15.2 及以上还可观察预热启动，在 iOS 16 及以上、启用相应测量时才有 extended launch 指标。`MXMemoryMetric`、`MXDiskIOMetric`、`MXNetworkTransferMetric` 和 `MXCPUMetric` 则适合辅助解释退化。它们更像“排查导航”：例如启动指标变差且磁盘写入上升，可以检查启动阶段是否加入了迁移或缓存预热；不能仅凭相关性断言两者存在因果。

每个告警都应有基线与最小样本量。对新版本，先比较同一版本发布后相近的观察窗口；对设备差异，至少拆开低内存机型、系统大版本和网络环境。直接与“全站历史平均”比较，容易把用户结构变化误报为性能回退。

## 让采集失败不伤害体验

MetricKit 回调到来时，App 可能正在冷启动或处于资源紧张状态。上报逻辑要做到小、可丢弃、可重试：先落一个有大小上限的本地队列，再由普通网络层择机发送；失败时指数退避；队列满时丢弃最旧的原始报告并记录自身计数，不能无限堆积，更不能在主线程同步上传。

还要把解析和告警的“版本兼容”当作正式需求。系统可能新增 JSON 字段，某些指标也会因设备或系统条件缺席。服务端解析未知字段时保留原文、已知字段按可选值处理；客户端只承担接收和安全转运，不要为了迎合仪表盘把缺失值伪造成零。

## 上线前检查清单

- 订阅者在 App 生命周期内被强引用，并在合适时机移除订阅。
- 指标与诊断分开标识，原始载荷可去重、可追溯、可设置保留期。
- 上传不阻塞主线程，离线队列有容量、重试和丢弃策略。
- 版本、构建号、系统版本等维度齐全，但不上传用户内容或不必要的标识。
- 趋势告警同时定义基线、样本量和人工复核步骤。
- 对每个诊断聚类，都能找到对应构建的 dSYM、责任路径和后续验证方式。

MetricKit 最有价值的产出不是多一张仪表盘，而是让“用户设备上发生了什么”进入工程决策。先把采集链路做得可信、节制且可回放，再用它挑出值得投入 Instruments 和代码审查的那一小部分问题，性能治理才会从猜测走向证据。

## 参考资料

- [Apple Developer：MetricKit](https://developer.apple.com/documentation/metrickit)
- [Apple Developer：MXMetricManagerSubscriber](https://developer.apple.com/documentation/metrickit/mxmetricmanagersubscriber)
- [Apple Developer：MXMetricPayload](https://developer.apple.com/documentation/metrickit/mxmetricpayload)
- [Apple Developer：MXDiagnosticPayload](https://developer.apple.com/documentation/metrickit/mxdiagnosticpayload)
- [Apple WWDC19：Improving Battery Life and Performance](https://developer.apple.com/videos/play/wwdc2019/417/)
