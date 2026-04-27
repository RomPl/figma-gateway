import { AppError } from './errors';
import type { FigmaCommandStep, FigmaLowLevelCommandType } from './figma-write-types';

const SUPPORTED_MVP_COMMANDS = new Set<FigmaLowLevelCommandType>([
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
  'set_layout_sizing',
  'set_visibility',
  'set_plugin_data',
  'get_plugin_data',
  'find_nodes',
  'set_icon_reference',
  'set_effects',
  'delete_matching_nodes',
  'export_ui_snapshot',
  'export_node_snapshot',
  'export_design_system_snapshot',
  'export_node_as_image',
  'debug_runtime_info'
]);

const SUPPORTED_MVP_KINDS = new Set([
  'page',
  'section',
  'frame',
  'group',
  'text',
  'image',
  'button',
  'input',
  'card',
  'list',
  'icon',
  'component_instance'
]);

const containsExcludedMarker = (value: string): boolean =>
  /(canvas|webgl|animation|animated|lottie|business[-_ ]logic|breakpoints?)/i.test(value);

export const assertMvpWriteCommandAllowed = (command: FigmaCommandStep): void => {
  if (!SUPPORTED_MVP_COMMANDS.has(command.type)) {
    throw new AppError(
      `Command is outside MVP v1 scope: ${command.type}`,
      422,
      'MVP_SCOPE_VIOLATION',
      {
        commandType: command.type,
        reason: 'This low-level command is not part of the supported React + TypeScript visual sync MVP.'
      }
    );
  }

  const payload = command.payload ?? {};
  const kind = typeof payload.kind === 'string' ? payload.kind : undefined;
  if (kind && !SUPPORTED_MVP_KINDS.has(kind)) {
    throw new AppError(
      `Node kind is outside MVP v1 scope: ${kind}`,
      422,
      'MVP_SCOPE_VIOLATION',
      {
        commandType: command.type,
        kind,
        reason: 'Only basic layout and visual UI kinds are supported in MVP v1.'
      }
    );
  }

  for (const value of Object.values(payload)) {
    if (typeof value === 'string' && containsExcludedMarker(value)) {
      throw new AppError(
        `Payload hints at unsupported MVP v1 feature: ${value}`,
        422,
        'MVP_SCOPE_VIOLATION',
        {
          commandType: command.type,
          reason: 'Animations, canvas/WebGL, complex business logic, and all-breakpoint diff are out of scope for MVP v1.'
        }
      );
    }
  }
};

export const assertMvpWriteBatchAllowed = (commands: FigmaCommandStep[]): void => {
  for (const command of commands) {
    assertMvpWriteCommandAllowed(command);
  }
};
