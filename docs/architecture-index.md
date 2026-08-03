# Architecture index

Project: **Figma Gateway**

- Primary architecture reference: [`docs/architecture.md`](../docs/architecture.md)
- Runtime/service boundary: `figma-gateway.service`
- Source changes must remain separate from backup, generated, and secret-bearing artifacts.
- Review branch ancestry and live/runtime paths before deploy or synchronization.
