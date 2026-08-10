---
layout:         post
title:          Objective-C 实现股票 K 线图：数据建模、坐标映射与高性能绘制
date:           2023-12-17
tags:           [iOS]
categories:
comments: false
---

## Objective-C 实现股票 K 线图：数据建模、坐标映射与高性能绘制

K 线图看起来只是红绿矩形和几条折线，真正动手后却会发现，它同时考验数据建模、坐标变换、手势状态和绘制性能。价格可能跨越几个数量级，交易日并不连续，缩放后还要保证蜡烛宽度可读；十字线移动时，如果每次都把整张图重画一遍，体验很快就会变得迟钝。

这篇文章以 Objective-C 和 UIKit/Core Graphics 为基础，拆解一个可落地的 K 线组件。代码是为说明结构而裁剪的片段，示例行情均为演示数据，不对应任何真实证券，也不构成投资建议。

### 一、先把行情数据定义清楚

一根蜡烛至少需要时间、开盘价、最高价、最低价、收盘价和成交量，也就是常说的 OHLCV。价格不要用 `float`：它的精度不足；如果数据源本身以最小货币单位传输，可以优先保存整数。本文为了让坐标计算直观，模型使用 `double`，展示文本再交给 `NSNumberFormatter`。

```objc
@interface YKCandle : NSObject
@property (nonatomic, assign) NSTimeInterval timestamp;
@property (nonatomic, assign) double open;
@property (nonatomic, assign) double high;
@property (nonatomic, assign) double low;
@property (nonatomic, assign) double close;
@property (nonatomic, assign) double volume;
@end
```

模型进入图表前要做一次校验：六个数值必须有限；成交量不能为负；并且 `high >= MAX(open, close)`、`low <= MIN(open, close)`、`high >= low`。时间戳应按升序排列，同一周期出现重复时间时，也要在数据层明确覆盖还是合并，不能留给绘制层猜测。

均线最好作为派生序列单独计算，不要在 `drawRect:` 里反复求和。以收盘价五日均线为例，可以用滑动窗口将复杂度从 `O(n × period)` 降到 `O(n)`；不足五根时保存 `NAN`，绘图时跳过。复权、时区、停牌和交易日历属于行情语义，也应在图表之前解决。

### 二、可见区间是组件的核心状态

图表不需要每次都处理全部历史数据。真正参与坐标计算和绘制的是可见区间：

```objc
@property (nonatomic, assign) NSRange visibleRange;
@property (nonatomic, assign) CGFloat candleWidth;
@property (nonatomic, assign) CGFloat candleSpacing;
```

假设绘图区宽度为 `plotWidth`，单元宽度是 `candleWidth + candleSpacing`，可见数量可由 `floor(plotWidth / unitWidth)` 得到。向左拖动时改变 `visibleRange.location`，双指缩放时改变 `candleWidth`，随后重新计算可见数量，并把区间裁剪到 `[0, candles.count)`。

这里最容易漏掉两个细节。第一，缩放锚点不能总是视图中心，否则手指下的蜡烛会“滑走”。缩放开始时记录锚点对应的数据索引，宽度变化后反推新的起点，让该索引尽量留在原来的屏幕位置。第二，数据刷新后要区分用户是否正查看最新一根：如果是，就继续吸附右侧；如果用户已经拖到历史区间，不要强行跳回末尾。

### 三、价格、时间与屏幕坐标

UIKit 坐标原点在左上角，`y` 向下增长，而价格越高应该画得越靠上。先扫描可见蜡烛的最高、最低价，再留少量上下边距：

```objc
- (CGFloat)yForPrice:(double)price
             minPrice:(double)minPrice
             maxPrice:(double)maxPrice
              inFrame:(CGRect)frame {
    double span = maxPrice - minPrice;
    if (!isfinite(span) || span <= DBL_EPSILON) {
        return CGRectGetMidY(frame);
    }
    double ratio = (maxPrice - price) / span;
    return CGRectGetMinY(frame) + (CGFloat)ratio * CGRectGetHeight(frame);
}

- (CGFloat)xForVisibleOffset:(NSUInteger)offset inFrame:(CGRect)frame {
    CGFloat unit = self.candleWidth + self.candleSpacing;
    return CGRectGetMinX(frame) + offset * unit + unit * 0.5;
}
```

当最高价等于最低价时，直接除法会产生无效坐标。实际实现可以在中线绘制，并人为扩展一个很小的价格区间，让刻度仍然有意义。扫描价格范围时，还要决定是否把均线包含进范围：包含会避免均线被裁掉，但极端均线值也可能压扁蜡烛。这个策略应作为明确配置，而不是隐藏规则。

横轴更适合按“序号”而不是自然时间等距排列。周末和节假日没有蜡烛，如果直接使用时间差映射，图中会出现没有交易含义的空洞。时间戳用于格式化刻度和定位数据，屏幕上的间距则由可见序号决定。

为了让一像素的线更清晰，可以根据屏幕缩放因子对坐标做像素对齐：

```objc
static inline CGFloat YKAlignToPixel(CGFloat value, CGFloat scale) {
    return round(value * scale) / scale;
}
```

### 四、用 Core Graphics 绘制蜡烛与成交量

`UIView` 的 `drawRect:` 已经提供当前图形上下文。不要自行创建位图上下文，也不要长期持有从这里取得的 `CGContextRef`。绘制顺序通常是：背景和网格、成交量、蜡烛、均线、坐标文字，最后才是十字线覆盖层。

```objc
- (void)drawCandle:(YKCandle *)item
                 x:(CGFloat)x
             frame:(CGRect)frame
          minPrice:(double)minPrice
          maxPrice:(double)maxPrice
           context:(CGContextRef)context {
    CGFloat yHigh = [self yForPrice:item.high minPrice:minPrice
                           maxPrice:maxPrice inFrame:frame];
    CGFloat yLow = [self yForPrice:item.low minPrice:minPrice
                          maxPrice:maxPrice inFrame:frame];
    CGFloat yOpen = [self yForPrice:item.open minPrice:minPrice
                           maxPrice:maxPrice inFrame:frame];
    CGFloat yClose = [self yForPrice:item.close minPrice:minPrice
                            maxPrice:maxPrice inFrame:frame];

    BOOL rising = item.close >= item.open;
    UIColor *color = rising ? self.risingColor : self.fallingColor;
    CGContextSetStrokeColorWithColor(context, color.CGColor);
    CGContextSetFillColorWithColor(context, color.CGColor);
    CGContextSetLineWidth(context, 1.0 / UIScreen.mainScreen.scale);
    CGContextMoveToPoint(context, x, yHigh);
    CGContextAddLineToPoint(context, x, yLow);
    CGContextStrokePath(context);

    CGFloat bodyTop = MIN(yOpen, yClose);
    CGFloat bodyHeight = MAX(fabs(yClose - yOpen),
                             1.0 / UIScreen.mainScreen.scale);
    CGRect body = CGRectMake(x - self.candleWidth * 0.5,
                             bodyTop, self.candleWidth, bodyHeight);
    CGContextFillRect(context, body);
}
```

示例把上涨画成实心色块，真实产品也可能采用“涨空跌实”，并且不同市场对红绿含义的习惯并不一致，因此颜色和填充方式都应开放配置。`open == close` 的十字星至少保留一个物理像素，否则会在高分屏上消失。

成交量使用独立区域和独立比例尺。可见区最大成交量映射到成交量区顶部，零映射到底部；若全部为零则不画柱体。柱体可复用蜡烛涨跌颜色，但不能把成交量和价格共用纵轴。

```objc
double ratio = maxVolume > 0.0 ? item.volume / maxVolume : 0.0;
CGFloat height = CGRectGetHeight(volumeFrame) * (CGFloat)ratio;
CGRect bar = CGRectMake(x - self.candleWidth * 0.5,
                        CGRectGetMaxY(volumeFrame) - height,
                        self.candleWidth, height);
CGContextFillRect(context, bar);
```

### 五、均线要处理断点，而不只是连线

均线绘制可以使用 `CGMutablePathRef`。第一个有效点调用 `CGPathMoveToPoint`，后续调用 `CGPathAddLineToPoint`；遇到 `NAN` 或超出可用数据区间时，把“已有起点”标志重置。否则路径会错误地跨过缺失数据。

```objc
CGMutablePathRef path = CGPathCreateMutable();
BOOL hasStart = NO;
for (NSUInteger offset = 0; offset < values.count; offset++) {
    double value = values[offset].doubleValue;
    if (!isfinite(value)) {
        hasStart = NO;
        continue;
    }
    CGFloat x = [self xForVisibleOffset:offset inFrame:priceFrame];
    CGFloat y = [self yForPrice:value minPrice:minPrice
                      maxPrice:maxPrice inFrame:priceFrame];
    if (hasStart) {
        CGPathAddLineToPoint(path, NULL, x, y);
    } else {
        CGPathMoveToPoint(path, NULL, x, y);
        hasStart = YES;
    }
}
CGContextAddPath(context, path);
CGContextStrokePath(context);
CGPathRelease(path);
```

生产代码通常同时展示 MA5、MA10、MA20。均线结果可以随数据版本缓存，绘制层只读取可见切片；周期变化或行情追加时再增量更新，避免每一次拖动都重复计算。

### 六、缩放、平移和手势冲突

平移用 `UIPanGestureRecognizer`，累计位移超过一个单元宽度后换算为整数根数，并保留不足一个单元的余量。这样既不会因每帧取整而丢失手势，也能让蜡烛最终稳定落在数据格上。

缩放用 `UIPinchGestureRecognizer`。不要直接连续乘上每一帧的 `scale`，否则会指数式放大；可以在 `.began` 保存初始宽度，在 `.changed` 使用 `initialWidth * recognizer.scale`，再限制到例如 3～24 点的可读范围。缩得太小时，优先切换到聚合或简化绘制，而不是把无数条亚像素线硬塞进屏幕。

当图表嵌在纵向 `UIScrollView` 中时，手势代理应根据移动方向决定是否同时识别：横向移动交给图表，明显的纵向移动留给页面。长按十字线期间可暂时禁止平移，结束后恢复，避免两个状态同时修改可见区间。

### 七、十字线应该是轻量覆盖层

十字线不适合和历史蜡烛绑定在同一个重绘周期。更实用的方式是单独放一个透明 `UIView` 或使用两个 `CAShapeLayer`：主图只在数据、尺寸、缩放和平移变化时重绘；手指移动时仅更新横线、竖线和标签。

长按位置到数据索引的换算同样基于单元宽度：

```objc
CGFloat localX = location.x - CGRectGetMinX(priceFrame);
NSInteger offset = (NSInteger)llround(localX /
                      (self.candleWidth + self.candleSpacing) - 0.5);
offset = MAX(0, MIN(offset, (NSInteger)self.visibleRange.length - 1));
NSUInteger index = self.visibleRange.location + (NSUInteger)offset;
```

得到索引后，竖线吸附到蜡烛中心；横线可以跟随手指显示对应价格，也可以吸附收盘价，两种交互含义不同，需要产品层明确。标签必须限制在视图边界内，并通过 `NSDateFormatter` 展示交易时区中的日期。VoiceOver 用户无法使用长按精确探索时，应有可访问的摘要或逐项浏览入口。

### 八、大数据量下的优化顺序

几万根历史数据并不可怕，可怕的是每次刷新都遍历、格式化和分配它们。优化应先从工作量边界入手：

1. **只扫描和绘制可见数据。** 缩放到一屏 80 根时，计算就限定在这 80 根及少量缓冲区。
2. **把计算移出绘制函数。** 均线、日期字符串、数据校验和可见极值缓存到独立结果中；后台队列计算完成后，回主线程替换不可变快照并触发重绘。
3. **合并同色路径。** 大量线段可按颜色加入路径后一次描边，减少频繁修改上下文状态。
4. **静态层与交互层分开。** 网格、K 线和均线低频更新，十字线高频更新；后者使用图层位移，不重画前者。
5. **控制刷新频率。** 行情回调可能快于屏幕刷新，不必每收到一条数据就调用 `setNeedsDisplay`。合并主线程更新，并以屏幕能展示的节奏提交。
6. **先测量再优化。** 使用 Instruments 的 Time Profiler 和 Core Animation 观察 CPU 热点、离屏渲染与掉帧，而不是凭感觉引入复杂缓存。

异步计算还要处理版本竞争：用户切换周期后，旧任务晚到不能覆盖新数据。可以为每份行情快照附带递增版本号，提交结果时再次核对。UIKit 对象及绘制触发留在主线程，后台只处理不变的数据值。

### 九、不能靠“正常行情”掩盖的边界

一个可靠组件至少要验证这些情况：空数组和只有一根数据；所有价格相同；零成交量；极大或极小价格；`NaN`、无穷值和非法 OHLC；数据量少于均线周期；旋转、分屏或安全区变化；缩放到上限和下限；新数据到达时位于最新区与历史区两种状态。

还要警惕“最新价一定是最后一个元素”这种隐含假设。网络乱序或周期切换时，应先在数据层排序、去重，再发布一份不可变数组。绘制过程中不要直接读取正在被其他线程修改的可变数组，否则轻则一帧数据不一致，重则越界崩溃。

### 十、一份可执行的检查清单

- 数据入图前完成排序、去重、合法性校验和时区统一。
- 可见区间始终不越界，数据追加不会打断用户查看历史。
- 价格轴处理零跨度，时间轴按交易序号等距。
- 蜡烛、成交量、均线使用各自正确的范围和断点策略。
- 平移保留余量，缩放保留手指锚点并限制最小、最大宽度。
- 十字线独立更新，索引和标签都能在边界处正确夹取。
- 只处理可见数据，缓存派生结果，并用 Instruments 验证瓶颈。
- 颜色、涨跌规则、精度和无障碍描述均可配置或本地化。

K 线组件的难点不在某一段 Core Graphics API，而在于把行情语义、可见窗口、坐标系统与交互状态分开。当这些边界清楚后，绘图代码只是把已经确定的数据投影到屏幕；当边界混在一起时，任何新需求都会牵动整张图。先建立稳定的数据流，再追求漂亮的线条，是更可靠的实现顺序。

### 参考资料

- [Apple：Drawing and Printing Guide for iOS（Quartz 2D 绘图基础）](https://developer.apple.com/library/archive/documentation/2DDrawing/Conceptual/DrawingPrintingiOS/)
- [Apple：Quartz 2D Programming Guide](https://developer.apple.com/library/archive/documentation/GraphicsImaging/Conceptual/drawingwithquartz2d/Introduction/Introduction.html)
- [Apple：View Programming Guide for iOS](https://developer.apple.com/library/archive/documentation/WindowsViews/Conceptual/ViewPG_iPhoneOS/)
- [Apple：Handling UIKit Gestures](https://developer.apple.com/documentation/uikit/touches_presses_and_gestures/handling_uikit_gestures)
- [Apple：Instruments Help](https://help.apple.com/instruments/mac/current/)
