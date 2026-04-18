# Figma → Code diff and safe patcher

## Goal

This is the execution path for the scenario:

- "sync code with the mockup"

The pipeline must compare Figma not only against static code parsing, but against rendered visual truth.

## Main rule

For visual sync, the code side must be interpreted through two different sources:

- Code AST for source mapping and safe patching
- Rendered UI Snapshot for actual visual state

This means the pipeline should no longer assume that AST is enough to describe the current UI.

## Comparison model

The effective comparison becomes:

- Figma Snapshot as design target
- Rendered UI Snapshot as current visual truth
- Code AST as patch surface
- Design Tokens as semantic normalization layer

## MVP patch scope

Allowed automatic changes:

- text content
- classes / style props
- spacing
- colors
- typography
- border radius
- block order
- add / remove simple UI elements

Explicitly forbidden from automatic patching:

- business logic
- API calls
- form logic
- hooks
- routing
- data layer

## Safety model

Patcher only targets JSX nodes addressable by stable `data-ui-id`.

It refuses unsafe subtrees that contain unsupported JSX expressions or spread attributes.

## Patcher behavior

The code patcher can:

- find JSX node by `uiId`
- change text
- change `className`
- change `style`
- add / remove simple child elements
- preserve non-managed attributes such as event handlers and `type`

Managed attributes in MVP:

- `data-ui-id`
- `className`
- `style`
- simple static children

## Outcome

The agent should understand a strict split:

- visual truth comes from browser render
- patch location comes from AST
- design target comes from Figma
- semantic normalization comes from tokens

That split is the basis for safe visual sync.
