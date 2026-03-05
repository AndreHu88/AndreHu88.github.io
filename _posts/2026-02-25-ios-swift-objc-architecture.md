---
layout:         post
title:          iOS高可维护架构：Swift 与 ObjC 混编实践
date:           2026-02-25
tags:           [iOS]
categories:
comments: false
---

## iOS高可维护架构：Swift 与 ObjC 混编实践

很多 iOS 团队都处在“历史 ObjC + 新增 Swift”的混合阶段。最常见的问题不是语言本身，而是边界混乱：模块职责不清、桥接层耦合、依赖方向失控，最后谁改代码都很痛苦。

本文给一个实践过的混编架构方案：**明确边界、协议抽象、依赖注入、渐进迁移**。目标不是“全量重写”，而是把维护成本降下来。

### 1. 为什么混编项目容易失控

常见症状：

1. `Bridging Header` 越来越大，任意模块互相可见。
2. Swift 层直接调用大量 ObjC 细节实现。
3. ObjC 为了调用 Swift，反向依赖了高层业务对象。
4. 新功能上线快，重构永远排不上。

根因是架构边界没有被制度化。

### 2. 推荐分层：Domain / Service / UI

建议把模块按职责拆三层：

- `Domain`：纯业务协议与模型（尽量 Swift，轻依赖）
- `Service`：网络、存储、日志、推送等实现（可混编）
- `UI`：页面、路由、状态编排（Swift 为主）

核心规则：**高层依赖抽象，低层实现抽象**。

### 3. 先定义跨语言边界协议

#### Swift：定义业务协议

```swift
@objc public protocol UserProfileService {
    func fetchProfile(userID: String,
                      completion: @escaping (UserProfile?, NSError?) -> Void)
}

@objcMembers
public final class UserProfile: NSObject {
    public let userID: String
    public let nickname: String

    public init(userID: String, nickname: String) {
        self.userID = userID
        self.nickname = nickname
    }
}
```

#### Objective-C：实现协议

```objective-c
#import "ProjectName-Swift.h"

@interface SOHUserProfileService : NSObject <UserProfileService>
@end

@implementation SOHUserProfileService
- (void)fetchProfileWithUserID:(NSString *)userID
                    completion:(void (^)(UserProfile * _Nullable, NSError * _Nullable))completion {
    // ObjC 网络实现与缓存读取
    UserProfile *profile = [[UserProfile alloc] initWithUserID:userID nickname:@"Jack"];
    completion(profile, nil);
}
@end
```

这样 Swift UI 不需要知道 ObjC 细节，只依赖协议。

### 4. 依赖注入：别在页面里直接 new 实现

#### Swift：构造注入

```swift
final class ProfileViewModel {
    private let service: UserProfileService

    init(service: UserProfileService) {
        self.service = service
    }

    func load(userID: String, completion: @escaping (String) -> Void) {
        service.fetchProfile(userID: userID) { profile, _ in
            completion(profile?.nickname ?? "-")
        }
    }
}
```

这种写法的收益：

- 测试时可替换 mock。
- 迁移时可替换实现，不动上层业务。

### 5. 渐进迁移策略：三步走

#### 第一步：封边界

先把旧 ObjC 能力包在 Service 层，不要让 UI 到处直连旧代码。

#### 第二步：迁移“高变更”模块

优先迁移需求变化频繁的模块（比如首页推荐、消息列表）。收益最大。

#### 第三步：处理底层公共组件

网络、存储、日志等底层模块谨慎迁移，先保证接口稳定。

### 6. 混编项目的四条红线

1. 不允许跨层直接 import 具体实现。
2. 不在业务代码里直接使用 Bridging Header 暴露的大杂烩能力。
3. 新增模块默认 Swift，但必须先定义协议。
4. 每次迁移必须带回归测试。

### 7. 工程层面的配套治理

#### 7.1 编译依赖可视化

定期输出模块依赖图，发现循环依赖立刻治理。

#### 7.2 Code Review 模板

PR 中强制回答：

- 新增依赖是否符合层级？
- 是否通过协议而非具体类交互？
- 是否影响现有 ObjC 模块可用性？

#### 7.3 统一异常处理与日志协议

跨语言统一错误码和日志字段，避免埋点口径混乱。

### 8. 一个常见误区

很多团队一上来就“全量 Swift 化”。这在技术上很诱人，但在业务周期里通常风险很高。更实际的方式是：

- 先建立清晰边界；
- 再做增量迁移；
- 每一步都能回滚。

这样你得到的是“持续可演进的架构”，而不是一次性大手术。

### 9. 总结

混编并不可怕，可怕的是没有边界和规则。只要你把依赖方向、协议抽象、注入方式和迁移策略固定下来，Swift 与 ObjC 完全可以长期共存，并且保持较高开发效率。

技术演进的关键不是“换语言”，而是把系统变成可维护、可替换、可验证。

## 参考资料

- [Apple - Mixing Swift and Objective-C](https://developer.apple.com/documentation/swift/importing-objective-c-into-swift)
- [Apple - Swift and Objective-C Interoperability](https://developer.apple.com/documentation/swift/objective-c_and_c_code_customization)
- [objc.io - Architecture](https://www.objc.io/issues/13-architecture/)
- [Clean Architecture](https://8thlight.com/blog/uncle-bob/2012/08/13/the-clean-architecture.html)
- [WWDC - Modern Swift API Design](https://developer.apple.com/videos/)
