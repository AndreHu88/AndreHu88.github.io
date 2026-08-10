---
layout:         post
title:          Objective-C 实现 AI 流式对话：SSE 增量解析与逐字渲染
date:           2024-10-20
tags:           [iOS]
categories:
comments: false
---

流式对话的难点不在于“把一段文字不断追加到标签上”。HTTP 响应到达的单位是字节块，不是一个完整 JSON，更不是一个完整汉字；SSE 的事件边界、UTF-8 字符边界和 UI 刷新节奏都可能彼此错开。若把每个 `didReceiveData:` 直接转成字符串、再立即刷新界面，轻则丢字和 JSON 解析失败，重则在长回答时把主线程塞满。

下面以 Objective-C 与 `NSURLSession` 为例，拆开一条适合 AI 文本流的客户端路径。服务端地址、鉴权和 JSON 字段均用演示名称表示；不同服务的事件 JSON 结构不同，应以其在 2024 年 10 月前公开的协议为准，而不是照搬本文的示例。

## 先分清 HTTP 流与 SSE 事件

许多对话接口使用一个带 JSON 请求体的 `POST` 请求，响应的 `Content-Type` 是 `text/event-stream`。这和浏览器 `EventSource` 常见的 GET 用法并不矛盾：SSE 描述的是响应内的事件格式，应用可以在自己约定的 HTTP 请求上承载它。

一条事件由若干 `field: value` 行组成，空行才表示事件结束；连续多行 `data:` 的值需用换行拼接。`event:`、`id:`、`retry:` 和以冒号开头的注释也有各自含义。因此，不能以“收到一次网络回调”或“遇到一次 `data:`”作为业务消息边界。SSE 文本必须按 UTF-8 解码，响应中的一段中文很可能被拆在两个网络块之间。

先配置一个串行的状态队列：所有字节缓存、行缓存、事件缓存和重连状态只在这条队列上读写。`NSURLSession` 的 delegate queue 也设为串行，可以省去分散的锁；UI 则只在主线程碰触。

```objc
@import Foundation;

@protocol AIStreamClientDelegate <NSObject>
- (void)streamClient:(id)client didBeginGeneration:(NSUInteger)generation;
- (void)streamClient:(id)client didInvalidateGeneration:(NSUInteger)generation;
- (void)streamClient:(id)client
          appendText:(NSString *)text
          generation:(NSUInteger)generation;
@end

@interface AIStreamClient : NSObject <NSURLSessionDataDelegate>
@property (nonatomic, strong) NSURLSession *session;
@property (nonatomic, strong) NSURLSessionDataTask *task;
@property (nonatomic, strong) NSMutableData *undecodedBytes;
@property (nonatomic, strong) NSMutableString *lineBuffer;
@property (nonatomic, strong) NSMutableArray<NSString *> *eventDataLines;
@property (nonatomic, copy) NSString *lastEventID;
@property (nonatomic, assign) BOOL cancelledByUser;
@property (nonatomic, assign) NSUInteger reconnectAttempt;
@property (nonatomic, strong) dispatch_queue_t streamQueue;
@property (nonatomic, strong) NSMutableString *pendingText;
@property (nonatomic, assign) BOOL renderScheduled;
@property (nonatomic, assign) NSUInteger streamGeneration;
@property (nonatomic, assign) NSUInteger renderGeneration;
@property (nonatomic, assign) NSUInteger visibleGeneration; // 只在主线程读写
@property (nonatomic, weak) id<AIStreamClientDelegate> delegate;
@end

@implementation AIStreamClient

- (instancetype)init {
    self = [super init];
    if (self) {
        _streamQueue = dispatch_queue_create("com.example.chat.stream", DISPATCH_QUEUE_SERIAL);
        NSOperationQueue *delegateQueue = [NSOperationQueue new];
        delegateQueue.maxConcurrentOperationCount = 1;
        _session = [NSURLSession sessionWithConfiguration:NSURLSessionConfiguration.defaultSessionConfiguration
                                                 delegate:self
                                            delegateQueue:delegateQueue];
    }
    return self;
}

- (void)startWithPrompt:(NSString *)prompt {
    NSUInteger visibleGeneration = [self advanceVisibleGenerationStarting:YES];
    dispatch_async(self.streamQueue, ^{
        [self startOnStreamQueueWithPrompt:prompt
                         visibleGeneration:visibleGeneration];
    });
}

- (NSUInteger)advanceVisibleGenerationStarting:(BOOL)starting {
    __block NSUInteger generation = 0;
    void (^advance)(void) = ^{
        self.visibleGeneration += 1;
        generation = self.visibleGeneration;
        if (starting) {
            [self.delegate streamClient:self didBeginGeneration:generation];
        } else {
            [self.delegate streamClient:self didInvalidateGeneration:generation];
        }
    };
    if ([NSThread isMainThread]) {
        advance();
    } else {
        dispatch_sync(dispatch_get_main_queue(), advance);
    }
    return generation;
}

- (void)cancel {
    [self advanceVisibleGenerationStarting:NO];
    dispatch_async(self.streamQueue, ^{
        self.streamGeneration += 1;
        self.cancelledByUser = YES;
        [self.pendingText setString:@""];
        self.renderScheduled = NO;
        [self.task cancel];
        // 同时取消或使已有的重连计时器失效。
    });
}

- (void)startOnStreamQueueWithPrompt:(NSString *)prompt
                    visibleGeneration:(NSUInteger)visibleGeneration {
    NSURL *url = [NSURL URLWithString:@"https://example.invalid/v1/chat"];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
    request.HTTPMethod = @"POST";
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    [request setValue:@"text/event-stream" forHTTPHeaderField:@"Accept"];
    [request setValue:@"Bearer 演示令牌" forHTTPHeaderField:@"Authorization"];
    request.HTTPBody = [NSJSONSerialization dataWithJSONObject:@{
        @"prompt": prompt, @"stream": @YES
    } options:0 error:nil];

    self.streamGeneration += 1;
    self.renderGeneration = visibleGeneration;
    self.cancelledByUser = NO;
    self.undecodedBytes = [NSMutableData data];
    self.lineBuffer = [NSMutableString string];
    self.eventDataLines = [NSMutableArray array];
    self.pendingText = [NSMutableString string];
    self.renderScheduled = NO;
    self.task = [self.session dataTaskWithRequest:request];
    [self.task resume];
}

```

这段初始化示例把 session 的 delegate queue 设为串行，并将开始、取消和重连相关的状态统一交给 `streamQueue`；下文的方法均属于同一个 `@implementation`。`streamGeneration` 是每轮会话的身份：后续的网络与渲染回调都会用它拒绝旧任务。`visibleGeneration` 则只由主线程维护，页面收到 `didBeginGeneration:` 或 `didInvalidateGeneration:` 后立即切换当前展示代次；即使旧批次已经排进主线程，也会因代次不匹配被页面丢弃。生产代码还应校验 URL 的 HTTPS、状态码和 `Content-Type`，并把令牌交给 Keychain 或既有鉴权层管理。不要把真实令牌写进日志，也不要将用户输入与完整响应默认上传到诊断系统。

## 先解决 UTF-8，再切事件行

`didReceiveData:` 中最危险的一句往往是 `initWithData:encoding:`。如果缓冲区末尾正好是四字节 UTF-8 字符的前半段，整个转换可能失败。正确做法是保留无法解码的末尾字节，等下一块数据到达后再试；若前缀已经无效，则应把它视为协议错误，而不是用替换字符悄悄吞掉。

下面的辅助方法展示“最多保留三个尾字节”的思路：UTF-8 最长四字节，所以每次寻找可解码的最大前缀。代码假设服务端以常见的 LF 或 CRLF 分行；若要覆盖 CR 单独作为行结束符，应按 SSE 规范把它纳入同一个行状态机。

```objc
- (void)consumeBytes:(NSData *)data {
    [self.undecodedBytes appendData:data];
    NSUInteger total = self.undecodedBytes.length;
    NSUInteger maxTail = MIN((NSUInteger)3, total);

    for (NSUInteger tail = 0; tail <= maxTail; tail++) {
        NSUInteger prefixLength = total - tail;
        NSData *prefix = [self.undecodedBytes subdataWithRange:
                         NSMakeRange(0, prefixLength)];
        NSString *text = [[NSString alloc] initWithData:prefix
                                               encoding:NSUTF8StringEncoding];
        if (text == nil) {
            continue;
        }
        NSData *remaining = [self.undecodedBytes subdataWithRange:
                             NSMakeRange(prefixLength, tail)];
        [self.undecodedBytes setData:remaining];
        [self consumeDecodedText:text];
        return;
    }
    [self failStreamWithReason:@"响应不是有效 UTF-8"];
}

- (void)URLSession:(NSURLSession *)session
          dataTask:(NSURLSessionDataTask *)dataTask
    didReceiveData:(NSData *)data {
    dispatch_async(self.streamQueue, ^{
        if (dataTask == self.task && !self.cancelledByUser) {
            [self consumeBytes:data];
        }
    });
}
```

解码完成后再累积到 `lineBuffer`，仅在遇到 `\n` 时取出一行，并去掉末尾可能存在的 `\r`。空行调用一次 `finishEvent`；普通行按第一个冒号分为字段和值，冒号后若紧跟一个空格则去掉这个空格。这样即使 JSON 内有冒号，解析也不会误切。`data:` 不应立即 JSON 解析，而应先压入 `eventDataLines`。

行缓存也必须跨回调保留。下面的片段只处理 LF 与 CRLF，和前一节的约定一致；它刻意把“切行”和“解释字段”分开，因此以后要支持命名事件或 `retry:` 时，不必改动字节解码器。服务端如果采用代理缓冲，客户端收到的仍可能是多条事件粘在同一个块里，这段循环会逐行消费，而不是只处理第一条。

```objc
- (void)consumeDecodedText:(NSString *)text {
    [self.lineBuffer appendString:text];
    while (true) {
        NSRange lineEnd = [self.lineBuffer rangeOfString:@"\n"];
        if (lineEnd.location == NSNotFound) return;
        NSString *line = [self.lineBuffer substringToIndex:lineEnd.location];
        [self.lineBuffer deleteCharactersInRange:
         NSMakeRange(0, lineEnd.location + 1)];
        if ([line hasSuffix:@"\r"]) {
            line = [line substringToIndex:line.length - 1];
        }
        [self consumeLine:line];
    }
}
```

```objc
- (void)consumeLine:(NSString *)line {
    if (line.length == 0) {
        [self finishEvent];
        return;
    }
    if ([line hasPrefix:@":"]) { return; } // 心跳注释

    NSRange colon = [line rangeOfString:@":"];
    NSString *field = colon.location == NSNotFound ? line :
        [line substringToIndex:colon.location];
    NSString *value = @"";
    if (colon.location != NSNotFound) {
        value = [line substringFromIndex:colon.location + 1];
        if ([value hasPrefix:@" "]) value = [value substringFromIndex:1];
    }
    if ([field isEqualToString:@"data"]) {
        [self.eventDataLines addObject:value];
    } else if ([field isEqualToString:@"id"]) {
        self.lastEventID = value;
    }
}

- (void)finishEvent {
    if (self.eventDataLines.count == 0) return;
    NSString *data = [self.eventDataLines componentsJoinedByString:@"\n"];
    [self.eventDataLines removeAllObjects];
    if ([data isEqualToString:@"[DONE]"]) {
        // 仅适用于把 data: [DONE] 约定为结束帧的具体服务。
        [self completeProviderDefinedStream];
        return;
    }
    [self consumeJSONEvent:data];
}
```

## 只从完整事件里取增量

`consumeJSONEvent:` 应只处理服务端已经用空行封口的完整 `data`。下例使用演示协议 `{"delta":"…"}`；实际接入时把这层做成可替换的 decoder，集中处理不同模型、角色字段、工具调用片段和结束标记，而不要把提供方特定路径散落在网络 delegate 里。`[DONE]` 不是 SSE 标准结束标记；上一节只是演示某些模型服务定义的私有 `data` 值，通用实现应以服务协议规定的结束事件或 HTTP 完成语义为准。

```objc
- (void)consumeJSONEvent:(NSString *)data {
    NSData *jsonData = [data dataUsingEncoding:NSUTF8StringEncoding];
    NSError *error = nil;
    id object = [NSJSONSerialization JSONObjectWithData:jsonData
                                                 options:0 error:&error];
    if (error != nil || ![object isKindOfClass:NSDictionary.class]) {
        [self handleInvalidEventData:data error:error];
        return;
    }
    NSDictionary *event = object;
    NSString *delta = [event[@"delta"] isKindOfClass:NSString.class]
        ? event[@"delta"] : nil;
    if (delta.length > 0) {
        [self enqueueTextForRendering:delta];
    }
}
```

对话产品还需要区分“传输完成”和“内容可提交”。某些协议会先下发角色、使用量或工具调用参数，文本增量只是其中一种事件；有些服务会在最后一帧给出完成原因。decoder 应把这些转换为明确的领域事件，例如 `textDelta`、`toolArgumentsDelta`、`finished`、`failed`，由页面决定怎样展示。不要看到无法识别的 JSON 就把它当文本拼进回答，尤其不要把服务端错误对象显示成模型回复。

HTTP 响应头是另一道边界。在 `didReceiveResponse` 中先检查状态码为成功范围、MIME 类型为 `text/event-stream`，再允许继续接收；错误响应应读取有限长度的错误正文后结束。因为 `NSURLSessionDataTask` 可能在重连前一个任务尚未完全回调时结束，回调里还应比较 `dataTask == self.task` 或会话序号，忽略旧任务的迟到数据。这个条件比单纯检查 `cancelledByUser` 更能避免串台。

```objc
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)dataTask
didReceiveResponse:(NSURLResponse *)response
 completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler {
    dispatch_async(self.streamQueue, ^{
        if (dataTask != self.task || self.cancelledByUser) {
            completionHandler(NSURLSessionResponseCancel);
            return;
        }
        NSHTTPURLResponse *http = (NSHTTPURLResponse *)response;
        BOOL validStatus = [http isKindOfClass:NSHTTPURLResponse.class] &&
            http.statusCode >= 200 && http.statusCode < 300;
        BOOL isEventStream = [response.MIMEType isEqualToString:@"text/event-stream"];
        completionHandler(validStatus && isEventStream
                          ? NSURLSessionResponseAllow : NSURLSessionResponseCancel);
    });
}
```

这里要保留两种失败语义：网络中断可以重连，协议错误或服务端明确拒绝通常不该盲目重试。若服务端支持事件 ID，重连请求可携带 `Last-Event-ID`；但对于带一次性请求体的对话接口，是否允许续传完全取决于服务端协议。不能因为客户端保存了 ID，就假设能安全地重复 POST，否则可能得到重复文本，甚至重复执行有副作用的工具调用。

取消是用户意图，不是一次可重试错误：先在主线程推进 `visibleGeneration` 并通知页面清空，再递增 `streamGeneration`、置 `cancelledByUser`，调用 `[self.task cancel]` 并停止重连计时器。这样即使旧批次已经排进主线程，也会因展示代次不匹配被页面忽略。非用户取消的网络错误可采用有上限的指数退避并加入随机抖动，例如 1、2、4 秒附近；收到 `retry:` 时，也只能在服务端协议明确允许时调整等待时间。重连前务必确认当前会话仍是屏幕上正在显示的那一轮，避免旧回答“复活”并写入新会话。

## 渲染队列要节流，不要逐包刷新

网络块可能非常碎。逐块 `dispatch_async` 到主线程，既会制造大量 UI 更新，也会让自动滚动、富文本布局和键盘动画互相抢占。更平稳的方式是：在串行状态队列上把增量并入 `pendingText`，若尚未安排刷新，则延迟约 1/30 秒取出一个批次，再一次性提交到主线程。这里的“逐字”指视觉上持续增长，不要求网络每到一个字节就重绘一次。

```objc
- (void)enqueueTextForRendering:(NSString *)text {
    [self.pendingText appendString:text];
    if (self.renderScheduled) return;
    self.renderScheduled = YES;
    NSUInteger streamGeneration = self.streamGeneration;
    NSUInteger visibleGeneration = self.renderGeneration;

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, NSEC_PER_SEC / 30),
                   self.streamQueue, ^{
        if (streamGeneration != self.streamGeneration || self.cancelledByUser) return;
        NSString *batch = self.pendingText.copy;
        [self.pendingText setString:@""];
        self.renderScheduled = NO;
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate streamClient:self
                              appendText:batch
                              generation:visibleGeneration];
        });
    });
}

@end
```

`streamQueue` 必须是本文所说的串行状态队列；`pendingText` 和 `renderScheduled` 不能被主线程和网络回调同时随意读写。界面层在主线程保存当前 `visibleGeneration`，只接受与之相同的 `appendText:generation:` 回调；取消时同样应先让主线程推进展示代次，再使 `streamQueue` 取消 task 和重连。这样不会在主线程读取状态队列的可变状态。界面层负责把有效批次追加到自己的模型，并在用户没有手动上滑查看历史时再自动滚到底部。遇到 Markdown、代码块或工具调用展示时，可先累计到语义完整的位置再做富文本解析，避免每个增量都触发整段重排。

还应限制单轮回答的内存上限。网络异常、服务端 bug 或重复重连都可能让流永不结束；当累计文本、待解码字节或单个事件超过预设容量时，客户端应取消任务并给出可理解的失败提示。这个上限不是为了截断正常回答，而是为了让异常输入不会把会话页拖入持续分配和布局抖动。

## 发布前检查清单

- 请求校验 HTTPS、状态码与 `text/event-stream`，令牌不进入日志和示例。
- 字节缓存先处理 UTF-8 尾片，再进入按行、按空行的 SSE 状态机。
- 多行 `data:` 合并后才交给 JSON decoder；decoder 与具体服务协议隔离。
- 用户取消不重连；网络错误有次数上限、退避和当前会话校验。
- 主线程只接收节流后的文本批次，状态队列不与 UI 共享可变对象。
- 对空事件、心跳、非法 UTF-8、非 JSON 错误帧和结束标记都有明确行为。

把流式对话做稳，核心是承认它是一条小型协议管线：字节先变成文本，文本再变成事件，事件才变成业务增量，最后才进入 UI。每一层都有自己的边界，边界清楚后，逐字效果反而是最容易的一部分。

## 参考资料

- [Apple Developer：URLSessionDataDelegate](https://developer.apple.com/documentation/foundation/urlsessiondatadelegate)
- [Apple Developer：URLSession 的数据任务](https://developer.apple.com/documentation/foundation/urlsessiondatatask)
- [W3C：Server-Sent Events（2015 Recommendation）](https://www.w3.org/TR/2015/REC-eventsource-20150203/)
- [IETF RFC 3629：UTF-8](https://www.rfc-editor.org/rfc/rfc3629)
- [Apple Developer：NSJSONSerialization](https://developer.apple.com/documentation/foundation/nsjsonserialization)
