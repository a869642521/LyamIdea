/** 聊天气泡台词库：按排名分层，每层 4 条随机选 */
const BUBBLE_LINES: Record<string, string[]> = {
  top: ['本王从未输过！', '第一的感觉，你懂吗？', '没人能挑战我的地位！', '冠军气质，与生俱来'],
  upper: ['第一！我马上就来！', '差一点点而已', '银牌也是牌，下次换金的', '卷起来，下一轮见'],
  mid: ['稳住，我们能赢', '中庸是一种美德', '中游选手，低调发育', '不争第一，但求稳进'],
  lower: ['我会证明自己的！', '等我第二轮爆发', '排名会说话的', '逆袭剧本已写好'],
  bottom: ['垫底也要垫得优雅', '排名不代表潜力', '裁判你好，我有话说…', '重在参与，下次再来'],
  none: ['我还没准备好上场…', '待评分中，勿cue', '先观战一会儿', '下一轮见真章'],
}

export function getBubbleText(rank: number | null): string {
  const key =
    rank === 1
      ? 'top'
      : rank != null && rank <= 3
        ? 'upper'
        : rank != null && rank <= 6
          ? 'mid'
          : rank != null && rank <= 9
            ? 'lower'
            : rank != null && rank <= 12
              ? 'bottom'
              : 'none'
  const pool = BUBBLE_LINES[key]
  return pool[Math.floor(Math.random() * pool.length)]
}
