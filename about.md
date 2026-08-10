---
layout: page
title: 关于
permalink: /about/
page_class: about-page
---

<section class="about-intro">
  <img src="/images/jack-avatar.png" alt="Jack Hu" class="about-avatar">
  <div>
    <p class="about-kicker">你好，我是 Jack Hu。</p>
    <p>我长期关注软件工程、投资方法、阅读与知识管理，用写作把零散经验整理成可以复用、验证和继续迭代的知识。</p>
    <div class="about-topics"><span>软件工程</span><span>投资方法</span><span>阅读思考</span><span>知识管理</span></div>
  </div>
</section>

<section class="about-stats" aria-label="站点数据">
  <div><strong>{{ site.posts | size }}</strong><span>篇博客文章</span></div>
  <div><strong>{{ site.tags | size }}</strong><span>个内容标签</span></div>
  <div><strong>2</strong><span>条知识库主线</span></div>
  <div><strong>{{ site.data.tools | size }}</strong><span>个本地工具</span></div>
</section>

<section class="about-focus">
  <div class="section-heading"><div><span class="eyebrow">What I explore</span><h2>我在持续整理什么</h2></div></div>
  <div class="about-focus__grid">
    <article><span class="material-symbols-rounded">terminal</span><h3>技术工程</h3><p>客户端、前端、性能、稳定性与工程化实践。</p></article>
    <article><span class="material-symbols-rounded">query_stats</span><h3>投资方法</h3><p>财报阅读、宏观框架、资产配置与风险管理。</p></article>
    <article><span class="material-symbols-rounded">menu_book</span><h3>阅读与思考</h3><p>把阅读输入转化为判断模型和长期可用的笔记。</p></article>
    <article><span class="material-symbols-rounded">construction</span><h3>实用工具</h3><p>把高频的小计算和文本处理做成打开即用的工具。</p></article>
  </div>
</section>

<section class="about-principles">
  <article><span>01</span><h2>把问题讲清楚</h2><p>先定义问题，再讨论方法；把适用边界和失效条件一起写出来。</p></article>
  <article><span>02</span><h2>让经验可复用</h2><p>不止记录结论，也保留推导、检查清单和验证方式。</p></article>
  <article><span>03</span><h2>保持跨界好奇</h2><p>技术、投资、阅读与生活并非孤岛，它们共同训练判断与行动。</p></article>
</section>

<section class="about-guide">
  <div><span class="eyebrow">Explore the site</span><h2>如何使用这个网站</h2><p>从最近文章获得灵感，沿标签和归档回看主题；需要系统学习时进入知识库，需要快速处理问题时打开工具箱。</p></div>
  <nav aria-label="网站主要入口"><a href="/"><span class="material-symbols-rounded">article</span><strong>最新文章</strong><small>最近的实践与思考</small></a><a href="/archive/"><span class="material-symbols-rounded">calendar_month</span><strong>时间归档</strong><small>按年份回看记录</small></a><a href="https://www.sohod.cn/book/"><span class="material-symbols-rounded">auto_stories</span><strong>知识库</strong><small>沿专题系统探索</small></a><a href="/tools/"><span class="material-symbols-rounded">construction</span><strong>工具箱</strong><small>本地运行的实用工具</small></a></nav>
</section>

<section class="about-site-note">
  <div><span class="eyebrow">About this site</span><h2>关于这个网站</h2></div>
  <p>博客使用 Jekyll，知识库使用 GitBook，静态页面托管在 GitHub Pages。工具全部在浏览器本地运行，不上传输入内容，也不保存计算数据。</p>
  <div class="about-contact"><a href="https://github.com/AndreHu88"><span class="material-symbols-rounded">code</span>GitHub</a><a href="mailto:huyong229@163.com"><span class="material-symbols-rounded">mail</span>Email</a></div>
</section>

<section class="about-cta">
  <h2>从最近的思考开始</h2>
  <p>阅读最新文章，进入知识库系统探索，或打开工具箱解决一个具体问题。</p>
  <div><a class="button button--primary" href="/">最新文章</a><a class="button button--ghost" href="/tools/">打开工具箱</a></div>
</section>
