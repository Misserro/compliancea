## Ultra Claude

This project uses [Ultra Claude](https://github.com/duniecdawid/ultra-claude-code), a Claude Code plugin for spec-driven development.

### Conventions

- **Documentation governs code.** Architecture docs are the source of truth. When code diverges from specs, update the spec first.
- **Canonical documentation** lives in `documentation/` — do not create docs outside this structure.
- **Plans** are stored in `documentation/plans/{NNN}-{name}/` with sequential numbering and embedded task lists.
- **External system context** (Anthropic Claude API docs, Voyage AI SDK, Google Drive API) goes in `context/`.
- **Project configuration** for Claude is in `.claude/` (app-context, system-test, environments-info).

### Key Commands

| Command | Purpose |
|---------|---------|
| `/uc:help` | Guide to all skills and workflows |
| `/uc:feature-mode` | Plan new features with architecture context |
| `/uc:debug-mode` | Investigate bugs with parallel research |
| `/uc:doc-code-verification-mode` | Verify documentation matches code |
| `/uc:discovery-mode` | Product research and requirements |
| `/uc:plan-execution` | Execute approved plans with agent teams |
| `/uc:tech-research` | Research external library docs via Ref.tools (use for Anthropic SDK, Voyage AI, Google Drive API) |

### Workflow

1. **Plan first** — Use feature-mode or debug-mode before writing code
2. **Spec-first for breaking changes** — Update architecture docs before modifying code
3. **Verify after changes** — Run doc-code-verification to catch drift
4. **External integrations** — Before modifying Claude API calls or Voyage AI embeddings, use `/uc:tech-research` to check current SDK docs
