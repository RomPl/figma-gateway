import { z } from 'zod';

import { AppError } from './errors';

export const visualGuardrailsPolicySchema = z.object({
  allowAuthenticatedPages: z.coerce.boolean().default(false),
  allowPrivateDataCapture: z.coerce.boolean().default(false),
  allowRuntimeDataAsBaseline: z.coerce.boolean().default(false),
  allowDynamicStatefulPatching: z.coerce.boolean().default(false)
}).default({ allowAuthenticatedPages: false, allowPrivateDataCapture: false, allowRuntimeDataAsBaseline: false, allowDynamicStatefulPatching: false });

export const visualPageAuditSchema = z.object({
  hasAuthWall: z.boolean().default(false),
  hasPrivateInputs: z.boolean().default(false),
  hasInfiniteScroll: z.boolean().default(false),
  hasAnimatedRegions: z.boolean().default(false),
  hasCarousel: z.boolean().default(false),
  hasCanvas: z.boolean().default(false),
  hasWebgl: z.boolean().default(false),
  riskyRegions: z.array(z.string()).default([]),
  reasons: z.array(z.string()).default([])
});

export type VisualGuardrailsPolicy = z.infer<typeof visualGuardrailsPolicySchema>;
export type VisualPageAudit = z.infer<typeof visualPageAuditSchema>;

export const assertVisualPageAuditAllowed = (auditRaw: unknown, policyRaw: z.input<typeof visualGuardrailsPolicySchema>): VisualPageAudit => {
  const audit = visualPageAuditSchema.parse(auditRaw);
  const policy = visualGuardrailsPolicySchema.parse(policyRaw);
  if (audit.hasAuthWall && !policy.allowAuthenticatedPages) {
    throw new AppError(
      'Refusing to render an authenticated/login-gated page without explicit allowAuthenticatedPages=true',
      403,
      'VISUAL_GUARDRAIL_AUTH_REQUIRED',
      { audit }
    );
  }
  return audit;
};

export const classifyNodeGuardrails = (meta: Record<string, unknown> | undefined): { needsReview: boolean; reasons: string[] } => {
  const guardrails = meta && typeof meta.guardrails === 'object' ? meta.guardrails as Record<string, unknown> : undefined;
  if (!guardrails) return { needsReview: false, reasons: [] };
  const reasons: string[] = [];
  if (guardrails.privateDataRedacted) reasons.push('private data redacted');
  if (guardrails.runtimeBaseline === 'untrusted') reasons.push('runtime baseline untrusted');
  if (guardrails.dynamicStatefulBlock) reasons.push('dynamic stateful block');
  if (Array.isArray(guardrails.unsupportedRegions) && guardrails.unsupportedRegions.length) reasons.push(...guardrails.unsupportedRegions.map(String));
  return { needsReview: reasons.length > 0, reasons };
};
