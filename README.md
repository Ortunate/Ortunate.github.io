# ortunate · Personal Space

英文深空个人网站，使用 Astro、TypeScript、Three.js。工具与游戏在浏览器运行，适合 GitHub Pages，无需服务器。

## 本地运行

安装 Node.js 24 LTS 或更新版本，然后在项目目录运行：

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。首页 3D 模块延迟加载；网络字体不可用时会使用系统字体。

```sh
npm test
npm run build
npm run preview
```

`dist/` 是构建完成的静态网站，不必提交生成文件。请通过本地 HTTP 服务预览，不要双击 HTML。

## 发布到 GitHub Pages

1. 在 GitHub 账号 `ortunate` 下创建公开仓库 **ortunate.github.io**。如果仓库已存在，先保留其中需要的文件和历史，再合入本站源码。
2. 将本项目源码（包括 `.github/workflows/deploy.yml` 和 `package-lock.json`，不包括 `node_modules`）提交并推送到该仓库的 `main` 分支。
3. 在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
4. 打开 **Actions**，等待 **Deploy to GitHub Pages** 完成；必要时点击 **Run workflow** 手动运行。
5. 访问 `https://ortunate.github.io/`，以及 `/projects/`、`/tools/`、`/play/`、`/about/`。

无需填写密钥，工作流使用 GitHub 自带的权限。此项目按用户根域名配置，仓库名必须是 `ortunate.github.io`；如果改用普通项目仓库，需要同时配置 Astro 的 `base` 并更新以 `/` 开头的链接和资源地址。

## 替换个人内容

- `src/data/site.ts`：昵称、简介、GitHub 链接、兴趣和作品列表。`demo` 标记为演示作品。作品链接应是真实可用的网址或本站页面，不使用 `#` 占位。
- `src/pages/index.astro`：首页标题、副标题和分区文案。
- `src/pages/about.astro`：个人介绍的布局及补充内容。
- `src/styles/global.css`：配色、字体、布局和动效；主要颜色集中在文件顶部变量中。
- `src/scripts/scene.ts`：首页轨道、粒子和辉光。
- `public/favicon.svg`：网站图标。

添加新页面时，在 `src/pages/` 添加 `.astro` 文件，并将导航加入 `src/layouts/Layout.astro`。所有分页构建为独立目录 HTML，支持直接访问和刷新。

## 使用说明

- 页脚 **Motion** 切换完整/减少动效，首次访问遵循系统偏好。不支持 WebGL 时显示静态轨道。切换后台会停止场景渲染。
- 番茄钟默认 25/5 分钟，专注时长支持 1–180 分钟，休息支持 1–60 分钟。切换阶段会重置当前倒计时；完成后由你手动开始下一阶段。
- JSON 支持格式化、压缩、复制；输入上限为 200 万字符，原始文本不会上传或持久化。
- 字数统计区分英文单词、中文字符，字符数按 Unicode 码点计数，空白包含换行。
- 贪吃蛇支持方向键、WASD、滑动和方向按钮，空格暂停；切换后台自动暂停。
- 2048 支持方向键、滑动和方向按钮，自动保存棋盘。New game 会开始新棋盘并保留最高分。
- 偏好、计时器与分数仅保存在当前浏览器。清理浏览器数据会清除这些记录；禁用存储时仍可使用，页面会提示无法保存。

## 验证

`npm test` 覆盖合并、移动、生成方块、游戏结束、贪吃蛇碰撞及吃食物、计时器暂停和后台时间、文本统计。`npm run build` 执行 Astro/TypeScript 检查并生成所有静态页面。

手动验收：手机和桌面布局、键盘导航、触控手势、减少动效、关闭 WebGL、禁用存储、剪贴板拒绝、分页刷新、两款游戏结束/重开/恢复。
