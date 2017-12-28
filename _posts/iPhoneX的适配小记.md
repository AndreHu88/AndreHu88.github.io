---
layout:         post

title:          iPhoneX的适配问题

subtitle:       总结一次iPhone X的适配

card-image:

date:           2017-12-28

tags:           总结

post-card-type: article
---



### 记录一次iPhone X的适配过程，做个总结

自iOS11后，苹果推出```iPhone X```。由于```iPhoneX```的尺寸，外观不太常规，所以适配自然就不太一样。而且iOS11后，有些API做了些改变。

在Xcode中，我打印了```iPhone X```的一些尺寸信息

```objective-c
StatusBarHeight:44.000000
TabBarHeight:83.000000
NavHeight:44.000000
ScreenHeight:812.000000
frame: {{0, 0}, {375, 812}}
```

再次打印```Phone7```的尺寸信息

```objective-c
StatusBarHeight:20.000000
TabBarHeight:49.000000
NavHeight:44.000000
frame: {{0, 0}, {375, 667}}
ScreenHeight:667.000000
```

