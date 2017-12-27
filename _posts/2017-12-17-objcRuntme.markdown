---
layout:         post
title:          objcRuntime小记
subtitle:       runtime学习
card-image:
date:           2017-12-25
tags:           objc
post-card-type: article
---
最近在学习objc的底层runtime知识，学到这块时就做个小笔记，做个总结，归纳。刚好最近也搭建了自己的GitHub博客，就以此作为个人博客的开篇吧

### objc函数调用总结
> Objective-C是动态语言，编译时并不决定函数的调用，通俗的讲，所有的类型声明都是给编译器看的。OC的函数调用实际上就是向一个objc对象(或者Class)**发消息**，发消息实际上就是沿着它的isa指针寻找真正的函数地址

runtime中声明了id和Class的类型，简化如下
```
struct objc_class {
    struct objc_class *isa;
};
struct objc_object {
    struct objc_class *isa;
};
 
typedef struct objc_class *Class; //类  (class object)
typedef struct objc_object *id;   //对象 (instance of class)
```

在objc中，id代表了一个对象。凡是首地址是*isa的结构体指针，都可以被认为是objc的对象。运行时通过isa指针，可以查找到该对象是属于什么类
只要一个对象满足下面的结构，就可以对它发消息
```
struct objc_object {
    Class isa;
} *id
```
##### runtime的运行机制
> 我们可以通过clang来重写一个类查看cpp代码
```
clang -rewrite-objc ClassName.m
```

```
//class的实际结构
struct _class_t {
	struct _class_t *isa;        //isa指针
	struct _class_t *superclass; //父类
	void *cache;
	void *vtable;
	struct _class_ro_t *ro;     //Class包含的信息
};

//Class包含的信息
struct _class_ro_t {
	unsigned int flags;
	unsigned int instanceStart;
	unsigned int instanceSize;
	unsigned int reserved;
	const unsigned char *ivarLayout;
	const char *name; //类名
	const struct _method_list_t *baseMethods; //方法列表
	const struct _objc_protocol_list *baseProtocols;  //协议列表
	const struct _ivar_list_t *ivars; //ivar列表
	const unsigned char *weakIvarLayout;
	const struct _prop_list_t *properties; //属性列表
};

//Person(meta-class)
struct _class_t OBJC_METACLASS_$_Person  = {
	.isa        = &OBJC_METACLASS_$_NSObject,
	.superclass = &OBJC_METACLASS_$_NSObject,
	.cache      = (void *)&_objc_empty_cache,
	.vtable     = (void *)&_objc_empty_vtable,
	.ro         = &_OBJC_METACLASS_RO_$_Person, //包含了类方法等
};
 
//Person(Class)
struct _class_t OBJC_CLASS_$_Person = {
	.isa        = &OBJC_METACLASS_$_Person,   //此处isa指向meta-class
	.superclass = &OBJC_CLASS_$_NSObject,
	.superclass = (void *)&_objc_empty_cache,
	.vtable     = (void *)&_objc_empty_vtable,
	.ro         = &_OBJC_CLASS_RO_$_Person,   //包含了实例方法 ivar信息等
};
typedef struct objc_object Person;   //定义NyanCat类型

```
所有实例的isa都指向了Class，Class是一个全局变量，其中记录了类名，成员变量，property信息，实例方法列表，协议列表

```
Person *jack = [Person alloc] init];
[jack walk];
```
向jack(instance)发送walk消息时，运行时会通过isa指针查找到Person(class)，Class中保存着本类中定义的实例方法的指针
```
[Person eat];
```
向Person发送eat消息时，runtime会通过isa查找到Person(meta-class),这里保存本类定义的类方法的指针

obj_msgSend()实际上是找到这个函数指针，然后调用它

