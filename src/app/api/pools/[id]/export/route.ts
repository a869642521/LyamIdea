import { NextRequest, NextResponse } from 'next/server'
import * as mockStore from '@/lib/mock-store'


// GET /api/pools/[id]/export?format=markdown|csv&topN=12
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  const { id: poolId } = await params
  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') ?? 'markdown'
  const topN = parseInt(searchParams.get('topN') ?? '12', 10)

  const pool = mockStore.getPoolDetail(poolId)
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  const allIdeas = [...pool.ideas]
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .slice(0, topN)
    .map((idea) => ({
      rank: idea.rank ?? 0,
      content: idea.current_version?.content ?? '',
      total_score: idea.total_score,
      score_innovation: idea.current_version?.score_innovation ?? 0,
      score_feasibility: idea.current_version?.score_feasibility ?? 0,
      score_impact: idea.current_version?.score_impact ?? 0,
    }))

  if (format === 'csv') {
    const header = 'Rank,TotalScore,Innovation,Feasibility,Impact,Content'
    const rows = allIdeas.map(
      (i) =>
        `${i.rank},${i.total_score},${i.score_innovation},${i.score_feasibility},${i.score_impact},"${(i.content || '').replace(/"/g, '""')}"`
    )
    const csv = [header, ...rows].join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pool-${pool.keyword}-${poolId.slice(0, 8)}.csv"`,
      },
    })
  }

  const lines: string[] = [
    `# 创意集市 — ${pool.keyword}`,
    `> 方向: ${pool.direction} | 用户轮次: ${Math.min((pool.iteration ?? 0) + 1, 3)}/3 | 数据迭代: ${pool.iteration}/2 | Top ${topN}`,
    '',
    '## 排行摘要',
    '',
    ...allIdeas.map(
      (i) => `- 第 ${i.rank} 名 | 总分 ${i.total_score} | 创新 ${i.score_innovation} | 可行 ${i.score_feasibility} | 影响 ${i.score_impact}`
    ),
    '',
    '---',
    '',
    ...allIdeas.flatMap((i) => [
      `## 第 ${i.rank} 名方案`,
      '',
      i.content || '（无内容）',
      '',
      '---',
      '',
    ]),
  ]
  const md = lines.join('\n')
  return new NextResponse(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="pool-${pool.keyword}-${poolId.slice(0, 8)}.md"`,
    },
  })
}
