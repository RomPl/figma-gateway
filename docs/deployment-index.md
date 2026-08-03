# Deployment index

Project: **Figma Gateway**

- Primary deployment reference: [`docs/README.md`](../docs/README.md)
- Validation command: `npm run check && npm test && npm run build`
- Service/runtime target: `figma-gateway.service`
- Health verification: `https://figma-gateway.vazovski.art/health`
- Deploy only reviewed commits; keep runtime secrets outside Git.
