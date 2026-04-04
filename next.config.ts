import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 以配置文件所在目录为项目根（避免从上级目录启动时 process.cwd() 指到 OK/ 导致找不到 tailwindcss） */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
    /** PostCSS `@import "tailwindcss"` 否则会从上层目录解析失败 */
    resolveAlias: {
      tailwindcss: path.join(projectRoot, "node_modules/tailwindcss"),
    },
  },
  env: {
    /** 与 DEBUG_POOL_STEPS 同步时，详情页可显示分阶段调试按钮（仅开发自测） */
    NEXT_PUBLIC_DEBUG_POOL_STEPS: process.env.DEBUG_POOL_STEPS ?? "",
  },
};

export default nextConfig;
