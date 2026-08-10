---
layout:         post
title:          Live Activity 工程实践：状态更新、推送与生命周期
date:           2023-10-29
tags:           [iOS]
categories:
comments: false
---

Live Activity（实时活动）适合展示一件正在发生、用户会反复查看的事情，例如外卖进度、比赛比分、出行状态和倒计时。它能出现在锁定屏幕和灵动岛，但不能简单理解为“刷新得更快的 Widget”：WidgetKit 负责界面，ActivityKit 管理生命周期，真正的数据更新则来自 App 或 APNs。

这一区分决定了工程方案。Live Activity 的扩展不能主动发起网络请求，也不能依赖普通 Widget 的时间线刷新；服务端状态变化频繁、App 又可能不在前台时，应当使用 ActivityKit 推送。下面以“订单配送”为演示场景，整理 Xcode 15、iOS 17 下从建模到结束的一条完整链路。示例中的订单与时间均为演示数据。

## 先划清静态属性与动态状态

`ActivityAttributes` 同时描述两类数据：外层属性在活动创建后不再改变，嵌套的 `ContentState` 保存每次更新都可能变化的内容。订单号适合作为静态属性；配送阶段、预计到达时间和骑手距离则属于动态状态。

```swift
import ActivityKit
import Foundation

struct DeliveryAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var stage: String
        var estimatedArrivalTimestamp: TimeInterval
        var remainingMeters: Int

        var estimatedArrival: Date {
            Date(timeIntervalSince1970: estimatedArrivalTimestamp)
        }
    }

    let orderID: String
    let storeName: String
}
```

拆分时可以问一个简单的问题：服务端下一次更新会不会改变它？会改变的字段放进 `ContentState`，不会改变、并且能标识这次活动的字段放在外层。不要为了少写一个字段而把完整业务对象塞进去。属性与动态内容连同更新载荷存在大小限制，模型越小，版本兼容和推送成功率越可控。

还要避免把“显示字符串”当作唯一数据。例如倒计时若只下发“还剩 12 分钟”，界面很快就会过期；下发目标 `Date`，再用 SwiftUI 的计时文本渲染，系统才能在不持续推送的情况下自然推进时间。

## Widget Extension 只负责呈现

在 Xcode 中新增 Widget Extension，并勾选 Include Live Activity；App Target 的配置中把 `NSSupportsLiveActivities` 设为 `YES`。界面通过 `ActivityConfiguration` 同时描述锁定屏幕与灵动岛的展开、紧凑和最小形态。

```swift
import ActivityKit
import SwiftUI
import WidgetKit

struct DeliveryLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DeliveryAttributes.self) { context in
            VStack(alignment: .leading, spacing: 8) {
                Text(context.attributes.storeName).font(.headline)
                Text(context.state.stage)
                HStack {
                    Text("距送达")
                    Text(timerInterval: Date.now...max(Date.now, context.state.estimatedArrival),
                         countsDown: true)
                }
                .font(.caption)
            }
            .padding()
            .activityBackgroundTint(.black.opacity(0.85))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.stage)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.state.remainingMeters)m")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.attributes.orderID).font(.caption)
                }
            } compactLeading: {
                Image(systemName: "bicycle")
            } compactTrailing: {
                Text("\(context.state.remainingMeters)m")
            } minimal: {
                Image(systemName: "bicycle")
            }
            .keylineTint(.orange)
        }
    }
}
```

这里应优先保证“扫一眼就能理解”。灵动岛各区域空间有限，长订单号、完整地址和解释性文案都不适合直接放进去。锁定屏幕布局也不宜无限增高；图像资源需要匹配展示尺寸，过大的资源甚至可能让活动无法启动。点击跳转可以通过 `widgetURL` 或 `Link` 指向 App 的具体页面，但敏感信息仍不应在锁屏上暴露。

## 在 App 内启动、更新和结束

启动 Live Activity 必须由 App 发起。先检查授权状态，再构造初始内容。`staleDate` 不是自动结束时间，它表示“超过这个时刻，当前内容应被视为陈旧”；`relevanceScore` 用于多个活动同时存在时帮助系统判断展示优先级。

```swift
import ActivityKit

@available(iOS 16.2, *)
func startDelivery() throws -> Activity<DeliveryAttributes> {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        throw DeliveryActivityError.disabled
    }

    let attributes = DeliveryAttributes(
        orderID: "DEMO-20231029",
        storeName: "示例餐厅"
    )
    let state = DeliveryAttributes.ContentState(
        stage: "商家已接单",
        estimatedArrivalTimestamp: Date().addingTimeInterval(30 * 60).timeIntervalSince1970,
        remainingMeters: 3200
    )
    let content = ActivityContent(
        state: state,
        staleDate: Date().addingTimeInterval(10 * 60),
        relevanceScore: 50
    )

    return try Activity.request(
        attributes: attributes,
        content: content,
        pushType: .token
    )
}

enum DeliveryActivityError: Error {
    case disabled
}
```

当 App 正在运行并拿到新数据，可以直接更新。更新应提交完整的 `ContentState`，而不是把它当成字段补丁；新的 `staleDate` 也应随有效数据向后推进。

```swift
func updateDelivery(
    _ activity: Activity<DeliveryAttributes>,
    state: DeliveryAttributes.ContentState
) async {
    let content = ActivityContent(
        state: state,
        staleDate: Date().addingTimeInterval(5 * 60),
        relevanceScore: state.remainingMeters < 500 ? 80 : 50
    )
    await activity.update(content)
}

func finishDelivery(
    _ activity: Activity<DeliveryAttributes>
) async {
    let finalState = DeliveryAttributes.ContentState(
        stage: "已送达",
        estimatedArrivalTimestamp: Date().timeIntervalSince1970,
        remainingMeters: 0
    )
    let finalContent = ActivityContent(
        state: finalState,
        staleDate: nil,
        relevanceScore: 0
    )
    await activity.end(finalContent, dismissalPolicy: .after(Date().addingTimeInterval(60)))
}
```

结束和移除是两回事：结束后不再接收内容更新，但最终状态可以按 `dismissalPolicy` 暂留在锁定屏幕；`.immediate` 适合无需回看的任务，`.default` 交给系统处理，`.after(_:)` 则能留出一段确认结果的时间。业务完成、取消或不可恢复失败时都要明确结束，不能把“不再发送更新”等同于结束。

## 获取并维护 push token

把 `pushType` 设为 `.token` 后，每个 Live Activity 都有自己独立的更新 token。它不是 App 的普通设备 token，也不应在 `request` 返回后立刻强取，因为 token 的产生是异步的，而且活动存续期间可能变化。

```swift
func observePushToken(
    for activity: Activity<DeliveryAttributes>
) -> Task<Void, Never> {
    Task {
        for await tokenData in activity.pushTokenUpdates {
            let token = tokenData.map { String(format: "%02x", $0) }.joined()
            await uploadActivityToken(
                token,
                activityID: activity.id,
                orderID: activity.attributes.orderID
            )
        }
    }
}
```

`uploadActivityToken` 代表项目自己的 HTTPS 上报逻辑，不是 ActivityKit API。调用方应保存返回的任务，并在活动结束或管理对象释放时取消监听。服务端至少要维护“用户、业务 ID、Activity ID、最新 token”的映射；收到新 token 时替换旧值，活动结束或 APNs 表明 token 失效后清理映射。不要打印完整 token，也不要假设重新启动 App 后还能沿用旧 token。

App 再次启动时，可以遍历 `Activity<DeliveryAttributes>.activities` 恢复本地管理关系，并监听 `activityStateUpdates`。用户可能在系统界面移除活动，系统也可能结束它；仅在内存中保存 `Activity` 引用，会让这些变化变成盲区。

## APNs 的 update 与 end 载荷

服务端向该活动 token 发送请求时，使用 HTTP/2 token 认证，并设置：

```text
apns-push-type: liveactivity
apns-topic: <App Bundle ID>.push-type.liveactivity
apns-priority: 5
```

普通进度更新优先使用优先级 5；真正需要及时提醒用户的事件才考虑优先级 10，避免把高优先级推送当轮询机制。一次更新的 JSON 可写成：

```json
{
  "aps": {
    "timestamp": 1698566400,
    "event": "update",
    "content-state": {
      "stage": "骑手正在配送",
      "estimatedArrivalTimestamp": 1698568200,
      "remainingMeters": 1200
    },
    "stale-date": 1698567000,
    "relevance-score": 70
  }
}
```

结束时把 `event` 改为 `end`，同时发送最终 `content-state`，必要时增加 `dismissal-date`：

```json
{
  "aps": {
    "timestamp": 1698568200,
    "event": "end",
    "content-state": {
      "stage": "已送达",
      "estimatedArrivalTimestamp": 1698568200,
      "remainingMeters": 0
    },
    "dismissal-date": 1698568260
  }
}
```

字段名与 `ContentState` 的 Codable 编码必须一致。示例不直接编码 `Date`，而是把预计送达时间明确保存为 UNIX 秒，再由客户端用 `Date(timeIntervalSince1970:)` 转换，避免服务端与 `Codable` 使用不同日期基准。`timestamp` 也使用 UNIX 秒，能帮助系统识别更新顺序，所以服务端要避免时钟明显漂移。需要展示提醒时可以加入 `alert`，但提醒与静默更新的产品语义不同，不应每次进度变化都打断用户。

推送链路还要区分开发与生产环境：使用开发签名安装的 App 对应 APNs 沙盒，TestFlight 和 App Store 版本对应生产环境，两边的 token 不能混用。服务端发送前应按应用环境选择连接，并把业务状态序号写入自己的动态模型。系统会依据载荷时间处理更新，但业务序号能让 App 与服务端共同判断“配送中”之后不应重新显示“商家备餐”，比单纯依赖网络到达顺序更可靠。

## 生命周期与失败边界

一套可靠实现至少要承认以下边界：

- 用户可以关闭 Live Activities 权限，`areActivitiesEnabled` 为 `false` 时应回退到 App 内状态或普通通知。
- Widget Extension 不能联网，也不会因为业务需要而持续执行；计算和数据获取应留在 App 或服务端。
- APNs 更新不是可靠消息队列。服务端应发送当前完整状态，使丢失中间更新后仍能恢复，而不是只发“距离减 100 米”这样的增量指令。
- 内容到达 `staleDate` 后只是进入陈旧状态，不会自动请求数据，也不等于活动已经结束；UI 可以用 `context.isStale` 呈现弱化提示。
- 同一业务可能被重复点击启动。启动前应检查已有活动和业务 ID，决定复用、结束旧活动还是拒绝重复创建。
- 系统会限制更新频率和展示时长。Live Activity 通常最多保持活跃八小时，随后从灵动岛结束；锁定屏幕上最多还可能保留四小时。长周期业务需要设计分段活动或其他通知方式。
- 本地更新、远程更新和用户移除可能并发发生。以业务版本号或服务端状态机约束倒退更新，并监听活动状态清理本地任务。

工程上最容易忽略的不是 API 调用，而是“结束责任”。建议由服务端业务状态作为最终事实源：成功、取消和确定失败都发送 `end`；App 收到相同终态时也可执行幂等结束。这样即使某一侧短暂离线，活动也不会长期停留在一个看似仍在进行的状态。

## 上线前测试清单

- 在设置中允许、关闭 Live Activities，分别验证启动与降级路径。
- 覆盖不支持灵动岛的机型，以及灵动岛的展开、紧凑、最小形态和锁定屏幕布局。
- 验证冷启动、退到后台、App 被系统终止后，APNs `update` 与 `end` 仍能正确刷新。
- 连续接收 token 变化，确认服务端替换旧 token，而不是新增重复映射。
- 构造乱序、重复、延迟和缺失更新，确认完整状态不会回退，过期内容会进入 stale 表现。
- 分别验证业务完成、取消、用户手动移除、八小时系统上限与三种 dismissal policy。
- 检查超长文本、较大数字、深色模式、辅助功能字号以及图片尺寸。
- 检查载荷编码、4 KB 限制、APNs topic、push type、priority 和失效 token 的清理。
- 使用沙盒 APNs 做端到端测试，并记录服务端请求 ID 与 Activity ID；日志中隐藏 token 和用户隐私。

Live Activity 的价值不在于“常驻一个页面”，而在于用最少的信息回答用户此刻最关心的问题。把静态与动态数据分清，把本地和远程更新设计成完整状态，把 stale 与 end 当作不同语义，再为权限、丢包和系统终止准备退路，功能才算真正落地。

## 参考资料

- [Apple Developer Documentation: Displaying live data with Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)
- [Apple Developer Documentation: Starting and updating Live Activities with ActivityKit push notifications](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications)
- [WWDC23: Update Live Activities with push notifications](https://developer.apple.com/videos/play/wwdc2023/10185/)
- [Apple Developer Documentation: ActivityKit](https://developer.apple.com/documentation/activitykit)
- [Apple Human Interface Guidelines: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)
