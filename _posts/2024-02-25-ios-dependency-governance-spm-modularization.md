---
layout:         post
title:          iOS 依赖治理：用 Swift Package Manager 推进模块化
date:           2024-02-25
tags:           [iOS]
categories:
comments: false
---

把一个 iOS 工程拆成很多 Target，并不自动得到模块化。真正决定维护成本的，是依赖有没有方向、边界是否稳定，以及一次改动会不会无意间让大半个工程重新编译。Swift Package Manager（下文简称 SPM）很适合作为这件事的执行工具，但它解决的是“如何声明和解析依赖”，不是“应该怎样划分业务”。

本文按 2024 年初 Xcode 和 Swift 5.9 的能力整理一条渐进路线。示例均为演示代码，不假定某个具体项目的目录、规模或改造收益；重点是让每次拆分都能回滚、能测试，也能解释为什么这样拆。

### 1. 先治理依赖，再谈目录

模块化常从“按页面建文件夹”开始，最后却形成一个 `Common`：网络、埋点、登录、UI、业务模型都能放进去，任何模块都可以引用它。表面上文件被移动了，依赖方向仍然是四处扩散的。

更有用的起点是画出当前依赖图。只记录三类关系就够了：Target 引用了哪些 Framework 或 Package；业务模块直接 import 了哪些基础模块；哪些模块同时被多个方向依赖。这里要找的不是“最大文件夹”，而是三个风险信号：

- 两个业务模块互相 import，说明边界尚未确定；
- 一个基础模块反过来 import 页面或业务模块，说明依赖方向倒置；
- 所有人都依赖同一个杂项模块，说明它已经成为没有约束的共享入口。

可以先约定一个朴素的方向：App Target 在最外层；业务 Feature 在中间；领域模型、接口和通用能力在内层。箭头只允许从外向内。网络实现、页面路由、登录态等带有运行环境的东西不应被领域模型反向引用。这个约定不是为了画出漂亮分层图，而是让编译器在错误的 import 出现时替团队守住边界。

### 2. 选择第一个可拆模块

第一包不要挑首页、登录或支付这类调用链最长的功能。更稳的选择是一个满足以下条件的“叶子”：输入输出清楚、对 UIKit 和全局单例依赖少、已有测试或至少可以补充样例。比如价格格式化、日期规则、纯数据转换，或者一个独立的请求协议层。

把它抽成 Local Package 的目的，不是马上缩短构建时间，而是验证三件事：包的公开 API 是否足够小；调用方能否只依赖接口；测试是否可以脱离 App Target 运行。第一次成功后，再按相同方式处理下一块，依赖图才会慢慢变得可控。

在 Xcode 中使用 **File > New > Package** 创建本地包，再将包添加到工程。SPM 会把清单、源码和测试放进一个独立目录；它既可以和 App 工程同仓，也可以在后续迁移到单独仓库。初期同仓更容易提交原子改动，也便于用相对路径调试。

一个最小的 `Package.swift` 可以这样写：

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "OrderDomain",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "OrderDomain", targets: ["OrderDomain"])
    ],
    targets: [
        .target(name: "OrderDomain"),
        .testTarget(name: "OrderDomainTests", dependencies: ["OrderDomain"])
    ]
)
```

`products` 是包对外提供的库，`targets` 才是编译单元。不要把每个目录都做成 Target；只有当一组代码需要独立编译、独立测试或独立控制依赖时，才值得成为一个 Target。否则 Target 数量会上升，清单和编译配置的维护反而会淹没收益。

### 3. 用接口把“知道实现”变成“表达能力”

模块拆不出来，往往不是因为类型放错了目录，而是上层直接创建下层的具体对象。例如页面既知道请求地址，又知道缓存键和 JSON 解码器；此时把网络代码搬走，页面仍然必须 import 那个实现包。

更合适的边界是让上层依赖能力的协议，并在组合根（通常是 App、场景装配或 Feature 的入口）注入具体实现：

```swift
public struct OrderSummary: Equatable {
    public let id: String
    public let title: String
}

public protocol OrderLoading {
    func loadOrder(id: String) async throws -> OrderSummary
}
```

实现包可以依赖 `OrderDomain`，App Target 同时依赖实现包和 Feature；Feature 只接收 `OrderLoading`。这样做并不意味着每个类型都要建一个协议。对不会替换、没有外部副作用的值类型，直接依赖具体类型通常更简单。协议最适合隔离网络、持久化、系统服务等不稳定边界，或为测试提供替身。

公开 API 要刻意少一些。Swift Package 里没有标记 `public` 的类型和成员不会暴露给其他模块；这恰好让编译错误成为一次设计提醒：调用方是真的需要这个细节，还是应该调用一个更高层的方法？把内部模型全部公开，短期迁移最快，长期却等于把旧耦合固化到包边界上。

### 4. 第三方依赖不是“加一次就结束”

SPM 的远程依赖写在清单里，版本范围就是工程的兼容承诺。对于需要稳定复现的应用，建议先明确升级策略，再选择范围。例如演示包仅依赖一个确定的主版本范围：

```swift
dependencies: [
    .package(url: "https://github.com/apple/swift-collections.git", from: "1.0.0")
],
targets: [
    .target(
        name: "OrderDomain",
        dependencies: [
            .product(name: "Collections", package: "swift-collections")
        ]
    )
]
```

`from: "1.0.0"` 表示接受同一主版本下的兼容更新，并不是“永远安全”。升级仍应经过构建、单测和关键路径验证。App 工程解析后会记录解析结果；排查“本机可编译、CI 不可编译”时，先比较锁定的依赖版本和 Xcode/Swift 工具链，而不是直接清缓存。

还要避免把 SDK 直接泄漏到所有 Feature。比如埋点 SDK 应由一个 Analytics 包封装为少量业务事件接口；图片库、数据库、网络库也应尽量停留在基础设施层。这样未来替换依赖时，变更集中在一个边界，而不是在几十个页面里搜索 API。

### 5. 资源、Objective-C 与构建条件是常见陷阱

包内资源需要显式声明，并以 `Bundle.module` 查找；不能继续假定资源一定在 `Bundle.main`。这是从 App Target 迁移时很容易漏掉的一点。

```swift
targets: [
    .target(
        name: "OrderFeature",
        resources: [.process("Resources")]
    )
]
```

```swift
let image = UIImage(named: "empty-order", in: .module, compatibleWith: nil)
```

上面的片段只说明资源定位上下文：使用 UIKit 的包仍需在源码中 `import UIKit`，并将平台条件写清楚。若包同时服务 iOS 和 macOS，也应使用 `#if canImport(UIKit)` 处理平台差异，不要把仅 iOS 可用的 API 藏进“通用”模块。

存量工程还有 Objective-C 互操作问题。Swift 包可以包含 Swift 与 Objective-C/C++ 目标，但同一个 Target 不能随意混放语言；跨语言公开接口也受可导出的 Objective-C 类型约束。迁移前先确认头文件、module map、桥接类型和调用方的最低系统版本。遇到复杂的混编基础库时，可以先把 Swift 调用入口封在现有 Framework 外，再逐步收缩，不必为了“全部 SPM 化”一次重写稳定代码。

### 6. 用测试和构建图收尾

一个包最有价值的测试，是不启动 App 也能验证的测试。领域规则、请求参数、解析转换都应优先放在这里；页面交互仍保留在 UI 测试或 Feature 测试中。这样依赖一旦意外倒置，测试目标也会更早暴露问题。

每次拆分后可按下面的顺序检查：

1. 原有 App Target 是否只改了依赖声明和装配代码；
2. 新包能否单独 `swift test`，并在 Xcode 中编译；
3. 是否出现 Feature 相互依赖或基础包依赖 App 的箭头；
4. 公开 API 是否只保留调用方真正需要的类型；
5. 资源、隐私权限声明和最低系统版本是否仍由正确 Target 承担；
6. CI 是否固定并验证了解析后的包版本。

SPM 不会替团队决定“订单”与“支付”该不该在同一模块，但它会让每一条依赖被写进清单、被编译器检查。把模块化当成持续整理依赖图的过程，而不是一次目录迁移，改动才会从一轮大工程变成一系列可验证的小步。

还有一个容易被忽略的边界：模块不等于组织架构，也不等于未来一定要拆仓。只有当版本节奏、权限或复用范围确实不同，独立仓库才带来收益；否则跨仓协调会让一次小修复变得更慢。先让同仓 Local Package 的依赖方向清晰，再根据真实的发布和协作需求决定是否分仓，通常比预先设计一张庞大的组件平台蓝图更可靠。

## 参考资料

- [Apple：Organizing your code with local packages](https://developer.apple.com/documentation/xcode/organizing-your-code-with-local-packages)
- [Apple：PackageDescription](https://developer.apple.com/documentation/packagedescription)
- [Apple：Adding resources to a Swift package](https://developer.apple.com/documentation/xcode/bundling-resources-with-a-swift-package)
- [Swift Package Manager 文档](https://www.swift.org/documentation/package-manager/)
