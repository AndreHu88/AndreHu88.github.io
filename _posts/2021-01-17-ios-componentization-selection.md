---
layout:         post
title:          iOS 组件化方案选型：CocoaPods、Carthage、Swift Package Manager 与本地模块的边界
date:           2021-01-17
tags:           [iOS]
categories:
comments: false
---

组件化经常被描述成“把工程拆成多个仓库”，但仓库数量从来不是目标。真正要解决的是：一处业务变化时，影响范围能否被看见；一个模块需要被复用时，依赖是否清楚；团队并行开发时，构建和发布是否仍然可控。工具只是把这些边界落到文件、依赖图和产物上。

2021 年的 iOS 工程同时拥有 CocoaPods、Carthage、Swift Package Manager 和本地 framework 等多种选择。它们没有一个天然胜出。选型时若只看“大家都在用什么”，很容易把集成成本、调试体验和交付责任藏到以后。本文把它们放进同一张决策表，再给出一条适合存量项目的渐进路径。

### 一、先定义模块边界，再选择分发工具

一个合格的模块至少应回答三个问题：它为谁提供能力、依赖哪些下层协议、由谁负责版本和兼容。若一个“公共组件”同时包含网络请求、业务页面、主题颜色和全局单例，它即使被放进独立仓库，也只是把耦合搬了位置。

可以先把代码分成三层。基础层放无业务状态的工具、协议和数据结构；能力层封装网络、缓存、日志或图片加载；业务层组合这些能力形成页面和流程。依赖方向应从业务指向能力、从能力指向基础，不能让基础层反过来引用某个业务页面。这样拆分后，工具选择只负责交付模块，不替你决定模块职责。

### 二、四种方案各自解决什么问题

| 方案 | 更擅长的事情 | 需要承担的代价 |
| --- | --- | --- |
| CocoaPods | 生态成熟、脚本和插件丰富、接入旧库直接 | 依赖安装会参与工程生成，升级时要管理 workspace 和构建脚本 |
| Carthage | 尽量少改 Xcode 工程，适合以 framework 交付 | 资源、签名、复制与多平台产物需要项目自己接管 |
| SwiftPM | Xcode 原生集成、依赖描述清晰，适合 Swift 和新模块 | 老旧三方库、复杂资源和混编场景需要先验证 |
| 本地模块 | 调试直接、改动即时可见，适合同仓库内部拆分 | 版本、构建缓存和跨项目复用都由团队自行维护 |

这里的“更擅长”不是排名。一个已有大量 Podfile 脚本和 Objective-C 库的项目，贸然迁移工具可能比保留 CocoaPods 更危险；一个新建的 Swift 模块，则可以优先评估 SwiftPM，减少额外工程生成。判断标准应是当前边界和交付责任，而不是工具的宣传口号。

### 三、用最小 manifest 表达依赖

以 SwiftPM 为例，manifest 的价值在于让模块依赖成为代码的一部分。下面片段是 Swift tools 5.3 语境下的演示，不能直接代表某个现有项目；`CoreKit` 只依赖基础库，业务模块再依赖它。

```swift
// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "ExampleModules",
    platforms: [.iOS(.v13)],
    products: [
        .library(name: "CoreKit", targets: ["CoreKit"]),
        .library(name: "ProfileFeature", targets: ["ProfileFeature"])
    ],
    targets: [
        .target(name: "CoreKit"),
        .target(name: "ProfileFeature", dependencies: ["CoreKit"]),
        .testTarget(name: "CoreKitTests", dependencies: ["CoreKit"])
    ]
)
```

如果一个模块只能通过“先启动某个全局服务”才能测试，manifest 再漂亮也没有真正降低耦合。可以先把服务抽成协议，在应用组合根创建真实实现，在测试目标注入替身。组件化的边界应让依赖可替换，而不是只让目录更整齐。

### 四、资源、混编与二进制是三个分水岭

资源是很多迁移计划最容易漏掉的部分。图片、strings、Core Data model 和 storyboard 不应默认“跟代码一起就会工作”。每种工具对资源复制、Bundle 查找和构建阶段的处理不同，模块应提供明确的资源访问入口，并用测试确认在应用主包、测试包和 framework 场景下都能找到资源。

混编项目还要确认头文件可见性、module map、Objective-C 类名和链接设置。不要把一个依赖能在 Debug 编译通过，误认为它已经支持所有配置；Release 的符号、架构和 bitcode 设置也可能改变结果。二进制分发则要额外保存构建工具链、支持的架构、版本号和校验值，不能只把一个压缩包丢进仓库。

### 五、存量项目的渐进迁移步骤

第一步是画依赖图。列出模块、直接依赖、资源和发布人，先处理环依赖和“公共模块反向引用业务”的问题。第二步挑一个边界稳定、资源少、测试容易补齐的模块做试点，不从最核心的登录或支付流程开始。第三步并行验证 Debug、Release、单元测试和干净机器构建，把失败原因记在迁移表里。

第四步才是决定工具。若试点主要是 Swift 源码并且希望减少工程脚本，评估 SwiftPM；若大量依赖仍由 Pod 管理，先保留 CocoaPods，同时把内部模块做成清晰的 target；若要把预编译 framework 交给多个应用，评估 Carthage 或 SwiftPM 二进制 target，但先验证资源和签名。

最后设定退出条件：什么时候可以删除旧脚本、谁负责升级、出现无法兼容的依赖时如何回退。没有退出条件的迁移很容易形成两套系统长期并存，维护成本反而上升。

### 六、边界陷阱与检查清单

- 模块名相同不等于职责相同，先检查公共 API 是否包含业务状态和页面对象。
- 依赖图必须有方向；任何基础模块引用业务模块都要解释原因。
- 资源、混编头文件、签名、架构和 Release 构建要分别验证。
- 迁移试点要在干净环境执行，不只依赖开发机缓存。
- 版本号、变更记录、负责人和回滚办法应与产物一起保存。
- 不要为了统一工具，把仍依赖旧构建脚本的三方库一次性全部替换。

组件化的最终产物不是一串 Pod、Cartfile 或 Package.swift，而是一张团队能共同理解的依赖地图。工具选对了，模块边界会更容易被执行；边界没有建立，换多少工具都只是在重新包装耦合。

### 七、把选型写成可复查的决策记录

团队评审时，可以为每个候选方案记录同一组问题：目标平台是什么，最低系统版本是多少；模块是源码交付还是预编译产物；是否含资源和 Objective-C；构建产物由谁签名；依赖发生冲突时谁来升级；本地调试是否需要额外脚本。统一问题比统一答案更重要，它能避免每次新增模块都重新争论工具偏好。

例如，一个只包含 Swift 源码和少量测试资源的基础模块，可以优先尝试 SwiftPM；一个必须同时支持旧版 Xcode、私有二进制和复杂脚本的历史模块，则可以继续由 CocoaPods 或 Carthage 承担交付。决策记录里还要写明“不选择其他方案的原因”，几年后维护者才能判断当时的约束是否已经变化。

### 八、迁移完成不等于工具替换完成

迁移之后要观察的是边界是否真的变得可维护：修改一个模块时，依赖它的目标是否能快速定位；模块升级时，应用是否能在干净环境恢复；测试是否能只构建必要目标；资源和符号是否能在崩溃定位时找到。若这些问题没有改善，只把 Podspec 换成 Package.swift 并不能称为组件化成功。

对于存量工程，允许一段时间内多种工具并存，但必须画出清晰边界。例如老库继续由 CocoaPods 管理，内部 Swift 模块采用 SwiftPM；应用层通过一个明确的适配 target 隔离两套依赖。并存不是失败，失去负责人、没有删除条件和没有冲突处理规则才是风险。

评审时还要把本地开发和发布流水线分开看。开发者需要快速断点和源码跳转，发布者则更关心可复现的版本、签名和缓存命中。一个方案在本机很顺，不代表 CI 的干净环境也能稳定得到同样产物。把这两类需求分别列出，才能知道应该优化工具链、模块边界，还是交付流程。

### 参考资料

- [Swift 5.3 发布说明：Swift Package Manager](https://www.swift.org/blog/swift-5.3-released/)，2020 年。
- [CocoaPods：Using CocoaPods](https://guides.cocoapods.org/using/using-cocoapods.html)，官方使用指南。
- [Carthage：官方 README](https://github.com/Carthage/Carthage)，Carthage 项目文档。
- [Apple：Framework Programming Guide](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPFrameworks/)，Apple 文档归档。
