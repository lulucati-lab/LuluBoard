import { BoardDialog } from "./BoardDialog";
import { version } from "../../desktop/package.json";

export function BoardAbout({ onClose }: { onClose: () => void }) {
  return (
    <BoardDialog title="关于画布" onClose={onClose}>
      <div className="board-about-content">
        <div className="board-about-brand">
          <img src="/board-logo.png" alt="画板 Logo" width={56} height={56} />
          <div>
            <strong>LuluBoard · 画板</strong>
            <span>{version} · by lulucati</span>
          </div>
        </div>
        <section>
          <h3>为知识分享而设计</h3>
          <p>
            画板由 lulucati 为自媒体创作者而整理，尤其面向知识付费、干货分享、
            短视频编导和 AI
            类博主。希望把选题思路、知识框架和讲解内容放到一张画布上，
            帮助创作者把内容理清楚，也让观众更容易看懂。
          </p>
        </section>
        <section>
          <h3>我们做了哪些设计与调整</h3>
          <ul>
            <li>
              <strong>常用素材，随取随用。</strong>
              整理适合创作与讲解的常用素材，支持拖到画布指定位置；
              自己画好的文字、图形和组合也能拖入个人素材库，反复复用，并支持右键删除。
            </li>
            <li>
              <strong>用主页管理内容。</strong>
              增加画布主页，通过文件夹、缩略图、搜索和排序整理选题与系列内容，
              支持改名、复制、导入和回收站，方便继续上次创作。
            </li>
            <li>
              <strong>创作与演示，轻松切换。</strong>
              点击眼镜按钮进入查看模式，隐藏画布标题和底部控件；
              中间工具栏向上收起，鼠标移到顶部再展开，让讲解和录屏的画面更干净。
            </li>
            <li>
              <strong>减少操作干扰。</strong>
              将常用工具集中在顶部，精简保存、导出、分享及外链等显眼入口，
              保留文字与绘图能力，让注意力更多放在内容表达上。
            </li>
            <li>
              <strong>自动保存，安心继续。</strong>
              编辑内容自动保存到本机，配合历史版本与回收站，方便回看和恢复，
              减少创作过程中手动保存的打断。
            </li>
          </ul>
        </section>
        <section>
          <h3>开源来源与致谢</h3>
          <p>本应用基于以下项目开发，感谢原作者与社区贡献者：</p>
          <ul>
            <li>Excalidraw · 原始绘图引擎与编辑器</li>
            <li>hulkbig/excalidraw-zh · 本版本采用的中文项目基础</li>
            <li>chenxuan520/excalidraw · 部分扩展功能来源</li>
          </ul>
        </section>
        <section>
          <h3>版本说明与署名</h3>
          <p>
            本版本的画布管理、本地保存流程、界面调整与功能整合由 lulucati
            整理维护。lulucati 为本版本作者署名及全平台名称。
          </p>
          <p>
            本应用是独立衍生版本，并非上述开源项目的官方发布版本。原有代码及第三方资源的版权归各自权利人所有。
          </p>
          <p>
            作者主页：
            <a
              href="https://github.com/lulucati-lab"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/lulucati-lab
            </a>
            。全平台名称：lulucati。
          </p>
          <p>
            本版本增加本地目录设置、主题切换、完整备份与副本恢复。首次使用不预置示例画布或业务文件夹。
          </p>
          <p>
            源代码与安装包按相同版本发布；源码包包含构建说明、上游许可及第三方资源署名。
            <br />
            <a
              href="https://github.com/lulucati-lab/LuluBoard"
              target="_blank"
              rel="noopener noreferrer"
            >
              项目源码：lulucati-lab/LuluBoard
            </a>
          </p>
        </section>
        <section>
          <h3>许可声明</h3>
          <p>
            本项目保留上游 MIT
            许可证及原版权声明。复制、修改或分发相关代码时，请一并保留对应声明与许可。第三方素材、字体及依赖分别遵循各自许可证。
          </p>
          <p>
            软件按“现状”提供，不附带适销性、特定用途适用性等担保，具体以许可原文为准。
          </p>
          <div className="board-about-links">
            <a
              href="/licenses/excalidraw-MIT.txt"
              target="_blank"
              rel="noopener noreferrer"
            >
              MIT 许可原文
            </a>
            <a
              href="/licenses/NOTICE.txt"
              target="_blank"
              rel="noopener noreferrer"
            >
              资源来源与署名
            </a>
          </div>
        </section>
        <div className="board-about-signature">lulucati · 画板</div>
      </div>
    </BoardDialog>
  );
}
