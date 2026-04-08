export interface TransferData {
  files: File[];
  fromModule: string;
}

export interface ToolConfig {
  key: string;
  path: string;
  name: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  icon: string;
}

export const SITE_URL = "https://image.moonrailgun.com";
export const SITE_NAME = "Image Master";

export const TOOLS: ToolConfig[] = [
  {
    key: "background",
    path: "/background-remover",
    name: "背景扣除",
    description:
      "上传带纯色背景的图片，自动将背景色处理为透明。支持自动检测、手动拾取颜色、调整容差范围。",
    seoTitle: "在线图片背景扣除 - 自动去背景透明化工具",
    seoDescription:
      "免费在线图片背景扣除工具，支持自动检测背景色、手动取色、AI智能抠图。纯前端处理，无需上传服务器，保护隐私安全。",
    icon: "eye",
  },
  {
    key: "sprite",
    path: "/sprite-splitter",
    name: "精灵图拆分",
    description:
      "上传带透明通道的 PNG 图片（如游戏 UI 精灵图集），自动按照透明区域间隙识别并拆分成独立的小图片。",
    seoTitle: "精灵图拆分工具 - Sprite Sheet自动切图",
    seoDescription:
      "免费在线精灵图拆分工具，自动识别透明区域间隙并拆分sprite sheet为独立图片。支持游戏UI精灵图集、CSS雪碧图切割，纯前端处理。",
    icon: "grid",
  },
  {
    key: "upscale",
    path: "/upscale",
    name: "超分放大",
    description:
      "使用 Real-ESRGAN 深度学习模型，将图片放大 4x，同时增强细节和清晰度。首次使用需下载模型。",
    seoTitle: "AI图片超分放大 - Real-ESRGAN 4倍无损放大",
    seoDescription:
      "使用Real-ESRGAN深度学习模型在线放大图片4倍，AI智能增强细节和清晰度。纯前端处理，无需上传服务器，免费使用。",
    icon: "expand",
  },
  {
    key: "resize",
    path: "/resize",
    name: "尺寸调整",
    description:
      "批量调整图片尺寸，支持按比例缩放或指定目标尺寸，可锁定宽高比保持图片不变形。",
    seoTitle: "在线图片尺寸调整 - 批量缩放修改分辨率",
    seoDescription:
      "免费在线图片尺寸调整工具，支持批量缩放、指定目标尺寸、锁定宽高比。纯前端处理，快速修改图片分辨率大小。",
    icon: "resize",
  },
  {
    key: "compress",
    path: "/compress",
    name: "图片压缩",
    description:
      "智能压缩图片文件大小，支持 JPEG、WebP、PNG 格式转换和质量调节，在保持画质的同时大幅减小文件体积。",
    seoTitle: "在线图片压缩 - 智能无损压缩减小文件大小",
    seoDescription:
      "免费在线图片压缩工具，支持JPEG、WebP、PNG格式转换和质量调节。智能压缩保持画质，大幅减小文件体积，纯前端处理。",
    icon: "compress",
  },
  {
    key: "transform",
    path: "/transform",
    name: "旋转翻转",
    description:
      "对图片进行旋转和翻转操作，支持顺时针/逆时针旋转 90°、180°，以及水平/垂直翻转。可组合多个操作按顺序应用。",
    seoTitle: "在线图片旋转翻转 - 批量旋转镜像翻转工具",
    seoDescription:
      "免费在线图片旋转翻转工具，支持90°/180°旋转、水平垂直翻转、组合变换。批量处理多张图片，纯前端处理无需上传。",
    icon: "transform",
  },
  {
    key: "inpaint",
    path: "/inpaint",
    name: "图片修复",
    description:
      "使用 AI 自动修复图片中涂抹标记的区域，可用于移除水印、修复划痕、消除不需要的物体等。首次使用需下载模型。",
    seoTitle: "AI图片修复 - 在线去水印修复划痕消除物体",
    seoDescription:
      "免费AI图片修复工具，智能移除水印、修复划痕、消除不需要的物体。使用深度学习模型，纯前端处理，保护隐私。",
    icon: "edit",
  },
  {
    key: "crop",
    path: "/crop",
    name: "图片裁剪",
    description:
      "自由裁剪图片区域，支持拖拽调整裁剪框大小和位置，也可精确输入像素值进行精准裁剪。",
    seoTitle: "在线图片裁剪 - 自由裁剪精确像素裁切",
    seoDescription:
      "免费在线图片裁剪工具，支持自由拖拽裁剪框、精确输入像素值裁切。快速裁剪图片区域，纯前端处理无需上传。",
    icon: "crop",
  },
  {
    key: "vectorize",
    path: "/vectorize",
    name: "图片矢量化",
    description:
      "将 PNG/JPG 位图转换为 SVG 矢量图，支持多种预设风格和自定义参数调节，可控制颜色数量、曲线精度等。",
    seoTitle: "图片矢量化 - PNG/JPG转SVG矢量图工具",
    seoDescription:
      "免费在线图片矢量化工具，将PNG/JPG位图转换为SVG矢量图。支持多种预设风格、自定义参数调节，纯前端处理。",
    icon: "vectorize",
  },
];
