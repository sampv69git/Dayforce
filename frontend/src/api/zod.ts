/**
 * Runtime validation at the UI boundary for the views that drive decisions. If the API ever sends a
 * draft that does not match the contract, the UI refuses to render the decision controls.
 */
import { z } from 'zod'
import type { DecisionResult, Draft } from './types'

const gate = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['pass', 'fail', 'skip']),
  detail: z.string(),
})

const report = z.object({ passed: z.boolean(), attempt: z.number(), gates: z.array(gate).length(10) })

const operation = z.object({
  op: z.enum(['add_punch', 'void_punch', 'record_premium', 'approve_overtime', 'acknowledge', 'approve_unscheduled', 'reassign_shift', 'escalate']),
  punch_type: z.enum(['IN', 'OUT', 'MEAL_START', 'MEAL_END']).nullable(),
  at: z.string().nullable(),
  punch_id: z.string().nullable(),
  premium_kind: z.enum(['meal', 'rest', 'holiday', 'seventh_day']).nullable(),
  hours: z.number().nullable(),
  shift_id: z.string().nullable(),
  to_employee_id: z.string().nullable(),
  evidence_ids: z.array(z.string()),
})

export const draftSchema = z
  .object({
    id: z.string(),
    exception_id: z.string(),
    route: z.enum(['suggest', 'fallback', 'escalate', 'manual']),
    validation: report,
    resolution: z
      .object({
        exception_id: z.string(),
        summary: z.string(),
        explanation: z.string(),
        operations: z.array(operation).min(1),
        citations: z.array(z.object({ clause_id: z.string(), quote: z.string() })).min(1),
      })
      .passthrough()
      .nullable(),
    evidence_strength: z.object({ score: z.number(), level: z.enum(['high', 'medium', 'low']) }).passthrough(),
  })
  .passthrough()
  .transform((d) => d as unknown as Draft)

export const decisionResultSchema = z
  .object({
    decision: z.object({ id: z.string(), action: z.enum(['approve', 'edit', 'reject']) }).passthrough(),
    resolved_exception_ids: z.array(z.string()),
    new_exception_ids: z.array(z.string()),
    revision_ids: z.array(z.string()),
  })
  .passthrough()
  .transform((d) => d as unknown as DecisionResult)
