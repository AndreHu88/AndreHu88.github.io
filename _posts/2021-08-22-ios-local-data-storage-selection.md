---
layout:         post
title:          iOS 本地数据存储：UserDefaults、Keychain、文件与数据库的选择
date:           2021-08-22
tags:           [iOS]
categories:
comments: false
---

iOS 本地存储经常从一句“先存起来”开始，最后却变成迁移失败、敏感信息泄露、清理后状态错乱和启动变慢。问题通常不在 API 不够多，而在数据性质没有先被说清楚：这是偏好设置、登录凭证、可重新下载的缓存，还是必须保持关系和查询能力的业务数据？不同答案对应不同存储边界。

本文不把某一种方案当成万能容器，而是用数据丢失成本、敏感程度、读写频率、查询方式和迁移责任做选择。示例均为演示代码，不对应任何真实项目，也不保存真实用户数据。

### 一、先给数据分类

可以先问五个问题：数据是否敏感；是否能从服务端重新获得；是否需要按条件查询；是否需要跨进程或跨设备同步；版本变化时谁负责迁移。只要其中一个答案不同，存储方式就可能不同。

用户是否开启深色模式、列表排序和最近一次提示，通常属于偏好设置；访问令牌、刷新令牌和密钥属于敏感凭证；图片缩略图和接口响应可以作为缓存；订单草稿、离线编辑和关系复杂的记录，则需要更完整的数据模型。先写分类表，再写代码，能减少“所有东西都塞 UserDefaults”的冲动。

### 二、UserDefaults 只保存小型偏好

`UserDefaults` 适合少量、非敏感、可用默认值替代的设置。它不是数据库，也不适合保存大数组、完整响应或访问令牌。写入成功只表示值交给系统处理，不等于它已经完成跨设备同步或永久落盘。读取时应提供类型和缺省值，避免旧版本写入的类型变化导致运行时错误。

```swift
enum Settings {
    static let prefersCompactList = "prefersCompactList"
}

let defaults = UserDefaults.standard
defaults.set(true, forKey: Settings.prefersCompactList)
let compact = defaults.bool(forKey: Settings.prefersCompactList)
```

Key 名称应集中管理，升级时记录旧键和新键。若布尔值从未写入，`bool(forKey:)` 返回 `false` 可能与“用户明确关闭”混淆；需要三态时，使用 `object(forKey:)` 判断是否存在。清理缓存时不要调用 `removePersistentDomain` 删除整个应用设置，除非这是明确的退出登录策略。

### 三、Keychain 用来保存凭证，不是普通缓存

Keychain 适合令牌、密钥和需要在应用重装等场景下按策略保留的敏感信息。它的访问属性、服务名、账户名和可访问时机需要明确。若应用在设备锁定时不应读取凭证，就不能使用一个过于宽松的可访问级别。Keychain 也不是把任意大对象都安全塞进去的数据库，数据量和更新频率都应受控。

```swift
import Security

let token = Data("demo-token".utf8)
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "example.service",
    kSecAttrAccount as String: "access-token",
    kSecValueData as String: token,
    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
]

let status = SecItemAdd(query as CFDictionary, nil)
// 生产代码应分别处理已存在、权限拒绝和参数错误。
```

示例没有覆盖更新和删除，也没有把状态码当成业务错误直接忽略。真实封装要处理 `errSecDuplicateItem`，并用 `SecItemUpdate` 更新已存在的条目。退出登录时是否删除 Keychain，需要结合账号切换和设备共享策略决定，不能简单照搬“清空本地数据”。

### 四、文件适合缓存和可序列化内容

文件系统适合图片、下载文件、草稿快照和可重新生成的 JSON。缓存应放在 Caches 目录，系统可以在空间不足时清理；用户必须保留的文档应放在 Documents 或应用支持目录，并考虑备份策略。文件名、目录层级和临时文件写入方式要稳定，不能把用户输入直接拼接成路径。

写文件时推荐先写临时文件，再通过原子替换完成更新，避免进程中断留下半个 JSON。读取失败时区分文件不存在、权限错误和格式错误：不存在可能是首次安装，格式错误则可能需要迁移或丢弃损坏缓存。缓存解析失败不应阻塞整个应用启动。

### 五、数据库解决查询和关系问题

当数据需要按条件筛选、排序、分页、建立关系或支持增量迁移时，数据库比一堆 JSON 文件更合适。Core Data 在 2021 年仍是 iOS 端的常见方案，但它要求开发者认真处理 model version、迁移策略、context 线程约束和保存失败。不要因为“数据现在只有几十条”就忽略未来的查询与一致性需求，也不要为了简单而把 Core Data 当成全局可随意访问的对象。

数据库的上下文应有明确的并发边界：主上下文负责 UI 展示，后台上下文处理导入或批量修改，保存时按父子关系或持久化容器的约定传递。页面离开后仍在运行的后台任务，要防止把旧对象直接写回已失效的界面。所有保存操作都应检查错误，并保留能定位失败实体和字段的日志。

### 六、迁移、备份和清理是同一个问题

存储方案一旦上线，就必须面对版本升级。为偏好设置保留键迁移表；为文件保存 schema version；为数据库使用轻量迁移或明确的重建策略；为 Keychain 记录服务名和账户变化。迁移失败时要有降级路径，但不能静默删除唯一副本。对用户文档，宁可停止写入并提示恢复，也不要用空数据覆盖原文件。

备份也要按数据类型判断。可重新下载的缓存不应占用用户备份空间，敏感凭证不应写入普通备份，用户明确创建的文档则要考虑恢复。测试卸载重装、系统空间不足、设备锁定、应用升级、异常中断和多账号切换，这些场景往往比“正常保存一条记录”更能检验设计。

### 七、选择矩阵与检查清单

| 数据 | 首选 | 不能忽略的边界 |
| --- | --- | --- |
| 小型非敏感偏好 | UserDefaults | 默认值、键迁移、不要存大对象 |
| 令牌和密钥 | Keychain | 访问级别、更新、退出登录和错误码 |
| 可重新下载内容 | Caches 文件 | 清理、原子写入和损坏恢复 |
| 用户文档或草稿 | 文件或数据库 | 备份、版本、并发写入和恢复 |
| 关系与查询数据 | Core Data | context 并发、迁移、保存错误 |

检查时逐项确认：数据分类是否有负责人；读写 API 是否集中封装；敏感字段是否避免出现在日志；迁移是否可回滚；缓存清理是否不会误删用户内容；失败时页面是否还能继续完成任务。存储设计的目标不是让数据永远存在，而是让数据在正确的生命周期里以正确的方式存在。

### 八、一个可落地的评审顺序

实际评审可以从数据字典开始，而不是从 API 开始。先列出字段来源、敏感级别、有效期、能否重新获取和删除条件，再选择容器。接着画出安装、登录、升级、退出登录和低磁盘空间几条生命周期，标出每个字段在何时创建、迁移、备份和清理。最后才检查具体调用是否满足并发、权限和错误处理要求。

这种顺序能避免两个常见误区。第一，看到一个方便的字典 API 就把服务器响应完整保存，随后难以迁移；第二，看到 Keychain 安全就把所有本地数据放进去，造成查询和更新困难。存储方案不是安全等级的单排行，而是数据生命周期、使用方式和失败成本的共同结果。

评审结束后，最好为每个字段留下删除和恢复记录：谁可以触发删除，删除后是否还能从服务端恢复，升级失败时是否保留旧格式。这样做能把“清理本地数据”从一个危险的按钮，变成有边界、有提示、可回退的生命周期动作。

### 参考资料

- [Apple：UserDefaults](https://developer.apple.com/documentation/foundation/userdefaults)。
- [Apple：Keychain Services Programming Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/keychainServConcepts/)，历史安全存储指南。
- [Apple：File System Programming Guide](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/)，文件目录与备份约定。
- [Apple：Core Data Programming Guide](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/CoreData/)，数据模型、并发和迁移基础。
