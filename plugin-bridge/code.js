const GATEWAY_URL = 'https://figma-gateway.vazovski.art';
const API_BEARER_TOKEN = '8f6c2d4e7a0b1c9d3e5f7a8b2c4d6e8f9a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d';
const CLIENT_NAME = 'figma-plugin-bridge';
const POLL_INTERVAL_MS = 3000;
const RUNTIME_BUILD = '2026-04-27-button-states-1';
const SESSION_STORAGE_KEY = 'figma-gateway-plugin-session-v1';
let pollInFlight = false;
const SUPPORTED_GENERIC_COMMANDS = new Set([
  'create_frame',
  'create_frame_rich',
  'create_section',
  'create_text',
  'create_text_rich',
  'create_button_state_set',
  'create_group',
  'move_node',
  'delete_node',
  'rename_node',
  'set_fill',
  'set_stroke',
  'set_corner_radius',
  'set_opacity',
  'set_size',
  'set_position',
  'set_text_content',
  'set_text_style',
  'set_auto_layout',
  'set_padding',
  'set_spacing',
  'set_alignment',
  'set_constraints',
  'set_layout_sizing',
  'set_visibility',
  'set_plugin_data',
  'get_plugin_data',
  'find_nodes',
  'delete_matching_nodes',
  'export_ui_snapshot',
  'export_node_snapshot',
  'export_design_system_snapshot',
  'export_node_as_image',
  'set_effects',
  'set_asset_reference',
  'set_icon_reference',
  'debug_runtime_info'
]);
const UI_ID_PLUGIN_NAMESPACE = 'figma-gateway';
const UI_ID_PLUGIN_KEY = 'ui-id';

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
  pendingCount: 0,
  activeSessionCount: 0
};

figma.showUI(__html__, { width: 360, height: 420, title: 'Figma Gateway Plugin Bridge' });

function isoNow() { return new Date().toISOString(); }
function syncFileState() {
  state.fileKey = figma.fileKey || '';
  state.localFileKey = typeof figma.editorType === 'string' ? 'local:' + figma.editorType : 'local:figma';
  state.fileName = figma.root && figma.root.name ? figma.root.name : 'Untitled';
}
function pushState() { syncFileState(); figma.ui.postMessage({ type: 'bridge-status', state: state }); }
function setError(message) { state.status = 'error'; state.connected = false; state.lastError = String(message || 'Unknown error'); pushState(); }
function setConnected(sessionId, sessionToken) { state.status = 'connected'; state.connected = true; state.sessionId = sessionId; state.sessionToken = sessionToken; state.lastError = ''; pushState(); persistSessionState(); refreshSessionScope().catch(function (error) { console.error('refreshSessionScope failed', error); }); }

async function persistSessionState() {
  try {
    await figma.clientStorage.setAsync(SESSION_STORAGE_KEY, {
      sessionId: state.sessionId || '',
      sessionToken: state.sessionToken || '',
      fileKey: state.fileKey || '',
      localFileKey: state.localFileKey || '',
      fileName: state.fileName || ''
    });
  } catch (error) {
    console.error('persistSessionState failed', error);
  }
}
async function loadStoredSessionState() {
  try {
    const value = await figma.clientStorage.getAsync(SESSION_STORAGE_KEY);
    return value && typeof value === 'object' ? value : null;
  } catch (error) {
    console.error('loadStoredSessionState failed', error);
    return null;
  }
}
async function clearStoredSessionState() {
  try {
    await figma.clientStorage.deleteAsync(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error('clearStoredSessionState failed', error);
  }
}
async function tryRestoreStoredSession() {
  const stored = await loadStoredSessionState();
  if (!stored || !stored.sessionId || !stored.sessionToken) return false;
  const sameFile = (stored.fileKey && stored.fileKey === state.fileKey) || (stored.localFileKey && stored.localFileKey === state.localFileKey) || (stored.fileName && stored.fileName === state.fileName);
  if (!sameFile) return false;
  try {
    await getPendingCommands(String(stored.sessionId), String(stored.sessionToken));
    setConnected(String(stored.sessionId), String(stored.sessionToken));
    setLastCommand('Session restored');
    return true;
  } catch (error) {
    console.error('tryRestoreStoredSession failed', error);
    await clearStoredSessionState();
    return false;
  }
}
function setPollHeartbeat() { state.lastPollAt = isoNow(); pushState(); }
function setLastCommand(text) { state.lastCommand = text; pushState(); }
function setPendingCount(count) { state.pendingCount = count; pushState(); }
function setActiveSessionCount(count) { state.activeSessionCount = Number(count || 0); pushState(); }
function getFileRegistrationPayload() { syncFileState(); return { fileKey: state.fileKey || undefined, localFileKey: state.localFileKey, fileName: state.fileName, clientName: CLIENT_NAME }; }
async function refreshSessionScope() {
  if (!state.sessionId || !state.sessionToken) { setActiveSessionCount(0); return null; }
  const scope = await getSessionScope(state.sessionId, state.sessionToken);
  setActiveSessionCount(scope && scope.data ? scope.data.activeSessionCount : 0);
  return scope;
}
async function registerSession() {
  const response = await fetch(GATEWAY_URL + '/api/plugin-bridge/sessions/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_BEARER_TOKEN }, body: JSON.stringify(getFileRegistrationPayload()) });
  if (!response.ok) { let details = ''; try { details = await response.text(); } catch (error) { details = ''; } throw new Error('Session registration failed: ' + response.status + (details ? ' ' + details : '')); }
  return response.json();
}
async function getPendingCommands(sessionId, sessionToken) {
  const response = await fetch(GATEWAY_URL + '/api/plugin-bridge/sessions/' + sessionId + '/commands/pending', { cache: 'no-store', headers: { 'Authorization': 'Bearer ' + API_BEARER_TOKEN, 'X-Plugin-Session-Token': sessionToken } });
  if (!response.ok) { let details = ''; try { details = await response.text(); } catch (error) { details = ''; } throw new Error('Pending command fetch failed: ' + response.status + (details ? ' ' + details : '')); }
  return response.json();
}
async function getSessionScope(sessionId, sessionToken) {
  const response = await fetch(GATEWAY_URL + '/api/plugin-bridge/sessions/' + sessionId + '/scope', { cache: 'no-store', headers: { 'Authorization': 'Bearer ' + API_BEARER_TOKEN, 'X-Plugin-Session-Token': sessionToken } });
  if (!response.ok) { let details = ''; try { details = await response.text(); } catch (error) { details = ''; } throw new Error('Session scope fetch failed: ' + response.status + (details ? ' ' + details : '')); }
  return response.json();
}
async function keepOnlyCurrentSession(sessionId, sessionToken) {
  const response = await fetch(GATEWAY_URL + '/api/plugin-bridge/sessions/' + sessionId + '/keep-current', { method: 'POST', headers: { 'Authorization': 'Bearer ' + API_BEARER_TOKEN, 'X-Plugin-Session-Token': sessionToken } });
  if (!response.ok) { let details = ''; try { details = await response.text(); } catch (error) { details = ''; } throw new Error('Keep-current failed: ' + response.status + (details ? ' ' + details : '')); }
  return response.json();
}
async function completeCommand(sessionId, sessionToken, commandId, payload) {
  const response = await fetch(GATEWAY_URL + '/api/plugin-bridge/sessions/' + sessionId + '/commands/' + commandId + '/complete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_BEARER_TOKEN, 'X-Plugin-Session-Token': sessionToken }, body: JSON.stringify(payload) });
  if (!response.ok) { let details = ''; try { details = await response.text(); } catch (error) { details = ''; } throw new Error('Complete command failed: ' + response.status + (details ? ' ' + details : '')); }
  return response.json();
}
function isSessionTransportError(error) { const message = String(error && error.message ? error.message : error); return /Pending command fetch failed: (403|404)|Complete command failed: (403|404)/i.test(message); }
async function recoverSessionAfterTransportError(reason) { try { await clearStoredSessionState(); state.status = 'reconnecting'; state.connected = false; state.lastError = ''; pushState(); const registration = await registerSession(); setConnected(registration.data.sessionId, registration.data.sessionToken); setLastCommand('Session re-registered after transport error'); figma.notify('Plugin bridge reconnected: ' + registration.data.sessionId); return true; } catch (recoveryError) { const message = String(recoveryError && recoveryError.message ? recoveryError.message : recoveryError); console.error(recoveryError); setError(message); return false; } }
function appError(code, message, details) { const error = new Error(message); error.code = code; error.details = details; return error; }
function mapError(error) {
  if (error && error.code && error.message) return { code: String(error.code), message: String(error.message), details: error.details };
  const message = String(error && error.message ? error.message : error);
  if (/not found/i.test(message)) return { code: 'NODE_NOT_FOUND', message: message };
  if (/font/i.test(message)) return { code: 'FONT_LOAD_FAILED', message: message };
  if (/support|cannot|not allowed|not supported/i.test(message)) return { code: 'UNSUPPORTED_OPERATION', message: message };
  if (/requires/i.test(message)) return { code: 'INVALID_COMMAND_PAYLOAD', message: message };
  return { code: 'PLUGIN_RUNTIME_ERROR', message: message };
}
function normalizeCommandResult(commandType, status, options) { return { commandType: String(commandType || 'unknown'), status: status === 'error' ? 'error' : 'ok', nodeId: options && Object.prototype.hasOwnProperty.call(options, 'nodeId') ? options.nodeId : null, data: options && Object.prototype.hasOwnProperty.call(options, 'data') ? options.data : undefined, error: options && Object.prototype.hasOwnProperty.call(options, 'error') ? options.error : undefined }; }
async function getNodeByIdRequired(nodeId, commandType) { const id = String(nodeId || ''); if (!id) throw appError('INVALID_COMMAND_PAYLOAD', commandType + ' requires nodeId'); const node = await figma.getNodeByIdAsync(id); if (!node) throw appError('NODE_NOT_FOUND', 'Node not found for ' + commandType + ': ' + id); return node; }
async function getParentNode(payload) { const parentNodeId = payload && payload.parentNodeId ? String(payload.parentNodeId) : ''; let parent = null; if (parentNodeId) { try { parent = await figma.getNodeByIdAsync(parentNodeId); } catch (error) { parent = null; } } if (!parent || !('appendChild' in parent)) parent = figma.currentPage; return parent; }
function setUiIdOnNode(node, uiId) { const value = String(uiId || '').trim(); if (!value || !node || !node.setPluginData) return; node.setPluginData(UI_ID_PLUGIN_NAMESPACE + ':' + UI_ID_PLUGIN_KEY, value); }
function getUiIdFromNode(node) { if (!node || !node.getPluginData) return ''; return String(node.getPluginData(UI_ID_PLUGIN_NAMESPACE + ':' + UI_ID_PLUGIN_KEY) || ''); }
function setXY(node, x, y) { if (x !== null && x !== undefined && 'x' in node) node.x = Number(x); if (y !== null && y !== undefined && 'y' in node) node.y = Number(y); }
function setSize(node, width, height, commandType) { if (width === undefined && height === undefined) throw appError('INVALID_COMMAND_PAYLOAD', commandType + ' requires width or height'); if (!('resizeWithoutConstraints' in node) && !('resize' in node)) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support resizing: ' + node.id); const nextWidth = width !== undefined ? Number(width) : node.width; const nextHeight = height !== undefined ? Number(height) : node.height; if ('resizeWithoutConstraints' in node) node.resizeWithoutConstraints(nextWidth, nextHeight); else node.resize(nextWidth, nextHeight); }
function setFills(node, fills) { if (!('fills' in node)) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support fills: ' + node.id); node.fills = Array.isArray(fills) ? fills : [fills]; }
function setStrokes(node, strokes, strokeWeight) { if (!('strokes' in node)) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support strokes: ' + node.id); node.strokes = Array.isArray(strokes) ? strokes : [strokes]; if (strokeWeight !== undefined && 'strokeWeight' in node) node.strokeWeight = Number(strokeWeight); }
async function ensureTextNode(node, commandType) { if (!('characters' in node)) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support text operations: ' + node.id); if (node.fontName && node.fontName !== figma.mixed) await figma.loadFontAsync(node.fontName); return node; }
let cachedAvailableFonts = null;
async function getAvailableFonts() { if (!cachedAvailableFonts) cachedAvailableFonts = await figma.listAvailableFontsAsync(); return cachedAvailableFonts; }
function normalizeFontStyleName(style) { return String(style || '').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' '); }
function buildStyleCandidates(styleGuess) { return Array.from(new Set([styleGuess, styleGuess.includes('Italic') ? styleGuess : `${styleGuess} Italic`, 'Black', 'Extra Bold', 'ExtraBold', 'Bold', 'Semi Bold', 'Semibold', 'Medium', 'Regular'])); }
async function loadRequestedFont(payload) {
  const rawFamily = payload && payload.fontFamily ? String(payload.fontFamily) : '';
  const requestedWeight = payload && payload.fontWeight ? String(payload.fontWeight) : '';
  const requestedStyle = payload && payload.fontStyle ? String(payload.fontStyle) : '';
  const numericWeight = Number.parseInt(requestedWeight || '400', 10);
  const normalizedStyle = requestedStyle.trim().toLowerCase();
  const weightDrivenStyle = (numericWeight >= 900) ? 'Black' : (numericWeight >= 800) ? 'Extra Bold' : (numericWeight >= 700) ? 'Bold' : (numericWeight >= 600) ? 'Semibold' : (numericWeight >= 500) ? 'Medium' : 'Regular';
  const styleGuess = (!requestedStyle || (normalizedStyle === 'regular' && numericWeight >= 500)) ? weightDrivenStyle : requestedStyle;
  const familyParts = rawFamily.split(',').map(function (item) { return String(item || '').replace(/["']/g, '').trim(); }).filter(Boolean);
  const genericFamilies = new Set(['ui-sans-serif','ui-serif','ui-monospace','system-ui','sans-serif','serif','monospace','emoji','math','fangsong']);
  const isEmojiFamily = function (item) { const normalized = String(item || '').toLowerCase(); return normalized.includes('emoji') || normalized.includes('symbol') || normalized.includes('color emoji'); };
  const candidateFamilies = familyParts.filter(function (item) { return !genericFamilies.has(String(item).toLowerCase()) && !isEmojiFamily(item); });
  if (!candidateFamilies.length) candidateFamilies.push('Inter', 'Roboto', 'Arial');
  candidateFamilies.push('Inter', 'Roboto', 'Arial');
  const uniqueFamilies = Array.from(new Set(candidateFamilies.filter(Boolean)));
  const availableFonts = await getAvailableFonts();
  const styleAttempts = buildStyleCandidates(styleGuess).map(normalizeFontStyleName);
  for (const family of uniqueFamilies) {
    const familyFonts = availableFonts.filter(function (item) { try { return String(item.fontName.family || '') === family; } catch (error) { return false; } });
    for (const wanted of styleAttempts) {
      const match = familyFonts.find(function (item) { return normalizeFontStyleName(item.fontName.style) === wanted; });
      if (!match) continue;
      try { await figma.loadFontAsync(match.fontName); return { family: match.fontName.family, style: match.fontName.style }; } catch (error) {}
    }
    for (const item of familyFonts) {
      try { await figma.loadFontAsync(item.fontName); return { family: item.fontName.family, style: item.fontName.style }; } catch (error) {}
    }
  }
  return null;
}
function safeClone(value) { try { return JSON.parse(JSON.stringify(value)); } catch (error) { return undefined; } }
function getNodeIdFromPayload(payload, refMap) { return payload && payload.nodeRef ? resolveRefId(payload.nodeRef, refMap || {}) : payload && payload.ref ? resolveRefId(payload.ref, refMap || {}) : payload && payload.nodeId ? String(payload.nodeId) : ''; }
function nodeSupportsAutoLayout(node) { return Boolean(node && ['FRAME','COMPONENT','COMPONENT_SET','INSTANCE'].includes(String(node.type))); }
function requireAutoLayoutNode(node, operation) { if (!nodeSupportsAutoLayout(node) || !('layoutMode' in node)) throw appError('UNSUPPORTED_OPERATION', operation + ' requires a Figma node that supports auto layout: ' + (node && node.id ? node.id : 'unknown')); }
function applyAutoLayout(node, payload) {
  requireAutoLayoutNode(node, 'set_auto_layout');
  const warnings = [];
  const requestedLayoutMode = payload.layoutMode !== undefined ? String(payload.layoutMode) : node.layoutMode;
  if (!['NONE','HORIZONTAL','VERTICAL'].includes(requestedLayoutMode)) throw appError('INVALID_COMMAND_PAYLOAD', 'Invalid layoutMode: ' + requestedLayoutMode);
  node.layoutMode = requestedLayoutMode;
  if (payload.layoutWrap !== undefined && 'layoutWrap' in node) {
    if (node.layoutMode === 'NONE') warnings.push('layoutWrap ignored because layoutMode=NONE');
    else node.layoutWrap = String(payload.layoutWrap);
  }
  if (payload.primaryAxisAlignItems !== undefined) {
    const value = String(payload.primaryAxisAlignItems);
    if (!['MIN','MAX','CENTER','SPACE_BETWEEN'].includes(value)) throw appError('INVALID_COMMAND_PAYLOAD', 'Invalid primaryAxisAlignItems: ' + value);
    if (node.layoutMode === 'NONE') warnings.push('primaryAxisAlignItems ignored because layoutMode=NONE');
    else node.primaryAxisAlignItems = value;
  }
  if (payload.counterAxisAlignItems !== undefined) {
    const value = String(payload.counterAxisAlignItems);
    if (!['MIN','MAX','CENTER','BASELINE'].includes(value)) throw appError('INVALID_COMMAND_PAYLOAD', 'Invalid counterAxisAlignItems: ' + value);
    if (value === 'BASELINE' && node.layoutMode !== 'HORIZONTAL') throw appError('INVALID_COMMAND_PAYLOAD', 'BASELINE counter axis alignment is only valid for HORIZONTAL auto layout');
    if (node.layoutMode === 'NONE') warnings.push('counterAxisAlignItems ignored because layoutMode=NONE');
    else node.counterAxisAlignItems = value;
  }
  if (payload.itemSpacing !== undefined) {
    if (node.layoutMode === 'NONE') warnings.push('itemSpacing ignored because layoutMode=NONE');
    else if (node.primaryAxisAlignItems === 'SPACE_BETWEEN') warnings.push('itemSpacing may be visually ignored because primaryAxisAlignItems=SPACE_BETWEEN');
    node.itemSpacing = Number(payload.itemSpacing);
  }
  if (payload.counterAxisSpacing !== undefined) {
    if (node.layoutMode === 'NONE') warnings.push('counterAxisSpacing ignored because layoutMode=NONE');
    else if (node.layoutWrap !== 'WRAP') throw appError('INVALID_COMMAND_PAYLOAD', 'counterAxisSpacing requires layoutWrap=WRAP');
    else if ('counterAxisSpacing' in node) node.counterAxisSpacing = Number(payload.counterAxisSpacing);
  }
  if (payload.strokesIncludedInLayout !== undefined && 'strokesIncludedInLayout' in node) node.strokesIncludedInLayout = Boolean(payload.strokesIncludedInLayout);
  return warnings;
}
function applyPadding(node, payload) {
  requireAutoLayoutNode(node, 'set_padding');
  if (node.layoutMode === 'NONE') throw appError('INVALID_COMMAND_PAYLOAD', 'Padding can only be set on auto-layout frames where layoutMode is HORIZONTAL or VERTICAL');
  const padding = payload.padding || {};
  if (payload.paddingTop !== undefined || padding.top !== undefined) node.paddingTop = Number(payload.paddingTop !== undefined ? payload.paddingTop : padding.top);
  if (payload.paddingRight !== undefined || padding.right !== undefined) node.paddingRight = Number(payload.paddingRight !== undefined ? payload.paddingRight : padding.right);
  if (payload.paddingBottom !== undefined || padding.bottom !== undefined) node.paddingBottom = Number(payload.paddingBottom !== undefined ? payload.paddingBottom : padding.bottom);
  if (payload.paddingLeft !== undefined || padding.left !== undefined) node.paddingLeft = Number(payload.paddingLeft !== undefined ? payload.paddingLeft : padding.left);
  return [];
}
function applyLayoutSizing(node, payload) {
  if (!('layoutSizingHorizontal' in node)) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support layout sizing: ' + node.id);
  const warnings = [];
  const sizing = payload.layoutSizing && typeof payload.layoutSizing === 'object' ? payload.layoutSizing : {};
  const horizontal = payload.layoutSizingHorizontal !== undefined ? payload.layoutSizingHorizontal : sizing.horizontal;
  const vertical = payload.layoutSizingVertical !== undefined ? payload.layoutSizingVertical : sizing.vertical;
  function apply(axis, value) {
    if (value === undefined) return;
    const normalized = String(value);
    if (!['FIXED','HUG','FILL'].includes(normalized)) throw appError('INVALID_COMMAND_PAYLOAD', 'Invalid layout sizing value: ' + normalized);
    if (normalized === 'FILL' && (!node.parent || !('layoutMode' in node.parent) || node.parent.layoutMode === 'NONE')) throw appError('INVALID_COMMAND_PAYLOAD', 'FILL sizing is only valid for children of auto-layout frames');
    if (normalized === 'HUG' && !['FRAME','TEXT','COMPONENT','COMPONENT_SET','INSTANCE'].includes(String(node.type))) throw appError('INVALID_COMMAND_PAYLOAD', 'HUG sizing is not valid for node type: ' + node.type);
    if (axis === 'horizontal') node.layoutSizingHorizontal = normalized;
    else node.layoutSizingVertical = normalized;
  }
  apply('horizontal', horizontal);
  apply('vertical', vertical);
  return warnings;
}
function extractNodeGeometry(node) { return { x: 'x' in node ? Number(node.x || 0) : undefined, y: 'y' in node ? Number(node.y || 0) : undefined, width: 'width' in node ? Number(node.width || 0) : undefined, height: 'height' in node ? Number(node.height || 0) : undefined, absoluteBoundingBox: node.absoluteBoundingBox ? safeClone(node.absoluteBoundingBox) : undefined }; }
function serializeNodeSnapshot(node, options, depth) {
  const maxDepth = options && Number.isFinite(Number(options.maxDepth)) ? Number(options.maxDepth) : 4;
  const includeChildren = options && options.includeChildren === false ? false : true;
  const snapshot = {
    id: node.id,
    name: node.name,
    type: node.type,
    uiId: getUiIdFromNode(node) || null,
    asset: getAssetPluginData(node),
    geometry: extractNodeGeometry(node),
    visible: 'visible' in node ? Boolean(node.visible) : undefined,
    opacity: 'opacity' in node ? Number(node.opacity) : undefined,
    blendMode: 'blendMode' in node ? String(node.blendMode) : undefined,
    fills: 'fills' in node ? safeClone(node.fills) : undefined,
    strokes: 'strokes' in node ? safeClone(node.strokes) : undefined,
    strokeWeight: 'strokeWeight' in node ? node.strokeWeight : undefined,
    strokeAlign: 'strokeAlign' in node ? node.strokeAlign : undefined,
    cornerRadius: 'cornerRadius' in node ? node.cornerRadius : undefined,
    rectangleCornerRadii: 'topLeftRadius' in node ? { topLeft: node.topLeftRadius, topRight: node.topRightRadius, bottomRight: node.bottomRightRadius, bottomLeft: node.bottomLeftRadius } : undefined,
    effects: 'effects' in node ? safeClone(node.effects) : undefined,
    clipsContent: 'clipsContent' in node ? Boolean(node.clipsContent) : undefined,
    layout: 'layoutMode' in node ? { layoutMode: node.layoutMode, layoutWrap: 'layoutWrap' in node ? node.layoutWrap : undefined, paddingTop: node.paddingTop, paddingRight: node.paddingRight, paddingBottom: node.paddingBottom, paddingLeft: node.paddingLeft, primaryAxisAlignItems: node.primaryAxisAlignItems, counterAxisAlignItems: node.counterAxisAlignItems, itemSpacing: node.itemSpacing, counterAxisSpacing: 'counterAxisSpacing' in node ? node.counterAxisSpacing : undefined, layoutSizingHorizontal: 'layoutSizingHorizontal' in node ? node.layoutSizingHorizontal : undefined, layoutSizingVertical: 'layoutSizingVertical' in node ? node.layoutSizingVertical : undefined, strokesIncludedInLayout: 'strokesIncludedInLayout' in node ? node.strokesIncludedInLayout : undefined } : undefined,
    constraints: 'constraints' in node ? safeClone(node.constraints) : undefined,
    text: 'characters' in node ? { characters: node.characters, fontName: node.fontName === figma.mixed ? 'MIXED' : safeClone(node.fontName), fontSize: node.fontSize === figma.mixed ? 'MIXED' : node.fontSize, lineHeight: node.lineHeight === figma.mixed ? 'MIXED' : safeClone(node.lineHeight), letterSpacing: node.letterSpacing === figma.mixed ? 'MIXED' : safeClone(node.letterSpacing), textAutoResize: node.textAutoResize, textAlignHorizontal: node.textAlignHorizontal, textAlignVertical: node.textAlignVertical } : undefined,
    childCount: 'children' in node ? node.children.length : 0
  };
  Object.keys(snapshot).forEach(function (key) { if (snapshot[key] === undefined) delete snapshot[key]; });
  if (includeChildren && 'children' in node && depth < maxDepth) snapshot.children = node.children.map(function (child) { return serializeNodeSnapshot(child, options, depth + 1); });
  return snapshot;
}

function readJsonPluginData(node, key) {
  if (!node || !('getPluginData' in node)) return null;
  const raw = node.getPluginData('figma-gateway:' + key) || '';
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (error) { return { parseError: String(error && error.message ? error.message : error), raw: raw.slice(0, 2000) }; }
}
function collectDesignSystemSnapshot(payload) {
  let root = null;
  if (payload && payload.nodeId) root = figma.getNodeById(String(payload.nodeId));
  if (!root && payload && payload.uiId) {
    const matches = findNodesByQuery({ uiId: String(payload.uiId) });
    root = matches[0] || null;
  }
  if (!root) {
    const matches = findNodesByQuery({ uiIdPrefix: payload && payload.uiIdPrefix ? String(payload.uiIdPrefix) : 'design-system/' });
    root = matches.find(function (node) { return !!readJsonPluginData(node, 'design-system-document'); }) || null;
  }
  if (!root) {
    const matches = findNodesByQuery({ namePrefix: payload && payload.namePrefix ? String(payload.namePrefix) : 'Site Design System' });
    root = matches[0] || null;
  }
  if (!root) throw appError('NODE_NOT_FOUND', 'Unable to find design-system sidecar root');
  const document = readJsonPluginData(root, 'design-system-document');
  const tokens = [];
  const bindings = [];
  const scanRoot = ('findAll' in root) ? root : figma.currentPage;
  const nodes = scanRoot && 'findAll' in scanRoot ? scanRoot.findAll(function (node) { return !!(readJsonPluginData(node, 'design-system-token') || readJsonPluginData(node, 'design-system-bindings')); }) : [];
  for (const node of nodes) {
    const token = readJsonPluginData(node, 'design-system-token');
    if (token) tokens.push({ nodeId: node.id, name: node.name, uiId: getUiIdFromNode(node) || null, token, snapshot: payload && payload.includeNodeSnapshots ? serializeNodeSnapshot(node, { includeChildren: false }, 0) : undefined });
    const binding = readJsonPluginData(node, 'design-system-bindings');
    if (binding) bindings.push({ nodeId: node.id, name: node.name, uiId: getUiIdFromNode(node) || null, binding });
  }
  return { root: { id: root.id, name: root.name, uiId: getUiIdFromNode(root) || null }, document, tokenCount: tokens.length, bindingCount: bindings.length, tokens, bindings };
}

async function exportNodeSnapshot(payload, refMap) {
  const nodeId = getNodeIdFromPayload(payload || {}, refMap || {});
  const node = await getNodeByIdRequired(nodeId, 'export_node_snapshot');
  const snapshot = serializeNodeSnapshot(node, payload || {}, 0);
  let restDocument = null;
  if (payload && payload.includeRestJson && 'exportAsync' in node) {
    try { restDocument = await node.exportAsync({ format: 'JSON_REST_V1' }); } catch (error) { restDocument = { error: String(error && error.message ? error.message : error) }; }
  }
  return { snapshot, restDocument };
}
function applyRichFrameProperties(node, payload) {
  const warnings = [];
  if (payload.fills !== undefined || payload.fill !== undefined) setFills(node, payload.fills !== undefined ? payload.fills : payload.fill);
  if (payload.strokes !== undefined || payload.stroke !== undefined) setStrokes(node, payload.strokes !== undefined ? payload.strokes : payload.stroke, payload.strokeWeight);
  if (payload.cornerRadius !== undefined && 'cornerRadius' in node) node.cornerRadius = Number(payload.cornerRadius);
  if (payload.opacity !== undefined && 'opacity' in node) node.opacity = Number(payload.opacity);
  if (payload.clipsContent !== undefined && 'clipsContent' in node) node.clipsContent = Boolean(payload.clipsContent);
  if (payload.layoutMode !== undefined || payload.autoLayout) warnings.push.apply(warnings, applyAutoLayout(node, Object.assign({}, payload.autoLayout || {}, payload)));
  if (payload.padding || payload.paddingTop !== undefined || payload.paddingRight !== undefined || payload.paddingBottom !== undefined || payload.paddingLeft !== undefined) warnings.push.apply(warnings, applyPadding(node, payload));
  if (payload.layoutSizing || payload.layoutSizingHorizontal !== undefined || payload.layoutSizingVertical !== undefined) warnings.push.apply(warnings, applyLayoutSizing(node, payload));
  if (payload.effects !== undefined && 'effects' in node) node.effects = safeClone(payload.effects) || payload.effects;
  if (payload.pluginData && node.setPluginData) Object.keys(payload.pluginData).forEach(function (key) { node.setPluginData(String(key), String(payload.pluginData[key])); });
  return warnings;
}
async function createFrameRich(payload, refMap) {
  const parent = await getParentNodeResolved(payload, refMap || {});
  const frame = figma.createFrame();
  frame.name = String(payload.name || 'Frame');
  if ('fills' in frame) frame.fills = [];
  frame.resizeWithoutConstraints(payload.width !== undefined ? Number(payload.width) : 320, payload.height !== undefined ? Number(payload.height) : 120);
  parent.appendChild(frame);
  setUiIdOnNode(frame, payload.uiId);
  setXY(frame, payload.x, payload.y);
  const warnings = applyRichFrameProperties(frame, payload || {});
  if (payload.ref) refMap[String(payload.ref)] = frame.id;
  return normalizeCommandResult('create_frame_rich', 'ok', { nodeId: frame.id, data: { id: frame.id, name: frame.name, parentNodeId: parent.id, ref: payload.ref || null, warnings, snapshot: serializeNodeSnapshot(frame, { includeChildren: false }, 0) } });
}
async function exportNodeAsImage(payload, refMap) {
  const nodeId = getNodeIdFromPayload(payload || {}, refMap || {});
  const node = await getNodeByIdRequired(nodeId, 'export_node_as_image');
  if (!('exportAsync' in node)) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support exportAsync: ' + node.id);
  const scale = payload && payload.scale !== undefined ? Number(payload.scale) : 1;
  const format = payload && payload.format ? String(payload.format).toUpperCase() : 'PNG';
  if (!['PNG','JPG','SVG','PDF'].includes(format)) throw appError('INVALID_COMMAND_PAYLOAD', 'Unsupported export format: ' + format);
  const settings = format === 'SVG' || format === 'PDF' ? { format } : { format, constraint: { type: 'SCALE', value: scale } };
  const bytes = await node.exportAsync(settings);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i]; const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0; const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (b1 << 16) | (b2 << 8) | b3;
    base64 += chars[(triplet >> 18) & 63] + chars[(triplet >> 12) & 63] + (i + 1 < bytes.length ? chars[(triplet >> 6) & 63] : '=') + (i + 2 < bytes.length ? chars[triplet & 63] : '=');
  }
  return { nodeId: node.id, format, scale, byteLength: bytes.length, imageData: payload && payload.returnImageData === false ? undefined : base64, snapshot: serializeNodeSnapshot(node, { includeChildren: false }, 0) };
}

const STANDARD_BUTTON_STATES = ['default', 'hover', 'active', 'focus', 'disabled', 'visited'];
function clonePaintsForButtonStates(value) { const cloned = safeClone(value); return Array.isArray(cloned) ? cloned : cloned ? [cloned] : []; }
function shiftSolidPaints(paints, delta, opacityMultiplier) {
  const list = clonePaintsForButtonStates(paints);
  return list.map(function (paint) {
    if (!paint || paint.type !== 'SOLID' || !paint.color) return paint;
    const next = Object.assign({}, paint, { color: Object.assign({}, paint.color) });
    next.color.r = Math.max(0, Math.min(1, Number(next.color.r || 0) + delta));
    next.color.g = Math.max(0, Math.min(1, Number(next.color.g || 0) + delta));
    next.color.b = Math.max(0, Math.min(1, Number(next.color.b || 0) + delta));
    if (opacityMultiplier !== undefined) next.opacity = Math.max(0, Math.min(1, Number(next.opacity === undefined ? 1 : next.opacity) * opacityMultiplier));
    return next;
  });
}
function deriveButtonStateStyle(base, stateName) {
  const fills = clonePaintsForButtonStates(base.fills || base.fill || [{ type: 'SOLID', color: { r: 0.15, g: 0.39, b: 0.92 } }]);
  const strokes = clonePaintsForButtonStates(base.strokes || base.stroke || []);
  const textFills = clonePaintsForButtonStates(base.textFills || base.textFill || [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]);
  const style = { fills: fills, strokes: strokes, textFills: textFills, opacity: base.opacity !== undefined ? Number(base.opacity) : 1, labelSuffix: '', description: 'default button state' };
  if (stateName === 'hover') { style.fills = shiftSolidPaints(fills, 0.06); style.description = 'hover: slightly lighter fill'; }
  else if (stateName === 'active') { style.fills = shiftSolidPaints(fills, -0.08); style.description = 'active/pressed: slightly darker fill'; }
  else if (stateName === 'focus') { style.strokes = clonePaintsForButtonStates(base.focusStrokes || [{ type: 'SOLID', color: { r: 0.23, g: 0.51, b: 0.96 } }]); style.strokeWeight = Math.max(2, Number(base.strokeWeight || 1)); style.description = 'focus: visible keyboard focus ring'; }
  else if (stateName === 'disabled') { style.fills = shiftSolidPaints(fills, 0.18, 0.5); style.textFills = shiftSolidPaints(textFills, 0.18, 0.55); style.opacity = 0.56; style.description = 'disabled: muted and non-interactive'; }
  else if (stateName === 'visited') { style.fills = clonePaintsForButtonStates(base.visitedFills || fills); style.textFills = clonePaintsForButtonStates(base.visitedTextFills || textFills); style.description = 'visited: retained for link-like buttons'; }
  return style;
}
async function createButtonStateSet(payload, refMap) {
  const parent = await getParentNodeResolved(payload || {}, refMap || {});
  const states = Array.isArray(payload.states) && payload.states.length ? payload.states.map(function (item) { return String(item); }) : STANDARD_BUTTON_STATES;
  const width = Number(payload.width || 160);
  const height = Number(payload.height || 44);
  const gap = Number(payload.gap || 20);
  const label = String(payload.label || payload.text || 'Button');
  const ref = String(payload.ref || payload.uiId || ('button-states-' + Date.now()));
  const wrapper = figma.createFrame();
  wrapper.name = String(payload.name || 'Button states');
  wrapper.resizeWithoutConstraints(Math.max(width, states.length * (width + gap) - gap), height + 74);
  parent.appendChild(wrapper);
  setUiIdOnNode(wrapper, payload.uiId || ref);
  setXY(wrapper, payload.x, payload.y);
  wrapper.fills = [];
  wrapper.layoutMode = 'HORIZONTAL';
  wrapper.itemSpacing = gap;
  wrapper.paddingTop = 34;
  wrapper.paddingRight = 0;
  wrapper.paddingBottom = 0;
  wrapper.paddingLeft = 0;
  wrapper.counterAxisAlignItems = 'MIN';
  wrapper.primaryAxisAlignItems = 'MIN';
  if (wrapper.setPluginData) {
    wrapper.setPluginData('figma-gateway:button-state-set', JSON.stringify({ version: 'button-state-set.v1', states: states, sourceUiId: payload.sourceUiId || payload.uiId || null, role: payload.role || 'button' }));
  }
  const created = [];
  for (let i = 0; i < states.length; i += 1) {
    const stateName = states[i];
    const stateStyle = deriveButtonStateStyle(payload || {}, stateName);
    const button = figma.createFrame();
    button.name = 'Button / state=' + stateName;
    button.resizeWithoutConstraints(width, height);
    button.layoutMode = 'HORIZONTAL';
    button.primaryAxisAlignItems = 'CENTER';
    button.counterAxisAlignItems = 'CENTER';
    button.paddingLeft = Number(payload.paddingLeft !== undefined ? payload.paddingLeft : 16);
    button.paddingRight = Number(payload.paddingRight !== undefined ? payload.paddingRight : 16);
    button.itemSpacing = Number(payload.itemSpacing !== undefined ? payload.itemSpacing : 8);
    button.cornerRadius = Number(payload.cornerRadius !== undefined ? payload.cornerRadius : payload.radius !== undefined ? payload.radius : 6);
    button.fills = stateStyle.fills;
    if (stateStyle.strokes.length) button.strokes = stateStyle.strokes;
    if (stateStyle.strokeWeight !== undefined) button.strokeWeight = stateStyle.strokeWeight;
    button.opacity = stateStyle.opacity;
    wrapper.appendChild(button);
    const textNode = figma.createText();
    const font = await loadRequestedFont({ fontFamily: payload.fontFamily || 'Inter', fontWeight: payload.fontWeight || '500' });
    if (font) textNode.fontName = font;
    else await figma.loadFontAsync(textNode.fontName);
    textNode.name = 'Label / state=' + stateName;
    textNode.characters = label;
    textNode.fontSize = Number(payload.fontSize || 14);
    textNode.fills = stateStyle.textFills;
    button.appendChild(textNode);
    if (button.setPluginData) button.setPluginData('figma-gateway:button-state', JSON.stringify({ version: 'button-state.v1', state: stateName, behavior: stateStyle.description, sourceUiId: payload.sourceUiId || payload.uiId || null }));
    created.push({ state: stateName, nodeId: button.id, textNodeId: textNode.id });
  }
  if (payload.ref) refMap[String(payload.ref)] = wrapper.id;
  return normalizeCommandResult('create_button_state_set', 'ok', { nodeId: wrapper.id, data: { id: wrapper.id, states: created, snapshot: serializeNodeSnapshot(wrapper, { includeChildren: true, maxDepth: 2 }, 0) } });
}

function applyTextMetrics(textNode, payload) { if (payload.lineHeight !== undefined) textNode.lineHeight = { value: Number(payload.lineHeight), unit: 'PIXELS' }; if (payload.letterSpacing !== undefined) textNode.letterSpacing = { value: Number(payload.letterSpacing), unit: 'PIXELS' }; }
function parseCssColor(raw) { const rgb=String(raw).match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i); if (rgb) return {r:Number(rgb[1])/255,g:Number(rgb[2])/255,b:Number(rgb[3])/255,a:rgb[4]!==undefined?Number(rgb[4]):1}; const hex=String(raw).trim().replace('#',''); if (hex.length===6||hex.length===3){ const n=hex.length===3?hex.split('').map(c=>c+c).join(''):hex; return {r:parseInt(n.slice(0,2),16)/255,g:parseInt(n.slice(2,4),16)/255,b:parseInt(n.slice(4,6),16)/255,a:1}; } return {r:0,g:0,b:0,a:0.25}; }
function splitBoxShadowEntries(boxShadow) { const input=String(boxShadow||'').trim(); if (!input || input==='none') return []; const parts=[]; let current=''; let depth=0; for (const ch of input) { if (ch==='(') depth+=1; if (ch===')') depth=Math.max(0, depth-1); if (ch===',' && depth===0) { if (current.trim()) parts.push(current.trim()); current=''; continue; } current+=ch; } if (current.trim()) parts.push(current.trim()); return parts; }
function parseSingleShadowEntry(entry) { const inset=/\binset\b/i.test(entry); const colorMatch=entry.match(/(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})/); const color=parseCssColor(colorMatch ? colorMatch[1] : 'rgba(0,0,0,0.25)'); const cleaned=entry.replace(/\binset\b/i,'').replace(/(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})/,' ').trim(); const nums=cleaned.match(/-?\d+(?:\.\d+)?px/g) || []; if (nums.length < 3) return null; return { type: inset ? 'INNER_SHADOW' : 'DROP_SHADOW', color, offset:{x:Number(nums[0].replace('px','')), y:Number(nums[1].replace('px',''))}, radius:Number(nums[2].replace('px','')), spread:nums[3]!==undefined?Number(nums[3].replace('px','')):0, visible:true, blendMode:'NORMAL' }; }
function parseBoxShadow(boxShadow) { return splitBoxShadowEntries(boxShadow).map(parseSingleShadowEntry).filter(Boolean); }


function isGatewayProxySource(value) {
  const raw = String(value || '').trim();
  return raw.startsWith(GATEWAY_URL + '/api/assets/proxy');
}
async function fetchWithGatewayAuth(source, options) {
  const raw = String(source || '').trim();
  const init = Object.assign({}, options || {});
  const headers = Object.assign({}, init.headers || {});
  if (raw.startsWith(GATEWAY_URL + '/api/')) headers['Authorization'] = 'Bearer ' + API_BEARER_TOKEN;
  init.headers = headers;
  return fetch(raw, init);
}
function isSvgSource(value) {
  const rawOriginal = String(value || '').trim();
  const raw = rawOriginal.toLowerCase();
  if (raw.startsWith('data:image/svg+xml') || /\.svg(?:[?#].*)?$/.test(raw)) return true;
  try {
    if (isGatewayProxySource(rawOriginal)) {
      const params = new URL(rawOriginal).searchParams;
      return (params.get('sourceKind') || params.get('sourcekind') || '').toLowerCase() === 'svg';
    }
  } catch (error) {}
  return false;
}
function decodeSvgDataUri(value) {
  const raw = String(value || '');
  const match = raw.match(/^data:image\/svg\+xml(?:;charset=[^;,]+)?(?:;base64)?,(.*)$/i);
  if (!match) return null;
  const body = match[1] || '';
  try {
    if (/;base64,/i.test(raw)) return atob(body);
    return decodeURIComponent(body);
  } catch (error) {
    return null;
  }
}

function isSupportedRasterImageSource(source) {
  const raw = String(source || '').trim().toLowerCase();
  if (/^data:image\/(png|jpeg|jpg|gif)/.test(raw) || /\.(png|jpe?g|gif)(?:[?#].*)?$/.test(raw)) return true;
  return isGatewayProxySource(raw);
}
async function fetchBinaryImageBytes(source) {
  const response = await fetchWithGatewayAuth(String(source), { redirect: 'follow', cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to fetch image: ' + response.status + ' ' + response.statusText);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}
async function fetchSvgMarkupFromSource(source) {
  const raw = String(source || '').trim();
  if (!raw) return null;
  const inline = decodeSvgDataUri(raw);
  if (inline) return inline;
  try {
    const response = await fetchWithGatewayAuth(raw, { cache: 'no-store', redirect: 'follow' });
    if (!response.ok) return null;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const text = await response.text();
    if (!text.trim()) return null;
    if (contentType.includes('image/svg+xml') || text.trim().startsWith('<svg')) return text;
  } catch (error) {}
  return null;
}
function applyShadowCompatibility(node, effects) {
  if (!Array.isArray(effects) || !effects.length) return;
  const needsSpreadCompatibility = effects.some(function (effect) { return effect && (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') && typeof effect.spread === 'number' && effect.spread !== 0; });
  if (!needsSpreadCompatibility) return;
  if ('clipsContent' in node) {
    try { node.clipsContent = true; } catch (error) {}
  }
}

function setAssetPluginData(node, payload, state) {
  if (!node || !('setPluginData' in node)) return;
  const imageSource = String((payload && (payload.resolvedAssetPath || payload.sourceUrl)) || '');
  node.setPluginData('figma-gateway:asset-source', imageSource);
  node.setPluginData('figma-gateway:asset-layer', String((payload && payload.layer) || ''));
  node.setPluginData('figma-gateway:asset-strategy', String((payload && payload.figmaStrategy) || ''));
  node.setPluginData('figma-gateway:asset-source-kind', String((payload && payload.sourceKind) || (isSvgSource(imageSource) ? 'svg' : 'raster')));
  if (state && state.importedAs) node.setPluginData('figma-gateway:asset-imported-as', String(state.importedAs));
  if (state && state.error) node.setPluginData('figma-gateway:asset-error', String(state.error));
  else node.setPluginData('figma-gateway:asset-error', '');
  if (state && state.placeholder) node.setPluginData('figma-gateway:asset-placeholder', String((payload && (payload.alt || payload.sourceUrl || payload.resolvedAssetPath)) || 'asset'));
  else node.setPluginData('figma-gateway:asset-placeholder', '');
}
function getAssetPluginData(node) {
  if (!node || !('getPluginData' in node)) return undefined;
  const data = {
    source: node.getPluginData('figma-gateway:asset-source') || undefined,
    layer: node.getPluginData('figma-gateway:asset-layer') || undefined,
    strategy: node.getPluginData('figma-gateway:asset-strategy') || undefined,
    sourceKind: node.getPluginData('figma-gateway:asset-source-kind') || undefined,
    importedAs: node.getPluginData('figma-gateway:asset-imported-as') || undefined,
    error: node.getPluginData('figma-gateway:asset-error') || undefined,
    placeholder: node.getPluginData('figma-gateway:asset-placeholder') || undefined
  };
  return Object.keys(data).some(function (key) { return data[key] !== undefined; }) ? data : undefined;
}

function centerImportedNodeInContainer(container, child, size) {
  const targetWidth = size && Number(size.width) > 0 ? Number(size.width) : (typeof child.width === 'number' ? child.width : 0);
  const targetHeight = size && Number(size.height) > 0 ? Number(size.height) : (typeof child.height === 'number' ? child.height : 0);
  if (targetWidth > 0 && targetHeight > 0 && 'resizeWithoutConstraints' in child) {
    try { child.resizeWithoutConstraints(targetWidth, targetHeight); } catch (error) {}
  }
  const containerWidth = typeof container.width === 'number' ? container.width : targetWidth;
  const containerHeight = typeof container.height === 'number' ? container.height : targetHeight;
  const childWidth = typeof child.width === 'number' ? child.width : targetWidth;
  const childHeight = typeof child.height === 'number' ? child.height : targetHeight;
  if ('x' in child) {
    try { child.x = Math.round((containerWidth - childWidth) / 2); } catch (error) {}
  }
  if ('y' in child) {
    try { child.y = Math.round((containerHeight - childHeight) / 2); } catch (error) {}
  }
}
function mapIconText(label) { const value=String(label||'').toLowerCase(); if (value.includes('microphone')) return '🎤'; if (value.includes('history')) return '🕘'; if (value.includes('cloud') || value.includes('upload')) return '☁'; if (value.includes('folder')) return '📁'; if (value.includes('play')) return '▶'; if (value.includes('file')) return '📄'; return '◆'; }
function applyAlignment(node, payload) { const alignment = payload.alignment || {}; if (alignment.layoutAlign !== undefined && 'layoutAlign' in node) node.layoutAlign = String(alignment.layoutAlign); if (alignment.layoutGrow !== undefined && 'layoutGrow' in node) node.layoutGrow = Number(alignment.layoutGrow); if (alignment.layoutPositioning !== undefined && 'layoutPositioning' in node) node.layoutPositioning = String(alignment.layoutPositioning); if (alignment.primaryAxisAlignItems !== undefined && 'primaryAxisAlignItems' in node) node.primaryAxisAlignItems = String(alignment.primaryAxisAlignItems); if (alignment.counterAxisAlignItems !== undefined && 'counterAxisAlignItems' in node) node.counterAxisAlignItems = String(alignment.counterAxisAlignItems); }

function findNodesByQuery(query) {
  const scopeRoot = query && query.parentNodeId ? figma.getNodeById(String(query.parentNodeId)) : figma.currentPage;
  if (!scopeRoot || !('findAll' in scopeRoot)) return [];
  return scopeRoot.findAll(function (node) {
    try {
      const nodeId = String(node.id || '');
      const nodeName = String(node.name || '');
      const nodeType = String(node.type || '');
      const nodeVisible = ('visible' in node) ? Boolean(node.visible) : undefined;
      const uiId = getUiIdFromNode(node);
      if (query.nodeId && nodeId !== String(query.nodeId)) return false;
      if (query.name && nodeName !== String(query.name)) return false;
      if (query.namePrefix && !nodeName.startsWith(String(query.namePrefix))) return false;
      if (query.type && nodeType !== String(query.type)) return false;
      if (query.visible !== undefined && nodeVisible !== undefined && nodeVisible !== Boolean(query.visible)) return false;
      if (query.uiId && uiId !== String(query.uiId)) return false;
      if (query.uiIdPrefix && !String(uiId || '').startsWith(String(query.uiIdPrefix))) return false;
      return true;
    } catch (error) {
      return false;
    }
  });
}

function findMatchingNodes(payload) { const query = payload && payload.query ? payload.query : {}; const matches = []; const nodes = findNodesByQuery(query); for (const node of nodes) matches.push({ id: node.id, name: node.name, type: node.type, visible: 'visible' in node ? node.visible : undefined }); return matches; }
function mapPaint(paint) { if (!paint || typeof paint !== 'object') return undefined; if (paint.type === 'IMAGE') return undefined; const color = paint.color && typeof paint.color === 'object' ? paint.color : null; const toHex = function (v) { return Math.round(Math.min(1, Math.max(0, Number(v || 0))) * 255).toString(16).padStart(2, '0'); }; const hex = color ? '#' + toHex(color.r) + toHex(color.g) + toHex(color.b) : undefined; return paint.opacity !== undefined ? { value: hex, opacity: Number(paint.opacity) } : hex; }
function inferUiKind(node) { const type = String(node.type || '').toUpperCase(); const name = String(node.name || ''); if (type === 'CANVAS') return 'page'; if (type === 'SECTION') return 'section'; if (type === 'FRAME' || type === 'COMPONENT' || type === 'COMPONENT_SET') return 'frame'; if (type === 'GROUP') return 'group'; if (type === 'TEXT') return 'text'; if (type === 'INSTANCE') return 'component_instance'; if (type === 'VECTOR' || /icon/i.test(name)) return 'icon'; if (node.fills && Array.isArray(node.fills) && node.fills.some(function (fill) { return fill && fill.type === 'IMAGE'; })) return 'image'; if (/button|cta/i.test(name)) return 'button'; if (/input|field/i.test(name)) return 'input'; if (/card/i.test(name)) return 'card'; if (/list/i.test(name)) return 'list'; return 'group'; }
function canReceiveImageFill(node) { return !!node && ('fills' in node); }
function buildUiModelSnapshot(node) {
  const layoutMode = typeof node.layoutMode === 'string' ? node.layoutMode : undefined;
  const style = {};
  const fill = Array.isArray(node.fills) ? mapPaint(node.fills.find(function (item) { return item && item.type !== 'IMAGE'; })) : undefined;
  const stroke = Array.isArray(node.strokes) ? mapPaint(node.strokes[0]) : undefined;
  if (fill !== undefined) style.fill = fill;
  if (stroke !== undefined) style.stroke = stroke;
  if (node.cornerRadius !== undefined) style.radius = Number(node.cornerRadius);
  if (node.opacity !== undefined) style.opacity = Number(node.opacity);
  if ('characters' in node) {
    style.text = {};
    if (node.fontName && node.fontName !== figma.mixed) {
      style.text.fontFamily = node.fontName.family;
      style.text.fontStyle = node.fontName.style;
    }
    if (node.fontSize !== figma.mixed && node.fontSize !== undefined) style.text.fontSize = Number(node.fontSize);
    if (node.lineHeight && typeof node.lineHeight === 'object' && node.lineHeight.value !== undefined) style.text.lineHeight = Number(node.lineHeight.value);
    if (node.letterSpacing && typeof node.letterSpacing === 'object' && node.letterSpacing.value !== undefined) style.text.letterSpacing = Number(node.letterSpacing.value);
    if (node.textAlignHorizontal) style.text.textAlign = String(node.textAlignHorizontal).toLowerCase();
    if (Object.keys(style.text).length === 0) delete style.text;
  }
  const model = {
    kind: inferUiKind(node),
    uiId: getUiIdFromNode(node) || String(node.type || 'node').toLowerCase() + '.' + String(node.id || '').replace(/[:]/g, '_'),
    name: node.name,
    role: /headline|title|hero/i.test(String(node.name || '')) ? 'headline' : /button|cta/i.test(String(node.name || '')) ? 'button-primary' : undefined,
    visible: 'visible' in node ? Boolean(node.visible) : true,
    text: 'characters' in node ? String(node.characters || '') : undefined,
    source: { fileKey: state.fileKey || undefined, nodeId: node.id },
    size: 'width' in node || 'height' in node ? { width: node.width !== undefined ? Number(node.width) : undefined, height: node.height !== undefined ? Number(node.height) : undefined } : undefined,
    position: 'x' in node || 'y' in node ? { x: node.x !== undefined ? Number(node.x) : undefined, y: node.y !== undefined ? Number(node.y) : undefined } : undefined,
    spacing: node.itemSpacing !== undefined ? Number(node.itemSpacing) : undefined,
    padding: 'paddingTop' in node ? { top: Number(node.paddingTop || 0), right: Number(node.paddingRight || 0), bottom: Number(node.paddingBottom || 0), left: Number(node.paddingLeft || 0) } : undefined,
    layout: layoutMode || node.itemSpacing !== undefined ? { type: layoutMode === 'VERTICAL' ? 'vertical' : layoutMode === 'HORIZONTAL' ? 'horizontal' : 'none', gap: node.itemSpacing !== undefined ? Number(node.itemSpacing) : undefined, padding: 'paddingTop' in node ? { top: Number(node.paddingTop || 0), right: Number(node.paddingRight || 0), bottom: Number(node.paddingBottom || 0), left: Number(node.paddingLeft || 0) } : undefined, alignment: { primary: node.primaryAxisAlignItems ? String(node.primaryAxisAlignItems).toLowerCase() : undefined, cross: node.counterAxisAlignItems ? String(node.counterAxisAlignItems).toLowerCase() : undefined } } : undefined,
    style: Object.keys(style).length ? style : undefined,
    meta: { figmaType: node.type, nodeName: node.name, constraints: 'constraints' in node ? node.constraints : undefined, layoutSizingHorizontal: 'layoutSizingHorizontal' in node ? node.layoutSizingHorizontal : undefined, layoutSizingVertical: 'layoutSizingVertical' in node ? node.layoutSizingVertical : undefined },
    children: Array.isArray(node.children) ? node.children.map(buildUiModelSnapshot) : []
  };
  return model;
}
async function exportUiSnapshot(payload) {
  let rootNode = null;
  if (payload && payload.nodeId) rootNode = await figma.getNodeByIdAsync(String(payload.nodeId));
  if (!rootNode && payload && payload.pageId) rootNode = await figma.getNodeByIdAsync(String(payload.pageId));
  if (!rootNode) rootNode = payload && payload.includePages ? figma.root : figma.currentPage;
  if (!rootNode) throw appError('NODE_NOT_FOUND', 'Unable to resolve root node for export_ui_snapshot');
  return { version: 'ui-model.v1', root: buildUiModelSnapshot(rootNode) };
}
function normalizeIncomingStep(step) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) return step;
  if (step.payload && typeof step.payload === 'object' && !Array.isArray(step.payload)) return step;
  var normalized = { type: step.type };
  var payload = {};
  for (var key in step) {
    if (!Object.prototype.hasOwnProperty.call(step, key) || key === 'type') continue;
    payload[key] = step[key];
  }
  if (Object.keys(payload).length) normalized.payload = payload;
  return normalized;
}

function resolveRefId(value, refMap) {
  const key = String(value || '').trim();
  if (!key) return '';
  return refMap && refMap[key] ? String(refMap[key]) : key;
}
async function getNodeFromPayload(payload, commandType, refMap) {
  const resolvedNodeId = payload && payload.nodeRef ? resolveRefId(payload.nodeRef, refMap) : payload && payload.nodeId ? String(payload.nodeId) : '';
  return getNodeByIdRequired(resolvedNodeId, commandType);
}
async function getParentNodeResolved(payload, refMap) {
  const parentRef = payload && payload.parentRef ? resolveRefId(payload.parentRef, refMap) : '';
  const parentNodeId = payload && payload.parentNodeId ? String(payload.parentNodeId) : '';
  let parent = null;
  const candidateId = parentRef || parentNodeId;
  if (candidateId) {
    try {
      parent = await figma.getNodeByIdAsync(candidateId);
    } catch (error) {
      parent = null;
    }
    if (!parent || !('appendChild' in parent)) throw appError('PARENT_NODE_NOT_FOUND', 'Parent node not found for ref: ' + candidateId);
    return parent;
  }
  return figma.currentPage;
}
async function executeLowLevelCommand(step, refMap) {
  step = normalizeIncomingStep(step);
  const commandType = step && step.type ? String(step.type) : '';
  const payload = step && step.payload ? step.payload : {};
  if (!SUPPORTED_GENERIC_COMMANDS.has(commandType)) throw appError('UNSUPPORTED_COMMAND', 'Unsupported generic plugin command: ' + commandType);
  if (commandType === 'debug_runtime_info') {
    const fonts = await figma.listAvailableFontsAsync();
    const interFonts = fonts.filter(function (item) {
      try { return String(item.fontName.family || '') === 'Inter'; } catch (error) { return false; }
    }).map(function (item) { return { family: item.fontName.family, style: item.fontName.style }; });
    return normalizeCommandResult(commandType, 'ok', {
      nodeId: null,
      data: {
        runtimeBuild: RUNTIME_BUILD,
        interFonts: interFonts,
        interStyles: Array.from(new Set(interFonts.map(function (item) { return item.style; }))).sort()
      }
    });
  }

  if (commandType === 'export_ui_snapshot') {
    const document = await exportUiSnapshot(payload);
    return normalizeCommandResult(commandType, 'ok', { nodeId: document.root && document.root.source ? document.root.source.nodeId || null : null, data: document });
  }
  if (commandType === 'create_button_state_set') {
    return await createButtonStateSet(payload, refMap);
  }
  if (commandType === 'create_frame_rich') {
    return await createFrameRich(payload, refMap);
  }
  if (commandType === 'create_frame' || commandType === 'create_section') {
    const parent = await getParentNodeResolved(payload, refMap);
    const node = commandType === 'create_frame' ? figma.createFrame() : figma.createSection();
    node.name = String(payload.name || (commandType === 'create_frame' ? 'Frame' : 'Section'));
    if ('fills' in node) node.fills = [];
    const width = payload.width !== undefined ? Number(payload.width) : 320;
    const height = payload.height !== undefined ? Number(payload.height) : 120;
    node.resizeWithoutConstraints(width, height);
    parent.appendChild(node);
    setUiIdOnNode(node, payload.uiId);
    setXY(node, payload.x, payload.y);
    if (payload.ref) refMap[String(payload.ref)] = node.id;
    return normalizeCommandResult(commandType, 'ok', {
      nodeId: node.id,
      data: { id: node.id, name: node.name, parentNodeId: parent.id, width: node.width, height: node.height, uiId: getUiIdFromNode(node) || null, ref: payload.ref || null }
    });
  }
  if (commandType === 'create_text' || commandType === 'create_text_rich') {
    const parent = await getParentNodeResolved(payload, refMap);
    const textNode = figma.createText();
    const requestedFont = await loadRequestedFont(payload);
    const effectiveFont = requestedFont || textNode.fontName;
    await figma.loadFontAsync(effectiveFont);
    if (requestedFont) textNode.fontName = requestedFont;
    textNode.name = String(payload.name || 'Text');
    textNode.characters = String(payload.text !== undefined ? payload.text : payload.content !== undefined ? payload.content : '');
    if (payload.fontSize !== undefined) textNode.fontSize = Number(payload.fontSize);
    applyTextMetrics(textNode, payload);
    if (payload.textAlignHorizontal !== undefined) textNode.textAlignHorizontal = String(payload.textAlignHorizontal);
    if (payload.textAlignVertical !== undefined) textNode.textAlignVertical = String(payload.textAlignVertical);
    if (payload.textAutoResize !== undefined) textNode.textAutoResize = String(payload.textAutoResize);
    if (payload.fills !== undefined || payload.fill !== undefined) setFills(textNode, payload.fills !== undefined ? payload.fills : payload.fill);
    parent.appendChild(textNode);
    setUiIdOnNode(textNode, payload.uiId);
    setXY(textNode, payload.x, payload.y);
    if (payload.width !== undefined || payload.height !== undefined) {
      try { setSize(textNode, payload.width, payload.height, commandType); } catch (error) {}
    }
    if (payload.ref) refMap[String(payload.ref)] = textNode.id;
    return normalizeCommandResult(commandType, 'ok', { nodeId: textNode.id, data: { id: textNode.id, name: textNode.name, parentNodeId: parent.id, text: textNode.characters, fontName: textNode.fontName, uiId: getUiIdFromNode(textNode) || null, ref: payload.ref || null, snapshot: serializeNodeSnapshot(textNode, { includeChildren: false }, 0) } });
  }
  if (commandType === 'create_group') {
    const nodeIds = payload.nodes;
    if (!Array.isArray(nodeIds) || !nodeIds.length) throw appError('INVALID_COMMAND_PAYLOAD', 'create_group requires nodes[]');
    const nodes = [];
    for (const id of nodeIds) {
      const node = await getNodeByIdRequired(resolveRefId(id, refMap), commandType);
      nodes.push(node);
    }
    const groupParent = nodes[0].parent || figma.currentPage;
    const group = figma.group(nodes, groupParent);
    if (payload.name) group.name = String(payload.name);
    setXY(group, payload.x, payload.y);
    if (payload.ref) refMap[String(payload.ref)] = group.id;
    return normalizeCommandResult(commandType, 'ok', { nodeId: group.id, data: { id: group.id, name: group.name, childIds: nodes.map(function (node) { return node.id; }), ref: payload.ref || null } });
  }
  if (commandType === 'move_node') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    let parent = null;
    const targetParentId = payload.targetParentRef ? resolveRefId(payload.targetParentRef, refMap) : payload.targetParentNodeId ? String(payload.targetParentNodeId) : '';
    if (targetParentId) {
      parent = await getNodeByIdRequired(targetParentId, commandType);
      if (!('appendChild' in parent)) throw appError('UNSUPPORTED_OPERATION', 'Target parent cannot contain children: ' + parent.id);
      parent.appendChild(node);
    }
    setXY(node, payload.x, payload.y);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, parentNodeId: node.parent ? node.parent.id : null, x: 'x' in node ? node.x : null, y: 'y' in node ? node.y : null } });
  }
  if (commandType === 'delete_node') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    const deletedNodeId = node.id;
    node.remove();
    return normalizeCommandResult(commandType, 'ok', { nodeId: deletedNodeId, data: { id: deletedNodeId, deleted: true } });
  }
  if (commandType === 'rename_node') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    if (!payload.name) throw appError('INVALID_COMMAND_PAYLOAD', 'rename_node requires name');
    node.name = String(payload.name);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, name: node.name } });
  }
  if (commandType === 'set_fill') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    if (payload.fills === undefined && payload.fill === undefined) throw appError('INVALID_COMMAND_PAYLOAD', 'set_fill requires fill or fills');
    setFills(node, payload.fills !== undefined ? payload.fills : payload.fill);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, fills: node.fills } });
  }
  if (commandType === 'set_stroke') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    if (payload.strokes === undefined && payload.stroke === undefined) throw appError('INVALID_COMMAND_PAYLOAD', 'set_stroke requires stroke or strokes');
    setStrokes(node, payload.strokes !== undefined ? payload.strokes : payload.stroke, payload.strokeWeight);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, strokes: node.strokes } });
  }
  if (commandType === 'set_corner_radius') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    if (!('cornerRadius' in node)) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support corner radius: ' + node.id);
    node.cornerRadius = Number(payload.cornerRadius);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, cornerRadius: node.cornerRadius } });
  }
  if (commandType === 'set_opacity') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    if (!('opacity' in node)) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support opacity: ' + node.id);
    node.opacity = Number(payload.opacity);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, opacity: node.opacity } });
  }
  if (commandType === 'set_size') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    setSize(node, payload.width, payload.height, commandType);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, width: node.width, height: node.height } });
  }
  if (commandType === 'set_position') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    setXY(node, payload.x, payload.y);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, x: 'x' in node ? node.x : null, y: 'y' in node ? node.y : null } });
  }
  if (commandType === 'set_text_content') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    const textNode = await ensureTextNode(node, commandType);
    textNode.characters = String(payload.text !== undefined ? payload.text : payload.content !== undefined ? payload.content : payload.characters || '');
    return normalizeCommandResult(commandType, 'ok', { nodeId: textNode.id, data: { id: textNode.id, text: textNode.characters } });
  }
  if (commandType === 'set_text_style') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    const textNode = await ensureTextNode(node, commandType);
    const requestedFont = await loadRequestedFont(payload);
    if (requestedFont) { await figma.loadFontAsync(requestedFont); textNode.fontName = requestedFont; }
    if (payload.fontSize !== undefined) textNode.fontSize = Number(payload.fontSize);
    applyTextMetrics(textNode, payload);
    if (payload.textAlignHorizontal !== undefined) textNode.textAlignHorizontal = String(payload.textAlignHorizontal);
    if (payload.textAlignVertical !== undefined) textNode.textAlignVertical = String(payload.textAlignVertical);
    if (payload.textAutoResize !== undefined) textNode.textAutoResize = String(payload.textAutoResize);
    if (payload.fills !== undefined || payload.fill !== undefined) setFills(textNode, payload.fills !== undefined ? payload.fills : payload.fill);
    return normalizeCommandResult(commandType, 'ok', { nodeId: textNode.id, data: { id: textNode.id, fontSize: textNode.fontSize, fontName: textNode.fontName } });
  }
  if (commandType === 'set_auto_layout') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    const warnings = applyAutoLayout(node, payload);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, layoutMode: node.layoutMode, layoutWrap: node.layoutWrap, primaryAxisAlignItems: node.primaryAxisAlignItems, counterAxisAlignItems: node.counterAxisAlignItems, itemSpacing: node.itemSpacing, counterAxisSpacing: 'counterAxisSpacing' in node ? node.counterAxisSpacing : undefined, warnings } });
  }
  if (commandType === 'set_padding') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    const warnings = applyPadding(node, payload);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, paddingTop: node.paddingTop, paddingRight: node.paddingRight, paddingBottom: node.paddingBottom, paddingLeft: node.paddingLeft, warnings } });
  }
  if (commandType === 'set_spacing') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    requireAutoLayoutNode(node, commandType);
    if (node.layoutMode === 'NONE') throw appError('INVALID_COMMAND_PAYLOAD', 'Spacing can only be set on auto-layout frames where layoutMode is HORIZONTAL or VERTICAL');
    node.itemSpacing = Number(payload.spacing !== undefined ? payload.spacing : payload.itemSpacing);
    if (payload.counterAxisSpacing !== undefined) { if (node.layoutWrap !== 'WRAP') throw appError('INVALID_COMMAND_PAYLOAD', 'counterAxisSpacing requires layoutWrap=WRAP'); if ('counterAxisSpacing' in node) node.counterAxisSpacing = Number(payload.counterAxisSpacing); }
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, itemSpacing: node.itemSpacing, counterAxisSpacing: 'counterAxisSpacing' in node ? node.counterAxisSpacing : undefined } });
  }
  if (commandType === 'set_alignment') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    applyAlignment(node, payload);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id } });
  }
  if (commandType === 'set_constraints') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    if (!('constraints' in node)) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support constraints: ' + node.id);
    node.constraints = { horizontal: payload.constraints && payload.constraints.horizontal ? String(payload.constraints.horizontal) : node.constraints.horizontal, vertical: payload.constraints && payload.constraints.vertical ? String(payload.constraints.vertical) : node.constraints.vertical };
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, constraints: node.constraints } });
  }
  if (commandType === 'set_layout_sizing') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    const warnings = applyLayoutSizing(node, payload);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, horizontal: node.layoutSizingHorizontal, vertical: node.layoutSizingVertical, warnings } });
  }
  if (commandType === 'set_visibility') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    if (!('visible' in node)) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support visibility: ' + node.id);
    node.visible = Boolean(payload.visible);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, visible: node.visible } });
  }

  if (commandType === 'export_design_system_snapshot') {
    const data = collectDesignSystemSnapshot(payload || {});
    return normalizeCommandResult(commandType, 'ok', { nodeId: data.root.id, data });
  }
  if (commandType === 'export_node_snapshot') {
    const data = await exportNodeSnapshot(payload, refMap);
    return normalizeCommandResult(commandType, 'ok', { nodeId: data.snapshot.id, data });
  }
  if (commandType === 'export_node_as_image') {
    const data = await exportNodeAsImage(payload, refMap);
    return normalizeCommandResult(commandType, 'ok', { nodeId: data.nodeId, data });
  }
  if (commandType === 'set_effects') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    if (!('effects' in node)) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support effects: ' + node.id);
    const parsedEffects = parseBoxShadow(payload.boxShadow);
    applyShadowCompatibility(node, parsedEffects);
    node.effects = parsedEffects;
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, effects: node.effects } });
  }
  if (commandType === 'set_asset_reference') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    setAssetPluginData(node, payload, { placeholder: Boolean(payload.placeholder) });
    const imageSource = payload.resolvedAssetPath || payload.sourceUrl;
    if (!payload.placeholder && typeof imageSource === 'string' && imageSource.trim()) {
      if (isSvgSource(imageSource) && 'appendChild' in node) {
        try {
          const svgMarkup = await fetchSvgMarkupFromSource(imageSource);
          if (!svgMarkup) throw new Error('Empty SVG markup');
          const imported = figma.createNodeFromSvg(svgMarkup);
          imported.name = 'asset-svg';
          if ('setPluginData' in imported) { imported.setPluginData('figma-gateway:asset-source', String(imageSource)); imported.setPluginData('figma-gateway:asset-imported-as', 'svg-child'); }
          node.appendChild(imported);
          centerImportedNodeInContainer(node, imported, { width: typeof node.width === 'number' ? node.width : undefined, height: typeof node.height === 'number' ? node.height : undefined });
          const hasImportedSvg = Array.isArray(node.children) && node.children.some(function (child) { return child && child.name === 'asset-svg'; });
          if (!hasImportedSvg) throw new Error('SVG import did not attach to node');
          setAssetPluginData(node, payload, { importedAs: 'svg', placeholder: false });
          return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, placeholder: false, layer: payload.layer || null, importedAs: 'svg', sourceKind: 'svg', snapshot: serializeNodeSnapshot(node, { includeChildren: true, maxDepth: 1 }, 0) } });
        } catch (error) {
          const message = String(error && error.message ? error.message : error);
          setAssetPluginData(node, payload, { importedAs: 'placeholder', placeholder: true, error: message });
          return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, placeholder: true, layer: payload.layer || null, importedAs: 'placeholder', sourceKind: 'svg', warning: message, snapshot: serializeNodeSnapshot(node, { includeChildren: false }, 0) } });
        }
      }
      if (canReceiveImageFill(node)) {
        try {
          if (!isSupportedRasterImageSource(imageSource)) throw new Error('Unsupported image type for Figma image API');
          const bytes = await fetchBinaryImageBytes(imageSource.trim());
          const image = figma.createImage(bytes);
          node.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
          const hasImageFill = Array.isArray(node.fills) && node.fills.some(function (fill) { return fill && fill.type === 'IMAGE' && fill.imageHash; });
          if (!hasImageFill) throw new Error('Image fill was not applied');
          setAssetPluginData(node, payload, { importedAs: 'image_fill', placeholder: false });
          return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, placeholder: false, layer: payload.layer || null, importedAs: 'image_fill', snapshot: serializeNodeSnapshot(node, { includeChildren: false }, 0) } });
        } catch (error) {
          const message = String(error && error.message ? error.message : error);
          setAssetPluginData(node, payload, { importedAs: 'placeholder', placeholder: true, error: message });
          return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, placeholder: true, layer: payload.layer || null, importedAs: 'placeholder', warning: message, snapshot: serializeNodeSnapshot(node, { includeChildren: false }, 0) } });
        }
      }
      setAssetPluginData(node, payload, { importedAs: 'placeholder', placeholder: true, error: 'Target node cannot receive raster image fill' });
      return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, placeholder: true, layer: payload.layer || null, importedAs: 'placeholder', warning: 'Target node cannot receive raster image fill', snapshot: serializeNodeSnapshot(node, { includeChildren: false }, 0) } });
    }
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, placeholder: Boolean(payload.placeholder), layer: payload.layer || null } });
  }
  if (commandType === 'set_icon_reference') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    if (!('appendChild' in node)) throw appError('UNSUPPORTED_OPERATION', 'Target node cannot contain icon placeholder: ' + node.id);
    let iconNode = null;
    if (payload.svgMarkup) {
      try {
        iconNode = figma.createNodeFromSvg(String(payload.svgMarkup));
        iconNode.name = 'icon-svg';
        if ('fills' in iconNode) {
          try { iconNode.fills = []; } catch (error) {}
        }
        centerImportedNodeInContainer(node, iconNode, payload.size);
      } catch (error) {
        iconNode = null;
      }
    }
    if (!iconNode && payload.svgMarkup) {
      try {
        const rect = figma.createRectangle();
        rect.name = 'icon-image';
        const imageHash = await createImageHashFromSvgMarkup(String(payload.svgMarkup));
        rect.fills = [{ type: 'IMAGE', scaleMode: 'FIT', imageHash }];
        if (payload.size && Number(payload.size.width) > 0 && Number(payload.size.height) > 0) rect.resizeWithoutConstraints(Number(payload.size.width), Number(payload.size.height));
        iconNode = rect;
      } catch (error) {
        iconNode = null;
      }
    }
    if (!iconNode) {
      const textNode = figma.createText();
      await figma.loadFontAsync(textNode.fontName);
      textNode.name = 'icon-placeholder';
      textNode.characters = mapIconText(payload.textLabel || payload.assetId || payload.hash || payload.sourceType || 'icon');
      if (payload.size && payload.size.height) textNode.fontSize = Number(payload.size.height);
      if (payload.fill) {
        const paint = Array.isArray(payload.fill) ? payload.fill : [parseRgbPaint(payload.fill)].filter(Boolean);
        if (paint.length) textNode.fills = paint;
      }
      iconNode = textNode;
    }
    node.appendChild(iconNode);
    if ('x' in iconNode) iconNode.x = 0;
    if ('y' in iconNode) iconNode.y = 0;
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, iconNodeId: iconNode.id } });
  }
  if (commandType === 'set_plugin_data') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    if (!node.setPluginData) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support plugin data: ' + node.id);
    if (payload.uiId !== undefined) {
      setUiIdOnNode(node, payload.uiId);
      return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, namespace: UI_ID_PLUGIN_NAMESPACE, key: UI_ID_PLUGIN_KEY, value: getUiIdFromNode(node) } });
    }
    if (!payload.pluginData || !payload.pluginData.namespace || !payload.pluginData.key) throw appError('INVALID_COMMAND_PAYLOAD', 'set_plugin_data requires pluginData.namespace and pluginData.key');
    const compositeKey = String(payload.pluginData.namespace) + ':' + String(payload.pluginData.key);
    node.setPluginData(compositeKey, String(payload.pluginData.value || ''));
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, namespace: payload.pluginData.namespace, key: payload.pluginData.key } });
  }
  if (commandType === 'get_plugin_data') {
    const node = await getNodeFromPayload(payload, commandType, refMap);
    if (!node.getPluginData) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support plugin data: ' + node.id);
    if (payload.uiId !== undefined || payload.pluginData === undefined) {
      const value = getUiIdFromNode(node);
      return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, namespace: UI_ID_PLUGIN_NAMESPACE, key: UI_ID_PLUGIN_KEY, value: value } });
    }
    if (!payload.pluginData || !payload.pluginData.namespace || !payload.pluginData.key) throw appError('INVALID_COMMAND_PAYLOAD', 'get_plugin_data requires pluginData.namespace and pluginData.key');
    const compositeKey = String(payload.pluginData.namespace) + ':' + String(payload.pluginData.key);
    const value = node.getPluginData(compositeKey);
    return normalizeCommandResult(commandType, 'ok', { nodeId: node.id, data: { id: node.id, namespace: payload.pluginData.namespace, key: payload.pluginData.key, value: value } });
  }

  if (commandType === 'delete_matching_nodes') {
    const query = payload && payload.query ? payload.query : {};
    let matches = findNodesByQuery(query).filter(function (node) { return node.type !== 'PAGE'; });
    if (query && query.uiIdPrefix) {
      const prefix = String(query.uiIdPrefix);
      const prefixMatches = [];
      walkScene(function (node) { const uiId = getUiIdFromNode(node) || ''; if (uiId && uiId.indexOf(prefix) === 0 && node.type !== 'PAGE') prefixMatches.push(node); });
      const seen = new Set(matches.map(function (n) { return n.id; }));
      for (const node of prefixMatches) if (!seen.has(node.id)) matches.push(node);
    }
    const deleted = [];
    for (const node of matches) {
      deleted.push({ id: node.id, name: node.name, type: node.type, uiId: getUiIdFromNode(node) || null });
      node.remove();
    }
    return normalizeCommandResult(commandType, 'ok', { nodeId: null, data: { count: deleted.length, deleted: deleted } });
  }
  if (commandType === 'find_nodes') {
    const nodes = findMatchingNodes(payload);
    return normalizeCommandResult(commandType, 'ok', { data: { count: nodes.length, nodes: nodes } });
  }
  throw appError('UNSUPPORTED_COMMAND', 'Unsupported generic plugin command: ' + commandType);
}
async function executeCommandStep(step, refMap) { try { return await executeLowLevelCommand(step, refMap || {}); } catch (error) { const mapped = mapError(error); return normalizeCommandResult(step && step.type ? step.type : 'unknown', 'error', { error: mapped }); } }
async function handleCreatePage(command, sessionId, sessionToken) { const page = figma.createPage(); page.name = String(command.payload && command.payload.name ? command.payload.name : 'New Page'); const result = normalizeCommandResult('create_page', 'ok', { nodeId: page.id, data: { id: page.id, name: page.name } }); await completeCommand(sessionId, sessionToken, command.commandId, { result: result }); setLastCommand('create-page → ' + page.name + ' (' + command.commandId + ')'); }
async function handleCreateFrame(command, sessionId, sessionToken) { const parent = await getParentNode(command.payload || {}); const frame = figma.createFrame(); frame.name = String(command.payload && command.payload.name ? command.payload.name : 'New Frame'); if ('fills' in frame) frame.fills = []; frame.resizeWithoutConstraints(Number(command.payload && command.payload.width ? command.payload.width : 1440), Number(command.payload && command.payload.height ? command.payload.height : 1024)); parent.appendChild(frame); setUiIdOnNode(frame, command.payload && command.payload.uiId); setXY(frame, command.payload && command.payload.x, command.payload && command.payload.y); const result = normalizeCommandResult('create_frame', 'ok', { nodeId: frame.id, data: { id: frame.id, name: frame.name, parentNodeId: parent.id, width: frame.width, height: frame.height, uiId: getUiIdFromNode(frame) || null } }); await completeCommand(sessionId, sessionToken, command.commandId, { result: result }); setLastCommand('create-frame → ' + frame.name + ' (' + command.commandId + ')'); }
async function handleCreateSection(command, sessionId, sessionToken) { const parent = await getParentNode(command.payload || {}); const section = figma.createSection(); section.name = String(command.payload && command.payload.name ? command.payload.name : 'New Section'); section.resizeWithoutConstraints(Number(command.payload && command.payload.width !== undefined && command.payload.width !== null ? command.payload.width : 1440), Number(command.payload && command.payload.height !== undefined && command.payload.height !== null ? command.payload.height : 1024)); parent.appendChild(section); setUiIdOnNode(section, command.payload && command.payload.uiId); setXY(section, command.payload && command.payload.x, command.payload && command.payload.y); const result = normalizeCommandResult('create_section', 'ok', { nodeId: section.id, data: { id: section.id, name: section.name, parentNodeId: parent.id, uiId: getUiIdFromNode(section) || null } }); await completeCommand(sessionId, sessionToken, command.commandId, { result: result }); setLastCommand('create-section → ' + section.name + ' (' + command.commandId + ')'); }
async function handleUpdateText(command, sessionId, sessionToken) { const result = await executeCommandStep({ type: 'set_text_content', payload: { nodeId: command.payload.nodeId, text: command.payload.text } }); if (result.status === 'error') { await completeCommand(sessionId, sessionToken, command.commandId, { error: result.error, result: result }); throw appError(result.error.code, result.error.message, result.error.details); } await completeCommand(sessionId, sessionToken, command.commandId, { result: result }); setLastCommand('update-text → ' + result.nodeId + ' (' + command.commandId + ')'); }
async function handleApplyStyleFromAlias(command, sessionId, sessionToken) { const alias = command.payload && command.payload.alias ? String(command.payload.alias) : ''; const style = STYLE_ALIAS_REGISTRY[alias]; if (!style) { const error = { code: 'STYLE_ALIAS_NOT_FOUND', message: 'Alias style not found in plugin registry: ' + alias }; await completeCommand(sessionId, sessionToken, command.commandId, { error: error, result: normalizeCommandResult('apply_style_from_alias', 'error', { error: error }) }); throw appError(error.code, error.message); } const result = await executeCommandStep({ type: 'set_fill', payload: { nodeId: command.payload.nodeId, fills: style.fills } }); if (result.status === 'error') { await completeCommand(sessionId, sessionToken, command.commandId, { error: result.error, result: result }); throw appError(result.error.code, result.error.message, result.error.details); } result.commandType = 'apply_style_from_alias'; result.data = { id: result.nodeId, alias: alias, applied: true }; await completeCommand(sessionId, sessionToken, command.commandId, { result: result }); setLastCommand('apply-style-from-alias → ' + alias + ' (' + command.commandId + ')'); }
async function handleDuplicateBlock(command, sessionId, sessionToken) { const sourceNodeId = command.payload && command.payload.nodeId ? String(command.payload.nodeId) : ''; if (!sourceNodeId) throw appError('INVALID_COMMAND_PAYLOAD', 'duplicate-block requires nodeId'); const sourceNode = await figma.getNodeByIdAsync(sourceNodeId); if (!sourceNode) throw appError('NODE_NOT_FOUND', 'Source node not found for duplicate-block: ' + sourceNodeId); if (!('clone' in sourceNode)) throw appError('UNSUPPORTED_OPERATION', 'Target node does not support clone(): ' + sourceNodeId); const cloned = sourceNode.clone(); let targetParent = null; if (command.payload && command.payload.targetParentNodeId) targetParent = await figma.getNodeByIdAsync(String(command.payload.targetParentNodeId)); if (!targetParent || !('appendChild' in targetParent)) targetParent = sourceNode.parent && 'appendChild' in sourceNode.parent ? sourceNode.parent : figma.currentPage; targetParent.appendChild(cloned); if (command.payload && command.payload.name) cloned.name = String(command.payload.name); setXY(cloned, command.payload && command.payload.x, command.payload && command.payload.y); const result = normalizeCommandResult('duplicate_block', 'ok', { nodeId: cloned.id, data: { id: cloned.id, name: cloned.name, parentNodeId: targetParent.id, sourceNodeId: sourceNode.id } }); await completeCommand(sessionId, sessionToken, command.commandId, { result: result }); setLastCommand('duplicate-block → ' + cloned.name + ' (' + command.commandId + ')'); }
async function handleExecutePluginCommand(command, sessionId, sessionToken) { const step = command.payload && command.payload.command ? command.payload.command : null; if (!step) throw appError('INVALID_COMMAND_PAYLOAD', 'execute-plugin-command requires command'); const result = await executeCommandStep(step); if (result.status === 'error') { await completeCommand(sessionId, sessionToken, command.commandId, { error: result.error, result: result }); throw appError(result.error.code, result.error.message, result.error.details); } await completeCommand(sessionId, sessionToken, command.commandId, { result: result }); setLastCommand('execute-plugin-command → ' + result.commandType + ' (' + command.commandId + ')'); }
async function handleExecutePluginBatch(command, sessionId, sessionToken) { const steps = command.payload && Array.isArray(command.payload.commands) ? command.payload.commands : []; if (!steps.length) throw appError('INVALID_COMMAND_PAYLOAD', 'execute-plugin-batch requires commands'); const refMap = {}; const results = []; let failed = false; for (const step of steps) { const result = await executeCommandStep(step, refMap); results.push(result); if (result.status === 'error') failed = true; } const batchResult = { status: failed ? 'partial' : 'ok', total: results.length, successCount: results.filter(function (item) { return item.status === 'ok'; }).length, errorCount: results.filter(function (item) { return item.status === 'error'; }).length, results: results, refs: refMap }; if (command.payload && command.payload.returnSnapshots) { batchResult.snapshots = {}; for (const key of Object.keys(refMap)) { try { const node = await figma.getNodeByIdAsync(refMap[key]); if (node) batchResult.snapshots[key] = serializeNodeSnapshot(node, { maxDepth: 3 }, 0); } catch (error) {} } } if (failed) await completeCommand(sessionId, sessionToken, command.commandId, { error: { code: 'PLUGIN_BATCH_PARTIAL_FAILURE', message: 'One or more batch steps failed' }, result: batchResult }); else await completeCommand(sessionId, sessionToken, command.commandId, { result: batchResult }); setLastCommand('execute-plugin-batch → ' + steps.length + ' steps (' + command.commandId + ')'); }
async function pollOnce() { const pending = await getPendingCommands(state.sessionId, state.sessionToken); const scope = await refreshSessionScope(); setPollHeartbeat(); const items = pending && pending.data ? pending.data : []; setPendingCount(items.length); if (!items.length) { if (scope && scope.data) setActiveSessionCount(scope.data.activeSessionCount); setLastCommand(state.lastCommand || 'No pending commands'); return; } for (const command of items) { try { if (command.type === 'create-page') await handleCreatePage(command, state.sessionId, state.sessionToken); else if (command.type === 'create-frame') await handleCreateFrame(command, state.sessionId, state.sessionToken); else if (command.type === 'create-section') await handleCreateSection(command, state.sessionId, state.sessionToken); else if (command.type === 'duplicate-block') await handleDuplicateBlock(command, state.sessionId, state.sessionToken); else if (command.type === 'apply-style-from-alias') await handleApplyStyleFromAlias(command, state.sessionId, state.sessionToken); else if (command.type === 'update-text') await handleUpdateText(command, state.sessionId, state.sessionToken); else if (command.type === 'execute-plugin-command') await handleExecutePluginCommand(command, state.sessionId, state.sessionToken); else if (command.type === 'execute-plugin-batch') await handleExecutePluginBatch(command, state.sessionId, state.sessionToken); else throw appError('UNSUPPORTED_COMMAND', 'Unsupported command: ' + command.type); } catch (error) { const mapped = mapError(error); await completeCommand(state.sessionId, state.sessionToken, command.commandId, { error: { code: mapped.code, message: mapped.message }, result: normalizeCommandResult(command.type, 'error', { error: mapped }) }); setLastCommand('Failed: ' + command.type + ' (' + command.commandId + ')'); } } }
figma.ui.onmessage = async function (msg) { if (!msg || !msg.type) return; if (msg.type === 'request-status') { pushState(); refreshSessionScope().catch(function (error) { console.error(error); }); return; } if (msg.type === 'reconnect-session') { try { state.status = 'reconnecting'; state.connected = false; state.lastError = ''; pushState(); const registration = await registerSession(); setConnected(registration.data.sessionId, registration.data.sessionToken); setLastCommand('Session re-registered'); figma.notify('Plugin bridge reconnected: ' + registration.data.sessionId); } catch (error) { const message = String(error && error.message ? error.message : error); console.error(error); setError(message); figma.notify(message, { error: true, timeout: 8000 }); } return; } if (msg.type === 'keep-current-session') { try { const result = await keepOnlyCurrentSession(state.sessionId, state.sessionToken); const count = result && result.data ? result.data.activeSessionCount : 0; setActiveSessionCount(count); setLastCommand('Kept only current session'); figma.notify('Only current session remains active' + (result && result.data && result.data.deactivatedSessionIds && result.data.deactivatedSessionIds.length ? ': ' + result.data.deactivatedSessionIds.length + ' deactivated' : '')); } catch (error) { const message = String(error && error.message ? error.message : error); console.error(error); setError(message); figma.notify(message, { error: true, timeout: 8000 }); } return; } if (msg.type === 'copy-session-id') { const value = msg.value || state.sessionId || ''; figma.notify(value ? 'Session ID ready to copy: ' + value : 'Session ID is empty'); return; } };
async function main() { syncFileState(); pushState(); try { const restored = await tryRestoreStoredSession(); if (restored) { figma.notify('Plugin bridge restored: ' + state.sessionId); } else { const registration = await registerSession(); const sessionId = registration.data.sessionId; const sessionToken = registration.data.sessionToken; setConnected(sessionId, sessionToken); setLastCommand('Session registered'); figma.notify('Plugin bridge connected: ' + sessionId); } setInterval(async function () { if (pollInFlight) return; pollInFlight = true; try { await pollOnce(); } catch (error) { if (isSessionTransportError(error)) { await recoverSessionAfterTransportError(error); } else { const message = String(error && error.message ? error.message : error); console.error(error); setError(message); } } finally { pollInFlight = false; } }, POLL_INTERVAL_MS); } catch (error) { const message = String(error && error.message ? error.message : error); console.error(error); setError(message); figma.notify(message, { error: true, timeout: 8000 }); } }
main();
