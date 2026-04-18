# Visual confidence score

## Purpose

The system should not invent visual certainty when the evidence is weak.

Each node now carries a visual confidence model that estimates how trustworthy the combined AST, rendered, Figma and token signals are.

## Per-node confidence fields

Each node can now include:

- `AST confidence`
- `rendered confidence`
- `figma confidence`
- `token confidence`
- combined `visual` confidence
- `needsReview`

## Behavior on low confidence

When confidence is low, the system should be conservative.

Current MVP behavior:

- do not auto-apply code patches for low-confidence nodes
- do not auto-create complex Figma asset/icon elements for low-confidence nodes
- mark the node as `needs review`

## Result

This reduces hallucinated sync behavior and makes the system explicitly report weak certainty instead of pretending the mapping is reliable.
