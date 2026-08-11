---
layout:         post
title:          XCTest 异步测试：Expectation、超时与不稳定测试
date:           2021-03-21
tags:           [iOS]
categories:
comments: false
---

异步测试最容易给人一种“把等待时间调大就好了”的错觉。测试偶尔失败，先把 timeout 从 1 秒改成 10 秒；回调偶尔触发两次，就把断言删掉；网络偶尔慢，就在测试里 sleep。这样的测试也许暂时变绿，却没有证明行为正确，只是把不确定性藏得更深。

在 Swift 还没有普遍使用 `async/await` 的 2021 年，`XCTestExpectation` 和 `XCTWaiter` 仍是处理回调、代理和通知的主要工具。它们真正解决的不是“让测试停下来”，而是把异步行为转成可描述、可等待、可失败的契约。本文从一个最小回调开始，说明如何减少假绿和假红。

### 一、异步测试要验证什么

一个异步用例至少包含触发、结果和结束三个部分。触发是调用请求或启动任务；结果是回调返回的数据、错误或状态；结束是告诉测试框架“这个预期已经满足”。少了任何一块，测试都可能失去意义：没有触发，期望永远超时；没有结果断言，回调来过就算成功；没有结束信号，测试只能靠睡眠猜测。

假设有一个只展示接口的服务：

```swift
protocol ProfileLoader {
    func load(completion: @escaping (Result<String, Error>) -> Void)
}
```

测试不应依赖真实网络。可以注入一个演示替身，在确定的队列中回调；文章中的 `StubProfileLoader` 只是上下文片段，不是可直接运行的完整工程。

```swift
final class StubProfileLoader: ProfileLoader {
    let result: Result<String, Error>

    init(result: Result<String, Error>) {
        self.result = result
    }

    func load(completion: @escaping (Result<String, Error>) -> Void) {
        DispatchQueue.global().async {
            completion(self.result)
        }
    }
}
```

### 二、Expectation 的最小闭环

测试先创建期望，再触发动作，在回调里断言并调用 `fulfill()`，最后等待期望。等待的 timeout 不是“越大越稳”，而是这条测试在当前环境中允许的最大完成时间。它应该基于被测行为的契约，而不是根据某次机器拥塞不断增加。

```swift
func testLoadProfileReturnsName() {
    let expectation = expectation(description: "profile loaded")
    let loader = StubProfileLoader(result: .success("Ada"))

    loader.load { result in
        switch result {
        case .success(let name):
            XCTAssertEqual(name, "Ada")
        case .failure(let error):
            XCTFail("unexpected error: \(error)")
        }
        expectation.fulfill()
    }

    wait(for: [expectation], timeout: 1.0)
}
```

断言放在回调里并不意味着可以忽略线程。若回调会更新 UI 或测试对象，应该明确它在哪个队列发生，并在测试替身中固定执行上下文。对于只验证值的服务，后台队列可以接受；对于界面状态，必须把主线程要求写进被测对象的契约。

### 三、反向期望与重复回调

“某件事不应该发生”同样需要被测试。比如取消请求后不应再调用完成回调，可以创建反向期望：

```swift
func testCancelledRequestDoesNotComplete() {
    let unexpected = expectation(description: "completion must not run")
    unexpected.isInverted = true

    let client = DelayedClient()
    client.completion = { _ in unexpected.fulfill() }
    client.start()
    client.cancel()

    wait(for: [unexpected], timeout: 0.2)
}
```

反向期望的 timeout 通常应短一些，因为它验证的是观察窗口，而不是等待网络完成。更重要的是，被测对象必须真的取消底层任务或让旧回调失效；如果只是把一个布尔值改成 `true`，而回调没有检查它，测试失败才会暴露问题。

回调重复触发也要有明确策略。默认的 expectation 只允许 fulfill 一次，重复 fulfill 会导致测试失败。若业务契约允许多次事件，应设置 `expectedFulfillmentCount`，或者使用数组记录事件后一次性比较顺序。不要用“只取最后一条”掩盖重复事件。

### 四、XCTWaiter 和资源清理

`XCTWaiter` 可以把等待逻辑从 `XCTestCase` 中分离出来，适合测试辅助对象或需要观察多个期望的场景。等待结果应被检查：超时、被中断、期望顺序错误和意外 fulfill 都是不同的失败原因，不应统一写成“测试没过”。

异步测试还要负责清理。测试结束前取消任务、移除通知观察者、释放 delegate 或断开回调；否则上一个测试留下的事件可能触发下一个测试的期望。使用通知测试时，应把通知名、发送者和通知中心都限定在测试范围内，避免全局通知造成串台。

### 五、降低不稳定测试的实践步骤

第一步，把真实网络、时间和随机数替换成可控依赖。第二步，给成功、失败、超时、取消和重复回调分别写测试，而不是只覆盖一条成功路径。第三步，让测试替身在需要时延迟回调，但延迟必须可控，不能使用无意义的长时间 sleep。第四步，重复运行同一测试，确认结果不依赖执行顺序。

如果测试仍然偶发失败，先记录 expectation 的描述、等待结果、线程和事件顺序，再决定是被测代码还是测试本身的问题。可以把等待结果和关键事件附加到测试报告，但不要在失败时自动重跑并吞掉第一次失败。重跑只能帮助收集线索，不能让不确定行为变成通过。

### 六、检查清单

- 每个异步测试都有明确触发、结果断言和 fulfill 位置。
- timeout 与业务契约匹配，并区分正常等待和反向期望观察窗口。
- 取消、重复回调、超时和错误路径各有覆盖。
- 测试替身控制网络、时间、随机数和执行队列。
- 回调涉及 UI 时明确主线程要求。
- 通知、任务和 delegate 在测试结束时完成清理。
- 不用 sleep、放大 timeout 或自动重跑掩盖竞态。

异步测试的稳定来自边界清楚，而不是等待更久。把完成条件写成 expectation，把取消和“不发生”写成反向期望，再把所有外部时间因素替换成可控依赖，测试才真正帮助我们理解代码的时序。

### 七、Objective-C 与代理回调的测试边界

异步测试不只属于 Swift。Objective-C 的 completion block、delegate 和通知同样可以用 expectation 表达。关键是不要在测试里复制一份生产逻辑来“模拟完成”，而应让替身只负责触发约定的事件，再由测试验证页面或服务是否做出了正确反应。

```objc
- (void)testDelegateReceivesFailure {
    XCTestExpectation *expectation =
        [self expectationWithDescription:@"delegate receives failure"];
    FakeClient *client = [FakeClient new];
    client.delegate = self;
    client.onFailure = ^(NSError *error) {
        XCTAssertEqual(error.code, 401);
        [expectation fulfill];
    };

    [client start];
    [self waitForExpectationsWithTimeout:1.0 handler:nil];
}
```

这个片段假设 `FakeClient` 是测试辅助对象，省略了 delegate 声明和错误构造。实际项目中应避免让 block 和 delegate 同时表达同一个完成事件，否则测试会暴露出接口职责重复。若两种回调都必须存在，就要明确哪个是唯一完成信号，哪个只是观察通知。

### 八、超时不是性能基准

测试 timeout 只回答“在这段时间内有没有完成”，不能直接替代性能测试。一个请求在 100 毫秒完成，不代表生产环境永远如此；一个测试在 1 秒内完成，也不代表用户体验符合要求。性能测试应有独立的测量指标、设备和基线，功能测试只需验证完成、失败与取消的契约。

同样，反向期望的短窗口也不能证明某个事件永远不会发生。它只能覆盖特定观察周期。对于必须长期禁止的回调，更可靠的方法是让对象在取消后解除引用、增加任务代次或让状态机拒绝过期事件，再用测试覆盖这些边界。

### 九、把测试失败变成时序证据

当异步测试失败时，优先记录事件序列：何时创建任务、何时取消、哪个队列收到回调、期望是否已 fulfill、对象是否已释放。可以给替身添加一个只读事件数组，在失败时附加到 XCTIssue 或日志中。这样的信息比“把 timeout 调大”更能帮助定位竞态，也能让修复后的测试说明具体保护了什么行为。

还要警惕测试之间共享静态缓存、单例和通知中心。单个测试独立通过，不代表整组测试按任意顺序运行都可靠。把状态放进测试实例，在 `tearDown` 中取消任务并恢复全局配置；若必须使用共享资源，就让测试明确声明依赖并串行执行。可重复的失败顺序本身也是线索，应该被保留下来，而不是通过随机打乱后重跑来掩盖。

当异步对象由多个生命周期共同持有时，还要确认测试结束后谁负责释放它。可以在测试辅助对象中记录取消是否发生、完成回调是否被置空，并在 `tearDown` 里再次检查。这样的断言不是为了增加形式上的覆盖率，而是为了防止一个测试留下仍在运行的任务，悄悄影响后续测试的队列和通知。

### 参考资料

- [Apple：XCTestExpectation](https://developer.apple.com/documentation/xctest/xctestexpectation?language=objc)。
- [Apple：XCTWaiter](https://developer.apple.com/documentation/xctest/xctwaiter?language=objc)。
- [Apple：Asynchronous Tests and Expectations](https://developer.apple.com/documentation/xctest/asynchronous-tests-and-expectations)，本文仅采用其中在 2021 年已有的 expectation 机制。
