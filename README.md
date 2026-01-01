# Image Master

一个纯前端的图片处理工具，所有操作均在浏览器本地完成，**不会上传到服务器**。

## ✨ 功能特性

### 🎨 精灵图拆分 (Sprite Splitter)

- 上传带透明通道的 PNG 图片（如游戏 UI 精灵图集）
- 自动按照透明区域间隙识别并拆分成独立的小图片
- 支持批量处理多张图片
- 支持单张下载或 ZIP 打包下载

### 🖼️ 背景扣除 (Background Remover)

- 上传带纯色背景的图片，自动将背景色处理为透明
- 支持自动检测背景色或手动拾取颜色
- 可调整颜色容差范围
- 边缘羽化功能，减少锯齿感
- 仅处理连续像素选项，精确控制扣除区域

### 🔄 工具联动

两个工具之间可以互相传递图片，方便进行连续处理流程。

## 🛠️ 技术栈

- [Next.js](https://nextjs.org) - React 框架
- [React 19](https://react.dev) - UI 库
- [Tailwind CSS](https://tailwindcss.com) - 样式框架
- [JSZip](https://stuk.github.io/jszip/) - ZIP 文件生成

## 🚀 快速开始

```bash
# 安装依赖
bun install

# 启动开发服务器
bun dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

## 📦 构建部署

```bash
# 构建生产版本
bun run build

# 启动生产服务器
bun start
```

## 📄 License

MIT
