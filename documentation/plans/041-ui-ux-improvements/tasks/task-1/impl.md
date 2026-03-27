## Task 1 Complete — Design token refresh (globals.css)

- Modified: `src/app/globals.css`

### `:root` changes (light mode)
- `--radius`: `0.625rem` -> `0.75rem` (line 47)
- `--primary`: achromatic -> `oklch(0.37 0.16 264)` indigo (line 54)
- `--primary-foreground`: `oklch(0.985 0 0)` -> `oklch(0.98 0 0)` (line 55)
- `--ring`: achromatic -> `oklch(0.55 0.18 264)` indigo (line 65)
- `--accent`: achromatic -> `oklch(0.94 0.03 264)` soft indigo tint (line 60)
- `--accent-foreground`: achromatic -> `oklch(0.25 0.08 264)` deep indigo (line 61)
- `--sidebar`: near-white -> `oklch(0.18 0.025 264)` dark navy (line 71)
- `--sidebar-foreground`: dark -> `oklch(0.94 0 0)` near-white (line 72)
- `--sidebar-primary`: achromatic -> `oklch(0.55 0.18 264)` medium indigo (line 73)
- `--sidebar-primary-foreground`: `oklch(0.985 0 0)` -> `oklch(0.98 0 0)` (line 74)
- `--sidebar-accent`: light gray -> `oklch(0.25 0.03 264)` slightly lighter navy (line 75)
- `--sidebar-accent-foreground`: dark -> `oklch(0.94 0 0)` near-white (line 76)
- `--sidebar-border`: light gray -> `oklch(0.28 0.03 264)` subtle navy border (line 77)
- `--sidebar-ring`: gray -> `oklch(0.55 0.18 264)` indigo ring (line 78)

### `.dark` changes
- `--primary`: near-white -> `oklch(0.65 0.18 264)` lighter indigo (line 88)
- `--primary-foreground`: dark -> `oklch(0.10 0.02 264)` dark text on indigo button (line 89)
- `--ring`: gray -> `oklch(0.65 0.18 264)` indigo ring (line 99)
- `--accent`: dark gray -> `oklch(0.30 0.04 264)` dark indigo tint (line 94)
- `--accent-foreground`: near-white -> `oklch(0.92 0.01 264)` (line 95)

### Unchanged `.dark` tokens
- background, foreground, card, card-foreground, popover, popover-foreground, secondary, secondary-foreground, muted, muted-foreground, destructive, border, input, chart-1 through chart-5, all sidebar-* tokens

### INTEGRATION
- Task 2 depends on the new `--sidebar-*` tokens in `:root` for sidebar footer readability fix
- Task 3 depends on the new `--primary` and `--accent` tokens for consistent indigo styling on dashboard elements

### Validation
- All 62 oklch values in the file follow valid 3-argument syntax (L C H)
- No structural changes to the CSS file — only token value replacements
