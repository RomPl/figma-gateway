import { spawn } from 'node:child_process';

import { Router } from 'express';
import { z } from 'zod';

import { listAssetRegistrySchema, resolveAssetRegistrySchema } from '../../core/asset-registry';
import { asyncHandler, sendSuccess, validateRequest } from './helpers';

export const assetsRouter = Router();

const proxyAssetSchema = z.object({ src: z.string().url(), sourceKind: z.enum(['svg', 'raster']).optional() });

const hasExtension = (value: string, pattern: RegExp): boolean => {
  try {
    const url = new URL(value);
    return pattern.test(url.pathname.toLowerCase());
  } catch {
    return pattern.test(String(value || '').toLowerCase());
  }
};

const looksLikeSvg = (sourceUrl: string, contentType: string | null, bytes: Buffer): boolean => {
  if (String(contentType || '').toLowerCase().includes('image/svg+xml')) return true;
  if (hasExtension(sourceUrl, /\.svg$/)) return true;
  return bytes.toString('utf8', 0, Math.min(bytes.length, 256)).trimStart().startsWith('<svg');
};

const isSupportedRasterContent = (sourceUrl: string, contentType: string | null, bytes: Buffer): boolean => {
  const lowerType = String(contentType || '').toLowerCase();
  if (lowerType.includes('image/png') || lowerType.includes('image/jpeg') || lowerType.includes('image/jpg') || lowerType.includes('image/gif')) return true;
  if (hasExtension(sourceUrl, /\.(png|jpe?g|gif)$/)) return true;
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'GIF8') return true;
  return false;
};

const convertImageToPng = async (input: Buffer): Promise<Buffer> =>
  await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn('python3', ['-c', [
      'import sys, io',
      'from PIL import Image',
      'data = sys.stdin.buffer.read()',
      'im = Image.open(io.BytesIO(data))',
      'out = io.BytesIO()',
      "im.save(out, format='PNG')",
      'sys.stdout.buffer.write(out.getvalue())'
    ].join('; ')]);
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code === 0 && chunks.length) return resolve(Buffer.concat(chunks));
      reject(new Error(`python pillow conversion failed (${code ?? 'unknown'}): ${Buffer.concat(stderr).toString('utf8').trim() || 'no stderr output'}`));
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });

assetsRouter.get(
  '/assets',
  validateRequest({ query: listAssetRegistrySchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.assetRegistryService.listAssets(req.query);
    sendSuccess(res, data);
  })
);

assetsRouter.get(
  '/assets/proxy',
  validateRequest({ query: proxyAssetSchema }),
  asyncHandler(async (req, res) => {
    const { src, sourceKind } = req.query as z.infer<typeof proxyAssetSchema>;
    const upstream = await fetch(src, { redirect: 'follow', headers: { 'User-Agent': 'figma-gateway-asset-proxy/0.1' } });
    if (!upstream.ok) {
      res.status(upstream.status).json({ success: false, error: { code: 'ASSET_PROXY_FETCH_FAILED', message: `Failed to fetch upstream asset: ${upstream.status} ${upstream.statusText}` } });
      return;
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type');
    if (sourceKind === 'svg' || looksLikeSvg(src, contentType, bytes)) {
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(bytes);
      return;
    }
    if (isSupportedRasterContent(src, contentType, bytes)) {
      res.setHeader('Content-Type', String(contentType || 'application/octet-stream'));
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(bytes);
      return;
    }
    const png = await convertImageToPng(bytes);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(png);
  })
);

assetsRouter.get(
  '/assets/:assetId',
  validateRequest({ params: resolveAssetRegistrySchema }),
  asyncHandler(async (req, res) => {
    const data = req.app.locals.assetRegistryService.resolveAsset({ assetId: String(req.params.assetId) });
    sendSuccess(res, data);
  })
);

