---
layout:         post
title:          iOS启动性能实战：冷启动拆解与优化闭环
date:           2026-02-20
tags:           [iOS]
categories:
comments: false
---

## iOS启动性能实战：冷启动拆解与优化闭环

很多团队做启动优化时都会卡在一个误区：只盯着“总时长”，不看“阶段贡献”。结果就是做了很多零碎改动，首帧时间偶尔下降，版本迭代后又反弹。

这篇文章给一个可持续的启动优化闭环：**定义指标 -> 拆分阶段 -> 定位瓶颈 -> 按收益排序改造 -> 持续回归监控**。如果你所在团队已经有埋点系统，本文方案可以直接落地。

### 1. 先把问题定义清楚：你到底在优化什么

启动性能建议至少跟踪这 4 个指标：

1. `Cold Launch`：用户从未驻留状态打开 App 到首屏可交互。
2. `Warm Launch`：进程仍在内存中，重新激活到可交互。
3. `First Frame`：主窗口第一帧出现在屏幕上的时间。
4. `First Interactive`：首屏关键按钮可点击且逻辑可用的时间。

实战中我建议把 KPI 设在 P90 或 P95，而不是平均值。平均值很容易被高端设备“稀释”，掩盖真实体验问题。

### 2. 启动阶段拆分：从“玄学”到可量化

一个典型 iOS 冷启动可以拆成：

- `dyld` 装载与链接阶段
- `main` 前初始化（静态对象、+load、C++ 全局构造）
- `application:didFinishLaunching...`
- 根控制器构建与首屏数据准备
- 首帧提交与可交互完成

你可以用 `os_signpost` 精确标记业务阶段，把系统阶段与业务阶段统一到同一时间轴里。

### 3. 埋点基线：Swift + ObjC 对照

#### Swift 示例

```swift
import os.signpost

final class LaunchTracer {
    static let shared = LaunchTracer()
    private let log = OSLog(subsystem: "com.sohod.blog", category: "launch")
    private var signpostID: OSSignpostID = .exclusive

    func begin(_ name: StaticString) {
        signpostID = OSSignpostID(log: log)
        os_signpost(.begin, log: log, name: name, signpostID: signpostID)
    }

    func end(_ name: StaticString) {
        os_signpost(.end, log: log, name: name, signpostID: signpostID)
    }
}

// AppDelegate
func application(_ application: UIApplication,
                 didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    LaunchTracer.shared.begin("didFinishLaunching")
    defer { LaunchTracer.shared.end("didFinishLaunching") }
    // 仅保留“首屏必需”任务
    bootstrapCriticalServices()
    return true
}
```

#### Objective-C 示例

```objective-c
@import os.signpost;

@interface SOHLaunchTracer : NSObject
@property (nonatomic, assign) os_log_t log;
@property (nonatomic, assign) os_signpost_id_t sid;
+ (instancetype)shared;
- (void)begin:(const char *)name;
- (void)end:(const char *)name;
@end

@implementation SOHLaunchTracer
+ (instancetype)shared {
    static SOHLaunchTracer *ins;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ ins = [SOHLaunchTracer new]; });
    return ins;
}

- (instancetype)init {
    if (self = [super init]) {
        _log = os_log_create("com.sohod.blog", "launch");
    }
    return self;
}

- (void)begin:(const char *)name {
    self.sid = os_signpost_id_generate(self.log);
    os_signpost_interval_begin(self.log, self.sid, "%{public}s", name);
}

- (void)end:(const char *)name {
    os_signpost_interval_end(self.log, self.sid, "%{public}s", name);
}
@end
```

### 4. 常见瓶颈与改造优先级

#### 4.1 `+load` 与静态初始化过重

问题特征：`main` 之前耗时高，且每次冷启动都会触发。

治理建议：

- 减少 `+load` 逻辑，迁移到可控时机。
- 避免全局单例在声明期完成重初始化。
- 对三方 SDK 做“分阶段激活”，先最小化初始化。

#### 4.2 首屏期间同步 I/O

问题特征：主线程卡在本地文件读取、数据库迁移、JSON 解码。

治理建议：

- 主线程只做“首帧必需数据”。
- 非关键配置延后到首帧后异步加载。
- 大 JSON 改为增量加载或本地二进制缓存。

#### 4.3 首屏视图树过重

问题特征：`Time Profiler` 与 `Core Animation` 显示布局/渲染占比过高。

治理建议：

- 首屏减少嵌套层级和离屏渲染。
- 图像提前降采样，不在主线程原图解码。
- 骨架屏优先，重内容延后渲染。

### 5. 一个可复用的“启动任务调度器”

核心思路：把任务分成 `Critical`（首帧前）和 `Deferred`（首帧后），并做依赖管理。

#### Swift 版本（简化）

```swift
enum LaunchTaskPriority { case critical, deferred }

protocol LaunchTask {
    var id: String { get }
    var dependencies: [String] { get }
    var priority: LaunchTaskPriority { get }
    func run()
}

final class LaunchScheduler {
    private var tasks: [LaunchTask] = []

    func register(_ task: LaunchTask) { tasks.append(task) }

    func runCritical() {
        execute(priority: .critical)
    }

    func runDeferred() {
        DispatchQueue.global(qos: .utility).async { self.execute(priority: .deferred) }
    }

    private func execute(priority: LaunchTaskPriority) {
        let filtered = tasks.filter { $0.priority == priority }
        // 示例仅展示思路，生产环境建议补充 DAG 循环依赖检测
        for task in filtered {
            task.run()
        }
    }
}
```

#### Objective-C 版本（简化）

```objective-c
typedef NS_ENUM(NSInteger, SOHLaunchTaskPriority) {
    SOHLaunchTaskPriorityCritical,
    SOHLaunchTaskPriorityDeferred
};

@protocol SOHLaunchTask <NSObject>
@property (nonatomic, copy, readonly) NSString *taskID;
@property (nonatomic, assign, readonly) SOHLaunchTaskPriority priority;
- (void)run;
@end

@interface SOHLaunchScheduler : NSObject
@property (nonatomic, strong) NSMutableArray<id<SOHLaunchTask>> *tasks;
- (void)registerTask:(id<SOHLaunchTask>)task;
- (void)runCritical;
- (void)runDeferred;
@end

@implementation SOHLaunchScheduler
- (instancetype)init { if (self = [super init]) { _tasks = [NSMutableArray array]; } return self; }
- (void)registerTask:(id<SOHLaunchTask>)task { [self.tasks addObject:task]; }
- (void)runCritical {
    for (id<SOHLaunchTask> task in self.tasks) {
        if (task.priority == SOHLaunchTaskPriorityCritical) [task run];
    }
}
- (void)runDeferred {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        for (id<SOHLaunchTask> task in self.tasks) {
            if (task.priority == SOHLaunchTaskPriorityDeferred) [task run];
        }
    });
}
@end
```

### 6. 优化顺序：先拿结果，再求极致

推荐按收益排序：

1. 删减首帧前任务（通常立刻见效）
2. 拆分 SDK 初始化
3. 首屏渲染减负
4. 高阶优化（预热、AOT、二进制布局）

很多团队做反了，一上来就做高阶优化，ROI 很低。

### 7. 建立“防反弹”机制

如果没有持续监控，启动优化一定会反弹。建议：

- 每次发版比较 `Cold Launch P90` 与上个稳定版本差异。
- 给关键启动阶段设置预算（如 `didFinishLaunching <= 400ms`）。
- CI 增加启动耗时基准测试（至少在固定测试机上回归）。

### 8. 总结

启动优化不是一次性活动，而是工程治理能力。真正有效的方法不是“找一个最慢函数改掉”，而是**持续把首帧前的工作做减法**，并通过阶段埋点把每次回归都可视化。

你可以从今天开始只做两件事：

- 给启动关键阶段加统一埋点。
- 把首帧前任务清单分成“必须/可延后”。

通常两周内就能看到明显收益。

## 参考资料

- [Apple - Reducing Your App’s Launch Time](https://developer.apple.com/documentation/xcode/reducing-your-app-s-launch-time)
- [Apple - Improving App Responsiveness](https://developer.apple.com/documentation/xcode/improving-app-responsiveness)
- [Apple - Instruments User Guide](https://developer.apple.com/documentation/xcode/analyzing-your-app-s-performance)
- [WWDC 2019 - Optimizing App Launch](https://developer.apple.com/videos/play/wwdc2019/423/)
- [WWDC 2021 - Understand and Eliminate Hangs from Your App](https://developer.apple.com/videos/play/wwdc2021/10258/)
