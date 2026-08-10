---
layout:         post
title:          React Native 新架构：Fabric、TurboModules 与迁移路径
date:           2025-05-25
tags:           [RN]
categories:
comments: false
---

React Native 新架构不是一次“打开开关就获得性能”的升级。它重新安排了 JavaScript、渲染器和原生能力的协作方式，但应用最终能否稳定运行，仍取决于依赖库、原生模块、原生组件以及测试方式是否准备好了。把它当作一次依赖治理和边界梳理，通常比把它当成纯框架升级更稳妥。

本文以 2025 年 5 月前公开的 React Native 资料为边界。React Native 0.76 已让新架构在新项目中默认启用，并保留了互操作层与临时退出路径；这意味着迁移可以分阶段完成，也意味着“能启动”并不等于已经获得 Fabric 与 TurboModules 的全部能力。文中的模块名和数据均为演示。

## 先看它解决的是什么问题

旧架构依赖异步 Bridge：JavaScript 调用原生方法或更新视图时，需要把数据序列化、排队，再由另一侧处理。这个模型有清晰的隔离性，却不适合高频、大对象传递，也无法让 React 在某些交互中同步协调布局与优先级。

新架构不是把所有异步都改成同步，而是提供了更直接的 JavaScript Interface（JSI）路径、可并发工作的渲染体系以及更明确的事件循环。它通常从四个部分理解：

- Fabric 是新的渲染器，负责把 React 的组件描述交给原生视图体系，并支持并发渲染所需的协调。
- TurboModules 是新的原生模块体系，配合 Codegen 用 TypeScript 规格生成跨端接口胶水，模块也可以按需加载。
- Codegen 是契约工具：它让 JavaScript 与原生端围绕一份受限制、可生成的类型定义协作，而不是各自维护两套容易漂移的声明。
- 新事件循环与 Bridgeless 相关能力让任务调度更接近现代 React 的并发语义，但不应据此假设每个旧库都已脱离 Bridge。

因此，迁移的收益首先是能力边界更清晰：并发特性、布局读取和原生接口的类型约束有了共同基础；性能收益需要通过实际启动、交互和内存数据验证，不能预先写进结论。

## 先升级应用，再清点生态

从 0.76 开始，新项目默认启用新架构，已有应用仍应先完成常规版本升级：比较模板差异、处理 Android Gradle 和 iOS CocoaPods 的变化、跑通现有测试。随后把依赖按风险分组，而不是一次性替换所有包：

| 分组 | 优先检查的问题 | 处理方式 |
| --- | --- | --- |
| 纯 JavaScript 库 | 是否依赖废弃 RN API | 升级并跑单元测试 |
| 含原生代码的库 | 是否声明兼容新架构、是否有预编译限制 | 查版本说明并在双端真机构建 |
| 自定义 Native Module | 接口是否依赖 Bridge 回调、动态对象或隐式类型 | 先靠互操作层验证，再规划 TurboModule |
| 自定义 Native Component | 是否直接使用旧 UIManager 或原生视图假设 | 先验证渲染与事件，再迁移 Fabric 组件 |

React Native Directory 可作为初筛入口，但它不替代自己项目的编译与关键路径测试。同一库的兼容性还取决于 React Native 版本、平台、是否使用特定原生能力。迁移清单至少应列出包版本、Android/iOS 构建结果、启动、导航、长列表、输入、媒体和原生交互结果；这些比“兼容/不兼容”一个标签更可复查。

如果确实遇到阻塞库，0.76 仍允许暂时退出。Android 在 `android/gradle.properties` 中设定 `newArchEnabled=false`；iOS 可在安装 Pods 时用 `RCT_NEW_ARCH_ENABLED=0`。这是为了给升级留出回退窗口，不是长期分叉策略：退出后要记录原因、负责库和复查版本，否则临时开关会变成无人维护的永久状态。

```properties
# android/gradle.properties
newArchEnabled=false
```

```sh
# iOS：仅作为无法兼容时的临时回退
RCT_NEW_ARCH_ENABLED=0 bundle exec pod install
```

## TurboModule：先写接口，再写平台实现

原生模块迁移最有价值的一步，是把“JavaScript 可以怎么调用原生”变成显式规格。规格文件不是普通任意 TypeScript：它必须使用 Codegen 支持的类型和命名方式，随后由构建流程生成 Android、iOS 与 C++ 侧需要的绑定代码。下面是一个只读写本地演示值的最小接口；同步 `getItem` 只是说明能力，实际接口仍要评估线程、I/O 和调用频率。

```ts
// specs/NativeLocalStore.ts
import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface Spec extends TurboModule {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeLocalStore')
```

不要为了“新架构化”把网络、文件扫描或数据库查询改成同步方法。同步调用会占用调用线程，适合极小、可预测且确实需要立即返回的值；耗时工作仍应设计异步结果与取消边界。`getEnforcing` 也意味着模块缺失时会尽早报错，开发阶段很有帮助；若模块是可选能力，应改用可空获取并在业务层提供明确的降级，而不是把错误吞掉。

原生侧实现前先写契约测试：空字符串、`null`、非法 key、并发调用和模块不存在分别会怎样。旧模块能通过互操作层运行，并不代表它自动获得 Codegen 类型安全、懒加载或跨平台 C++ 复用；这些收益来自有意识地迁移接口与实现。

## Fabric：把原生视图当作受约束的组件契约

Fabric 的核心不是把每个 `View` 重写一遍，而是让自定义原生组件的属性、事件与命令可以由 Codegen 统一描述。以一个演示的原生进度条为例，JS 侧规格应只暴露渲染所需的 props 和结构稳定的事件，避免把原生对象、任意 JSON 或平台句柄直接穿过边界。

```ts
// specs/NativeProgressBar.ts
import type { ViewProps } from 'react-native'
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent'
import type { DirectEventHandler } from 'react-native/Libraries/Types/CodegenTypes'

export interface NativeProps extends ViewProps {
  progress: number
  onComplete?: DirectEventHandler<Readonly<{ value: number }>>
}

export default codegenNativeComponent<NativeProps>('NativeProgressBar')
```

这份规格的真正作用是提前限制变更。新增 prop 是否可空、事件是否需要冒泡、数值范围由谁校验、Android/iOS 是否都能表达，都会在接口评审时暴露，而不是等运行时发现某个平台静默忽略。对于现有组件，先用互操作层确认它能渲染、事件能回调、命令不会丢失；再选择一个边界小、测试充分的组件改为 Codegen，不要从最复杂的地图、编辑器或视频视图开始。

## 用双轨验证代替“一次切换”

一个可操作的迁移节奏可以分为五步。第一步，冻结一次可工作的旧架构基线，保存双端构建命令和关键流程结果。第二步，升级到目标 React Native 版本，在默认新架构下只修编译、启动和依赖问题。第三步，把新旧架构都跑一遍关键路径，重点看导航切换、输入焦点、列表回收、手势、动画与所有自定义原生边界。第四步，挑一个原生模块或组件迁移到 Codegen，补齐其契约和异常测试。第五步，逐项消除退出开关和不兼容依赖，持续记录回归矩阵。

检查点不应只看首屏。建议至少覆盖：冷启动与热重载、前后台切换、弱网和失败态、长时间滚动、频繁输入、原生事件高频回调、低端设备上的内存警告，以及 Android/iOS 各自的打包产物。涉及同步接口时，还要单独观察主线程阻塞和帧率。没有某个项目的实测数据时，文章或发布说明里应写“待验证”，而不是以框架宣传代替基线。

## 迁移的完成标准

新架构迁移的完成标准不是仓库里出现了 `newArchEnabled=true`，而是边界可以被维护：依赖有兼容记录；原生模块和组件有可生成的类型契约；回退开关有明确的删除条件；关键路径能在两端稳定复现；性能判断来自同口径数据。Fabric、TurboModules 和 Codegen 提供了更好的地基，但是否把地基用好，取决于每一个跨 JavaScript 与原生边界的接口是否足够小、足够清楚、足够可测。

## 参考资料

- [React Native：0.76 默认启用新架构](https://reactnative.dev/blog/2024/10/23/the-new-architecture-is-here)
- [React Native：0.76 发布说明](https://reactnative.dev/blog/2024/10/23/release-0.76-new-architecture)
- [React Native：协助库迁移到新架构](https://reactnative.dev/blog/2022/06/16/resources-migrating-your-react-native-library-to-the-new-architecture)
- [React Native：0.68 的新架构 opt-in 起点](https://reactnative.dev/blog/2022/03/30/version-068)
