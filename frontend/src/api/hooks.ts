import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './client'
import type { DecisionRequest, Fault, Operation } from './types'
import { draftSchema, decisionResultSchema } from './zod'

export const keys = {
  personas: ['personas'] as const,
  me: ['me'] as const,
  period: (site?: string) => ['period', site ?? 'scope'] as const,
  queue: (site?: string) => ['queue', site ?? 'scope'] as const,
  exception: (id: string) => ['exception', id] as const,
  provider: ['provider'] as const,
  forecast: (site?: string) => ['forecast', site ?? 'scope'] as const,
  timecard: (id: string) => ['timecard', id] as const,
  traces: ['traces'] as const,
  trace: (id: string) => ['trace', id] as const,
  policies: ['policies'] as const,
  audit: ['audit'] as const,
  outcomes: (site?: string) => ['outcomes', site ?? 'scope'] as const,
  evaluation: ['evaluation'] as const,
  myActions: ['my-actions'] as const,
}

type Site = 'FRE' | 'AUS' | 'BLR'

export const usePersonas = () =>
  useQuery({ queryKey: keys.personas, queryFn: () => unwrap(api.GET('/api/v1/auth/personas')) })

export const usePayPeriod = (site?: Site, enabled = true) =>
  useQuery({
    queryKey: keys.period(site),
    queryFn: () => unwrap(api.GET('/api/v1/pay-period/current', { params: { query: { site } } })),
    enabled,
  })

export const useQueue = (site?: Site) =>
  useQuery({
    queryKey: keys.queue(site),
    queryFn: () => unwrap(api.GET('/api/v1/exceptions', { params: { query: { site } } })),
  })

export const useException = (id: string | undefined) =>
  useQuery({
    queryKey: keys.exception(id ?? ''),
    queryFn: () => unwrap(api.GET('/api/v1/exceptions/{exception_id}', { params: { path: { exception_id: id! } } })),
    enabled: !!id,
  })

export const useProvider = (enabled = true) =>
  useQuery({ queryKey: keys.provider, queryFn: () => unwrap(api.GET('/api/v1/admin/provider')), enabled, refetchInterval: 30_000 })

export const useForecast = (site?: Site, enabled = true) =>
  useQuery({
    queryKey: keys.forecast(site),
    queryFn: () => unwrap(api.GET('/api/v1/forecast/overtime', { params: { query: { site } } })),
    enabled,
  })

export const useTimecard = (id: string | undefined) =>
  useQuery({
    queryKey: keys.timecard(id ?? ''),
    queryFn: () => unwrap(api.GET('/api/v1/timecards/{employee_id}', { params: { path: { employee_id: id! } } })),
    enabled: !!id,
  })

export const useTraces = () =>
  useQuery({ queryKey: keys.traces, queryFn: () => unwrap(api.GET('/api/v1/traces', { params: { query: { limit: 100 } } })) })

export const useTrace = (id: string | undefined) =>
  useQuery({
    queryKey: keys.trace(id ?? ''),
    queryFn: () => unwrap(api.GET('/api/v1/traces/{run_id}', { params: { path: { run_id: id! } } })),
    enabled: !!id,
  })

export const usePolicies = () =>
  useQuery({ queryKey: keys.policies, queryFn: () => unwrap(api.GET('/api/v1/policies')), staleTime: Infinity })

export const useAudit = () =>
  useQuery({ queryKey: keys.audit, queryFn: () => unwrap(api.GET('/api/v1/audit', { params: { query: { limit: 300 } } })) })

export const useOutcomes = (site?: Site) =>
  useQuery({
    queryKey: keys.outcomes(site),
    queryFn: () => unwrap(api.GET('/api/v1/outcomes', { params: { query: { site } } })),
  })

export const useEvaluation = () =>
  useQuery({
    queryKey: keys.evaluation,
    queryFn: () => unwrap(api.GET('/api/v1/evaluation/latest')) as Promise<Record<string, unknown>>,
    retry: false,
  })

export const useMyActions = () =>
  useQuery({ queryKey: keys.myActions, queryFn: () => unwrap(api.GET('/api/v1/me/actions')) })

function useInvalidateWork() {
  const qc = useQueryClient()
  return () =>
    Promise.all(
      ['queue', 'period', 'exception', 'forecast', 'outcomes', 'traces', 'timecard', 'audit', 'my-actions', 'personas'].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    )
}

export function useCreateDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) =>
      draftSchema.parse(
        await unwrap(
          api.POST('/api/v1/exceptions/{exception_id}/drafts', {
            params: { path: { exception_id: id } },
            body: { force: !!force },
          }),
        ),
      ),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: keys.exception(v.id) })
      qc.invalidateQueries({ queryKey: ['queue'] })
      qc.invalidateQueries({ queryKey: ['period'] })
      qc.invalidateQueries({ queryKey: keys.traces })
    },
  })
}

export function useDecide() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: async ({ draftId, body }: { draftId: string; body: DecisionRequest }) =>
      decisionResultSchema.parse(
        await unwrap(api.POST('/api/v1/drafts/{draft_id}/decision', { params: { path: { draft_id: draftId } }, body })),
      ),
    onSuccess: () => invalidate(),
  })
}

export function useValidateEdit() {
  return useMutation({
    mutationFn: ({ draftId, operations }: { draftId: string; operations: Operation[] }) =>
      unwrap(api.POST('/api/v1/drafts/{draft_id}/validate-edit', { params: { path: { draft_id: draftId } }, body: { operations } })),
  })
}

export function useBulkApprove() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: (draftIds: string[]) => unwrap(api.POST('/api/v1/drafts/bulk-approve', { body: { draft_ids: draftIds } })),
    onSuccess: () => invalidate(),
  })
}

export function useRequestAttestation() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/api/v1/exceptions/{exception_id}/attestation-requests', { params: { path: { exception_id: id } } })),
    onSuccess: () => invalidate(),
  })
}

export function useAttest() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: (body: { exception_id: string; confirmed_at: string; note?: string | null }) =>
      unwrap(api.POST('/api/v1/attestations', { body })),
    onSuccess: () => invalidate(),
  })
}

export function useReplay() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { exception_id: string; fault: Fault }) =>
      draftSchema.parse(await unwrap(api.POST('/api/v1/admin/replay', { body }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.traces }),
  })
}

export function useSwitchProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (provider: 'groq' | 'ollama' | 'rule_based') => unwrap(api.PUT('/api/v1/admin/provider', { body: { provider } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.provider }),
  })
}

export function useVerifyAudit() {
  return useMutation({ mutationFn: () => unwrap(api.GET('/api/v1/audit/verify')) })
}

export function useResetDemo() {
  const invalidate = useInvalidateWork()
  return useMutation({ mutationFn: () => unwrap(api.POST('/api/v1/admin/reset')), onSuccess: () => invalidate() })
}

export function usePolicySearch() {
  return useMutation({
    mutationFn: (body: { query: string; jurisdiction: 'US-CA' | 'US-TX' | 'IN-KA'; employee_class?: 'exempt' | 'non_exempt'; k?: number }) =>
      unwrap(api.POST('/api/v1/policies/search', { body: { employee_class: 'non_exempt', k: 5, ...body } })),
  })
}
