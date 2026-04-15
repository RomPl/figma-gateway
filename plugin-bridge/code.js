const GATEWAY_URL = 'https://figma-gateway.vazovski.art';
const API_BEARER_TOKEN = '8f6c2d4e7a0b1c9d3e5f7a8b2c4d6e8f9a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d';
const CLIENT_NAME = 'figma-plugin-bridge';
const POLL_INTERVAL_MS = 3000;
const SUPPORTED_GENERIC_COMMANDS = new Set(['create_page', 'create_frame', 'create_section', 'update_text', 'duplicate_block', 'apply_style_from_alias']);
const STYLE_ALIAS_REGISTRY = {
  'hero-primary': {
    fills: [{ type: 'SOLID', color: { r: 0.145, g: 0.388, b: 0.922 } }]
  },
  'footer-contact': {
    fills: [{ type: 'SOLID', color: { r: 0.149, g: 0.165, b: 0.184 } }]
  }
};

const state = {
  status: 'starting',
  connected: false,
  sessionId: '',
  sessionToken: '',
  fileKey: '',
  localFileKey: '',
  fileName: '',
  lastPollAt: '',
  lastCommand: '',
  lastError: '',
  pendingCount: 0
};

figma.showUI(__html__, { width: 360, height: 420, title: 'Figma Gateway Plugin Bridge' });

function isoNow() {
  return new Date().toISOString();
}

function syncFileState() {
  state.fileKey = figma.fileKey || '';
  state.localFileKey = typeof figma.editorType === 'string' ? 'local:' + figma.editorType : 'local:figma';
  state.fileName = figma.root && figma.root.name ? figma.root.name : 'Untitled';
}

function pushState() {
  syncFileState();
  figma.ui.postMessage({ type: 'bridge-status', state: state });
}

function setError(message) {
  state.status = 'error';
  state.connected = false;
  state.lastError = String(message || 'Unknown error');
  pushState();
}

function setConnected(sessionId, sessionToken) {
  state.status = 'connected';
  state.connected = true;
  state.sessionId = sessionId;
  state.sessionToken = sessionToken;
  state.lastError = '';
  pushState();
}

function setPollHeartbeat() {
  state.lastPollAt = isoNow();
  pushState();
}

function setLastCommand(text) {
  state.lastCommand = text;
  pushState();
}

function setPendingCount(count) {
  state.pendingCount = count;
  pushState();
}

function getFileRegistrationPayload() {
  syncFileState();
  return {
    fileKey: state.fileKey || undefined,
    localFileKey: state.localFileKey,
    fileName: state.fileName,
    clientName: CLIENT_NAME
  };
}

async function registerSession() {
  const response = await fetch(GATEWAY_URL + '/api/plugin-bridge/sessions/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + API_BEARER_TOKEN
    },
    body: JSON.stringify(getFileRegistrationPayload())
  });
  if (!response.ok) {
    let details = '';
    try {
      details = await response.text();
    } catch (error) {
      details = '';
    }
    throw new Error('Session registration failed: ' + response.status + (details ? ' ' + details : ''));
  }
  return response.json();
}

async function getPendingCommands(sessionId, sessionToken) {
  const response = await fetch(GATEWAY_URL + '/api/plugin-bridge/sessions/' + sessionId + '/commands/pending', {
    cache: 'no-store',
    headers: {
      'Authorization': 'Bearer ' + API_BEARER_TOKEN,
      'X-Plugin-Session-Token': sessionToken
    }
  });
  if (!response.ok) {
    let details = '';
    try {
      details = await response.text();
    } catch (error) {
      details = '';
    }
    throw new Error('Pending command fetch failed: ' + response.status + (details ? ' ' + details : ''));
  }
  return response.json();
}

async function completeCommand(sessionId, sessionToken, commandId, payload) {
  const response = await fetch(GATEWAY_URL + '/api/plugin-bridge/sessions/' + sessionId + '/commands/' + commandId + '/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + API_BEARER_TOKEN,
      'X-Plugin-Session-Token': sessionToken
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    let details = '';
    try {
      details = await response.text();
    } catch (error) {
      details = '';
    }
    throw new Error('Complete command failed: ' + response.status + (details ? ' ' + details : ''));
  }
  return response.json();
}

async function handleUpdateText(command, sessionId, sessionToken) {
  const nodeId = command.payload && command.payload.nodeId ? String(command.payload.nodeId) : '';
  if (!nodeId) {
    throw new Error('update-text requires nodeId');
  }
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error('Node not found for update-text: ' + nodeId);
  }
  if (!('characters' in node)) {
    throw new Error('Target node does not support text updates: ' + nodeId);
  }
  if (node.fontName !== figma.mixed && node.fontName) {
    await figma.loadFontAsync(node.fontName);
  }
  node.characters = String(command.payload && command.payload.text ? command.payload.text : '');
  await completeCommand(sessionId, sessionToken, command.commandId, {
    result: { nodeId: node.id, text: node.characters }
  });
  setLastCommand('update-text → ' + node.id + ' (' + command.commandId + ')');
  console.log('Updated text:', node.id);
  figma.notify('Updated text: ' + node.id);
}

async function handleApplyStyleFromAlias(command, sessionId, sessionToken) {
  const nodeId = command.payload && command.payload.nodeId ? String(command.payload.nodeId) : '';
  const alias = command.payload && command.payload.alias ? String(command.payload.alias) : '';
  if (!nodeId || !alias) {
    throw new Error('apply-style-from-alias requires nodeId and alias');
  }
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error('Node not found for apply-style-from-alias: ' + nodeId);
  }
  const style = STYLE_ALIAS_REGISTRY[alias];
  if (!style) {
    throw new Error('Alias style not found in plugin registry: ' + alias);
  }
  if (style.fills && 'fills' in node) {
    node.fills = style.fills;
  }
  await completeCommand(sessionId, sessionToken, command.commandId, {
    result: { nodeId: node.id, alias: alias, applied: true }
  });
  setLastCommand('apply-style-from-alias → ' + alias + ' (' + command.commandId + ')');
  console.log('Applied style alias:', alias, 'to', node.id);
  figma.notify('Applied style alias: ' + alias);
}

async function handleDuplicateBlock(command, sessionId, sessionToken) {
  const sourceNodeId = command.payload && command.payload.nodeId ? String(command.payload.nodeId) : '';
  if (!sourceNodeId) {
    throw new Error('duplicate-block requires nodeId');
  }
  const sourceNode = await figma.getNodeByIdAsync(sourceNodeId);
  if (!sourceNode) {
    throw new Error('Source node not found for duplicate-block: ' + sourceNodeId);
  }
  if (!('clone' in sourceNode)) {
    throw new Error('Target node does not support clone(): ' + sourceNodeId);
  }
  const cloned = sourceNode.clone();
  const targetParentNodeId = command.payload && command.payload.targetParentNodeId ? String(command.payload.targetParentNodeId) : '';
  let targetParent = null;
  if (targetParentNodeId) {
    try {
      targetParent = await figma.getNodeByIdAsync(targetParentNodeId);
    } catch (error) {
      targetParent = null;
    }
  }
  if (!targetParent || !('appendChild' in targetParent)) {
    targetParent = sourceNode.parent && 'appendChild' in sourceNode.parent ? sourceNode.parent : figma.currentPage;
  }
  targetParent.appendChild(cloned);
  if (command.payload && command.payload.name) {
    cloned.name = String(command.payload.name);
  }
  if (command.payload && command.payload.x !== null && command.payload.x !== undefined && 'x' in cloned) {
    cloned.x = Number(command.payload.x);
  }
  if (command.payload && command.payload.y !== null && command.payload.y !== undefined && 'y' in cloned) {
    cloned.y = Number(command.payload.y);
  }
  await completeCommand(sessionId, sessionToken, command.commandId, {
    result: { nodeId: cloned.id, name: cloned.name, parentNodeId: targetParent.id }
  });
  setLastCommand('duplicate-block → ' + cloned.name + ' (' + command.commandId + ')');
  console.log('Duplicated block:', cloned.name, 'id=', cloned.id);
  figma.notify('Duplicated block: ' + cloned.name);
}

async function handleCreateSection(command, sessionId, sessionToken) {
  const parentNodeId = command.payload && command.payload.parentNodeId ? String(command.payload.parentNodeId) : '';
  let parent = null;
  if (parentNodeId) {
    try {
      parent = await figma.getNodeByIdAsync(parentNodeId);
    } catch (error) {
      parent = null;
    }
  }
  if (!parent || !('appendChild' in parent)) {
    parent = figma.currentPage;
  }
  const section = figma.createSection();
  section.name = String(command.payload && command.payload.name ? command.payload.name : 'New Section');
  const width = command.payload && command.payload.width !== null && command.payload.width !== undefined ? Number(command.payload.width) : 1440;
  const height = command.payload && command.payload.height !== null && command.payload.height !== undefined ? Number(command.payload.height) : 1024;
  section.resizeWithoutConstraints(width, height);
  const x = command.payload && command.payload.x !== null && command.payload.x !== undefined ? Number(command.payload.x) : 0;
  const y = command.payload && command.payload.y !== null && command.payload.y !== undefined ? Number(command.payload.y) : 0;
  section.x = x;
  section.y = y;
  parent.appendChild(section);
  await completeCommand(sessionId, sessionToken, command.commandId, {
    result: { sectionId: section.id, name: section.name, parentNodeId: parent.id }
  });
  setLastCommand('create-section → ' + section.name + ' (' + command.commandId + ')');
  console.log('Created section:', section.name, 'id=', section.id);
  figma.notify('Created section: ' + section.name);
}

async function handleCreateFrame(command, sessionId, sessionToken) {
  const parentNodeId = command.payload && command.payload.parentNodeId ? String(command.payload.parentNodeId) : '';
  let parent = null;
  if (parentNodeId) {
    try {
      parent = await figma.getNodeByIdAsync(parentNodeId);
    } catch (error) {
      parent = null;
    }
  }
  if (!parent || !('appendChild' in parent)) {
    parent = figma.currentPage;
  }
  const frame = figma.createFrame();
  frame.name = String(command.payload && command.payload.name ? command.payload.name : 'New Frame');
  frame.resizeWithoutConstraints(
    Number(command.payload && command.payload.width ? command.payload.width : 1440),
    Number(command.payload && command.payload.height ? command.payload.height : 1024)
  );
  const x = command.payload && command.payload.x !== null && command.payload.x !== undefined ? Number(command.payload.x) : 0;
  const y = command.payload && command.payload.y !== null && command.payload.y !== undefined ? Number(command.payload.y) : 0;
  frame.x = x;
  frame.y = y;
  parent.appendChild(frame);
  await completeCommand(sessionId, sessionToken, command.commandId, {
    result: { frameId: frame.id, name: frame.name, parentNodeId: parent.id }
  });
  setLastCommand('create-frame → ' + frame.name + ' (' + command.commandId + ')');
  console.log('Created frame:', frame.name, 'id=', frame.id);
  figma.notify('Created frame: ' + frame.name);
}

async function handleCreatePage(command, sessionId, sessionToken) {
  const page = figma.createPage();
  page.name = String(command.payload && command.payload.name ? command.payload.name : 'New Page');
  await completeCommand(sessionId, sessionToken, command.commandId, {
    result: { pageId: page.id, name: page.name }
  });
  setLastCommand('create-page → ' + page.name + ' (' + command.commandId + ')');
  console.log('Created page:', page.name, 'id=', page.id);
  figma.notify('Created page: ' + page.name);
}

async function executeGenericCommand(step, sessionId, sessionToken, commandIdForLog) {
  const stepType = step && step.type ? String(step.type) : '';
  const payload = step && step.payload ? step.payload : {};
  if (!SUPPORTED_GENERIC_COMMANDS.has(stepType)) {
    throw new Error('Unsupported generic plugin command: ' + stepType);
  }
  if (stepType === 'create_page') {
    return handleCreatePage({ commandId: commandIdForLog, payload: { name: payload.name } }, sessionId, sessionToken);
  }
  if (stepType === 'create_frame') {
    return handleCreateFrame({ commandId: commandIdForLog, payload: payload }, sessionId, sessionToken);
  }
  if (stepType === 'create_section') {
    return handleCreateSection({ commandId: commandIdForLog, payload: payload }, sessionId, sessionToken);
  }
  if (stepType === 'update_text') {
    return handleUpdateText({ commandId: commandIdForLog, payload: payload }, sessionId, sessionToken);
  }
  if (stepType === 'duplicate_block') {
    return handleDuplicateBlock({ commandId: commandIdForLog, payload: payload }, sessionId, sessionToken);
  }
  if (stepType === 'apply_style_from_alias') {
    return handleApplyStyleFromAlias({ commandId: commandIdForLog, payload: payload }, sessionId, sessionToken);
  }
}

async function handleExecutePluginCommand(command, sessionId, sessionToken) {
  const step = command.payload && command.payload.command ? command.payload.command : null;
  if (!step) {
    throw new Error('execute-plugin-command requires command');
  }
  await executeGenericCommand(step, sessionId, sessionToken, command.commandId);
}

async function handleExecutePluginBatch(command, sessionId, sessionToken) {
  const steps = command.payload && Array.isArray(command.payload.commands) ? command.payload.commands : [];
  if (!steps.length) {
    throw new Error('execute-plugin-batch requires commands');
  }
  const results = [];
  for (const step of steps) {
    const stepType = step && step.type ? String(step.type) : '';
    await executeGenericCommand(step, sessionId, sessionToken, command.commandId + ':' + stepType);
    results.push({ type: stepType, status: 'executed' });
  }
  await completeCommand(sessionId, sessionToken, command.commandId, { result: { results: results } });
  setLastCommand('execute-plugin-batch → ' + steps.length + ' steps (' + command.commandId + ')');
  figma.notify('Executed plugin batch: ' + steps.length + ' steps');
}

async function pollOnce() {
  const pending = await getPendingCommands(state.sessionId, state.sessionToken);
  setPollHeartbeat();
  const items = pending && pending.data ? pending.data : [];
  setPendingCount(items.length);
  if (!items.length) {
    setLastCommand(state.lastCommand || 'No pending commands');
    return;
  }
  for (const command of items) {
    if (command.type === 'create-page') {
      await handleCreatePage(command, state.sessionId, state.sessionToken);
    } else if (command.type === 'create-frame') {
      await handleCreateFrame(command, state.sessionId, state.sessionToken);
    } else if (command.type === 'create-section') {
      await handleCreateSection(command, state.sessionId, state.sessionToken);
    } else if (command.type === 'duplicate-block') {
      await handleDuplicateBlock(command, state.sessionId, state.sessionToken);
    } else if (command.type === 'apply-style-from-alias') {
      await handleApplyStyleFromAlias(command, state.sessionId, state.sessionToken);
    } else if (command.type === 'update-text') {
      await handleUpdateText(command, state.sessionId, state.sessionToken);
    } else if (command.type === 'execute-plugin-command') {
      await handleExecutePluginCommand(command, state.sessionId, state.sessionToken);
    } else if (command.type === 'execute-plugin-batch') {
      await handleExecutePluginBatch(command, state.sessionId, state.sessionToken);
    } else {
      setLastCommand('Unsupported command: ' + command.type);
    }
  }
}

figma.ui.onmessage = async function (msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'request-status') {
    pushState();
    return;
  }
  if (msg.type === 'reconnect-session') {
    try {
      state.status = 'reconnecting';
      state.connected = false;
      state.lastError = '';
      pushState();
      const registration = await registerSession();
      setConnected(registration.data.sessionId, registration.data.sessionToken);
      setLastCommand('Session re-registered');
      figma.notify('Plugin bridge reconnected: ' + registration.data.sessionId);
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      console.error(error);
      setError(message);
      figma.notify(message, { error: true, timeout: 8000 });
    }
    return;
  }
  if (msg.type === 'copy-session-id') {
    const value = msg.value || state.sessionId || '';
    figma.notify(value ? 'Session ID ready to copy: ' + value : 'Session ID is empty');
    return;
  }
};

async function main() {
  syncFileState();
  pushState();
  try {
    const registration = await registerSession();
    const sessionId = registration.data.sessionId;
    const sessionToken = registration.data.sessionToken;
    setConnected(sessionId, sessionToken);
    setLastCommand('Session registered');
    figma.notify('Plugin bridge connected: ' + sessionId);
    setInterval(async function () {
      try {
        await pollOnce();
      } catch (error) {
        const message = String(error && error.message ? error.message : error);
        console.error(error);
        setError(message);
      }
    }, POLL_INTERVAL_MS);
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    console.error(error);
    setError(message);
    figma.notify(message, { error: true, timeout: 8000 });
  }
}

main();
