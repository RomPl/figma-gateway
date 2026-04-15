const { spawn } = require('node:child_process');

const server = spawn('node', [
  '/home/figma-gateway.vazovski.art/scripts/mcp-stdio-runner.mjs'
], {
  cwd: '/home/figma-gateway.vazovski.art',
  env: { ...process.env },
  stdio: ['pipe', 'pipe', 'pipe']
});

const pending = new Map();
let nextId = 1;
let buffer = '';

function sendMessage(message) {
  server.stdin.write(JSON.stringify(message) + '\n');
}

function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, method });
    sendMessage({ jsonrpc: '2.0', id, method, params });
  });
}

function parseMessages() {
  while (true) {
    const sep = buffer.indexOf('\n');
    if (sep === -1) return;
    const line = buffer.slice(0, sep).trim();
    buffer = buffer.slice(sep + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, method } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
      } else {
        resolve(message.result);
      }
    }
  }
}

server.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  parseMessages();
});

let stderr = '';
server.stderr.on('data', (chunk) => {
  stderr += chunk.toString('utf8');
});

server.on('exit', (code) => {
  if (code !== 0 && pending.size > 0) {
    for (const [id, { reject, method }] of pending) {
      reject(new Error(`${method} aborted; server exited with code ${code}; stderr=${stderr}`));
      pending.delete(id);
    }
  }
});

(async () => {
  try {
    const init = await request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'stdio-smoke', version: '1.0.0' }
    });
    sendMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });

    const tools = await request('tools/list', {});
    const toolNames = tools.tools.map((tool) => tool.name).sort();

    const calls = [];
    calls.push({
      tool: 'figma_search_aliases',
      result: await request('tools/call', { name: 'figma_search_aliases', arguments: { query: 'hero', limit: 5 } })
    });
    calls.push({
      tool: 'figma_resolve_alias',
      result: await request('tools/call', { name: 'figma_resolve_alias', arguments: { alias: 'hero-primary' } })
    });
    calls.push({
      tool: 'figma_create_frame',
      result: await request('tools/call', {
        name: 'figma_create_frame',
        arguments: {
          fileKey: 'file-smoke',
          parentNodeId: '1:1',
          name: 'MCP Dry Run',
          width: 1440,
          height: 320,
          dryRun: true
        }
      })
    });

    console.log(JSON.stringify({
      ok: true,
      initialize: init,
      toolCount: toolNames.length,
      tools: toolNames,
      calls
    }, null, 2));
    server.kill('SIGINT');
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error), stderr }, null, 2));
    server.kill('SIGKILL');
    process.exit(1);
  }
})();
