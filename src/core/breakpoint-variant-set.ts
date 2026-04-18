import { z } from 'zod';

import type { UiModelDocument } from './ui-model';
import type { BreakpointFamily, PlanningContext } from './planning-context';
import { breakpointFamilySchema, createPlanningContextFromNode } from './planning-context';
import { getBlockIdentityAliasesFromUnknown } from './block-identity';

export const breakpointVariantSetSchema = z.object({
  mode: z.enum(['single_active', 'multi_snapshot_ready']).default('single_active'),
  active: breakpointFamilySchema,
  available: z.array(breakpointFamilySchema).min(1),
  variantGroupId: z.string().trim().min(1),
  preferredOrder: z.array(breakpointFamilySchema).min(1).default(['desktop', 'tablet', 'mobile'])
});

export type BreakpointVariantSet = z.infer<typeof breakpointVariantSetSchema>;

const buildVariantGroupId = (context: PlanningContext, meta: Record<string, unknown> | undefined, uiId: string): string => {
  const aliases = getBlockIdentityAliasesFromUnknown(meta?.blockIdentity ?? meta);
  return aliases[0] || uiId || `surface.${context.surfaceMode}`;
};

export const createBreakpointVariantSetFromDocument = (document: UiModelDocument, availableFamilies?: BreakpointFamily[]): BreakpointVariantSet => {
  const context = createPlanningContextFromNode(document.root);
  const meta = document.root.meta && typeof document.root.meta === 'object' ? document.root.meta as Record<string, unknown> : undefined;
  const available = Array.from(new Set((availableFamilies?.length ? availableFamilies : [context.breakpointFamily])));
  return breakpointVariantSetSchema.parse({
    mode: available.length > 1 ? 'multi_snapshot_ready' : 'single_active',
    active: context.breakpointFamily,
    available,
    variantGroupId: buildVariantGroupId(context, meta, document.root.uiId),
    preferredOrder: ['desktop', 'tablet', 'mobile']
  });
};

export const attachBreakpointVariantSet = (document: UiModelDocument, availableFamilies?: BreakpointFamily[]): UiModelDocument => {
  const variantSet = createBreakpointVariantSetFromDocument(document, availableFamilies);
  document.root.meta = { ...(document.root.meta ?? {}), breakpointVariantSet: variantSet };
  return document;
};
