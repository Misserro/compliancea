# Task 1 — Implementation Plan: Design token refresh

## File to modify
- `src/app/globals.css`

## Changes

### `:root` block (lines 46-79)
Replace the following tokens with indigo values:

| Token | Old value | New value |
|-------|-----------|-----------|
| `--radius` | `0.625rem` | `0.75rem` |
| `--primary` | `oklch(0.205 0 0)` | `oklch(0.37 0.16 264)` |
| `--primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.98 0 0)` |
| `--ring` | `oklch(0.708 0 0)` | `oklch(0.55 0.18 264)` |
| `--accent` | `oklch(0.97 0 0)` | `oklch(0.94 0.03 264)` |
| `--accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.25 0.08 264)` |
| `--sidebar` | `oklch(0.985 0 0)` | `oklch(0.18 0.025 264)` |
| `--sidebar-foreground` | `oklch(0.145 0 0)` | `oklch(0.94 0 0)` |
| `--sidebar-primary` | `oklch(0.205 0 0)` | `oklch(0.55 0.18 264)` |
| `--sidebar-primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.98 0 0)` |
| `--sidebar-accent` | `oklch(0.97 0 0)` | `oklch(0.25 0.03 264)` |
| `--sidebar-accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.94 0 0)` |
| `--sidebar-border` | `oklch(0.922 0 0)` | `oklch(0.28 0.03 264)` |
| `--sidebar-ring` | `oklch(0.708 0 0)` | `oklch(0.55 0.18 264)` |

### `.dark` block (lines 81-113)
Replace ONLY these tokens — leave all others unchanged:

| Token | Old value | New value |
|-------|-----------|-----------|
| `--primary` | `oklch(0.985 0 0)` | `oklch(0.65 0.18 264)` |
| `--primary-foreground` | `oklch(0.205 0 0)` | `oklch(0.10 0.02 264)` |
| `--ring` | `oklch(0.439 0 0)` | `oklch(0.65 0.18 264)` |
| `--accent` | `oklch(0.269 0 0)` | `oklch(0.30 0.04 264)` |
| `--accent-foreground` | `oklch(0.985 0 0)` | `oklch(0.92 0.01 264)` |

### Tokens NOT touched
- `:root`: background, foreground, card, card-foreground, popover, popover-foreground, secondary, secondary-foreground, muted, muted-foreground, destructive, border, input, chart-1 through chart-5
- `.dark`: background, foreground, card, card-foreground, popover, popover-foreground, secondary, secondary-foreground, muted, muted-foreground, destructive, border, input, chart-1 through chart-5, sidebar-*

## Risks
- None significant. This is a pure CSS variable update with no structural changes.
- All OKLch values follow the existing format pattern (3-argument: L C H).

## Verification
- File must parse without errors (valid CSS)
- No tokens outside the specified set are modified
