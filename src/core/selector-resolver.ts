import { z } from 'zod';

import { AppError } from './errors';
import type { CodeUiParserService } from './code-ui-parser';
import type { FigmaUiExtractorService } from './figma-ui-extractor';
import type { UiMappingService } from './ui-mapping-registry';
import type { UiModelDocument, UiNode } from './ui-model';

export const resolveSelectorSchema = z.object({
  query: z.string().trim().min(1).max(300),
  project: z.string().trim().min(1).max(128).optional(),
  fileKey: z.string().trim().min(1).optional(),
  nodeId: z.string().trim().min(1).optional(),
  rootDir: z.string().trim().min(1).optional(),
  source: z.enum(['code', 'figma', 'both']).default('both'),
  limit: z.coerce.number().int().min(1).max(20).default(5)
});

export type SelectorMatchKind = 'uiId' | 'node_name' | 'semantic_role' | 'text' | 'tree_path' | 'fuzzy';

export type SelectorResolvedMatch = {
  uiId: string;
  score: number;
  source: 'code' | 'figma';
  kind: SelectorMatchKind[];
  name?: string;
  text?: string;
  role?: string;
  treePath: string;
  filePath?: string;
  fileKey?: string;
  nodeId?: string;
  componentName?: string;
  reasons: string[];
};

export type SelectorResolveResult = {
  query: string;
  normalizedQuery: string;
  matches: SelectorResolvedMatch[];
};

type Candidate = SelectorResolvedMatch & { signature: string };

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/['"“”]/g, '')
    .replace(/[^a-z0-9._\-/\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value: string): string[] => normalize(value).split(/\s+/).filter(Boolean);

const diceCoefficient = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const pairs = (input: string): string[] => {
    const normalized = normalize(input).replace(/\s+/g, '');
    if (normalized.length < 2) return [normalized];
    const result: string[] = [];
    for (let index = 0; index < normalized.length - 1; index += 1) result.push(normalized.slice(index, index + 2));
    return result;
  };
  const aPairs = pairs(a);
  const bPairs = pairs(b);
  const counts = new Map<string, number>();
  for (const pair of aPairs) counts.set(pair, (counts.get(pair) ?? 0) + 1);
  let intersection = 0;
  for (const pair of bPairs) {
    const count = counts.get(pair) ?? 0;
    if (count > 0) {
      intersection += 1;
      counts.set(pair, count - 1);
    }
  }
  return (2 * intersection) / (aPairs.length + bPairs.length);
};

const parseButtonTextQuery = (query: string): { roleHint?: string; textHint?: string } => {
  const normalized = normalize(query);
  const quoted = query.match(/text\s+["']([^"']+)["']/i) || query.match(/["']([^"']+)["']/);
  const textHint = quoted?.[1]?.trim();
  const roleHint = /button/.test(normalized) ? 'button' : /hero/.test(normalized) ? 'headline' : undefined;
  return { roleHint, textHint };
};

const walk = (node: UiNode, fn: (node: UiNode, treePath: string) => void, currentPath = ''): void => {
  const pathSegment = node.name?.trim() || node.uiId;
  const treePath = currentPath ? `${currentPath} > ${pathSegment}` : pathSegment;
  fn(node, treePath);
  node.children.forEach((child) => walk(child, fn, treePath));
};

const collectDocuments = (
  codeUiParserService: CodeUiParserService,
  figmaUiExtractorService: FigmaUiExtractorService,
  payload: z.infer<typeof resolveSelectorSchema>
): Array<{ source: 'code' | 'figma'; document: UiModelDocument }> => {
  const documents: Array<{ source: 'code' | 'figma'; document: UiModelDocument }> = [];
  if (payload.source === 'code' || payload.source === 'both') {
    const code = codeUiParserService.parseProject({ rootDir: payload.rootDir, project: payload.project, limit: 200 });
    for (const component of code.components) documents.push({ source: 'code', document: component.tree });
  }
  return documents;
};

const scoreNode = (
  node: UiNode,
  source: 'code' | 'figma',
  query: string,
  treePath: string,
  extras: { filePath?: string; fileKey?: string; nodeId?: string; componentName?: string }
): Candidate | null => {
  const normalizedQuery = normalize(query);
  const tokens = tokenize(query);
  const queryHints = parseButtonTextQuery(query);
  const kinds = new Set<SelectorMatchKind>();
  const reasons: string[] = [];
  let score = 0;

  const normalizedUiId = normalize(node.uiId);
  const normalizedName = normalize(node.name ?? '');
  const normalizedRole = normalize(node.role ?? '');
  const normalizedText = normalize(node.text ?? '');
  const normalizedPath = normalize(treePath);

  if (normalizedUiId === normalizedQuery) {
    score += 120;
    kinds.add('uiId');
    reasons.push(`Exact uiId match: ${node.uiId}`);
  } else if (normalizedUiId.includes(normalizedQuery) || normalizedQuery.includes(normalizedUiId)) {
    score += 90;
    kinds.add('uiId');
    reasons.push(`Partial uiId match: ${node.uiId}`);
  }

  if (normalizedName && normalizedName === normalizedQuery) {
    score += 100;
    kinds.add('node_name');
    reasons.push(`Exact node name match: ${node.name}`);
  } else if (normalizedName && normalizedName.includes(normalizedQuery)) {
    score += 70;
    kinds.add('node_name');
    reasons.push(`Node name contains query: ${node.name}`);
  }

  if (normalizedRole && (normalizedRole === normalizedQuery || normalizedQuery.includes(normalizedRole) || normalizedRole.includes(normalizedQuery))) {
    score += 80;
    kinds.add('semantic_role');
    reasons.push(`Semantic role match: ${node.role}`);
  }

  if (normalizedText && (normalizedText === normalizedQuery || normalizedText.includes(normalizedQuery))) {
    score += 85;
    kinds.add('text');
    reasons.push(`Text match: ${node.text}`);
  }

  if (queryHints.textHint && normalizedText.includes(normalize(queryHints.textHint))) {
    score += 95;
    kinds.add('text');
    reasons.push(`Quoted text match: ${queryHints.textHint}`);
  }

  if (normalizedPath && (normalizedPath === normalizedQuery || normalizedPath.includes(normalizedQuery))) {
    score += 75;
    kinds.add('tree_path');
    reasons.push(`Tree path match: ${treePath}`);
  }

  const fields = [node.uiId, node.name ?? '', node.role ?? '', node.text ?? '', treePath];
  const bestFuzzy = Math.max(...fields.map((field) => diceCoefficient(field, query)));
  if (bestFuzzy >= 0.5) {
    score += Math.round(bestFuzzy * 60);
    kinds.add('fuzzy');
    reasons.push(`Fuzzy match score ${bestFuzzy.toFixed(2)}`);
  }

  const tokenCoverage = tokens.filter((token) => [normalizedUiId, normalizedName, normalizedRole, normalizedText, normalizedPath].some((field) => field.includes(token))).length;
  if (tokenCoverage > 0) score += tokenCoverage * 10;

  if (queryHints.roleHint === 'button' && (node.kind === 'button' || String(node.role ?? '').includes('button'))) {
    score += 40;
    reasons.push('Button role preference matched');
  }
  if (queryHints.roleHint === 'headline' && (node.role === 'headline' || node.kind === 'section' || normalizedUiId.includes('hero'))) {
    score += 25;
    reasons.push('Hero/headline preference matched');
  }

  if (score <= 0 || kinds.size === 0) return null;

  return {
    uiId: node.uiId,
    score,
    source,
    kind: Array.from(kinds),
    name: node.name,
    text: node.text,
    role: node.role,
    treePath,
    filePath: extras.filePath,
    fileKey: extras.fileKey,
    nodeId: extras.nodeId,
    componentName: extras.componentName,
    reasons,
    signature: `${source}:${node.uiId}:${extras.filePath ?? extras.fileKey ?? ''}:${extras.nodeId ?? ''}`
  };
};

export class SelectorResolverService {
  constructor(
    private readonly codeUiParserService: CodeUiParserService,
    private readonly figmaUiExtractorService: FigmaUiExtractorService,
    private readonly uiMappingService: UiMappingService
  ) {}

  public async resolve(input: z.input<typeof resolveSelectorSchema>): Promise<SelectorResolveResult> {
    const data = resolveSelectorSchema.parse(input);
    const candidates = new Map<string, Candidate>();

    if (data.source === 'code' || data.source === 'both') {
      const code = this.codeUiParserService.parseProject({ rootDir: data.rootDir, project: data.project, limit: 200 });
      for (const component of code.components) {
        walk(component.tree.root, (node, treePath) => {
          const match = scoreNode(node, 'code', data.query, treePath, {
            filePath: component.filePath,
            componentName: component.componentName
          });
          if (!match) return;
          const prev = candidates.get(match.signature);
          if (!prev || match.score > prev.score) candidates.set(match.signature, match);
        });
      }
    }

    if ((data.source === 'figma' || data.source === 'both') && data.fileKey) {
      const figma = await this.figmaUiExtractorService.extract({ fileKey: data.fileKey, project: data.project, nodeId: data.nodeId });
      const mappings = this.uiMappingService.listUiMappings({ project: data.project, fileKey: data.fileKey, limit: 100 });
      const byNode = new Map(mappings.map((mapping) => [`${mapping.figma.fileKey}:${mapping.figma.nodeId}`, mapping.uiId]));
      walk(figma.root, (node, treePath) => {
        const key = node.source?.fileKey && node.source?.nodeId ? `${node.source.fileKey}:${node.source.nodeId}` : '';
        if (key && byNode.has(key)) node.uiId = byNode.get(key)!;
        const match = scoreNode(node, 'figma', data.query, treePath, {
          fileKey: node.source?.fileKey,
          nodeId: node.source?.nodeId
        });
        if (!match) return;
        const prev = candidates.get(match.signature);
        if (!prev || match.score > prev.score) candidates.set(match.signature, match);
      });
    }

    const matches = Array.from(candidates.values())
      .sort((a, b) => b.score - a.score || a.uiId.localeCompare(b.uiId))
      .slice(0, data.limit)
      .map(({ signature: _signature, ...rest }) => rest);

    return {
      query: data.query,
      normalizedQuery: normalize(data.query),
      matches
    };
  }
}
