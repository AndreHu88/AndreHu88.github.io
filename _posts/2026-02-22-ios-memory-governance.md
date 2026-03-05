---
layout:         post
title:          iOS内存治理：泄漏、峰值、OOM 的定位与修复
date:           2026-02-22
tags:           [iOS]
categories:
comments: false
---

## iOS内存治理：泄漏、峰值、OOM 的定位与修复

很多团队遇到 OOM（Out of Memory）时，第一反应是“把图片压小一点”。这个动作有时候有用，但往往治标不治本。真正的内存治理应该是一套体系：**监控、定位、修复、回归、防回退**。

本文给一个实战导向的方法，适用于中大型 iOS 项目，尤其是列表复杂、图文混排、音视频并存的场景。

### 1. 先区分三类问题

内存问题不要混为一谈，建议先分型：

1. **泄漏（Leak）**：对象该释放没释放，长期累积。
2. **峰值（Peak）**：短时间内分配过多，触发内存警告或被系统杀掉。
3. **碎片与抖动（Churn）**：频繁分配释放导致性能波动、间接放大峰值。

三类问题对应工具和修复策略不同。

### 2. 监控体系：线上先有事实，再谈优化

建议每次版本都采集以下指标：

- 前台常驻内存（P50/P90/P99）
- 场景峰值（进入详情、长列表滚动、图片预览、编辑页）
- 内存警告次数
- OOM 疑似率（结合前后台切换和崩溃缺失日志推断）

如果只有“总内存”而没有“场景内存”，你很难把责任归因到具体模块。

### 3. 常见根因清单

#### 3.1 引用循环

- 闭包强引用 `self`
- `Timer/CADisplayLink` 未释放
- `Notification` 观察者未移除
- ObjC block 属性默认 `copy` 后未打破环

#### 3.2 图片解码与缓存不当

- 主线程解码大图
- 原图直接进入内存缓存
- 列表快速滚动时并发解码过高

#### 3.3 大对象一次性加载

- 大 JSON 全量解码
- 富文本一次性构建
- 数据库全量读入内存

### 4. Swift + ObjC 的修复模板

#### 4.1 闭包避免循环引用（Swift）

```swift
final class ProfileViewModel {
    var onUpdate: (() -> Void)?

    func bind(service: UserService) {
        service.fetchProfile { [weak self] result in
            guard let self else { return }
            // 更新状态
            self.onUpdate?()
        }
    }

    deinit {
        print("ProfileViewModel deinit")
    }
}
```

#### 4.2 NSTimer 循环引用治理（ObjC）

```objective-c
@interface SOHWeakProxy : NSProxy
@property (nonatomic, weak) id target;
+ (instancetype)proxyWithTarget:(id)target;
@end

@implementation SOHWeakProxy
+ (instancetype)proxyWithTarget:(id)target {
    SOHWeakProxy *proxy = [SOHWeakProxy alloc];
    proxy.target = target;
    return proxy;
}
- (NSMethodSignature *)methodSignatureForSelector:(SEL)sel {
    return [NSObject instanceMethodSignatureForSelector:@selector(init)];
}
- (void)forwardInvocation:(NSInvocation *)invocation {}
@end

// 使用
self.timer = [NSTimer scheduledTimerWithTimeInterval:1.0
                                              target:[SOHWeakProxy proxyWithTarget:self]
                                            selector:@selector(tick)
                                            userInfo:nil
                                             repeats:YES];
```

#### 4.3 图片降采样（Swift）

```swift
import ImageIO

func downsample(imageAt url: URL, to pointSize: CGSize, scale: CGFloat) -> UIImage? {
    let sourceOpts = [kCGImageSourceShouldCache: false] as CFDictionary
    guard let src = CGImageSourceCreateWithURL(url as CFURL, sourceOpts) else { return nil }
    let maxDimension = max(pointSize.width, pointSize.height) * scale
    let downsampleOpts = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: maxDimension
    ] as CFDictionary
    guard let cgImage = CGImageSourceCreateThumbnailAtIndex(src, 0, downsampleOpts) else { return nil }
    return UIImage(cgImage: cgImage)
}
```

### 5. 场景化治理：列表页是重灾区

列表页建议同时做 5 件事：

1. 复用池命中率监控，避免频繁创建视图。
2. 图片尺寸按容器下发，不请求原图。
3. 预加载窗口可配置，不盲目扩大。
4. 富文本布局缓存，滚动中只做读取。
5. `autoreleasepool` 包裹批处理任务。

#### ObjC 在循环中显式释放临时对象

```objective-c
for (NSInteger i = 0; i < items.count; i++) {
    @autoreleasepool {
        id model = items[i];
        // 解析和渲染预处理
    }
}
```

### 6. OOM 处置：比“修一个点”更重要

当线上出现 OOM 时，我建议用“战情室”节奏：

1. 先确认是否集中在特定机型/系统版本。
2. 对应版本做“路径还原”：用户在哪个页面停留最久。
3. 拉取近 30 天变更，定位涉及缓存、图片、富文本、视频的提交。
4. 给出临时止血策略（降低缓存上限、关闭高内存特性）。
5. 同步长期修复（重构数据加载与渲染链路）。

### 7. 防回退机制

内存问题修完后最怕回归。推荐加三道门：

- CI 跑关键场景的内存基准测试。
- 发布前对比上个稳定版本的 P90 常驻内存。
- PR 模板要求：涉及缓存、图片、序列化改动必须附内存评估。

### 8. 一个可执行的“内存预算”示例

按页面定义预算更有效：

- 首页：常驻 < 180MB，峰值 < 260MB
- 详情页：常驻 < 220MB，峰值 < 320MB
- 图片预览：峰值 < 380MB

预算不是绝对值，而是团队约束。没有预算，就没有治理闭环。

### 9. 总结

内存治理是工程问题，不是“某个同学的经验修复”。

要想长期稳定，必须做到：

- 指标分层（常驻/峰值/场景）
- 根因分型（泄漏/峰值/抖动）
- 工具化修复（模板 + 监控 + 回归）

当治理体系建立起来，OOM 会从“线上突发事故”变成“可预期、可压制的工程指标”。

## 参考资料

- [Apple - Preventing Memory Use Regressions](https://developer.apple.com/documentation/xcode/preventing-memory-use-regressions)
- [Apple - Understanding and Analyzing Application Crash Reports](https://developer.apple.com/documentation/xcode/diagnosing-issues-using-crash-reports-and-device-logs)
- [WWDC 2018 - iOS Memory Deep Dive](https://developer.apple.com/videos/play/wwdc2018/416/)
- [WWDC 2022 - Reduce Memory Footprint](https://developer.apple.com/videos/)
- [NSHipster - NSCache](https://nshipster.com/nscache/)
