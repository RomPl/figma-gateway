import { z } from 'zod';

import { browserRenderTargetSchema } from './browser-renderer';

export const surfaceModeSchema = z.enum(['component', 'document', 'app_shell', 'auth_gated_spa']);
export type SurfaceMode = z.infer<typeof surfaceModeSchema>;

export const renderProfileHintsSchema = z.object({
  surfaceMode: surfaceModeSchema.optional(),
  authenticated: z.coerce.boolean().optional(),
  routePath: z.string().trim().min(1).max(500).optional(),
  preferredRootSelectors: z.array(z.string().trim().min(1).max(300)).max(12).optional()
}).partial();

export const renderProfileSchema = z.object({
  surfaceMode: surfaceModeSchema,
  authenticated: z.boolean(),
  rootStrategy: z.enum(['explicit_ui_id', 'preferred_selector', 'body_fallback']),
  preferredRootSelectors: z.array(z.string().trim().min(1)).default([]),
  preserveOuterShell: z.boolean().default(false),
  expectPersistentShell: z.boolean().default(false),
  allowBodyFallback: z.boolean().default(true),
  notes: z.array(z.string()).default([])
});

export type RenderProfile = z.infer<typeof renderProfileSchema>;

export const renderProfileResolverInputSchema = z.object({
  rootUiId: z.string().trim().min(1).optional(),
  hydrationSelector: z.string().trim().min(1).optional(),
  target: browserRenderTargetSchema,
  profile: renderProfileHintsSchema.optional()
});

const APP_SHELL_SELECTORS = [
  '[data-ui-root]',
  '[data-app-shell]',
  '[role="main"]',
  'main',
  '#__next',
  '#__nuxt',
  '#root',
  '#app',
  '[data-reactroot]'
] as const;

const AUTH_GATED_APP_SHELL_SELECTORS = [
  '[data-authenticated-shell]',
  '[data-app-shell]',
  '[data-ui-root]',
  '[role="main"]',
  'main',
  '#__next',
  '#__nuxt',
  '#root',
  '#app',
  '[data-reactroot]'
] as const;

const getRoutePath = (input: z.infer<typeof renderProfileResolverInputSchema>): string => {
  if (input.profile?.routePath) return input.profile.routePath;
  if (input.target.mode === 'existing_url') {
    try {
      return new URL(input.target.url).pathname || '/';
    } catch {
      return '/';
    }
  }
  return input.target.path || '/';
};

const inferSurfaceMode = (input: z.infer<typeof renderProfileResolverInputSchema>, routePath: string): SurfaceMode => {
  if (input.profile?.surfaceMode) return input.profile.surfaceMode;
  if (input.rootUiId) return 'component';
  const path = routePath.toLowerCase();
  const shellLikePath = /\/(app|dashboard|workspace|settings|account|projects|files|admin)(?:\/|$)/.test(path);
  if (input.profile?.authenticated || shellLikePath) return 'auth_gated_spa';
  if (input.hydrationSelector || input.target.mode !== 'existing_url') return 'app_shell';
  return 'document';
};

export class RenderProfileResolver {
  public resolve(inputRaw: z.input<typeof renderProfileResolverInputSchema>): RenderProfile {
    const input = renderProfileResolverInputSchema.parse(inputRaw);
    const routePath = getRoutePath(input);
    const surfaceMode = inferSurfaceMode(input, routePath);

    if (input.rootUiId) {
      return renderProfileSchema.parse({
        surfaceMode,
        authenticated: input.profile?.authenticated ?? false,
        rootStrategy: 'explicit_ui_id',
        preferredRootSelectors: [`[data-ui-id="${input.rootUiId}"]`],
        preserveOuterShell: surfaceMode !== 'component',
        expectPersistentShell: surfaceMode === 'app_shell' || surfaceMode === 'auth_gated_spa',
        allowBodyFallback: true,
        notes: ['render profile resolved from explicit root uiId']
      });
    }

    const selectors = input.profile?.preferredRootSelectors?.length
      ? input.profile.preferredRootSelectors
      : surfaceMode === 'auth_gated_spa'
        ? [...AUTH_GATED_APP_SHELL_SELECTORS]
        : surfaceMode === 'app_shell'
          ? [...APP_SHELL_SELECTORS]
          : [];

    return renderProfileSchema.parse({
      surfaceMode,
      authenticated: input.profile?.authenticated ?? surfaceMode === 'auth_gated_spa',
      rootStrategy: selectors.length ? 'preferred_selector' : 'body_fallback',
      preferredRootSelectors: selectors,
      preserveOuterShell: surfaceMode === 'app_shell' || surfaceMode === 'auth_gated_spa',
      expectPersistentShell: surfaceMode === 'app_shell' || surfaceMode === 'auth_gated_spa',
      allowBodyFallback: true,
      notes: selectors.length
        ? [`render profile resolved in ${surfaceMode} mode with selector-first root detection`]
        : [`render profile resolved in ${surfaceMode} mode with body fallback root detection`]
    });
  }
}

export const createRenderProfileResolver = (): RenderProfileResolver => new RenderProfileResolver();
