import { z } from 'zod';

import type { CodeUiParserService } from './code-ui-parser';
import type { RenderedUiExtractorService } from './rendered-ui-extractor';
import type { UiModelDocument, UiNode, UiSourceMapping } from './ui-model';
import { annotateVisualConfidence } from './visual-confidence';
import { attachBlockIdentity } from './block-identity';
import { segmentVisualBlocks } from './visual-segmentation';

export const mapRenderedToCodeSchema = z.object({
  project: z.string().trim().min(1).max(128).optional(),
  rootDir: z.string().trim().min(1).optional(),
  render: z.record(z.string(), z.unknown())
});

export type RenderedToCodeMatchType = 'exact_ui_id' | 'heuristic_fallback' | 'unmatched';

export type RenderedToCodeBinding = {
  uiId?: string;
  filePath?: string;
  componentName?: string;
  jsxPath?: string;
  sourceRange?: { lineStart: number; lineEnd: number };
  confidence: number;
  stable: boolean;
  matchType: RenderedToCodeMatchType;
  reasons: string[];
};

export type RenderedToCodeMapResult = {
  rendered: UiModelDocument;
  componentCount: number;
  matchedNodeCount: number;
  unmatchedNodeCount: number;
  notes: string[];
};

type CodeCandidate = {
  componentName: string;
  filePath: string;
  node: UiNode;
  treePath: string;
};

const walk = (node: UiNode, fn: (node: UiNode, treePath: string) => void, currentPath = ''): void => {
  const pathSegment = node.name?.trim() || node.uiId;
  const treePath = currentPath ? `${currentPath} > ${pathSegment}` : pathSegment;
  fn(node, treePath);
  node.children.forEach((child) => walk(child, fn, treePath));
};

const normalize = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9._\-/\s]+/g, ' ').replace(/\s+/g, ' ').trim();

const isSyntheticUiId = (value: string | undefined): boolean => Boolean(value && value.startsWith('__auto__/'));

const diceCoefficient = (a: string, b: string): number => {
  const normalizePairs = (input: string): string[] => {
    const n = normalize(input).replace(/\s+/g, '');
    if (!n) return [];
    if (n.length < 2) return [n];
    const pairs: string[] = [];
    for (let i = 0; i < n.length - 1; i += 1) pairs.push(n.slice(i, i + 2));
    return pairs;
  };
  const aPairs = normalizePairs(a);
  const bPairs = normalizePairs(b);
  if (!aPairs.length || !bPairs.length) return 0;
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

const collectCodeCandidates = (codeUiParserService: CodeUiParserService, rootDir?: string, project?: string): { components: number; candidates: CodeCandidate[]; byUiId: Map<string, CodeCandidate> } => {
  const parsed = codeUiParserService.parseProject({ rootDir, project, limit: 200 });
  const candidates: CodeCandidate[] = [];
  const byUiId = new Map<string, CodeCandidate>();
  for (const component of parsed.components) {
    walk(component.tree.root, (node, treePath) => {
      const candidate: CodeCandidate = {
        componentName: component.componentName,
        filePath: component.filePath,
        node,
        treePath
      };
      candidates.push(candidate);
      if (node.uiId && !byUiId.has(node.uiId)) byUiId.set(node.uiId, candidate);
    });
  }
  return { components: parsed.componentCount, candidates, byUiId };
};

const bindingFromCandidate = (candidate: CodeCandidate, confidence: number, stable: boolean, matchType: RenderedToCodeMatchType, reasons: string[]): RenderedToCodeBinding => ({
  uiId: candidate.node.uiId,
  filePath: candidate.filePath,
  componentName: candidate.componentName,
  jsxPath: candidate.node.source?.jsxPath,
  sourceRange: candidate.node.source?.lineStart && candidate.node.source?.lineEnd ? { lineStart: candidate.node.source.lineStart, lineEnd: candidate.node.source.lineEnd } : undefined,
  confidence,
  stable,
  matchType,
  reasons
});

const heuristicMatch = (renderedNode: UiNode, renderedTreePath: string, candidates: CodeCandidate[]): RenderedToCodeBinding | null => {
  let best: { candidate: CodeCandidate; score: number; reasons: string[] } | null = null;
  for (const candidate of candidates) {
    let score = 0;
    const reasons: string[] = [];
    if (renderedNode.kind === candidate.node.kind) {
      score += 0.2;
      reasons.push(`kind:${renderedNode.kind}`);
    }
    if (renderedNode.text && candidate.node.text) {
      const textScore = diceCoefficient(renderedNode.text, candidate.node.text);
      if (textScore > 0.45) {
        score += Math.min(0.35, textScore * 0.35);
        reasons.push(`text:${textScore.toFixed(2)}`);
      }
    }
    const pathScore = diceCoefficient(renderedTreePath, candidate.treePath);
    if (pathScore > 0.35) {
      score += Math.min(0.25, pathScore * 0.25);
      reasons.push(`treePath:${pathScore.toFixed(2)}`);
    }
    if (renderedNode.role && candidate.node.role && renderedNode.role === candidate.node.role) {
      score += 0.1;
      reasons.push(`role:${renderedNode.role}`);
    }
    if (renderedNode.name && candidate.node.name) {
      const nameScore = diceCoefficient(renderedNode.name, candidate.node.name);
      if (nameScore > 0.45) {
        score += Math.min(0.1, nameScore * 0.1);
        reasons.push(`name:${nameScore.toFixed(2)}`);
      }
    }
    if (!best || score > best.score) best = { candidate, score, reasons };
  }
  if (!best || best.score < 0.45) return null;
  return bindingFromCandidate(best.candidate, Number(best.score.toFixed(2)), false, 'heuristic_fallback', best.reasons);
};

const annotateRenderedDocument = (document: UiModelDocument, byUiId: Map<string, CodeCandidate>, candidates: CodeCandidate[]): { matched: number; unmatched: number } => {
  let matched = 0;
  let unmatched = 0;
  walk(document.root, (node, treePath) => {
    const exact = node.uiId && !isSyntheticUiId(node.uiId) ? byUiId.get(node.uiId) : undefined;
    let binding: RenderedToCodeBinding | null = null;
    if (exact) {
      binding = bindingFromCandidate(exact, 1, true, 'exact_ui_id', [`exact uiId:${node.uiId}`]);
      node.source = {
        ...(node.source ?? {}),
        codePath: exact.node.source?.codePath ?? exact.filePath,
        codeExportName: exact.node.source?.codeExportName ?? exact.componentName,
        codeSelector: exact.node.source?.codeSelector,
        jsxPath: exact.node.source?.jsxPath,
        lineStart: exact.node.source?.lineStart,
        lineEnd: exact.node.source?.lineEnd
      } satisfies UiSourceMapping;
    } else {
      binding = heuristicMatch(node, treePath, candidates);
      if (!binding && isSyntheticUiId(node.uiId)) {
        node.meta = {
          ...(node.meta ?? {}),
          codeMapping: {
            uiId: node.uiId,
            confidence: 0,
            stable: false,
            matchType: 'unmatched',
            reasons: ['synthetic heuristic uiId requires fallback mapping']
          }
        };
      }
      if (binding) {
        node.source = {
          ...(node.source ?? {}),
          codePath: binding.filePath,
          codeExportName: binding.componentName,
          jsxPath: binding.jsxPath,
          lineStart: binding.sourceRange?.lineStart,
          lineEnd: binding.sourceRange?.lineEnd
        } satisfies UiSourceMapping;
      }
    }
    node.meta = {
      ...(node.meta ?? {}),
      codeMapping: binding ?? {
        uiId: node.uiId,
        confidence: 0,
        stable: false,
        matchType: 'unmatched',
        reasons: ['no code match found']
      }
    };
    if (binding) matched += 1; else unmatched += 1;
  });
  return { matched, unmatched };
};

export class RenderedToCodeMapperService {
  constructor(
    private readonly renderedUiExtractorService: RenderedUiExtractorService,
    private readonly codeUiParserService: CodeUiParserService
  ) {}

  public async map(input: z.input<typeof mapRenderedToCodeSchema>): Promise<RenderedToCodeMapResult> {
    const data = mapRenderedToCodeSchema.parse(input);
    const rendered = segmentVisualBlocks(await this.renderedUiExtractorService.extract(data.render as any));
    const code = collectCodeCandidates(this.codeUiParserService, data.rootDir, data.project);
    const stats = annotateRenderedDocument(rendered, code.byUiId, code.candidates);
    attachBlockIdentity(annotateVisualConfidence(rendered));
    return {
      rendered,
      componentCount: code.components,
      matchedNodeCount: stats.matched,
      unmatchedNodeCount: stats.unmatched,
      notes: [
        'Exact uiId matches are treated as stable source mappings.',
        'Fallback heuristic matches are allowed when exact uiId mapping is missing, but they are marked unstable.',
        'Synthetic __auto__/ uiIds from fallback rendered extraction never count as stable exact source mappings.',
        'Confidence score reflects how safely a rendered node can be patched in code.'
      ]
    };
  }
}
