import { Router } from 'express';
import { z } from 'zod';

import { extractRenderedUiSchema } from '../../core/rendered-ui-extractor';
import { attachBreakpointVariantSet } from '../../core/breakpoint-variant-set';
import { segmentVisualBlocks } from '../../core/visual-segmentation';
import { normalizeRenderableAssetSourcesForTarget } from '../../core/code-to-figma-pipeline';
import { createObservedDesignSystem } from '../../core/design-system-extractor';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const designSystemRouter = Router();

const designSystemExtractRouteSchema = extractRenderedUiSchema.extend({
  title: z.string().trim().min(1).max(160).optional(),
  maxItemsPerSection: z.number().int().positive().max(64).default(24),
  includeFigmaCommands: z.coerce.boolean().default(true),
  x: z.number().finite().optional(),
  y: z.number().finite().optional()
});

designSystemRouter.post(
  '/design-system/extract',
  validateRequest({ body: designSystemExtractRouteSchema }),
  asyncHandler(async (req, res) => {
    const data = designSystemExtractRouteSchema.parse(req.body);
    const extracted = await req.app.locals.renderedUiExtractorService.extract(data);
    const model = attachBreakpointVariantSet(segmentVisualBlocks(extracted));
    normalizeRenderableAssetSourcesForTarget(model);
    const sourceUrl = data.target.mode === 'existing_url' ? data.target.url : undefined;
    const title = data.title ?? (sourceUrl ? new URL(sourceUrl).hostname : 'Rendered UI');
    const observed = createObservedDesignSystem(model, {
      title,
      sourceUrl,
      maxItemsPerSection: data.maxItemsPerSection,
      x: data.x,
      y: data.y
    });
    sendSuccess(res, {
      designSystem: observed.document,
      commands: data.includeFigmaCommands ? observed.commands : undefined,
      commandCount: data.includeFigmaCommands ? observed.commands.length : 0,
      notes: [
        'Observed design system was extracted from rendered browser truth.',
        'Tokens are evidence-backed suggestions, not yet curated brand truth.',
        'Figma commands create editable documentation frames with plugin data for reverse sync.'
      ]
    });
  })
);
