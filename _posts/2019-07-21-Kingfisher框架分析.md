---
layout:         post
title:          Kingfisher框架分析
date:           2019-07-21
tags:           [iOS, Swift]
categories:
comments: false
---

# Kingfisher框架的内部实现解读
Kingfisher 是由 onevcat 编写的用于下载和缓存网络图片的轻量级Swift工具库，其中涉及到了包括GCD、Swift高级语法、缓存、硬盘读写、网络编程、图像编码、图形绘制、Gif数据生成和处理、MD5、Associated Objects的使用等大量iOS开发知识

## 一、Kingfisher的架构
![](https://user-gold-cdn.xitu.io/2016/11/30/8a440adc43cd3da2b46c16f9ffb8c087)

UIImage+Extension 文件内部对 UIImage 以及 NSData 进行了拓展, 包含判定图片类型、图片解码以及Gif数据处理等操作。

String+MD5 负责图片缓存时对文件名进行MD5加密操作。

ImageCache 主要负责将加载过的图片缓存至本地。

ImageDownloader 负责下载网络图片。

KingfisherOptions 内含配置 Kingfisher 行为的部分参数，包括是否设置下载低优先级、是否强制刷新、是否仅缓存至内存、是否允许图像后台解码等设置。

Resource 中的 Resource 结构体记录了图片的下载地址和缓存Key。

ImageTransition 文件中的动画效果将在使用 UIImageView 的拓展 API 时被采用，其底层为UIViewAnimationOptions，此外你也可以自己传入相应地动画操作、完成闭包来配置自己的动画效果。

ThreadHelper 中的dispatch_async_safely_main_queue 函数接受一个闭包，利用 NSThread.isMainThread 判定并将其放置在主线程中执行。

KingfisherManager 是 Kingfisher 的主控制类，整合了图片下载及缓存操作。

KingfisherOptionsInfoItem 被提供给开发者对 Kingfisher 的各种行为进行控制，包含下载设置、缓存设置、动画设置以及 KingfisherOptions 中的全部配置参数。

UIImage+Kingfisher 以及 UIButton+Kingfisher 对 UIImageView 和 UIButton 进行了拓展，即主要用于提供 Kingfisher 的外部接口。

## 二、 Kingfisher的入口

我们在使用Kingfisher时，是这样调用的
```
imageView.kf.setImage(with: URL(string: imageUrl), placeholder: UIImage(named: "img_default_medium"))
```

kf是kingfisher.swift中 对UIImageView和UIButton的extension中都实现了KingfisherCompatible的Protocol， Protocol中定义了kf变量，用来标识当前的调用类型
```
/**
 A type that has Kingfisher extensions.
 */
public protocol KingfisherCompatible {

    associatedtype CompatibleType

    var kf: Self.CompatibleType { get }
}

extension KingfisherCompatible {

    public var kf: Kingfisher.Kingfisher<Self> { get }
}

extension ImageView: KingfisherCompatible { }
extension Button: KingfisherCompatible { }
```

在UIImageView和UIButton的extension中有以上方法，供外部使用的API，快速设置网络图片，我们看到传入的的是`Resource`类型

```
public func setImage(with resource: Resource?,
                         placeholder: Placeholder? = nil,
                         options: KingfisherOptionsInfo? = nil,
                         progressBlock: DownloadProgressBlock? = nil,
                         completionHandler: CompletionHandler? = nil) -> RetrieveImageTask
```
可以看到Resource是一个Protocol, 在Protocol中定义了URL和cacheKey, 在URL的extension中实现了Resource协议，所以我们只需传入URL对象即可
```
public protocol Resource {
    /// The key used in cache.
    var cacheKey: String { get }
    
    /// The target image URL.
    var downloadURL: URL { get }
}

extension URL: Resource {
    public var cacheKey: String { return absoluteString }
    public var downloadURL: URL { return self }
}
```

## 三、具体分析Kingfisher的工作原理
先判断Resource是否为空， 如果为空，直接return RetrieveImageTask.empty
```
 public func setImage(with resource: Resource?,
                         placeholder: Placeholder? = nil,
                         options: KingfisherOptionsInfo? = nil,
                         progressBlock: DownloadProgressBlock? = nil,
                         completionHandler: CompletionHandler? = nil) -> RetrieveImageTask
    {
        guard let resource = resource else {
            self.placeholder = placeholder
            setWebURL(nil)
            completionHandler?(nil, nil, .none, nil)
            return .empty
        }
}

```
我们来具体看Kingfisher的对于一张未下载图片的工作流
```
// 1. UIView的Extension，提供API调用
func setImage(with resource: Resource?,
                         placeholder: Placeholder? = nil,
                         options: KingfisherOptionsInfo? = nil,
                         progressBlock: DownloadProgressBlock? = nil,
                         completionHandler: CompletionHandler? = nil) -> RetrieveImageTask
                
                         
// 2. 尝试从缓存中获取Image            
func retrieveImage(with resource: Resource,
        options: KingfisherOptionsInfo?,
        progressBlock: DownloadProgressBlock?,
        completionHandler: CompletionHandler?) -> RetrieveImageTask
        
// 3. 创建ImageDownloader，来下载Image
func downloadAndCacheImage(with url: URL,
                             forKey key: String,
                      retrieveImageTask: RetrieveImageTask,
                          progressBlock: DownloadProgressBlock?,
                      completionHandler: CompletionHandler?,
                                options: KingfisherOptionsInfo) -> RetrieveImageDownloadTask?
          
// 4. Download                               
open func downloadImage(with url: URL,
                       retrieveImageTask: RetrieveImageTask? = nil,
                       options: KingfisherOptionsInfo? = nil,
                       progressBlock: ImageDownloaderProgressBlock? = nil,
                       completionHandler: ImageDownloaderCompletionHandler? = nil) -> RetrieveImageDownloadTask?

```


下载的核心流程, 来自`ImageDownloader`

```
// 1. 
 var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)  
 
// 2. ImageDownloader内部 创建了多个队列
barrierQueue = DispatchQueue(label: "com.onevcat.Kingfisher.ImageDownloader.Barrier.\(name)", attributes: .concurrent)

processQueue = DispatchQueue(label: "com.onevcat.Kingfisher.ImageDownloader.Process.\(name)", attributes: .concurrent)

cancelQueue = DispatchQueue(label: "com.onevcat.Kingfisher.ImageDownloader.Cancel.\(name)")                 

```






