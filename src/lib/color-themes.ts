/**
 * 统一配色主题 —— 以 5 个 Robot SVG 的真实颜色为单一数据源
 *
 * 每个主题同时控制：
 *   - Robot SVG 文件
 *   - 格子容器 border / background（精确匹配 SVG hex）
 *   - IdeaCard：emoji icon 渐变、发光阴影、卡片背景、悬浮光效、气泡
 *   - PoolColumn 最外层卡片渐变边框
 */
export interface PoolTheme {
  /** Robot SVG 路径 */
  svgSrc: string
  /** 容器 border-color（rgba，精确取自 SVG 主色） */
  containerBorder: string
  /** 容器 background-color（rgba，极淡） */
  containerBg: string
  /** emoji icon 背景渐变（Tailwind） */
  gradient: string
  /** emoji icon 底部发光阴影（Tailwind） */
  glowShadow: string
  /** 卡片背景 + 默认 border（Tailwind） */
  cardBg: string
  /** 悬浮时外发光 + border（Tailwind） */
  hoverGlow: string
  /** 气泡背景 / border / 文字 / 尾巴（Tailwind） */
  bubbleStyle: string
  /** PoolColumn 最外层卡片渐变 bg + border（Tailwind） */
  poolColumnBg: string
}

export const POOL_THEMES: PoolTheme[] = [
  {
    // jiqiren01（紫色主题，内含打字机 host 元素）— #5D0CB4 → violet 族
    svgSrc: '/jiqiren01.svg',
    containerBorder: 'rgba(93,12,180,0.30)',
    containerBg:     'rgba(93,12,180,0.07)',
    gradient:        'bg-gradient-to-br from-violet-500 to-indigo-600',
    glowShadow:      'shadow-[0_8px_18px_4px_rgba(93,12,180,0.60)]',
    cardBg:          'bg-violet-500/10 border-violet-500/30',
    hoverGlow:       'hover:shadow-[0_0_20px_6px_rgba(93,12,180,0.40)] hover:border-violet-400/50',
    bubbleStyle:     'bg-violet-600/95 border-violet-400 text-white after:!border-t-violet-600',
    poolColumnBg:    'from-violet-500/10 to-violet-500/3 border-violet-500/10',
  },
  {
    // Robot_Cyan — #107E9C → cyan 族
    svgSrc: '/Robot_Cyan.svg',
    containerBorder: 'rgba(16,126,156,0.30)',
    containerBg:     'rgba(16,126,156,0.07)',
    gradient:        'bg-gradient-to-br from-cyan-400 to-teal-600',
    glowShadow:      'shadow-[0_8px_18px_4px_rgba(16,126,156,0.60)]',
    cardBg:          'bg-cyan-500/10 border-cyan-500/30',
    hoverGlow:       'hover:shadow-[0_0_20px_6px_rgba(16,126,156,0.40)] hover:border-cyan-400/50',
    bubbleStyle:     'bg-cyan-600/95 border-cyan-400 text-white after:!border-t-cyan-600',
    poolColumnBg:    'from-cyan-500/10 to-cyan-500/3 border-cyan-500/10',
  },
  {
    // Robot_Blue — #1B4494 → blue/indigo 族
    svgSrc: '/Robot_Blue.svg',
    containerBorder: 'rgba(27,68,148,0.30)',
    containerBg:     'rgba(27,68,148,0.07)',
    gradient:        'bg-gradient-to-br from-blue-500 to-indigo-700',
    glowShadow:      'shadow-[0_8px_18px_4px_rgba(27,68,148,0.60)]',
    cardBg:          'bg-blue-500/10 border-blue-500/30',
    hoverGlow:       'hover:shadow-[0_0_20px_6px_rgba(27,68,148,0.40)] hover:border-blue-400/50',
    bubbleStyle:     'bg-blue-600/95 border-blue-400 text-white after:!border-t-blue-600',
    poolColumnBg:    'from-blue-500/10 to-blue-500/3 border-blue-500/10',
  },
  {
    // Robot_Green — #2B9778 → emerald 族
    svgSrc: '/Robot_Green.svg',
    containerBorder: 'rgba(43,151,120,0.30)',
    containerBg:     'rgba(43,151,120,0.07)',
    gradient:        'bg-gradient-to-br from-emerald-400 to-teal-600',
    glowShadow:      'shadow-[0_8px_18px_4px_rgba(43,151,120,0.60)]',
    cardBg:          'bg-emerald-500/10 border-emerald-500/30',
    hoverGlow:       'hover:shadow-[0_0_20px_6px_rgba(43,151,120,0.40)] hover:border-emerald-400/50',
    bubbleStyle:     'bg-emerald-600/95 border-emerald-400 text-white after:!border-t-emerald-600',
    poolColumnBg:    'from-emerald-500/10 to-emerald-500/3 border-emerald-500/10',
  },
  {
    // Robot_Pink — #FF35B8 → fuchsia/pink 族
    svgSrc: '/Robot_Pink.svg',
    containerBorder: 'rgba(255,53,184,0.30)',
    containerBg:     'rgba(255,53,184,0.07)',
    gradient:        'bg-gradient-to-br from-fuchsia-500 to-pink-600',
    glowShadow:      'shadow-[0_8px_18px_4px_rgba(255,53,184,0.60)]',
    cardBg:          'bg-fuchsia-500/10 border-fuchsia-500/30',
    hoverGlow:       'hover:shadow-[0_0_20px_6px_rgba(255,53,184,0.40)] hover:border-fuchsia-400/50',
    bubbleStyle:     'bg-fuchsia-600/95 border-fuchsia-400 text-white after:!border-t-fuchsia-600',
    poolColumnBg:    'from-fuchsia-500/10 to-fuchsia-500/3 border-fuchsia-500/10',
  },
]
