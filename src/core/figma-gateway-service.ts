import { z } from 'zod';

import type { FigmaReadClient } from './figma-client';
import type { FigmaImageFormat, FigmaNode } from '../types/figma';

export const fileKeyParamsSchema = z.object({
  fileKey: z.string().trim().min(1)
});

export const fileNodeParamsSchema = z.object({
  fileKey: z.string().trim().min(1),
  nodeId: z.string().trim().min(1)
});

export const batchNodesSchema = z.object({
  fileKey: z.string().trim().min(1),
  nodeIds: z.array(z.string().trim().min(1)).min(1).max(100)
});

export const renderSchema = z.object({
  fileKey: z.string().trim().min(1),
  nodeIds: z.array(z.string().trim().min(1)).min(1).max(100),
  format: z.enum(['jpg', 'png', 'svg', 'pdf'])
});

export const searchSchema = z.object({
  fileKey: z.string().trim().min(1),
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).default(20)
});

export type SearchableNodeMatch = {
  id: string;
  name: string;
  type: string;
  characters?: string;
};

const toNodeMatch = (node: FigmaNode): SearchableNodeMatch => ({
  id: node.id,
  name: node.name,
  type: node.type,
  characters: typeof node.characters === 'string' ? node.characters : undefined
});

export const findNodesByName = (
  rootNode: FigmaNode,
  query: string,
  limit: number
): SearchableNodeMatch[] => {
  const normalizedQuery = query.toLowerCase();
  const results: SearchableNodeMatch[] = [];

  const visit = (node: FigmaNode): void => {
    if (results.length >= limit) {
      return;
    }

    if (node.name.toLowerCase().includes(normalizedQuery)) {
      results.push(toNodeMatch(node));
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child);
        if (results.length >= limit) {
          break;
        }
      }
    }
  };

  visit(rootNode);

  return results;
};

export const findNodesByText = (
  rootNode: FigmaNode,
  query: string,
  limit: number
): SearchableNodeMatch[] => {
  const normalizedQuery = query.toLowerCase();
  const results: SearchableNodeMatch[] = [];

  const visit = (node: FigmaNode): void => {
    if (results.length >= limit) {
      return;
    }

    if (typeof node.characters === 'string' && node.characters.toLowerCase().includes(normalizedQuery)) {
      results.push(toNodeMatch(node));
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child);
        if (results.length >= limit) {
          break;
        }
      }
    }
  };

  visit(rootNode);

  return results;
};

export const createFigmaGatewayService = (figmaClient: FigmaReadClient) => ({
  getFile: async (input: z.infer<typeof fileKeyParamsSchema>) => {
    const { fileKey } = fileKeyParamsSchema.parse(input);
    return figmaClient.getFile(fileKey);
  },
  getNode: async (input: z.infer<typeof fileNodeParamsSchema>) => {
    const { fileKey, nodeId } = fileNodeParamsSchema.parse(input);
    return figmaClient.getNode(fileKey, nodeId);
  },
  getNodesBatch: async (input: z.infer<typeof batchNodesSchema>) => {
    const { fileKey, nodeIds } = batchNodesSchema.parse(input);
    return figmaClient.getNodes(fileKey, nodeIds);
  },
  getStyles: async (input: z.infer<typeof fileKeyParamsSchema>) => {
    const { fileKey } = fileKeyParamsSchema.parse(input);
    return figmaClient.getStyles(fileKey);
  },
  getComponents: async (input: z.infer<typeof fileKeyParamsSchema>) => {
    const { fileKey } = fileKeyParamsSchema.parse(input);
    return figmaClient.getComponents(fileKey);
  },
  getComponentSets: async (input: z.infer<typeof fileKeyParamsSchema>) => {
    const { fileKey } = fileKeyParamsSchema.parse(input);
    return figmaClient.getComponentSets(fileKey);
  },
  renderNodes: async (input: z.infer<typeof renderSchema>) => {
    const { fileKey, nodeIds, format } = renderSchema.parse(input);
    return figmaClient.getImages(fileKey, nodeIds, format as FigmaImageFormat);
  },
  searchByName: async (input: z.infer<typeof searchSchema>) => {
    const { fileKey, query, limit } = searchSchema.parse(input);
    const file = await figmaClient.getFile(fileKey);
    const results = findNodesByName(file.document, query, limit);

    return {
      query,
      count: results.length,
      results
    };
  },
  searchByText: async (input: z.infer<typeof searchSchema>) => {
    const { fileKey, query, limit } = searchSchema.parse(input);
    const file = await figmaClient.getFile(fileKey);
    const results = findNodesByText(file.document, query, limit);

    return {
      query,
      count: results.length,
      results
    };
  }
});

export type FigmaGatewayService = ReturnType<typeof createFigmaGatewayService>;
