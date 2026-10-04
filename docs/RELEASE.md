# 发布流程

## 版本与平台

首发版本 `0.1.0-beta.1`，Windows x64 NSIS 安装包。macOS ARM64/x64、Windows ARM64 和 Linux 待对应环境验证后再发布，不能将交叉编译视作已测试。

## 构建与验收

1. 按 README 安装锁定依赖并构建桌面版。
2. 在临时用户配置中运行 `scripts/check-desktop.cjs`，验证空白工作区、素材、关闭保存与重启。
3. 验证真实安装包的安装、启动、覆盖升级和卸载保留数据。
4. 核对 About 版本、作者地址、README 与 CHANGELOG；审计源码包和安装白名单，不含个人画布、日志和凭据。
5. 执行 `node scripts/release-artifacts.cjs` 生成源码 ZIP 与 SHA256。源代码包括完整构建工程，排除已不使用且缺少再分发许可的旧 Yutong 字体文件。
6. 在自己的 GitHub 仓库创建草稿预发布，上传安装包、源码 ZIP、SHA256 和发布说明。确认资源齐全后公开。

本地 upstream origin 指向原作者仓库，不可推送我们的发行内容到该地址。发布仓库为 https://github.com/lulucati-lab/LuluBoard ，源码以清理后的独立快照发布，保留上游来源与许可。

## 发布说明模板

LuluBoard · 画板 0.1.0-beta.1，由 lulucati 整理维护。面向知识创作者的本地画布，包含主页管理、205 项本地素材、个人素材收藏、查看模式、本地主题与备份。

安装 `LuluBoard-0.1.0-beta.1-windows-x64-setup.exe`。无需安装 Node.js。首次启动无预置画布。旧浏览器用户先导出 `.boardbackup`，再在桌面版恢复。

本版本未签名，属于测试版。数据默认存于用户目录，升级前建议完整备份。详情见使用指南和 CHANGELOG。源码与版本同步发布，保留上游 MIT 和第三方声明。
