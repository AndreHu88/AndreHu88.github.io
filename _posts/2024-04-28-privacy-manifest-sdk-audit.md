---
layout:         post
title:          Privacy Manifest 实战：Required Reason API 与三方 SDK 审计
date:           2024-04-28
tags:           [iOS]
categories:
comments: false
---

隐私清单不是又一份“提交前填表”。它要求开发者把应用和 SDK 对某些系统 API 的使用理由写进可随构建交付的文件，再由 Xcode 汇总到最终产物。对 iOS 工程而言，这件事的难点不在 XML 语法，而在于回答一个更具体的问题：这段代码为什么要读取这些系统信息，它是否真的没有替代方案？

本文以 2024 年 4 月 28 日为时间锚点。Apple 在 2024 年 4 月 26 日提醒：从 5 月 1 日起，新增或更新的 App 如新加入了名单中的常用第三方 SDK，需要在 App Store Connect 提交相应的 Required Reason、隐私清单；当这类 SDK 以二进制依赖加入时，还需要有效签名。以下内容只覆盖当时已经公开的要求和 API 分类，不把后续扩展的规则倒灌回这次检查。

### 1. 先把三个概念分开

Privacy Manifest 文件名为 `PrivacyInfo.xcprivacy`。它是随 App、Framework 或 SDK 提供的声明，描述两件不同的事：代码是否收集特定类型的数据，以及是否使用 Apple 列出的 Required Reason API。它不是 App Store Connect 中“App 隐私”问卷的替代品；后者面向用户展示的数据实践，前者更接近构建物中可审计的技术声明。

Required Reason API 也不是“只要调用系统 API 就要申报”。Apple 列出了若干容易被用来推断设备或用户行为的 API 类别，并为每一类提供允许的用途。2024 年春季公开分类包含 UserDefaults、文件时间戳、磁盘空间、系统启动时间等。只有实际访问到列出的 API，且使用目的符合公布的 reason，才应在清单中声明。反过来，不能为了让检查通过而选择一个看起来最接近的 reason；如果用途不符合，就应调整实现或选择替代方案。

第三方 SDK 的清单又是另一层责任：SDK 作者应在其 Framework 或 Bundle 中提供自己的 manifest，App 开发者仍要负责确认最终 App 的行为和提交材料。把“SDK 已经带清单”误解为“宿主无需审计”，通常会留下无法解释的调用路径。

### 2. 从最终产物倒推，而不是只搜索源码

审计从一个确定的构建配置开始，例如 Release + 真正要上架的 scheme。原因很简单：Debug 专用工具、条件编译代码和 Release 引入的二进制 SDK 可能不同。建议同时建立两张清单。

第一张是“依赖账本”：SDK 名称、版本、来源（SPM/CocoaPods/手工二进制）、静态或动态链接、是否是新增依赖、供应商的 manifest 和签名状态。第二张是“API 账本”：API 类别、直接调用位置、间接调用的 SDK、业务目的、可选替代方案、最终选用的 reason。它们不需要复杂工具，一份随版本控制维护的表格或 Markdown 即可；关键是能从最终二进制中的问题回到负责的依赖和用途。

源码检索可以先从明显入口开始，但结果只能当线索。以 UserDefaults 为例：

```text
UserDefaults.standard
UserDefaults(suiteName:)
objectForKey:
integerForKey:
boolForKey:
```

文件时间戳、磁盘空间、启动时间也要按官方列出的具体 API 逐项对照。不要把 `FileManager` 或 `ProcessInfo` 的每个调用都武断地列入：审计对象是 Apple 当时定义的受覆盖 API，而不是类型名。对于闭源 SDK，阅读供应商版本说明和其包内的 `PrivacyInfo.xcprivacy`，并在集成前向供应商确认实际使用范围，比从符号名猜测更可靠。

### 3. 清单内容必须对应真实调用

在 Xcode 中可以通过 **File > New > File > App Privacy** 创建 manifest。下面是一个仅作格式说明的片段：演示应用确实用 `UserDefaults` 保存用户在 App 内可见的界面设置，并选择了官方允许、且与该用途相符的 reason。`CA92.1` 只是演示 reason；正式项目必须按当时官方列表核实每项描述，再选择实际适用的代码。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
```

这个文件不应成为“万能清单”。如果 App 本身没有直接使用该类 API，就不应因为某个 SDK 可能会使用而先塞入声明；应先检查 SDK 自己的 manifest 与版本。反过来，如果 App 和 SDK 都使用了同一类别，汇总结果中可能有多项 reason，仍要分别能解释来源。清单是声明，不会把不合规实现变合规。

数据收集声明也需要同样的可追溯性。先问“收集”在这里是否真的发生：数据是否离开设备、是否关联用户或设备、是否用于追踪；再根据 SDK 文档和实际代码填写类别、用途和关联性。不要仅凭 SDK 名称推断它一定收集某种数据，也不要把分析 SDK 的默认能力当成当前配置已经启用。关闭某功能、切换配置或升级 SDK 后，清单和 App 隐私问卷都可能需要重新核对。

### 4. 三方 SDK 审计要落在版本和交付方式上

Apple 在 2024 年 4 月的通知针对“新加入”的常用 SDK 提出了 manifest 和签名要求，尤其指出二进制依赖需要有效签名。因此依赖账本至少要能回答：这次提审是否新加了名单中的 SDK？它是源码构建还是预编译 Framework？发布者是否提供了对应版本的清单和签名？

这和“把所有依赖升级到最新”是两回事。临近提交时批量升级会同时改变 SDK 行为、清单和二进制签名，反而扩大排查范围。更可控的节奏是：先锁定当前版本，单独升级一个 SDK；查看其发布说明和 manifest；在干净环境归档；再检查 Xcode 生成的隐私报告。发现 SDK 没有相应声明时，优先使用供应商提供的兼容版本或联系供应商，不要复制一份未知内容的 manifest 放到宿主工程里冒充其行为。

对于 SPM、CocoaPods 和手工引入，记录方式可以不同，但最终都要落到 Archive。SPM 的 `Package.resolved`、Podfile.lock、Framework 的版本号或校验信息，都是“这次到底审了什么”的证据。把这些锁定文件随工程管理，才能在审核反馈或紧急回滚时复现依赖组成。

### 5. 用 Xcode 的报告做最后一公里检查

Xcode 能生成隐私报告来汇总工程、Framework 和 SDK 所含的 manifests。它适合回答“最终包里收到了什么声明”，但不替代对调用目的的判断。检查报告时，不妨按以下顺序走：

1. 用发布 scheme 在干净的依赖解析状态下 Archive；
2. 导出并查看 Privacy Report，确认每个 SDK 的名称与版本符合依赖账本；
3. 对报告中的每个 Required Reason API，回到 API 账本确认调用方和 reason；
4. 对新加入且属于 Apple 名单的第三方 SDK，检查其 manifest；如以二进制形式接入，再检查供应商签名；
5. 对照 App Store Connect 的隐私问卷，确认数据类别、用途与产品当前配置一致；
6. 记录检查日期、Archive 标识和未解决项，避免下一次发布从头猜起。

最容易漏掉的是“构建没有报错，所以隐私工作完成了”。清单格式正确只能说明 Xcode 能读取它，不能证明 reason 与实际用途匹配，也不能证明 SDK 配置没有收集额外数据。另一个反向陷阱是为了避免申报而改用更隐蔽的实现；这既没有降低隐私风险，也会使维护者失去解释路径。

### 6. 把审计变成发布节奏的一部分

隐私清单最值得建立的不是一份一次性 XML，而是一条变更规则：新增 SDK、升级 SDK、改变数据流、引入新的系统信息读取时，必须同时更新依赖账本、API 账本和 manifest。代码评审可以把问题问得很具体：新增 API 的业务目的是什么？有没有不读取该信息的替代方案？为什么对应 reason 合适？由哪一份产物验证？

这样做不会替开发者承担责任，但会把“最后一天才发现审核要求”变成一次普通的工程变更。对用户而言，可解释的数据使用比一份堆满字段的声明更有价值；对团队而言，可追溯的依赖与用途，才是隐私清单真正留下的工程资产。

## 参考资料

- [Apple：Reminder: Privacy requirement for app submissions starts May 1（2024-04-26）](https://developer.apple.com/news/?id=pvszzano)
- [Apple：Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Apple：Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)
- [Apple：Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)
