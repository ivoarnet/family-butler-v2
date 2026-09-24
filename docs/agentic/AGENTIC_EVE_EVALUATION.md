# Evaluation: Should we use eve.dev?

## Short answer

`eve.dev` can be evaluated for orchestration patterns, but for this repository the default recommendation is:

- Keep the first implementation framework-light.
- Build agent chat + MCP surfaces directly in the existing Azure Functions architecture.
- Re-evaluate a framework only after first production usage data.

## Why this recommendation

1. **Architecture fit today**
   - Current backend is simple Azure Functions handlers.
   - Introducing a new framework early may add deployment/runtime complexity before core workflows are proven.

2. **Incremental delivery**
   - The requested feature can be delivered with current stack primitives:
     - provider adapters
     - tool/action handlers
     - DB-backed conversation + audit records

3. **Future flexibility**
   - A clean provider + tool abstraction keeps the path open to adopt eve.dev later without breaking API contracts.

## Practical decision gate

Revisit framework adoption only if one or more triggers appears:

- Multi-agent orchestration complexity grows significantly
- Tool invocation graphs become hard to maintain manually
- Evaluation/runtime tracing needs exceed current logging approach
- Team velocity slows due to custom orchestration code

Until then, the lowest-risk path is to stay within the current architecture and keep extension points well-defined.
