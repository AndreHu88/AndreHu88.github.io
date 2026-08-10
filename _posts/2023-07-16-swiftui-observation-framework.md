---
layout:         post
title:          Observation：SwiftUI 状态更新机制的新变化
date:           2023-07-16
tags:           [iOS]
categories:
comments: false
---

## Observation：SwiftUI 状态更新机制的新变化

WWDC23 带来的 Observation 框架，看起来只是把 `ObservableObject` 和一组 `@Published` 换成了 `@Observable`。如果只关注少写了多少代码，很容易忽略它更重要的变化：SwiftUI 可以根据视图实际读取的属性建立依赖，不再把一次 `objectWillChange` 广播等同于整个对象都发生了变化。

这篇文章以 Xcode 15、Swift 5.9 和 iOS 17 的能力为边界，梳理 Observation 的更新模型、属性包装器选择、嵌套对象以及从 `ObservableObject` 迁移时需要保留的兼容边界。

### 1. ObservableObject 的问题不在于不能用

传统写法很清晰：

```swift
final class LibraryModel: ObservableObject {
    @Published var books: [Book] = []
    @Published var query = ""
    @Published var isLoading = false
}
```

视图通过 `@StateObject` 创建，通过 `@ObservedObject` 接收，或者从 `@EnvironmentObject` 获取。它的问题并不是错误，而是通知粒度主要围绕对象变化展开。对象里的任意 `@Published` 属性改变，都可能触发依赖该对象的视图重新计算 `body`。

在小页面里这通常不是性能问题。随着一个 Model 同时保存列表、筛选条件、加载状态和用户偏好，视图之间的依赖会越来越隐含：读者看到 `@ObservedObject var model`，无法直接知道这个视图究竟关心哪些字段。

### 2. @Observable 改变了依赖记录方式

使用 Observation 后，模型可以写成普通属性：

```swift
import Observation

@Observable
final class LibraryModel {
    var books: [Book] = []
    var query = ""
    var isLoading = false

    var filteredBooks: [Book] {
        guard !query.isEmpty else { return books }
        return books.filter { $0.title.localizedCaseInsensitiveContains(query) }
    }
}
```

宏会为属性访问生成观察能力。SwiftUI 在计算视图 `body` 时记录实际读取的可观察属性；这些属性改变后，相关视图才需要重新求值。

```swift
struct BookCountView: View {
    let model: LibraryModel

    var body: some View {
        Text("共 \(model.books.count) 本")
    }
}
```

`BookCountView` 读取了 `books`，没有读取 `query` 和 `isLoading`。从依赖表达上看，它比“观察整个对象”更精确。不过这不意味着可以忽略视图拆分：如果一个巨大 `body` 同时读取几十个属性，依赖范围仍然会很大。

### 3. @State 仍然负责视图拥有的状态

`@Observable` 解决“对象如何被观察”，没有解决“对象由谁拥有”。如果视图创建并持有模型，应使用 `@State` 保存它：

```swift
struct LibraryScreen: View {
    @State private var model = LibraryModel()

    var body: some View {
        LibraryContent(model: model)
            .task {
                await loadBooks()
            }
    }

    private func loadBooks() async {
        model.isLoading = true
        defer { model.isLoading = false }
        model.books = await BookService().fetchBooks()
    }
}
```

不要因为 `LibraryModel` 是引用类型就改成普通存储属性。SwiftUI View 是值类型，会反复创建；`@State` 让模型的生命周期与视图身份关联，而不是与某次结构体初始化关联。

如果模型由父视图创建，子视图只读取它，普通 `let` 或 `var` 参数已经足够：

```swift
struct LibraryContent: View {
    let model: LibraryModel

    var body: some View {
        List(model.filteredBooks) { book in
            Text(book.title)
        }
    }
}
```

这也是 Observation 带来的一个直观变化：并不是每个接收模型的子视图都需要 `@ObservedObject`。

### 4. 需要 Binding 时使用 @Bindable

读取属性和建立双向绑定是两件事。`TextField` 需要 `Binding<String>`，这时可以在子视图中使用 `@Bindable`：

```swift
struct LibrarySearchBar: View {
    @Bindable var model: LibraryModel

    var body: some View {
        TextField("搜索书名", text: $model.query)
            .textFieldStyle(.roundedBorder)
    }
}
```

`@Bindable` 的职责是为可观察对象生成属性绑定，不是声明对象所有权。如果一个视图只显示 `query`，就不必为了“看起来统一”而加上它。

在父视图局部需要绑定时，也可以在 `body` 中创建 bindable 视图：

```swift
var body: some View {
    @Bindable var model = model
    TextField("搜索书名", text: $model.query)
}
```

选择包装器时可以用一个简单问题判断：视图是拥有、读取，还是绑定这份状态？

### 5. 环境注入不再依赖固定类型包装器

Observation 模型可以通过环境传递：

```swift
@main
struct ReadingApp: App {
    @State private var session = UserSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
        }
    }
}
```

使用端按类型读取：

```swift
struct AccountView: View {
    @Environment(UserSession.self) private var session

    var body: some View {
        Text(session.displayName)
    }
}
```

环境适合跨越较深视图层级、且语义上属于整个场景的依赖。它不应该成为所有对象的默认传递方式。过度使用环境会隐藏依赖，让预览、测试和多窗口场景更难配置。

### 6. 嵌套对象终于更符合直觉，但仍要管理边界

使用 `ObservableObject` 时，父对象持有另一个 `ObservableObject` 并不会自动转发子对象的 `objectWillChange`，开发者常常需要手动转发或让视图直接观察子对象。

Observation 记录的是属性访问路径。只要嵌套对象也能被观察，视图读取 `model.settings.theme` 后，主题变化可以成为依赖：

```swift
@Observable
final class ReadingSettings {
    var fontScale: Double = 1.0
    var theme: Theme = .system
}

@Observable
final class ReaderModel {
    var settings = ReadingSettings()
    var currentBook: Book?
}
```

这让组合模型更自然，但不意味着可以无限嵌套。模型层级过深时，状态来源依然难以追踪；跨页面共享的可变对象也仍然需要明确生命周期和线程隔离。

### 7. 忽略不需要观察的属性

缓存、日志器、Service 等属性变化时通常不需要刷新 UI，可以使用 `@ObservationIgnored` 排除：

```swift
@Observable
final class SearchModel {
    var results: [Book] = []
    var query = ""

    @ObservationIgnored
    private let service: BookSearching

    init(service: BookSearching) {
        self.service = service
    }
}
```

排除的理由应是“它不是界面状态”，而不是为了掩盖过大的模型。如果一个属性代表用户可见状态，却因为刷新过多被忽略，应该先检查视图依赖和模型职责。

### 8. Observation 不替代并发隔离

Observation 负责变化跟踪，不负责线程安全。UI 模型通常应明确运行在主 actor：

```swift
@MainActor
@Observable
final class DownloadModel {
    var progress: Double = 0
    var status: DownloadStatus = .idle

    func start() async {
        status = .running
        // 等待异步服务，并在主 actor 上更新可见状态。
    }
}
```

把 `@Observable` 类从后台队列和主线程同时修改，仍可能产生竞态。宏不会替你决定状态属于哪个 actor，也不会自动取消页面离开后的任务。

### 9. 从 ObservableObject 渐进迁移

Observation 需要新系统版本。存量项目的迁移不应从“全局替换”开始，而应先确认部署版本和模块边界。

一条稳妥路线是：

1. 选择仅支持 iOS 17 的新页面或独立功能；
2. 把状态模型职责缩小，区分页面状态和 Service；
3. 用 `@Observable` 重写模型，用 `@State` 保存所有者；
4. 子视图只读时直接传模型，需要绑定时才使用 `@Bindable`；
5. 用 Instruments 和 SwiftUI 更新诊断观察实际刷新范围；
6. 为旧系统继续保留 `ObservableObject` 实现或兼容页面；
7. 不为了统一语法，提前抬高整个 App 的最低系统版本。

如果一个公开模块需要同时服务 iOS 16 和 iOS 17，直接改变模型协议可能扩大影响。可以先在 UI 适配层转换状态，而不是强迫业务层一次完成迁移。

### 10. 用刷新诊断验证，而不是假设一定更快

Observation 能缩小依赖范围，但不能保证页面自然获得更高帧率。`body` 重新计算只是渲染链的一部分，列表标识不稳定、图片解码、复杂布局和主线程 I/O 仍可能成为真正瓶颈。迁移前后应该使用相同数据和相同交互路径比较，而不是看到 `@Published` 变少就宣布优化完成。

一个实用方法是把页面拆成几个有明确输入的小视图，在调试环境记录哪些视图发生更新。依次修改 `query`、`isLoading` 和 `books`，确认只有读取相应属性的视图被重新求值。如果一个只展示加载状态的视图仍随列表滚动频繁更新，应检查它是否通过计算属性间接读取了整个集合，或者父视图是否承担了过多工作。

测试模型时同样不必依赖 SwiftUI。把筛选、排序和状态转换当普通 Swift 行为测试；再用少量界面测试确认 Binding、环境注入和页面生命周期。这样即使未来再次更换观察机制，业务规则仍然有独立保护。

### 11. 常见误区

- **认为 @Observable 自带主线程安全**：观察与并发隔离是不同问题。
- **所有参数都加 @Bindable**：只读视图不需要产生 Binding。
- **忽略对象所有权**：视图创建的模型仍需用 `@State` 保存身份。
- **用环境隐藏所有依赖**：深层注入方便，但会降低可测试性。
- **只比较代码行数**：真正收益是更精确的依赖表达和更自然的模型组合。
- **无视部署版本**：新框架不能自动解决旧系统兼容。

### 12. 落地检查清单

- 模型是否只保存与界面相关的状态？
- 谁创建并拥有模型，生命周期是否清楚？
- 子视图是读取还是修改，是否选对 `let`、`@State` 与 `@Bindable`？
- 不参与 UI 的依赖是否用 `@ObservationIgnored` 排除？
- UI 状态是否有明确的 `@MainActor` 边界？
- iOS 16 及更低版本是否仍需支持？
- 迁移前后是否验证了刷新范围和交互行为？

### 总结

Observation 的核心价值不是删除 `@Published`，而是让 SwiftUI 的依赖更接近视图真正读取的状态。它降低了组合可观察模型的摩擦，也让所有权、读取和绑定可以分别表达。

但它没有取消架构问题：模型仍要保持清晰职责，任务仍要管理生命周期，共享状态仍要隔离，旧系统仍要兼容。把这些边界先说清楚，再使用 `@Observable`，才能得到比“语法更短”更持久的收益。

## 参考资料

- [Apple WWDC23 - Discover Observation in SwiftUI](https://developer.apple.com/videos/play/wwdc2023/10149/)
- [Apple - Observation](https://developer.apple.com/documentation/observation)
- [Apple - Migrating from the ObservableObject protocol to the Observable macro](https://developer.apple.com/documentation/swiftui/migrating-from-the-observable-object-protocol-to-the-observable-macro)
- [Swift Evolution SE-0395 - Observability](https://github.com/swiftlang/swift-evolution/blob/main/proposals/0395-observability.md)
- [Apple WWDC23 - Demystify SwiftUI performance](https://developer.apple.com/videos/play/wwdc2023/10160/)
