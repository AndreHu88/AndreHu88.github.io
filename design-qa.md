# Design QA · 第三轮

## Evidence

- Source visual truth: `/Users/huyong/.codex/generated_images/019feae7-1e03-7f03-ba1c-3f07a2de45eb/exec-399fdb37-ed9d-422c-8bf4-7e2fce6c8982.png`
- Browser-rendered home: `/Users/huyong/Desktop/blog/.design-qa/round2-home-desktop.png`
- Side-by-side comparison: `/Users/huyong/Desktop/blog/.design-qa/round2-home-comparison.png`
- Current navigation and cover comparison: `/Users/huyong/Desktop/blog/.design-qa/nav-cover-comparison-desktop.png`
- Current implementation evidence: `/Users/huyong/Desktop/blog/.design-qa/nav-cover-after-desktop.png`, `/Users/huyong/Desktop/blog/.design-qa/nav-cover-after-mobile.png`, `/Users/huyong/Desktop/blog/.design-qa/timestamp-now-after.png`, `/Users/huyong/Desktop/blog/.design-qa/book-flat-nav-after.png`
- Browser annotation comparison: `/Users/huyong/Desktop/blog/.design-qa/about-annotation-comparison.png`
- Browser annotation before/after: `/Users/huyong/Desktop/blog/.design-qa/about-annotation-before.png`, `/Users/huyong/Desktop/blog/.design-qa/about-annotation-after.png`; narrow-screen follow-up: `/Users/huyong/Desktop/blog/.design-qa/about-annotation-mobile-390.png`
- Focused desktop evidence: `/Users/huyong/Desktop/blog/.design-qa/round2-tools-desktop.png`, `/Users/huyong/Desktop/blog/.design-qa/round2-mortgage-desktop.png`, `/Users/huyong/Desktop/blog/.design-qa/round2-about-desktop.png`, `/Users/huyong/Desktop/blog/.design-qa/round2-book-desktop.png`
- Responsive evidence: `/Users/huyong/Desktop/blog/.design-qa/round2-home-mobile.png`, `/Users/huyong/Desktop/blog/.design-qa/round2-tools-mobile.png`, `/Users/huyong/Desktop/blog/.design-qa/round2-mortgage-mobile.png`, `/Users/huyong/Desktop/blog/.design-qa/round2-about-mobile.png`, `/Users/huyong/Desktop/blog/.design-qa/round2-book-mobile-menu.png`
- Desktop viewport: 1440 × 1024 CSS px, device scale factor 1
- Mobile viewport: 390 × 844 CSS px, device scale factor 1
- Source pixels: 1487 × 1058; normalized by centered crop to 1440 × 1024
- Implementation pixels: 1440 × 1024 desktop and 390 × 844 mobile
- State: light theme; home, tools, about, mortgage and knowledge routes; default, open-navigation and populated-result states

## Findings

- No actionable P0, P1, or P2 issue remains.
- Fonts and typography: editorial serif display type and restrained sans-serif UI copy remain consistent with the selected blue-violet direction. Chinese headings, labels, form copy and long financial values wrap without clipping at both breakpoints.
- Spacing and layout rhythm: the hero keeps the source proportions. The first article is intentionally no longer enlarged; the approved second-round requirement replaces the source masonry emphasis with three equal desktop cards, two tablet cards and one mobile column. Tool panels, about sections and GitBook navigation preserve a consistent radius and spacing scale.
- Colors and visual tokens: the blue-violet action system, pale atmospheric surfaces, subtle borders and green privacy state are consistent across blog, tools and knowledge pages with readable contrast.
- Image quality and asset fidelity: visible hero and article art uses the existing generated raster assets with stable crops. No placeholder artwork or code-drawn replacement was introduced.
- Copy and content: location information is removed. About content now uses non-private professional themes, real Jekyll article/tag counts, site guidance and existing public contact routes.
- Interaction and affordance: article cards use explicit title, media and “阅读全文” links with keyboard focus rings. Tool results use `aria-live`, visible errors, copy/reset feedback and a mobile single-column layout.
- Annotation follow-up: the low-resolution script logo has been replaced by the site's existing public GitHub avatar, stored locally at 460 × 460. The about CTA now renders white, non-underlined primary text against its blue-violet fill. Weibo has been removed from both the about contacts and footer; GitHub and email remain.
- Navigation and cover follow-up: the former article drawer is replaced by six direct top-level links in both Jekyll and GitBook. Active state now follows the current route and exposes `aria-current="page"`; knowledge is highlighted only inside GitBook. At 1440 px the navigation and search control do not overlap; the blog switches at 1100 px and GitBook at 1080 px. All 47 paginated cards resolve to local raster covers with the established crop and color direction.

## Focused Region Comparison

- Home comparison keeps header, hero, primary actions and the equal-card first row readable in one 2880 × 1024 side-by-side image.
- Mortgage evidence checks the densest form/result layout, numeric hierarchy, two repayment-method cards and collapsed monthly schedule.
- About evidence checks the profile narrative, generated counts, four content directions and mobile stacking.
- Tool-center and GitBook evidence check navigation consistency and information density; these routes do not exist in the source mock, so they were evaluated against the established tokens rather than claimed as pixel-identical source regions.
- The current 2960 × 1024 comparison places the previous 1440 × 1024 home capture beside the revised home. The hero, typography, spacing and tokens remain unchanged; the deliberate differences are the flattened header links and tag-derived first-card cover.

## Primary Interactions Tested

- All 12 tool routes render; representative browser checks cover every calculation family, plus invalid Base64, URL and JSON input.
- Unicode Base64 encode/decode, swap, copy and reset work; copy reports a visible success state.
- Text statistics update live. SHA-256 for `abc` matches the standard vector. Color conversion renders HEX/RGB/HSL and a real color preview.
- Date interval handles month-end dates. Mortgage comparison produces 360 merged rows for mixed terms. Compound interest, loss CAGR and beginning-period recurring investment return results.
- Blog search and GitBook search both return “房贷计算器” with source “工具”.
- Desktop and mobile navigation expose “最新文章、时间归档、全部标签、工具、知识库、关于” without drawer nodes. Blog and GitBook both switch to their mobile menu before links can overlap.
- Active-state checks return “最新文章” on the home route, “工具” on `/tools/timestamp/` and “知识库” under `/book/`; each is the sole `aria-current="page"` link in its navigation.
- With the timestamp field empty, “使用当前时间” fills a millisecond timestamp, renders seconds, milliseconds, local time and ISO UTC, and updates again on a second click without native validation errors.
- Built pagination contains 20, 20 and 7 article cards; each page contains the same number of image covers and no icon-only placeholder.
- Console errors and warnings checked after interaction passes: none.

## Comparison History

1. Round-one browser comparison fixed the article-popover pointer/click state conflict and retained deterministic click, outside-click and Escape behavior.
2. Round-two first implementation intentionally replaced the oversized leading article with equal cards per the approved plan; the post-change home capture confirms balanced first-row density and explicit links.
3. Round-two browser interaction pass found a P2 native-validation issue: `min="0.01"` and `step="0.25"` made common integer-year inputs such as 10 invalid for compound and recurring-investment forms. Both inputs now use a matching 0.25-year base; post-fix browser evidence returns correct populated result cards.
4. Boundary review found month-end calendar drift in the year-month-day interval. Date arithmetic now clamps month anniversaries; `2026-01-31` to `2026-02-28` reports `1 个月 0 天` and is covered by Node and browser checks.
5. Final review found missing per-tool document titles and insufficient live validation feedback. Tool titles/descriptions now derive from `_data/tools.yml`; native range checks plus JSON, color and cross-date checks report through an accessible live status. Current mortgage evidence shows the post-fix result state.
6. Browser annotations identified a blurred avatar, unreadable CTA label and obsolete Weibo routes. The post-fix 694 × 862 browser pass confirms a 460 × 460 local avatar, computed CTA text color `rgb(255, 255, 255)` with no underline, exactly two about contact links (GitHub and Email), two footer social links (Email and GitHub), and no console errors. A second 390 × 844 pass reports a 390 px document width with no horizontal overflow and no visible Weibo route.
7. Third-round feedback classified the article drawer as redundant. The drawer markup, event handling and styling were removed; its three destinations now sit beside the existing primary routes. Browser checks at 1440, 1101/1099 and 390 px show no overlap or horizontal overflow, and GitBook repeats the same successful check at 1081/1079 px.
8. The timestamp “current time” action was blocked by the required input before the submit handler could run. The action now bypasses native validation and the post-fix browser capture confirms immediate populated results with no console error.
9. Only four of twenty first-page cards previously rendered raster covers. Tag-driven local cover selection now produces 20/20, 20/20 and 7/7 image cards across all pagination pages; visual inspection found no actionable crop, sharpness or contrast issue.
10. Post-implementation review found a P1 stale `setArticleMenu` call in the Escape handler after the drawer function was removed. The handler now closes only the remaining mobile navigation state; a browser Escape check produces no console error.
11. User follow-up found the knowledge link was permanently highlighted. The permanent presentation class was removed and Jekyll active state now derives from the route; post-fix captures verify home, tool and GitBook highlighting independently on desktop and mobile.

## Follow-up Polish

- P3: self-host the two web font families later if fully offline visual parity becomes a requirement.
- P3: the legacy GitBook anchor-navigation plugin still emits its pre-existing configuration-version warning; GitBook generation completes successfully.

final result: passed
