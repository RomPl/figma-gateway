# Figma Gateway GPT schema import

Use the schema matching the required GPT integration:

- Plugin bridge: `https://figma-gateway.vazovski.art/openapi/openapi-gpt-plugin-bridge.yaml`
- Read-only REST: `https://figma-gateway.vazovski.art/openapi/openapi-gpt-readonly.yaml`
- Write REST: `https://figma-gateway.vazovski.art/openapi/openapi-gpt-write.yaml`
- Core read API: `https://figma-gateway.vazovski.art/openapi/openapi.yaml`

The plugin-bridge schema is the preferred surface when a connected Figma plugin session is available. It exposes health/version/capabilities, alias lookup, session registration/listing, generic plugin commands and batches, and safe high-level write helpers.

## Import checklist

1. Fetch the live YAML over HTTPS and confirm HTTP 200 and a YAML-compatible content type.
2. Parse the document and confirm OpenAPI 3.x.
3. Confirm all `operationId` values are unique.
4. Replace the existing GPT Action schema rather than appending duplicate operations.
5. Complete OAuth/API authentication configuration required by the target GPT.
6. Save the GPT configuration and verify that `getCapabilities` and `listActivePluginSessions` appear.
7. Run a read-only call first, then a `dryRun: true` write call before any live mutation.

The plugin-bridge YAML description containing a colon must remain quoted; otherwise GPT import and standard YAML parsers reject the schema.

## Correlation metadata

All request-body operations in the four published schemas accept optional `correlation_id` and `metric_context` fields. `metric_context` is limited to `correlation_id`, `segment_id`, and `activity_window_id`. The gateway captures this metadata before request validation and retains it in the audit event even when a route schema strips unknown business fields.
