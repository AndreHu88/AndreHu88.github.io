---
layout:         post
title:          ArkUI 状态管理 V1：组件状态、父子同步与对象观察
date:           2025-03-23
tags:           [HarmonyOS]
categories:
comments: false
---

状态管理最容易被误写成一张“装饰器速查表”：看见数据会变就加 `@State`，子组件要改值就换 `@Link`。真正导致界面不刷、改动串到意料之外位置的，往往不是装饰器拼错，而是没有先回答三个问题：数据由谁拥有、子组件是否有权修改、它是不是一个需要继续观察的对象。

本文只讨论状态管理 V1 的组件级模型，以 2025 年 3 月前已有的能力为边界，不是 V1 到 V2 的迁移说明。示例是独立的 ArkTS 片段，演示数据不对应任何实际产品；重点是建立一条可以在代码审查时复用的判断路径。

## 先把“状态”还给拥有它的组件

声明式 UI 中，`build()` 描述的是当前状态应该长成什么样，而不是命令式地逐个修改控件。状态变量被写入后，框架会让读取过该变量的 UI 重建。普通成员变量没有这层追踪：它可以保存值，却不会因为赋值自动刷新界面。

`@State` 是组件私有、可变状态的起点。它的生命周期与所属自定义组件一致，适合计数、输入草稿、选中项这类“该组件负责决定”的数据。不要把所有传入参数复制成 `@State`；一旦复制，父组件更新与子组件本地副本就变成两条独立的时间线。

```ts
@Entry
@Component
struct QuantityPicker {
  @State quantity: number = 1

  build() {
    Row() {
      Button('-').onClick(() => {
        this.quantity = Math.max(1, this.quantity - 1)
      })
      Text(`${this.quantity}`).margin({ left: 12, right: 12 })
      Button('+').onClick(() => {
        this.quantity += 1
      })
    }
  }
}
```

这个例子里，数量的创建、修改和销毁都属于 `QuantityPicker`，所以 `@State` 很自然。若数量实际由订单页拥有，选择器只是一个可复用控件，那么状态不应悄悄留在选择器内部，而要把同步方向写进组件接口。

还要注意初始化并不是“每次重建都重置”。组件进入页面后，`@State` 保存的是该组件实例的状态；`build()` 可以因状态变化被重新执行，但不应在 `build()` 中再次构造、写入或依赖偶然副作用来恢复状态。需要根据外部输入重置草稿时，应把重置条件和动作写成明确的事件或生命周期逻辑。这样阅读代码的人能区分“UI 正在重新描述”与“业务状态正在重新开始”，也能避免列表复用、条件渲染时把状态丢失误判成框架刷新问题。

## 父子传值不是一种关系

V1 的 `@Prop` 与 `@Link` 都能从父组件接收数据，但它们表达的是不同权限。`@Prop` 是从父到子的单向同步：子组件得到一份可在本地改动的值，父源变化时该本地值会被覆盖。它适合“初始配置”或子组件内部可短暂编辑、但提交动作另行上报的场景。

`@Link` 是双向同步。子组件通过 `$` 传入父组件状态，并直接参与同一个状态来源的读写；适合开关、步进器、筛选条件这类由子组件负责交互、父组件负责持有的值。双向并不等于到处都用：如果子组件只能展示，`@Prop` 更能保留边界。

```ts
@Component
struct Summary {
  @Prop title: string

  build() {
    Text(this.title)
  }
}

@Component
struct SwitchRow {
  @Link enabled: boolean

  build() {
    Toggle({ type: ToggleType.Switch, isOn: this.enabled })
      .onChange((value: boolean) => {
        this.enabled = value
      })
  }
}

@Entry
@Component
struct SettingsPage {
  @State notificationsEnabled: boolean = true
  @State pageTitle: string = '消息设置'

  build() {
    Column() {
      Summary({ title: this.pageTitle })
      SwitchRow({ enabled: this.$notificationsEnabled })
    }
  }
}
```

这里有一个很实用的审查问题：子组件如果把这次修改删掉，父组件的业务状态是否还应变化？若答案是“应当”，`@Link` 是合理候选；若答案是“不应当，只有点保存才变化”，应使用 `@Prop` 加显式回调，或把编辑草稿放在子组件 `@State` 中。同步方向是接口语义，不是减少代码量的技巧。

对象作为 `@Prop` 传递时尤其要谨慎。“单向”描述的是源到子变量的同步方向，不等于可变对象一定彻底隔离；值类型、引用类型和嵌套属性的行为需要用当前 SDK 的规则和测试确认。若组件需要编辑一份独立草稿，最清晰的做法通常是将输入映射为专门的草稿模型，在“保存”时把变化组织成一个明确的输出，而不是依赖对象引用的偶然共享。这样取消、校验和脏数据提示也有放置的位置。

## 对象先可观察，再谈对象链接

基本类型的边界相对直观，对象和数组才是 V1 中常见的误区。`@State task: Task` 只解决了状态变量的拥有关系；对象内部属性发生变化时，还需要对象类具备可观察性，子组件也需要以合适方式订阅那个对象。

`@Observed` 修饰类，`@ObjectLink` 修饰子组件接收的该类实例。二者配合适合列表项、嵌套模型等需要让子组件修改对象属性并同步回父组件的情形。`@ObjectLink` 接收的是 `@Observed` 类实例，不能在子组件本地初始化，也不能整体重新赋值；可以修改其成员属性。需要替换整个对象时，应由拥有对象的父组件完成。

```ts
@Observed
class Task {
  title: string
  completed: boolean

  constructor(title: string, completed: boolean) {
    this.title = title
    this.completed = completed
  }
}

@Component
struct TaskRow {
  @ObjectLink task: Task

  build() {
    Row() {
      Toggle({ type: ToggleType.Checkbox, isOn: this.task.completed })
        .onChange((value: boolean) => {
          this.task.completed = value
        })
      Text(this.task.title)
        .decoration({ type: this.task.completed ? TextDecorationType.LineThrough : TextDecorationType.None })
    }
  }
}

@Entry
@Component
struct TaskPage {
  @State currentTask: Task = new Task('整理本周任务', false)

  build() {
    Column() {
      TaskRow({ task: this.currentTask })
      Button('替换任务').onClick(() => {
        this.currentTask = new Task('复查发布清单', false)
      })
    }
  }
}
```

这段代码刻意区分了“改属性”和“换引用”。`TaskRow` 能改 `this.task.completed`，但不应写 `this.task = new Task(...)`；后者会破坏链接规则。父组件拥有 `currentTask`，因此只有它可以替换整项。对于数组，稳定的 `ForEach` 键同样重要：索引会随着插入、删除改变，应该使用业务上稳定的 ID，使框架能把状态与正确的行对应起来。

## V1 的观察边界要提前画出来

V1 对对象的观察不是无限递归的。对象中的嵌套对象、数组项或类属性若还要继续被追踪，通常需要它们各自成为 `@Observed` 类，并通过对应层级的自定义组件和 `@ObjectLink` 把观察链继续向下传。只给最外层模型加 `@Observed`，再直接修改很深的 `a.b.c`，很容易得到“数据已经变了，界面没有变”的结果。

这也是拆分行组件的理由之一。它不只是让 `build()` 短一些，更是在数据层级与 UI 订阅层级之间建立一一对应关系。外层页面负责集合和替换，行组件负责一个对象，嵌套子组件负责对象里的嵌套对象。遇到深层数据时，先问“哪个组件读取了哪个对象的哪一层”，再决定装饰器，而不是期待一次传递覆盖所有层级。

还有两个常被忽略的边界。第一，`@Observed` 单独使用不会让任意位置都自动刷新，它需要与 `@ObjectLink` 或相应的状态传递关系一起形成可观察链。第二，状态变量不等于数据仓库：跨页面、跨组件树共享的数据应另行评估 V1 的应用级状态机制，而不是把大量全局内容层层用 `@Link` 传递。

## 一份落地前检查清单

在给变量加装饰器前，可以按下面的顺序检查：

1. 这个值由哪个组件创建、复位和销毁？归属组件优先使用 `@State`。
2. 子组件是只读、维护本地草稿，还是应直接改变父状态？分别倾向普通参数/`@Prop`、子组件 `@State` 加回调、`@Link`。
3. 传递的是基本值还是可变对象？对象内部属性需要响应时，准备 `@Observed` 类与 `@ObjectLink` 的配合。
4. 修改是改对象属性还是替换对象引用？前者可在对象链接组件中完成，后者回到拥有该引用的父组件。
5. 数据是否跨越组件树边界？若是，先设计应用级状态的生命周期和命名空间，而不是继续增加多层双向链接。

状态管理 V1 的核心并不是记住更多装饰器，而是把数据流画得足够窄：拥有者负责引用和生命周期，展示组件只接收所需输入，交互组件才获得明确的写权限，对象观察在每一层都被显式建立。这样即便后续模型增长，问题也更容易被定位在“归属、方向、层级”三者之一。

## 参考资料

- [OpenHarmony：状态管理概述（V1）](https://gitee.com/openharmony/docs/blob/1f9cdbf8db2cd709bd312c1e3525b2ba21361fd9/zh-cn/application-dev/quick-start/arkts-state-management-overview.md)
- [OpenHarmony：@State 装饰器](https://gitee.com/openharmony/docs/blob/1dc9dc5f5385ecc7e6fabb522309ec319fded139/en/application-dev/quick-start/arkts-state.md)
- [OpenHarmony：@Link 装饰器](https://gitee.com/openharmony/docs/blob/c31b855c8a9f4b12eb528b29e4883196895b6e67/zh-cn/application-dev/quick-start/arkts-link.md)
- [OpenHarmony：@Prop 装饰器](https://gitee.com/openharmony/docs/blob/50c1524f1f183e230e7f48865556357225743a6b/en/application-dev/quick-start/arkts-prop.md)
- [OpenHarmony：@Observed 与 @ObjectLink](https://gitee.com/openharmony/docs/blob/78506da4a7b64366c26658febcf3f6fad81890fe/zh-cn/application-dev/quick-start/arkts-observed-and-objectlink.md)
