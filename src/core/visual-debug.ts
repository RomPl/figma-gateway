import { logger } from '../utils/logger';

export const visualLogger = logger.child({ subsystem: 'visual-pipeline' });

export const summarizeNode = (node: any): Record<string, unknown> => ({
  uiId: node?.uiId,
  kind: node?.kind,
  tag: node?.tag,
  text: typeof node?.text === 'string' ? node.text.slice(0, 80) : undefined,
  childCount: Array.isArray(node?.children) ? node.children.length : 0,
  hasComputedStyle: Boolean(node?.computedStyle && Object.keys(node.computedStyle).length),
  hasAsset: Boolean(node?.asset && Object.keys(node.asset).length),
  hasIcon: Boolean(node?.icon && Object.keys(node.icon).length),
  needsReview: Boolean(node?.confidence?.needsReview ?? node?.meta?.needsReview)
});
