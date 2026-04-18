import { z } from 'zod';

import type { UiModelDocument, UiNode } from './ui-model';
import { renderProfileSchema, surfaceModeSchema } from './render-profile-resolver';

export const breakpointFamilySchema = z.enum(['desktop', 'tablet', 'mobile']);
export type BreakpointFamily = z.infer<typeof breakpointFamilySchema>;

export const planningContextSchema = z.object({
  surfaceMode: surfaceModeSchema,
  rootStrategy: z.enum(['explicit_ui_id', 'preferred_selector', 'body_fallback']).optional(),
  authenticated: z.boolean().default(false),
  shellSelectionMode: z.string().trim().min(1).optional(),
  contentSelectionMode: z.string().trim().min(1).optional(),
  shellPreserved: z.boolean().default(false),
  shellRootTag: z.string().trim().min(1).optional(),
  contentRootTag: z.string().trim().min(1).optional(),
  breakpointName: z.string().trim().min(1).optional(),
  breakpointFamily: breakpointFamilySchema,
  viewportWidth: z.number().finite().positive().optional(),
  viewportHeight: z.number().finite().positive().optional(),
  notes: z.array(z.string().trim().min(1)).default([])
});

export type PlanningContext = z.infer<typeof planningContextSchema>;

const inferBreakpointFamily = (breakpointName?: string, viewportWidth?: number): BreakpointFamily => {
  const name = String(breakpointName || '').toLowerCase();
  if (name.includes('mobile')) return 'mobile';
  if (name.includes('tablet')) return 'tablet';
  if (name.includes('desktop')) return 'desktop';
  if (typeof viewportWidth === 'number') {
    if (viewportWidth < 768) return 'mobile';
    if (viewportWidth < 1180) return 'tablet';
  }
  return 'desktop';
};

export const createPlanningContextFromNode = (node: UiNode): PlanningContext => {
  const meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
  const renderProfileRaw = (meta as Record<string, unknown>).renderProfile;
  const renderSurfaceRaw = (meta as Record<string, unknown>).renderSurface;
  const renderProfile = renderProfileRaw && typeof renderProfileRaw === 'object' ? renderProfileSchema.safeParse(renderProfileRaw) : null;
  const renderSurface = renderSurfaceRaw && typeof renderSurfaceRaw === 'object' ? renderSurfaceRaw as Record<string, unknown> : {};
  const viewportWidth = node.responsive?.viewportWidth;
  const viewportHeight = node.responsive?.viewportHeight;
  const breakpointName = node.responsive?.breakpointName;
  const surfaceMode = renderProfile?.success ? renderProfile.data.surfaceMode : surfaceModeSchema.parse('document');
  return planningContextSchema.parse({
    surfaceMode,
    rootStrategy: renderProfile?.success ? renderProfile.data.rootStrategy : undefined,
    authenticated: renderProfile?.success ? renderProfile.data.authenticated : false,
    shellSelectionMode: typeof renderSurface.shellSelectionMode === 'string' ? renderSurface.shellSelectionMode : undefined,
    contentSelectionMode: typeof renderSurface.contentSelectionMode === 'string' ? renderSurface.contentSelectionMode : undefined,
    shellPreserved: typeof renderSurface.shellPreserved === 'boolean' ? renderSurface.shellPreserved : false,
    shellRootTag: typeof renderSurface.shellRootTag === 'string' ? renderSurface.shellRootTag : undefined,
    contentRootTag: typeof renderSurface.contentRootTag === 'string' ? renderSurface.contentRootTag : undefined,
    breakpointName,
    breakpointFamily: inferBreakpointFamily(breakpointName, viewportWidth),
    viewportWidth,
    viewportHeight,
    notes: [
      `surface:${surfaceMode}`,
      `breakpoint-family:${inferBreakpointFamily(breakpointName, viewportWidth)}`,
      ...(typeof renderSurface.contentSelectionMode === 'string' ? [`content-root:${renderSurface.contentSelectionMode}`] : [])
    ]
  });
};

export const attachPlanningContext = (document: UiModelDocument): UiModelDocument => {
  const planningContext = createPlanningContextFromNode(document.root);
  document.root.meta = { ...(document.root.meta ?? {}), planningContext };
  return document;
};


export const formatPlanningVariantName = (context: PlanningContext, baseName: string): string => {
  const parts = [baseName, context.breakpointFamily];
  if (context.surfaceMode !== 'component') parts.push(context.surfaceMode);
  return parts.join(' · ');
};
