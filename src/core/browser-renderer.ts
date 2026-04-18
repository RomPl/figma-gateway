import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { z } from 'zod';

import { AppError } from './errors';
import { assertVisualPageAuditAllowed, visualGuardrailsPolicySchema, type VisualPageAudit } from './visual-guardrails';
import { visualLogger } from './visual-debug';

const viewportSchema = z.object({
  width: z.number().int().min(320).max(3840).default(1440),
  height: z.number().int().min(320).max(3840).default(900)
});

const browserTargetExistingUrlSchema = z.object({ mode: z.literal('existing_url'), url: z.string().url() });
const browserTargetControlledRunnerSchema = z.object({
  mode: z.literal('controlled_local_runner'),
  projectRoot: z.string().trim().min(1),
  command: z.string().trim().min(1).max(2000),
  port: z.number().int().min(1).max(65535),
  path: z.string().trim().default('/'),
  startupTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
  shutdownTimeoutMs: z.number().int().min(1000).max(30000).default(5000),
  readyUrl: z.string().url().optional(),
  readyPattern: z.string().trim().min(1).max(500).optional(),
  maxOutputBytes: z.number().int().min(1024).max(1024 * 1024).default(65536)
});
const browserTargetPreviewBuildSchema = z.object({
  mode: z.literal('preview_build'),
  projectRoot: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535),
  path: z.string().trim().default('/'),
  buildCommand: z.string().trim().min(1).max(2000).default('npm run build'),
  previewCommand: z.string().trim().min(1).max(2000).optional(),
  startupTimeoutMs: z.number().int().min(1000).max(120000).default(45000),
  shutdownTimeoutMs: z.number().int().min(1000).max(30000).default(5000),
  readyUrl: z.string().url().optional(),
  readyPattern: z.string().trim().min(1).max(500).optional(),
  maxOutputBytes: z.number().int().min(1024).max(1024 * 1024).default(65536)
});

export const browserRenderTargetSchema = z.discriminatedUnion('mode', [browserTargetExistingUrlSchema, browserTargetControlledRunnerSchema, browserTargetPreviewBuildSchema]);

export const browserRenderOpenSchema = z.object({
  guardrails: visualGuardrailsPolicySchema,
  target: browserRenderTargetSchema,
  viewport: viewportSchema.default({ width: 1440, height: 900 }),
  colorScheme: z.enum(['light', 'dark']).default('light'),
  browserHeadless: z.coerce.boolean().default(true),
  browserExecutablePath: z.string().trim().min(1).optional(),
  browserChannel: z.string().trim().min(1).optional(),
  userAgent: z.string().trim().min(1).max(500).optional(),
  navigationTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
  actionTimeoutMs: z.number().int().min(1000).max(120000).default(15000),
  waitUntil: z.enum(['domcontentloaded', 'load', 'networkidle']).default('networkidle'),
  waitForMs: z.number().int().min(0).max(20000).default(0),
  hydrationSelector: z.string().trim().min(1).max(500).optional(),
  hydrationTimeoutMs: z.number().int().min(1000).max(120000).default(10000)
});

export type BrowserRenderOpenInput = z.infer<typeof browserRenderOpenSchema>;

type RunnerHandle = { process?: ChildProcess; resolvedUrl: string; stdout: string; stderr: string; shutdownTimeoutMs: number };
export type BrowserPageRuntime = { page: Page; resolvedUrl: string; targetMode: z.infer<typeof browserRenderTargetSchema>['mode']; pageAudit: VisualPageAudit };

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const toBaseUrl = (port: number, path: string): string => `http://127.0.0.1:${port}${path.startsWith('/') ? path : `/${path}`}`;

const waitForUrlReady = async (url: string, timeoutMs: number): Promise<void> => {
  const startedAt = Date.now();
  let lastError = 'unknown';
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(300);
  }
  throw new AppError(`Local runner did not become ready: ${lastError}`, 504, 'BROWSER_RENDERER_RUNNER_NOT_READY');
};

const waitForOutputPattern = async (getOutput: () => string, pattern: string, timeoutMs: number): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (getOutput().includes(pattern)) return;
    await delay(200);
  }
  throw new AppError(`Local runner did not emit ready pattern: ${pattern}`, 504, 'BROWSER_RENDERER_RUNNER_PATTERN_TIMEOUT');
};

const killProcess = async (handle: RunnerHandle): Promise<void> => {
  if (!handle.process) return;
  if (handle.process.exitCode !== null || handle.process.killed) return;
  handle.process.kill('SIGTERM');
  const startedAt = Date.now();
  while (Date.now() - startedAt < handle.shutdownTimeoutMs) {
    if (handle.process.exitCode !== null) return;
    await delay(100);
  }
  if (handle.process.exitCode === null) handle.process.kill('SIGKILL');
};

const makePreviewCommand = (port: number): string => `npm run preview -- --host 127.0.0.1 --port ${port}`;

const auditPage = async (page: Page, input: BrowserRenderOpenInput): Promise<VisualPageAudit> => {
  const raw = await page.evaluate(() => {
    const text = (document.body?.innerText || '').toLowerCase();
    const hasAuthWall = Boolean(document.querySelector('input[type="password"], form[action*="login" i], form[action*="signin" i], [data-auth-required="true"], [data-login-required="true"]')) || /sign in|log in|authentication required|please log in/.test(text);
    const hasPrivateInputs = Boolean(document.querySelector('input[type="password"], input[type="email"], input[name*="email" i], input[name*="phone" i], input[name*="ssn" i], textarea, [data-private="true"]'));
    const hasCanvas = Boolean(document.querySelector('canvas'));
    const hasWebgl = Boolean(document.querySelector('canvas[data-webgl], canvas.webgl, [data-engine="webgl"]'));
    const hasCarousel = Boolean(document.querySelector('[data-carousel], .carousel, .swiper, .slick-slider, [aria-roledescription="carousel"], [aria-label*="carousel" i]'));
    const animatedNodes = Array.from(document.querySelectorAll('*')).filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const animationDuration = Number.parseFloat(style.animationDuration || '0');
      const transitionDuration = Number.parseFloat(style.transitionDuration || '0');
      return (style.animationName && style.animationName !== 'none' && animationDuration > 0) || transitionDuration > 0.2;
    });
    const hasAnimatedRegions = animatedNodes.length > 0;
    const hasInfiniteScroll = Boolean(document.querySelector('[data-infinite-scroll="true"], .infinite-scroll, [data-virtualized="true"]')) || ((document.documentElement?.scrollHeight || 0) > ((window.innerHeight || 1) * 8));
    const riskyRegions: string[] = [];
    if (hasInfiniteScroll) riskyRegions.push('infinite_scroll');
    if (hasAnimatedRegions) riskyRegions.push('animated_regions');
    if (hasCarousel) riskyRegions.push('carousel');
    if (hasCanvas) riskyRegions.push('canvas');
    if (hasWebgl) riskyRegions.push('webgl');
    const reasons: string[] = [];
    if (hasAuthWall) reasons.push('auth_wall');
    if (hasPrivateInputs) reasons.push('private_inputs');
    return { hasAuthWall, hasPrivateInputs, hasInfiniteScroll, hasAnimatedRegions, hasCarousel, hasCanvas, hasWebgl, riskyRegions, reasons };
  });
  return assertVisualPageAuditAllowed(raw, input.guardrails);
};

export class BrowserRendererService {
  public async withPage<T>(inputRaw: z.input<typeof browserRenderOpenSchema>, fn: (runtime: BrowserPageRuntime) => Promise<T>): Promise<T> {
    const input = browserRenderOpenSchema.parse(inputRaw);
    let runner: RunnerHandle | undefined;
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;

    try {
      visualLogger.info({ targetMode: input.target.mode, viewport: input.viewport, waitUntil: input.waitUntil, hydrationSelector: input.hydrationSelector, hasExecutablePath: Boolean(input.browserExecutablePath), browserChannel: input.browserChannel }, 'browser render start');
      runner = await this.startTarget(input);
      visualLogger.info({ resolvedUrl: runner.resolvedUrl, targetMode: input.target.mode }, 'browser render target ready');
      visualLogger.info({ executablePath: input.browserExecutablePath, channel: input.browserChannel, headless: input.browserHeadless }, 'browser launch');
      browser = await chromium.launch({
        headless: input.browserHeadless,
        executablePath: input.browserExecutablePath,
        channel: input.browserExecutablePath ? undefined : input.browserChannel,
        args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--mute-audio']
      });
      context = await browser.newContext({ viewport: input.viewport, colorScheme: input.colorScheme, userAgent: input.userAgent });
      context.setDefaultNavigationTimeout(input.navigationTimeoutMs);
      context.setDefaultTimeout(input.actionTimeoutMs);
      const page = await context.newPage();
      visualLogger.info({ url: runner.resolvedUrl, navigationTimeoutMs: input.navigationTimeoutMs }, 'page goto start');
      await page.goto(runner.resolvedUrl, { waitUntil: input.waitUntil, timeout: input.navigationTimeoutMs });
      visualLogger.info({ finalUrl: page.url() }, 'page goto done');
      if (input.hydrationSelector) await page.waitForSelector(input.hydrationSelector, { timeout: input.hydrationTimeoutMs, state: 'attached' });
      if (input.waitForMs > 0) await page.waitForTimeout(input.waitForMs);
      const pageAudit = await auditPage(page, input);
      visualLogger.info({ pageAudit }, 'page audit complete');
      return await fn({ page, resolvedUrl: runner.resolvedUrl, targetMode: input.target.mode, pageAudit });
    } catch (error) {
      visualLogger.error({ err: error, targetMode: input.target.mode }, 'browser render failed');
      throw error;
    } finally {
      if (context) await context.close().catch(() => undefined);
      if (browser) await browser.close().catch(() => undefined);
      if (runner) await killProcess(runner).catch(() => undefined);
    }
  }

  public async openPage(inputRaw: z.input<typeof browserRenderOpenSchema>): Promise<{ resolvedUrl: string; title: string; finalUrl: string; htmlLength: number; targetMode: string; pageAudit: VisualPageAudit }> {
    return this.withPage(inputRaw, async ({ page, resolvedUrl, targetMode, pageAudit }) => ({ resolvedUrl, title: await page.title(), finalUrl: page.url(), htmlLength: (await page.content()).length, targetMode, pageAudit }));
  }

  private async startTarget(input: BrowserRenderOpenInput): Promise<RunnerHandle> {
    switch (input.target.mode) {
      case 'existing_url':
        visualLogger.debug({ url: input.target.url }, 'using existing url target');
        return { process: undefined, resolvedUrl: input.target.url, stdout: '', stderr: '', shutdownTimeoutMs: 0 };
      case 'controlled_local_runner':
        return this.startLocalRunner({ projectRoot: input.target.projectRoot, command: input.target.command, resolvedUrl: input.target.readyUrl ?? toBaseUrl(input.target.port, input.target.path), readyPattern: input.target.readyPattern, startupTimeoutMs: input.target.startupTimeoutMs, shutdownTimeoutMs: input.target.shutdownTimeoutMs, maxOutputBytes: input.target.maxOutputBytes, port: input.target.port });
      case 'preview_build':
        await this.runOneShotCommand(input.target.projectRoot, input.target.buildCommand, input.target.startupTimeoutMs);
        return this.startLocalRunner({ projectRoot: input.target.projectRoot, command: input.target.previewCommand ?? makePreviewCommand(input.target.port), resolvedUrl: input.target.readyUrl ?? toBaseUrl(input.target.port, input.target.path), readyPattern: input.target.readyPattern, startupTimeoutMs: input.target.startupTimeoutMs, shutdownTimeoutMs: input.target.shutdownTimeoutMs, maxOutputBytes: input.target.maxOutputBytes, port: input.target.port });
      default:
        throw new AppError('Unsupported browser render target mode', 400, 'BROWSER_RENDERER_TARGET_UNSUPPORTED');
    }
  }

  private async runOneShotCommand(projectRoot: string, command: string, timeoutMs: number): Promise<void> {
    const child = spawn('bash', ['-lc', command], { cwd: projectRoot, env: { ...process.env, HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    const [code] = await new Promise<[number | null]>((resolve) => { child.on('close', (exitCode) => resolve([exitCode])); });
    clearTimeout(timeout);
    if (code !== 0) throw new AppError(`Preview build command failed: ${command}`, 500, 'BROWSER_RENDERER_BUILD_FAILED');
  }

  private async startLocalRunner(input: { projectRoot: string; command: string; resolvedUrl: string; readyPattern?: string; startupTimeoutMs: number; shutdownTimeoutMs: number; maxOutputBytes: number; port: number; }): Promise<RunnerHandle> {
    visualLogger.info({ projectRoot: input.projectRoot, command: input.command, resolvedUrl: input.resolvedUrl, readyPattern: input.readyPattern }, 'starting local runner');
    const child = spawn('bash', ['-lc', input.command], { cwd: input.projectRoot, env: { ...process.env, HOST: '127.0.0.1', PORT: String(input.port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString('utf8');
      return next.length > input.maxOutputBytes ? next.slice(-input.maxOutputBytes) : next;
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk as Buffer); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk as Buffer); });
    child.on('exit', (code) => { if (code !== null && code !== 0) stderr = append(stderr, Buffer.from(`\nprocess exited with code ${code}`)); });
    const handle: RunnerHandle = { process: child, resolvedUrl: input.resolvedUrl, stdout, stderr, shutdownTimeoutMs: input.shutdownTimeoutMs };
    const outputReader = () => `${stdout}\n${stderr}`;
    if (input.readyPattern) await waitForOutputPattern(outputReader, input.readyPattern, input.startupTimeoutMs);
    await waitForUrlReady(input.resolvedUrl, input.startupTimeoutMs);
    visualLogger.info({ resolvedUrl: input.resolvedUrl }, 'local runner ready');
    return handle;
  }
}

export const createBrowserRendererService = (): BrowserRendererService => new BrowserRendererService();
