# Contributing to CXOS

**CXOS** is a fleet workspace companion for domain-agnostic CX programs.

The **engine, packages, CLI, and product code** live in
[chendren/coxswain](https://github.com/chendren/coxswain). Contribute code,
packages, packs, and bug fixes there:

- Contributing guide: https://github.com/chendren/coxswain/blob/main/CONTRIBUTING.md
- Code of Conduct: https://github.com/chendren/coxswain/blob/main/CODE_OF_CONDUCT.md
- Security: https://github.com/chendren/coxswain/blob/main/SECURITY.md
- Support: https://github.com/chendren/coxswain/blob/main/SUPPORT.md

This repository holds workspace content: program state under `.cox/cx/`,
dashboards, CAB exports, and bootstrap scripts that proxy into
`$COXSWAIN_ROOT` (a local coxswain checkout).

## When to open a PR here

- Workspace docs, dashboards, or program scaffolding
- Demo program content that is not engine logic
- Bootstrap / proxy script fixes for the fleet workspace

## When to open a PR in coxswain

- Anything under `packages/`
- `cox` / `cox cx` CLI behavior
- Vertical packs (`cx-pack-*`)
- Golden path, operate loop, AWS plan export, router, ledger

## License

Apache License 2.0. See [LICENSE](./LICENSE).
