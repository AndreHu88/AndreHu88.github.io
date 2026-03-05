---
layout:         post
title:          iOS网络层工程化：重试、限流、可观测性设计
date:           2026-02-23
tags:           [iOS]
categories:
comments: false
---

## iOS网络层工程化：重试、限流、可观测性设计

很多 iOS 项目的网络层在功能初期都很顺：封一个 `request()` 就够了。等到业务复杂后，问题会集中爆发：超时重试互相打架、弱网体验差、日志不成体系、线上故障无法复盘。

网络层真正的目标不是“能发请求”，而是**在复杂网络环境下稳定输出可预期结果**。

这篇文章给一个可落地的工程化方案，核心是三件事：**策略化重试、分级限流、全链路可观测**。

### 1. 网络层分层模型

建议拆成四层：

1. `Request Builder`：构造 URL、Header、Body、签名。
2. `Transport`：真正发送请求（URLSession/AFNetworking）。
3. `Policy`：重试、熔断、超时、限流策略。
4. `Observer`：日志、指标、追踪 ID、错误归因。

如果把策略和传输写在一起，后期几乎无法扩展。

### 2. 重试策略：不是“失败就再来一次”

推荐规则：

- 仅对幂等请求（GET、部分 PUT）自动重试。
- 仅在可恢复错误重试：超时、连接中断、5xx、429。
- 指数退避 + 抖动（jitter），防止雪崩。

#### Swift 示例：指数退避

```swift
struct RetryPolicy {
    let maxAttempts: Int
    let baseDelay: TimeInterval

    func shouldRetry(statusCode: Int?, error: URLError?, attempt: Int) -> Bool {
        guard attempt < maxAttempts else { return false }
        if let code = statusCode, [500, 502, 503, 504, 429].contains(code) { return true }
        if let error, [.timedOut, .networkConnectionLost, .cannotFindHost].contains(error.code) { return true }
        return false
    }

    func delay(attempt: Int) -> TimeInterval {
        let pure = baseDelay * pow(2.0, Double(attempt - 1))
        let jitter = Double.random(in: 0...(pure * 0.2))
        return pure + jitter
    }
}
```

#### Objective-C 示例：重试调度

```objective-c
- (void)sendRequest:(NSURLRequest *)req
            attempt:(NSInteger)attempt
         completion:(void(^)(NSData *data, NSURLResponse *resp, NSError *err))completion {
    NSURLSessionDataTask *task = [self.session dataTaskWithRequest:req
                                                 completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
        NSInteger status = [(NSHTTPURLResponse *)resp statusCode];
        BOOL retryable = (status == 429 || (status >= 500 && status <= 504) || err != nil);
        if (retryable && attempt < 3) {
            NSTimeInterval delay = pow(2, attempt - 1) * 0.2;
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay * NSEC_PER_SEC)), dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
                [self sendRequest:req attempt:attempt + 1 completion:completion];
            });
            return;
        }
        completion(data, resp, err);
    }];
    [task resume];
}
```

### 3. 限流设计：保护客户端与服务端

常见误区：客户端不做限流，弱网下疯狂并发重试，服务端雪上加霜。

建议至少做两层：

- **全局并发上限**：比如最多 8 个并发请求。
- **域名级/接口级上限**：热点接口单独限流。

配套策略：

- 用户关键路径优先级更高（首页、支付、登录）。
- 非关键请求可延后或合并（埋点、推荐位刷新）。

### 4. 可观测性：没有日志就没有真相

每个请求建议统一采集：

- traceID/requestID
- method + path + status
- 端到端耗时（DNS、连接、TLS、TTFB、下载）
- 重试次数与最终结果
- 业务错误码

#### Swift 示例：统一日志结构

```swift
struct NetworkLogEvent: Codable {
    let traceID: String
    let path: String
    let method: String
    let statusCode: Int?
    let durationMs: Int
    let retryCount: Int
    let errorCode: String?
}
```

日志必须结构化，避免“字符串拼接日志”导致无法聚合分析。

### 5. 错误模型统一：减少业务层判断分支

推荐网络层向上抛统一错误：

- `transportError`（无网、超时、连接中断）
- `serverError`（5xx）
- `rateLimited`（429）
- `businessError(code, message)`（业务码）
- `decodeError`

业务层拿到统一模型后可以简化 UI 策略：展示重试按钮、降级缓存、提示文案等。

### 6. 缓存与降级策略

弱网环境下，网络层必须支持“读缓存 + 后台刷新”：

1. 先返回最近成功缓存（如果可用）。
2. 后台请求新数据，成功后静默刷新。
3. 若失败，保留缓存并标记过期状态。

这比“失败就空白页”体验稳定得多。

### 7. 发布治理：把事故前移

上线前建议做三类压测：

- 弱网模拟（丢包、延迟、抖动）
- 服务端错误注入（429/5xx）
- DNS 异常与证书异常

同时检查指标：

- 请求成功率
- 平均重试次数
- P95 请求耗时
- 关键接口空页面率

### 8. 总结

网络层工程化的关键，不是选 URLSession 还是三方库，而是你有没有把“策略”和“观察能力”做成平台能力。

当重试、限流、观测成为基础设施，业务团队会得到三个直接收益：

- 线上故障更快定位。
- 弱网体验更稳定。
- 网络逻辑改造成本更低。

## 参考资料

- [Apple - URLSession](https://developer.apple.com/documentation/foundation/urlsession)
- [Apple - Networking Overview](https://developer.apple.com/documentation/foundation)
- [IETF RFC 6585 - HTTP 429](https://datatracker.ietf.org/doc/html/rfc6585)
- [Google SRE Book - Handling Overload](https://sre.google/sre-book/handling-overload/)
- [AWS Architecture Blog - Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
