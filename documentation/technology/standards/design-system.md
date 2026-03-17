# Design System Standard

> Established: 2026-03-17
> Applies to: Vaulta (ComplianceA) / React 19, shadcn/ui (Radix UI + CVA), Tailwind v4, OKLCH color tokens
> Related: [rest-api.md](./rest-api.md), [security.md](./security.md), [module-separation.md](./module-separation.md)

## Principle

A compliance platform must present information with absolute visual clarity -- ambiguous status indicators, inconsistent interaction patterns, or inaccessible controls directly undermine operator trust and regulatory confidence. Vaulta's design system enforces a single source of truth for color, spacing, typography, and component behavior through semantic tokens, variant-driven components, and Radix UI accessibility primitives. Every visual choice must be tokenized, every interactive element must be keyboard-navigable, and every component must render correctly in both light and dark modes.

## FORBIDDEN

| Forbidden | Use instead |
|---|---|
| `window.confirm()` or `window.alert()` for destructive actions -- not accessible, not styled, blocks the main thread | Use Radix `AlertDialog` from `@/components/ui/alert-dialog` with explicit confirm/cancel buttons |
| Hardcoded color values in component code (`bg-red-500`, `text-[#333]`) for semantic meaning -- breaks dark mode, bypasses token system | Use semantic tokens (`bg-destructive`, `text-muted-foreground`) or domain color maps from `@/lib/constants.ts` (`STATUS_COLORS`, `CATEGORY_COLORS`) |
| `className="..."` string concatenation without `cn()` -- fails to merge conflicting Tailwind classes correctly | Always use `cn()` from `@/lib/utils`: `className={cn("base-classes", conditional && "extra", className)}` |
| Inline `onClick` handlers on non-button elements (`<div onClick>`, `<span onClick>`) -- not keyboard-accessible, no focus indicator | Use `<Button>` component or add `role="button"`, `tabIndex={0}`, and `onKeyDown` handler for Enter/Space |
| Missing `"use client"` directive on components with state, effects, or event handlers -- causes hydration errors in App Router | Add `"use client"` as the first line of any component file that uses hooks or browser APIs |

## Color System

### OKLCH Tokens

All colors are defined in `src/app/globals.css` using the OKLCH color space for perceptual uniformity. Light and dark mode values are set via CSS custom properties on `:root` and `.dark`.

```css
:root {
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
}

.dark {
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
}
```

### Semantic Color Tokens

Use semantic tokens in all component styling. Never reference OKLCH values directly in components.

| Token | Purpose | Tailwind class |
|---|---|---|
| `primary` / `primary-foreground` | Primary actions, emphasis | `bg-primary text-primary-foreground` |
| `secondary` / `secondary-foreground` | Secondary actions, subtle backgrounds | `bg-secondary text-secondary-foreground` |
| `muted` / `muted-foreground` | Disabled states, helper text | `bg-muted text-muted-foreground` |
| `accent` / `accent-foreground` | Hover states, highlights | `bg-accent text-accent-foreground` |
| `destructive` | Delete, error, danger actions | `bg-destructive text-white` |
| `card` / `card-foreground` | Card surfaces | `bg-card text-card-foreground` |
| `border` | Borders, dividers | `border-border` |
| `ring` | Focus ring color | `ring-ring` |

### Domain Color Maps

Status and category colors are centralized in `@/lib/constants.ts` with explicit light and dark mode classes. Always import from constants -- never define inline.

```typescript
import { STATUS_COLORS, CATEGORY_COLORS } from "@/lib/constants";

// Usage in a component
<Badge className={cn(STATUS_COLORS[obligation.status] || STATUS_COLORS.active)}>
  {obligation.status}
</Badge>

<span className={cn(CATEGORY_COLORS[obligation.category || "others"])}>
  {obligation.category}
</span>
```

Rules:

1. Every entry in `STATUS_COLORS` and `CATEGORY_COLORS` must include both light and dark mode classes (e.g., `bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`).
2. Always provide a fallback when accessing color maps: `STATUS_COLORS[status] || STATUS_COLORS.active`.
3. New status or category values must be added to both the constant array (e.g., `OBLIGATION_STATUSES`) and the color map in the same commit.

## Dark Mode

Dark mode is implemented via the `next-themes` ThemeProvider with `attribute="class"`. The `.dark` class is toggled on the `<html>` element.

```typescript
// src/app/layout.tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
  {children}
</ThemeProvider>
```

Rules:

1. CSS custom properties in `globals.css` handle the base theme switch -- most components need no `dark:` overrides.
2. When domain color maps use Tailwind utility classes (STATUS_COLORS, CATEGORY_COLORS), they must include explicit `dark:` variants because they bypass the CSS variable system.
3. Never use `@media (prefers-color-scheme: dark)` in components -- rely on the `.dark` class strategy.

## Component Architecture

### CVA (class-variance-authority) for Variants

All reusable components with visual variants use CVA to define variant classes with type-safe props.

```typescript
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Base classes applied to all variants
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

// Component uses VariantProps for type-safe variant prop
function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
```

Rules:

1. Export both the component and its `*Variants` function so consumers can compose variant classes outside the component when needed.
2. Always set `defaultVariants` so the component renders correctly without explicit variant props.
3. Use `React.ComponentProps<"element">` for the base prop type -- not custom interfaces.

### cn() for Class Merging

Every `className` prop must pass through `cn()` (clsx + tailwind-merge). This ensures conflicting Tailwind classes resolve correctly.

```typescript
import { cn } from "@/lib/utils";

// cn() merges base classes, variant classes, conditional classes, and consumer overrides
<div className={cn(
  "rounded-lg border p-4",           // base
  isActive && "border-primary",       // conditional
  className                           // consumer override (always last)
)} />
```

Rules:

1. Consumer `className` is always the last argument to `cn()` so it can override internal classes.
2. Never concatenate className strings manually: `className={\`base ${extra}\`}` fails to resolve conflicts.

### data-slot Attributes

All shadcn/ui primitive components include `data-slot` attributes for testing and CSS targeting.

```typescript
<div data-slot="card" className={cn("bg-card ...", className)} {...props} />
<div data-slot="card-header" className={cn("...", className)} {...props} />
<span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
```

Rules:

1. Every shadcn/ui component sets `data-slot` to a kebab-case identifier matching its role.
2. Use `data-slot` for CSS targeting in parent contexts: `has-data-[slot=card-action]:grid-cols-[1fr_auto]`.
3. Do not remove `data-slot` attributes from shadcn/ui components when customizing them.

## Accessibility

### Focus Indicators

All interactive components include visible focus indicators using the `focus-visible` pseudo-class.

```css
/* Standard focus ring -- applied to all interactive shadcn/ui components */
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

Rules:

1. Never remove or override focus-visible styles without providing an equivalent indicator.
2. Use `focus-visible` (not `focus`) so that mouse clicks do not trigger the ring.
3. The ring uses `ring-ring/50` (50% opacity of the ring token) with a 3px width.

### Keyboard Navigation

All interactive elements must be operable via keyboard.

1. Buttons: use `<Button>` component (renders `<button>` by default) -- keyboard support is built in.
2. Dialogs: use Radix `Dialog` or `AlertDialog` -- focus trapping and Escape-to-close are built in.
3. Dropdowns: use Radix `DropdownMenu` -- arrow key navigation is built in.
4. Custom interactive elements: add `role`, `tabIndex={0}`, and `onKeyDown` handler.

### ARIA

Radix UI primitives provide ARIA attributes automatically. Do not add redundant ARIA attributes to Radix-based components. When building custom components, follow WAI-ARIA patterns for the relevant widget role.

## Radius Token System

A base radius value is defined in `globals.css` with derived sizes:

```css
:root {
  --radius: 0.625rem;
}

/* Derived in @theme inline */
--radius-sm: calc(var(--radius) - 4px);
--radius-md: calc(var(--radius) - 2px);
--radius-lg: var(--radius);
--radius-xl: calc(var(--radius) + 4px);
```

| Token | Value | Typical use |
|---|---|---|
| `rounded-sm` | 0.225rem | Small elements (badges, chips) |
| `rounded-md` | 0.425rem | Buttons, inputs |
| `rounded-lg` | 0.625rem | Cards, dialogs |
| `rounded-xl` | 1.025rem | Large panels, hero sections |

Rules:

1. Use Tailwind's `rounded-*` classes that map to these tokens -- never hardcode pixel radius values.
2. Cards use `rounded-xl`. Buttons use `rounded-md`. Badges use `rounded-md`.

## Tailwind v4 Conventions

Vaulta uses Tailwind CSS v4 with its new configuration syntax.

```css
/* globals.css -- Tailwind v4 setup */
@import "tailwindcss";
@plugin "@tailwindcss/typography";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-primary: var(--primary);
  /* ... all semantic tokens bridged to Tailwind */
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

Rules:

1. Use `@theme inline` (not `tailwind.config.js`) for token registration -- this is the Tailwind v4 way.
2. Use `@custom-variant dark (&:is(.dark *))` for dark mode -- not the v3 `darkMode: "class"` config.
3. Use `@layer base` for global element styles -- not bare selectors.
4. Use `@plugin` for Tailwind plugins (typography, animate) -- not the v3 `plugins: []` array.

## Icon System

Vaulta uses Lucide React for all icons with a consistent sizing convention.

```typescript
import { AlertCircle, Check, ChevronDown } from "lucide-react";

// Icons inside buttons/badges are auto-sized via parent [&_svg]:size-4
<Button variant="outline" size="sm">
  <Check /> Approve
</Button>

// Standalone icons specify size explicitly
<AlertCircle className="size-5 text-destructive" />
```

Rules:

1. Import icons individually from `lucide-react` -- never import the entire library.
2. Icons inside `Button` and `Badge` components are auto-sized to `size-4` (16px) via the `[&_svg]:size-4` selector in the CVA base classes.
3. Standalone icons use `size-*` utility classes (not `w-*` + `h-*`).
4. Icon color inherits from parent text color by default. Override with `text-*` classes when semantic coloring is needed.

## New Component Checklist

- [ ] `"use client"` directive if component uses hooks, state, effects, or event handlers
- [ ] CVA used for any component with 2+ visual variants
- [ ] `cn()` wraps all `className` values -- consumer `className` passed as last argument
- [ ] `data-slot` attribute set on the root element
- [ ] `focus-visible:ring-[3px] focus-visible:ring-ring/50` on all interactive elements
- [ ] Dark mode works -- either via CSS variable tokens or explicit `dark:` classes in color maps
- [ ] Destructive actions use `AlertDialog`, not `window.confirm()`
- [ ] All domain colors sourced from `@/lib/constants.ts` color maps, not inline Tailwind classes
- [ ] Icons imported individually from `lucide-react`
- [ ] Component exported as named export alongside its `*Variants` function (if applicable)

## Related

- [module-separation.md](./module-separation.md) -- component import conventions, layer boundaries, `@/lib/utils` and `@/lib/constants` as shared modules
- [rest-api.md](./rest-api.md) -- error response shapes that the UI must handle
- [security.md](./security.md) -- `escapeHtml()` for user-generated content rendering
