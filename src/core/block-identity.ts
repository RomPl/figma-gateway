import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { UiModelDocument, UiNode } from './ui-model';

const stableUiIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i;

export const blockIdentitySchema = z.object({
  blockId: z.string().trim().min(1),
  primaryUiId: z.string().trim().min(1).optional(),
  aliases: z.array(z.string().trim().min(1)).default([]),
  semanticName: z.string().trim().min(1).optional(),
  identitySource: z.enum(['stable_ui_id', 'semantic_fallback', 'synthetic_fallback']),
  stable: z.boolean().default(false)
});

export type BlockIdentity = z.infer<typeof blockIdentitySchema>;

const isStableUiId = (value: string | undefined): boolean => Boolean(value && !value.startsWith('__auto__/') && stableUiIdPattern.test(value));
const normalizeAlias = (value: string | undefined): string | null => {
  if (!value) return null;
  const cleaned = value.trim().replace(/\s+/g, ' ');
  return cleaned ? cleaned : null;
};
const aliasFromName = (value: string | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
  return normalized || null;
};

export const createBlockIdentityFromNode = (node: UiNode): BlockIdentity => {
  const aliases = new Set<string>();
  const stableUiId = isStableUiId(node.uiId) ? node.uiId : undefined;
  if (stableUiId) aliases.add(stableUiId);
  if (node.role) aliases.add(`role:${node.role}`);
  const semanticName = aliasFromName(node.name) ?? aliasFromName(node.role) ?? aliasFromName(node.uiId) ?? normalizeAlias(node.name) ?? undefined;
  if (semanticName) aliases.add(semanticName);
  if (node.source?.codeSelector) aliases.add(node.source.codeSelector);
  if (node.source?.jsxPath) aliases.add(node.source.jsxPath);
  if (node.text && node.text.length <= 80) aliases.add(`text:${node.text.trim()}`);
  const identitySource: BlockIdentity['identitySource'] = stableUiId ? 'stable_ui_id' : semanticName ? 'semantic_fallback' : 'synthetic_fallback';
  const fallbackSeed = JSON.stringify({ kind: node.kind, semanticName, role: node.role, source: node.source, text: node.text, uiId: node.uiId });
  const fallbackId = `block.${node.kind}.${createHash('sha1').update(fallbackSeed).digest('hex').slice(0, 10)}`;
  return blockIdentitySchema.parse({
    blockId: stableUiId ?? fallbackId,
    primaryUiId: stableUiId,
    aliases: Array.from(aliases).slice(0, 12),
    semanticName,
    identitySource,
    stable: Boolean(stableUiId)
  });
};

const walk = (node: UiNode, fn: (node: UiNode) => void): void => {
  fn(node);
  node.children.forEach((child) => walk(child, fn));
};

export const attachBlockIdentity = (document: UiModelDocument): UiModelDocument => {
  walk(document.root, (node) => {
    node.meta = { ...(node.meta ?? {}), blockIdentity: createBlockIdentityFromNode(node) };
  });
  return document;
};
