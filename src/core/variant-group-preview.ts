import type { UiModelDocument } from './ui-model';
import { getBlockIdentityAliasesFromUnknown } from './block-identity';

export type VariantGroupPreview = {
  variantGroupId: string;
  rootUiId: string;
  breakpoints: string[];
  variantUiIdsByBreakpoint: Record<string, string>;
  aliases: string[];
  mappingMode: 'deferred';
};

const extractAliases = (document: UiModelDocument): string[] => {
  const meta = document.root.meta && typeof document.root.meta === 'object' ? document.root.meta as Record<string, unknown> : undefined;
  return Array.from(new Set([
    ...getBlockIdentityAliasesFromUnknown(meta?.blockIdentity ?? meta),
    typeof document.root.uiId === 'string' ? document.root.uiId : undefined,
    typeof (meta?.breakpointVariantSet as Record<string, unknown> | undefined)?.variantGroupId === 'string'
      ? String((meta?.breakpointVariantSet as Record<string, unknown>).variantGroupId)
      : undefined
  ].filter(Boolean) as string[]));
};

export const buildVariantGroupPreview = (documentsByBreakpoint: Record<string, UiModelDocument>): VariantGroupPreview | null => {
  const entries = Object.entries(documentsByBreakpoint);
  if (!entries.length) return null;
  const [firstBreakpoint, firstDocument] = entries[0];
  const firstMeta = firstDocument.root.meta && typeof firstDocument.root.meta === 'object' ? firstDocument.root.meta as Record<string, unknown> : undefined;
  const rootUiId = typeof ((firstMeta?.breakpointVariantRef as Record<string, unknown> | undefined)?.originalUiId) === 'string'
    ? String((firstMeta?.breakpointVariantRef as Record<string, unknown>).originalUiId)
    : firstDocument.root.uiId;
  const variantGroupId = typeof ((firstMeta?.breakpointVariantSet as Record<string, unknown> | undefined)?.variantGroupId) === 'string'
    ? String((firstMeta?.breakpointVariantSet as Record<string, unknown>).variantGroupId)
    : rootUiId;
  return {
    variantGroupId,
    rootUiId,
    breakpoints: entries.map(([breakpoint]) => breakpoint),
    variantUiIdsByBreakpoint: Object.fromEntries(entries.map(([breakpoint, document]) => [breakpoint, document.root.uiId])),
    aliases: Array.from(new Set(entries.flatMap(([, document]) => extractAliases(document)))),
    mappingMode: 'deferred'
  };
};
