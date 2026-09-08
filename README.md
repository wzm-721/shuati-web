# 刷题小程序

上传 Word（`.docx`）题库文档即可刷题的纯前端网页应用。无需账号、无需后端，数据保存在浏览器本地。

## 功能

- **导入题库**：上传 `.docx`，纯规则自动识别单选题、多选题、判断题
- **刷题模式**：顺序练习、随机刷题、错题重练（练习模式答完立刻判对错）
- **模拟考试**：自定义题量与时长，交卷统一出分，计时自动交卷
- **错题本**：答错自动收集，重练答对自动移除
- **答题统计**：每个题库的练习量、正确率、错题数
- **本地保存**：题库、进度、错题、成绩全部存浏览器 `localStorage`

## 本地运行

```bash
npm install
npm run dev        # 开发模式，浏览器打开提示的地址
npm run build      # 构建，产物在 dist/
npm run preview    # 本地预览构建产物
```

## 验证解析器

```bash
npm run test:parser                  # 用样例文档验证解析准确率
node scripts/test-parser.mjs 你的文件.docx   # 验证其它文档
node scripts/test-flow.mjs           # 数据流集成测试（需样例文档）
```

## 支持的题库格式

解析器支持问卷星导出及常见表格式题库（可混合出现）：

| 题型 | 识别方式 |
|------|----------|
| 单选题 | `1. 题干 [单选题] *` 或 `1. 题干（C）`，选项 `A、xxx` / `A xxx`，正确项标 `(正确答案)` 或题干尾部标 `（C）` |
| 多选题 | 多个选项标 `(正确答案)`，或题干尾部标 `（ABCD）` / `（B)、(D）` |
| 判断题 | `对(正确答案)/错`，或题干尾部标 `（√）/（×）` |

同时兼容：选项同行（`A xxx    B xxx`）、选项紧贴（`A避让B指挥C穿插式D故意冲撞`）、选项跨行续接、题干内嵌选项、一段两题（`37.…（√）38.…（×）`）等情形。`答案解析`、姓名填空等无关内容会被自动忽略。

## 部署到线上（免费静态托管，任选其一）

构建产物在 `dist/`，部署任一静态托管即可：

### Vercel（推荐，最快）

```bash
npm run build
npx vercel deploy --prod   # 首次运行按提示登录，一路回车即可
```

或直接访问 [vercel.com](https://vercel.com) → Add New Project → 把本项目文件夹拖进去，框架选 Vite，构建命令 `npm run build`，输出目录 `dist`。

### Netlify

访问 [app.netlify.com/drop](https://app.netlify.com/drop)，把 `dist/` 文件夹拖入页面即可获得网址。

### GitHub Pages

```bash
npm run build
# 把 dist/ 内容推到仓库 gh-pages 分支，或使用 Actions：
```

参考 `.github/workflows` 官方 Vite 部署模板，配置 `base: './'` 已内置。

## 已知限制

- 仅支持 `.docx`（Word 2007+）；`.doc` 老格式与 PDF 暂不支持
- 扫描图片型 PDF/图片中的题目无法识别（需要 OCR）
- 导入后的题目只读，不支持编辑
- 数据存浏览器本地，清除浏览器数据会丢失；换设备/浏览器不互通
