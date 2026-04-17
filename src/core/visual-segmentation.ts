import type { UiModelDocument, UiNode } from './ui-model';

export type VisualBoundaryKind = 'component-boundary' | 'visual-block' | 'layout-wrapper' | 'text-carrier' | 'unsupported-island';

const cloneNode = (node: UiNode): UiNode => ({
  ...node,
  meta: { ...(node.meta ?? {}) },
  children: node.children.map(cloneNode)
});

const isSyntheticUiId = (value: string | undefined): boolean => Boolean(value && value.startsWith('__auto__/'));
const hasMeaningfulText = (node: UiNode): boolean => Boolean(node.text && node.text.trim().length > 0);
const hasVisualContainerStyle = (node: UiNode): boolean => Boolean(
  node.computedStyle?.backgroundColor && !['transparent', 'rgba(0, 0, 0, 0)', 'rgba(255, 255, 255, 0)'].includes(String(node.computedStyle.backgroundColor).trim().toLowerCase()) ||
  node.computedStyle?.backgroundImage && String(node.computedStyle.backgroundImage).trim().toLowerCase() !== 'none' ||
  (node.computedStyle?.borderWidth ?? 0) > 0 ||
  (node.computedStyle?.borderRadius ?? 0) > 0 ||
  Boolean(node.computedStyle?.boxShadow && String(node.computedStyle.boxShadow).trim().toLowerCase() !== 'none')
);
const hasInteractiveRole = (node: UiNode): boolean => Boolean(node.state?.interactive || node.role?.includes('button') || node.kind === 'button' || node.kind === 'input');
const unsupportedRegionsForNode = (node: UiNode): string[] => {
  const guardrails = node.meta && typeof node.meta.guardrails === 'object' ? (node.meta.guardrails as Record<string, unknown>) : undefined;
  return Array.isArray(guardrails?.unsupportedRegions)
    ? guardrails.unsupportedRegions.map((item) => String(item)).filter((item) => item && item !== 'heuristic_node')
    : [];
};

const classifyBoundaryKind = (node: UiNode): VisualBoundaryKind => {
  const hasStableSource = Boolean(node.source?.jsxPath || node.source?.lineStart || node.source?.lineEnd || (node.meta as any)?.codeMapping?.stable);
  const unsupported = unsupportedRegionsForNode(node).length > 0;
  if (unsupported) return 'unsupported-island';
  if (hasStableSource && !isSyntheticUiId(node.uiId)) return 'component-boundary';
  if (hasMeaningfulText(node) && !node.children.length) return 'text-carrier';
  if (hasVisualContainerStyle(node) || hasInteractiveRole(node) || Boolean(node.asset?.layer) || Boolean(node.icon?.sourceType)) return 'visual-block';
  return 'layout-wrapper';
};

const inheritMeta = (wrapper: UiNode, child: UiNode): UiNode => ({
  ...child,
  meta: {
    ...(wrapper.meta ?? {}),
    ...(child.meta ?? {}),
    segmentation: {
      ...(((wrapper.meta as any)?.segmentation ?? {})),
      ...(((child.meta as any)?.segmentation ?? {})),
      inheritedWrapperUiId: wrapper.uiId,
      collapsedWrapperUiIds: Array.from(new Set([
        ...((((wrapper.meta as any)?.segmentation?.collapsedWrapperUiIds) ?? []) as string[]),
        ...((((child.meta as any)?.segmentation?.collapsedWrapperUiIds) ?? []) as string[]),
        wrapper.uiId
      ]))
    }
  }
});

const shouldCollapseWrapper = (node: UiNode, isRoot: boolean): boolean => {
  if (isRoot) return false;
  if (!isSyntheticUiId(node.uiId)) return false;
  if (classifyBoundaryKind(node) !== 'layout-wrapper') return false;
  if (node.children.length !== 1) return false;
  if (hasMeaningfulText(node)) return false;
  if (Boolean(node.asset?.layer) || Boolean(node.icon?.sourceType)) return false;
  if (node.kind !== 'frame' && node.kind !== 'group') return false;
  return true;
};

const annotateIdentityAndSegment = (node: UiNode, isRoot = false): UiNode => {
  const next = cloneNode(node);
  next.children = next.children.map((child) => annotateIdentityAndSegment(child, false));
  const boundaryKind = classifyBoundaryKind(next);
  next.meta = {
    ...(next.meta ?? {}),
    identity: {
      sourceUiId: !isSyntheticUiId(next.uiId) ? next.uiId : ((next.meta as any)?.codeMapping?.uiId || undefined),
      visualUiId: next.uiId,
      figmaRef: ((next.meta as any)?.identity?.figmaRef ?? undefined),
      synthetic: isSyntheticUiId(next.uiId)
    },
    segmentation: {
      boundaryKind,
      blockBoundary: boundaryKind !== 'layout-wrapper',
      stableOwner: !isSyntheticUiId(next.uiId) || Boolean((next.meta as any)?.codeMapping?.stable),
      renderedOnly: isSyntheticUiId(next.uiId),
      collapsedWrapperUiIds: (((next.meta as any)?.segmentation?.collapsedWrapperUiIds) ?? []) as string[]
    }
  };
  if (shouldCollapseWrapper(next, isRoot)) {
    return inheritMeta(next, next.children[0]);
  }
  return next;
};

export const segmentVisualBlocks = <T extends UiModelDocument>(document: T): T => {
  const segmentedRoot = annotateIdentityAndSegment(document.root, true);
  return { ...document, root: segmentedRoot } as T;
};
