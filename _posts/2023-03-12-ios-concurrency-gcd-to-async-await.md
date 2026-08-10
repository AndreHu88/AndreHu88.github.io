---
layout:         post
title:          从 GCD 到 async/await：iOS 并发迁移的边界与落地
date:           2023-03-12
tags:           [iOS]
categories:
comments: false
---

## 从 GCD 到 async/await：iOS 并发迁移的边界与落地

`async/await` 最吸引人的地方是代码终于可以按执行顺序阅读，但把回调改成 `await` 并不等于完成了并发迁移。真正困难的部分，是重新说明任务由谁创建、结果交给谁、页面退出后谁负责取消，以及哪些状态只能在主线程修改。

这篇文章不讨论如何把整个项目一次性改成新语法，而是整理一条适合存量 iOS 工程的渐进路线：先封住回调边界，再建立任务生命周期，最后处理并行、取消和共享状态。示例以 Swift 5.7 和 iOS 15 已提供的能力为基准。

### 1. 先区分异步与并行

GCD 时代常见的写法是把工作扔到某个队列：

```swift
DispatchQueue.global(qos: .userInitiated).async {
    let result = loadAndDecode()
    DispatchQueue.main.async {
        self.render(result)
    }
}
```

这段代码同时表达了三个决定：工作在哪个队列执行、何时切回主线程、闭包捕获哪些对象。业务变复杂后，错误处理、超时和取消会继续嵌套在这些闭包里。

结构化并发换了一种表达方式。`async` 表示函数可能暂停，`await` 表示当前任务等待结果时允许出让执行资源。它并不保证创建新线程，也不等于所有 `async` 函数都会并行。只有明确创建多个子任务时，工作才有机会并发推进。

迁移时最重要的思维变化是：**不再先问代码放到哪个队列，而是先问任务属于哪个作用域、受谁管理。**

### 2. 第一刀切在回调边界

最稳妥的起点不是页面，而是已有 Service 的 completion API。假设旧接口如下：

```swift
protocol ProfileLoading {
    func loadProfile(
        userID: String,
        completion: @escaping (Result<Profile, Error>) -> Void
    )
}
```

为了兼容旧调用方，可以保留原接口并增加异步入口。包装一次性的回调时，使用 checked continuation 能在调试阶段发现“恢复两次”或“没有恢复”的错误：

```swift
extension ProfileLoading {
    func loadProfile(userID: String) async throws -> Profile {
        try await withCheckedThrowingContinuation { continuation in
            loadProfile(userID: userID) { result in
                continuation.resume(with: result)
            }
        }
    }
}
```

这里有两个边界必须守住：

1. completion 无论成功还是失败都只能触发一次；
2. continuation 只负责桥接结果，不自动提供取消能力。

如果旧接口本身可能多次回调，例如进度通知、位置变化或长连接消息，就不能用一次性 continuation。此类接口更适合 `AsyncStream` 或 `AsyncThrowingStream`，否则第二次回调会破坏 continuation 的约定。

### 3. 页面任务要有明确的主人

UIKit 页面最容易出现的问题，是创建任务后不保存引用。任务即使没有被持有也会继续运行，页面消失并不会让它自动停止。

```swift
@MainActor
final class ProfileViewController: UIViewController {
    private let loader: ProfileLoading
    private var loadingTask: Task<Void, Never>?

    init(loader: ProfileLoading) {
        self.loader = loader
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startLoading()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        loadingTask?.cancel()
    }

    private func startLoading() {
        loadingTask?.cancel()
        loadingTask = Task { [weak self] in
            guard let self else { return }
            do {
                let profile = try await loader.loadProfile(userID: "demo-user")
                try Task.checkCancellation()
                render(profile)
            } catch is CancellationError {
                // 页面离开造成的取消不需要提示用户。
            } catch {
                showLoadFailure(error)
            }
        }
    }
}
```

类标记为 `@MainActor` 后，页面状态和 UI 方法的隔离意图变得明确。这里保存 `Task` 不是为了等待它，而是为了让生命周期结束时可以发出取消信号。

需要注意，Swift 的任务取消是协作式的。`cancel()` 只是改变取消状态；底层操作是否立即结束，要看它是否检查取消状态或原生支持取消。长循环、分段解码等自定义工作，应在合适的位置调用 `Task.checkCancellation()`。

### 4. 不要用 Task.detached 模拟全局队列

看到旧代码里的 `DispatchQueue.global()`，很容易机械替换成 `Task.detached`。这通常不是好迁移。

普通 `Task` 会继承当前 actor、优先级和任务本地值；结构化子任务还会继承取消关系。`Task.detached` 则主动脱离这些上下文，适合极少数确实需要独立生命周期的底层工作，而不是“我想去后台执行”的通用写法。

对于 CPU 密集的同步函数，更合理的顺序是：

- 先确认系统或三方库是否已经提供异步 API；
- 把纯计算隔离到不触碰 UI 和共享可变状态的类型中；
- 用受控任务调用，而不是让任意页面随手创建 detached task；
- 用 Instruments 验证主线程占用，而不是凭语法判断执行位置。

`await` 之后的代码也不保证回到原来的物理线程。应依赖 actor 隔离表达正确性，而不是依赖线程编号。

### 5. 并行请求要保持结构

两个互不依赖的请求可以使用 `async let`：

```swift
func loadDashboard() async throws -> Dashboard {
    async let profile = profileService.loadCurrentProfile()
    async let notices = noticeService.loadNotices()

    return try await Dashboard(
        profile: profile,
        notices: notices
    )
}
```

动态数量的任务则适合 task group：

```swift
func loadThumbnails(for urls: [URL]) async throws -> [UIImage] {
    try await withThrowingTaskGroup(of: (Int, UIImage).self) { group in
        for (index, url) in urls.enumerated() {
            group.addTask {
                try Task.checkCancellation()
                return (index, try await imageLoader.load(url))
            }
        }

        var images = Array<UIImage?>(repeating: nil, count: urls.count)
        for try await (index, image) in group {
            images[index] = image
        }
        return images.compactMap { $0 }
    }
}
```

任务完成顺序不等于输入顺序，所以示例把索引与结果一起返回。真实工程还要增加并发上限；一次为几百个 URL 创建任务，虽然语法合法，却可能把网络连接、内存和服务端同时压满。

### 6. Actor 不是所有状态的万能容器

actor 适合保护确实需要跨任务访问的可变状态，例如内存缓存：

```swift
actor ProfileCache {
    private var values: [String: Profile] = [:]

    func profile(for userID: String) -> Profile? {
        values[userID]
    }

    func store(_ profile: Profile, for userID: String) {
        values[userID] = profile
    }
}
```

但如果数据本来只属于一个页面，把整个业务层都塞进 `@MainActor` 会让耗时工作也排队等待主 actor；反过来，为每个类型都创建 actor 又会产生大量跨隔离域调用。判断标准不是“新语法是否高级”，而是这份状态是否真的会被多个并发任务读写。

### 7. 一条可执行的迁移顺序

更稳妥的做法是按风险从低到高推进：

1. 选择一个调用链短、可独立验证的只读接口；
2. 保留 completion API，增加 async 适配层；
3. 在 ViewModel 或页面入口创建有引用、有取消点的任务；
4. 用 `@MainActor` 标记 UI 状态边界；
5. 补齐成功、失败、取消和重复触发测试；
6. 稳定后再迁移并行请求、缓存和更长调用链；
7. 等旧调用方消失后，才考虑删除 completion 接口。

迁移期间不要同时重写网络层、状态管理和页面架构，否则回归很难归因。一次只改变一条异步链，更容易观察行为是否一致。

### 8. 测试重点从“回调触发”转向“任务行为”

异步接口的测试不能只覆盖成功结果。迁移前应把旧实现的关键行为固定下来：同一次请求会不会回调多次、错误是否回到主线程、页面重复进入时是否复用缓存、请求被替代后旧结果是否还会覆盖新结果。否则语法迁完了，隐含契约却可能悄悄改变。

对于可注入的 Service，可以用受控延迟验证任务取消：先启动第一次加载，再立即启动第二次；让第一次最后返回，断言页面仍显示第二次结果。对 task group，则分别验证输入保序、部分任务失败以及父任务取消。测试里不要依赖固定的几十毫秒等待，这会制造不稳定用例；更适合用 continuation、actor 或测试桩明确控制结果何时释放。

还应观察资源行为。取消图片列表页面后，网络请求数量是否下降？快速输入搜索词时，旧任务是否持续解码？这些问题只看最终 UI 很难发现，可以结合 Instruments、网络日志和任务标识验证。结构化并发让生命周期更容易表达，但只有测试真正覆盖生命周期，这个优势才会落地。

### 9. 常见失败模式

- **把 Task 当 fire-and-forget 工具**：没有引用，也没有取消和错误归属。
- **用 continuation 包装多次回调**：接口语义与桥接工具不匹配。
- **所有任务都 detached**：丢失 actor、优先级和取消关系。
- **取消后仍更新 UI**：底层工作返回时没有再次检查任务状态。
- **误以为 async 就不会阻塞**：同步解码仍可能长时间占用当前执行器。
- **一次迁完整个项目**：新旧行为差异与业务回归混在一起。

### 10. 迁移检查清单

- 每个任务是否有清晰的创建者和生命周期？
- 页面退出、搜索词变化或请求被替代时，旧任务是否可取消？
- completion 是否保证只回调一次？多次事件是否改用 AsyncSequence？
- UI 状态是否通过 `@MainActor` 隔离？
- 并行任务是否需要保序、限流或部分失败策略？
- 错误与取消是否被区别处理？
- 新旧接口并存期间是否有相同输入、相同结果的回归测试？

### 总结

从 GCD 到 async/await 的价值，不是少写几层闭包，而是让异步工作的所有权、生命周期和隔离边界进入类型与代码结构。好的迁移应该让任务更容易被取消、错误更容易被追踪、共享状态更少，而不是只把旧问题换一种语法继续保存。

对于存量工程，慢一点反而更快：先桥接一条边界，验证一种生命周期，再逐步扩大范围。只要每一步都能解释“任务属于谁”，并发代码就开始从队列技巧变成可维护的业务结构。

## 参考资料

- [Apple WWDC21 - Meet async/await in Swift](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [Apple WWDC21 - Explore structured concurrency in Swift](https://developer.apple.com/videos/play/wwdc2021/10134/)
- [The Swift Programming Language - Concurrency](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [Swift Evolution SE-0300 - Continuations for interfacing async tasks with synchronous code](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0300-continuation.md)
- [Swift Evolution SE-0306 - Actors](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0306-actors.md)
