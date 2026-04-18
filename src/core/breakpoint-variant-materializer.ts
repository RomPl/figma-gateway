import type { UiModelDocument, UiNode } from './ui-model';
import type { BreakpointFamily } from './planning-context';

const cloneDocument = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const walk = (node: UiNode, fn: (node: UiNode) => void): void => {
  fn(node);
  node.children.forEach((child) => walk(child, fn));
};

export const materializeBreakpointVariantNodeRefs = (document: UiModelDocument, family: BreakpointFamily): UiModelDocument => {
  const cloned = cloneDocument(document);
  walk(cloned.root, (node) => {
    const originalUiId = node.uiId;
    node.uiId = `${node.uiId}--${family}`;
    node.meta = {
      ...(node.meta ?? {}),
      breakpointVariantRef: {
        originalUiId,
        breakpointFamily: family,
        variantUiId: node.uiId
      },
      blockIdentity: {
        ...((node.meta?.blockIdentity as Record<string, unknown> | undefined) ?? {}),
        primaryUiId: ((node.meta?.blockIdentity as Record<string, unknown> | undefined)?.primaryUiId as string | undefined) ?? originalUiId,
        aliases: Array.from(new Set([originalUiId, ...((((node.meta?.blockIdentity as Record<string, unknown> | undefined)?.aliases as string[] | undefined) ?? []) )]))
      }
    };
  });
  return cloned;
};
