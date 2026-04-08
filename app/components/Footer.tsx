import Link from "next/link";
import { TOOLS } from "../types";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800 py-8">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-6 grid grid-cols-3 gap-4 sm:grid-cols-5">
          {TOOLS.map((tool) => (
            <Link
              key={tool.key}
              href={tool.path}
              className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {tool.name}
            </Link>
          ))}
        </div>
        <p className="text-center text-sm text-zinc-600">
          所有图片处理均在浏览器本地完成，不会上传到服务器
        </p>
      </div>
    </footer>
  );
}
