import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { z } from 'zod';

import { AppError } from './errors';

const stringArraySchema = z.array(z.string().trim().min(1)).default([]);

export const codeComponentRefSchema = z.object({
  repository: z.string().trim().min(1),
  path: z.string().trim().min(1),
  exportName: z.string().trim().min(1),
  framework: z.string().trim().min(1),
  language: z.string().trim().min(1),
  storybookUrl: z.string().url().optional(),
  docsUrl: z.string().url().optional(),
  propsType: z.string().trim().min(1).optional(),
  examples: stringArraySchema
});

export const figmaComponentRefSchema = z.object({
  fileKey: z.string().trim().min(1),
  nodeId: z.string().trim().min(1),
  componentKey: z.string().trim().min(1),
  name: z.string().trim().min(1),
  libraryName: z.string().trim().min(1).optional(),
  variantProperties: z.record(z.string(), z.string()).default({})
});

export const codeConnectMappingSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(['draft', 'active', 'deprecated']).default('active'),
  figma: figmaComponentRefSchema,
  code: codeComponentRefSchema,
  propMappings: z.record(z.string(), z.string()).default({}),
  notes: stringArraySchema,
  tags: stringArraySchema,
  owners: stringArraySchema,
  updatedAt: z.string().trim().min(1)
});

export type CodeConnectMapping = z.infer<typeof codeConnectMappingSchema> & {
  sourceFile: string;
};

export type CodeConnectRegistryOptions = {
  mappingsDir: string;
  allowedExtensions?: string[];
};

const DEFAULT_ALLOWED_EXTENSIONS = ['.json'];

const collectFiles = (directory: string, allowedExtensions: Set<string>): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath, allowedExtensions));
      continue;
    }

    if (entry.isFile() && allowedExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
};

const parseMappingFile = (filePath: string): CodeConnectMapping[] => {
  const raw = readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw) as unknown;
  const parsed = z.union([codeConnectMappingSchema, z.array(codeConnectMappingSchema)]).parse(json);
  const mappings = Array.isArray(parsed) ? parsed : [parsed];

  return mappings.map((mapping) => ({
    ...mapping,
    sourceFile: filePath
  }));
};

export class CodeConnectRegistry {
  private readonly mappingsDir: string;
  private readonly allowedExtensions: Set<string>;
  private mappings: CodeConnectMapping[] = [];

  constructor(options: CodeConnectRegistryOptions) {
    this.mappingsDir = resolve(options.mappingsDir);
    this.allowedExtensions = new Set(
      (options.allowedExtensions ?? DEFAULT_ALLOWED_EXTENSIONS).map((extension) =>
        extension.toLowerCase().trim()
      )
    );
  }

  public refresh(): CodeConnectMapping[] {
    let stats;

    try {
      stats = statSync(this.mappingsDir);
    } catch {
      throw new AppError(`Code Connect mappings directory not found: ${this.mappingsDir}`, 500, 'CODE_CONNECT_MAPPINGS_DIR_NOT_FOUND');
    }

    if (!stats.isDirectory()) {
      throw new AppError(
        `Code Connect mappings path is not a directory: ${this.mappingsDir}`,
        500,
        'CODE_CONNECT_MAPPINGS_DIR_INVALID'
      );
    }

    const files = collectFiles(this.mappingsDir, this.allowedExtensions);
    const loadedMappings = files.flatMap((filePath) => parseMappingFile(filePath));

    this.mappings = loadedMappings;
    return [...this.mappings];
  }

  public list(): CodeConnectMapping[] {
    return [...this.mappings];
  }

  public findByFigmaComponentKey(componentKey: string): CodeConnectMapping | null {
    const normalizedKey = componentKey.trim();
    return this.mappings.find((mapping) => mapping.figma.componentKey === normalizedKey) ?? null;
  }

  public findByCodeComponent(path: string, exportName?: string): CodeConnectMapping[] {
    const normalizedPath = path.trim();
    const normalizedExport = exportName?.trim();

    return this.mappings.filter((mapping) => {
      if (mapping.code.path !== normalizedPath) {
        return false;
      }

      if (!normalizedExport) {
        return true;
      }

      return mapping.code.exportName === normalizedExport;
    });
  }

  public search(input: {
    query?: string;
    framework?: string;
    repository?: string;
    tag?: string;
    limit?: number;
  }): CodeConnectMapping[] {
    const query = input.query?.trim().toLowerCase();
    const framework = input.framework?.trim().toLowerCase();
    const repository = input.repository?.trim().toLowerCase();
    const tag = input.tag?.trim().toLowerCase();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

    return this.mappings
      .filter((mapping) => {
        if (framework && mapping.code.framework.toLowerCase() !== framework) {
          return false;
        }

        if (repository && mapping.code.repository.toLowerCase() !== repository) {
          return false;
        }

        if (tag && !mapping.tags.some((mappingTag) => mappingTag.toLowerCase() === tag)) {
          return false;
        }

        if (!query) {
          return true;
        }

        const haystack = [
          mapping.id,
          mapping.figma.name,
          mapping.figma.componentKey,
          mapping.code.path,
          mapping.code.exportName,
          mapping.code.framework,
          ...mapping.tags,
          ...mapping.notes
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      })
      .slice(0, limit);
  }

  public getSummary(): {
    mappingsDir: string;
    fileCount: number;
    mappingCount: number;
    repositories: string[];
    frameworks: string[];
  } {
    const repositories = new Set<string>();
    const frameworks = new Set<string>();
    const sourceFiles = new Set<string>();

    for (const mapping of this.mappings) {
      repositories.add(mapping.code.repository);
      frameworks.add(mapping.code.framework);
      sourceFiles.add(relative(this.mappingsDir, mapping.sourceFile));
    }

    return {
      mappingsDir: this.mappingsDir,
      fileCount: sourceFiles.size,
      mappingCount: this.mappings.length,
      repositories: Array.from(repositories).sort((left, right) => left.localeCompare(right)),
      frameworks: Array.from(frameworks).sort((left, right) => left.localeCompare(right))
    };
  }
}
