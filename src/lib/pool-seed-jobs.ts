import * as mockStore from '@/lib/mock-store'
import { seedPool } from '@/lib/mock-engine'
import { seedPoolReal } from '@/lib/real-engine'

const activeSeedJobs = new Set<string>()

function poolHasAnyContent(poolId: string): boolean {
  return mockStore.getIdeasByPool(poolId).some((idea) =>
    mockStore.getVersionsByIdea(idea.id).some((v) => !!v.content?.trim())
  )
}

export function shouldSeedPool(poolId: string): boolean {
  const pool = mockStore.getPool(poolId)
  if (!pool) return false
  if (activeSeedJobs.has(poolId)) return false
  if (pool.status === 'done' && poolHasAnyContent(poolId)) return false
  return !pool.direction?.trim() || !poolHasAnyContent(poolId)
}

export async function runPoolSeedJob(options: {
  poolId: string
  keyword: string
  description?: string
  useMock: boolean
  deleteOnFailure?: boolean
}): Promise<void> {
  const { poolId, keyword, description, useMock, deleteOnFailure = false } = options
  if (activeSeedJobs.has(poolId)) return
  activeSeedJobs.add(poolId)
  try {
    if (useMock) {
      seedPool(poolId, keyword, description)
    } else {
      await seedPoolReal(poolId, keyword, description)
    }
  } catch (err) {
    if (deleteOnFailure) {
      mockStore.deletePool(poolId)
    }
    throw err
  } finally {
    activeSeedJobs.delete(poolId)
  }
}

export function startPoolSeedJob(options: {
  poolId: string
  keyword: string
  description?: string
  useMock: boolean
  deleteOnFailure?: boolean
  logPrefix: string
}): void {
  const { logPrefix, ...rest } = options
  void runPoolSeedJob(rest).catch((err) => {
    console.error(`${logPrefix} seed failed:`, err)
  })
}
