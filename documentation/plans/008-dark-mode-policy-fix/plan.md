# Dark Mode + Policy In-Force Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a light/dark/system theme toggle to the app sidebar, and fix the Policies tab showing AI-tagged "In Force" documents as "Archived".

**Architecture:** `next-themes` (already in `package.json`) provides a `ThemeProvider` that applies the `.dark` CSS class to `<html>` — the CSS variables for both themes already exist in `globals.css`. The policy bug is fixed by adding a shared `isInForce()` helper to `src/lib/utils.ts` and using it in the three Policies-tab files that currently check only `in_force === "true"`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, next-themes ^0.4.4, lucide-react

---

## Context for the implementer

**Working directory:** `/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea`

**No test framework is set up** — verification is done by running `npm run build` (catches TS errors) and manual browser checks.

**Key fact about the policy bug:** The `in_force` DB column can hold two "active" values:
- `"in_force"` — written by the AI auto-tagger (`lib/autoTagger.js`)
- `"true"` — written by the Replace workflow (`lib/db.js:1465`)

The Policies tab only checks `=== "true"`, so AI-tagged documents always appear "Archived". The `document-badges.tsx` component already handles both values correctly — we're fixing the Policies tab to match.

---

### Task 1: Add `isInForce` helper and fix Policies tab

**Files:**
- Modify: `src/lib/utils.ts` (append after line 35)
- Modify: `src/app/policies/page.tsx` (lines 64–76)
- Modify: `src/components/policies/policies-list.tsx` (line 39)
- Modify: `src/components/policies/version-history-panel.tsx` (line 57)

**Step 1: Add the helper to `src/lib/utils.ts`**

Append this function at the end of the file (after `escapeHtml`):

```ts
export function isInForce(value: string | null | undefined): boolean {
  return value === "true" || value === "in_force";
}
```

**Step 2: Update `src/app/policies/page.tsx`**

At the top, add the import:
```ts
import { isInForce } from "@/lib/utils";
```

Replace the `activeOnly` filter (line ~64):
```ts
// BEFORE:
result = result.filter((d) => d.in_force === "true");

// AFTER:
result = result.filter((d) => isInForce(d.in_force));
```

Replace the sort comparisons (lines ~74–76):
```ts
// BEFORE:
result.sort((a, b) => {
  if (a.in_force === "true" && b.in_force !== "true") return -1;
  if (a.in_force !== "true" && b.in_force === "true") return 1;
  return a.name.localeCompare(b.name);
});

// AFTER:
result.sort((a, b) => {
  if (isInForce(a.in_force) && !isInForce(b.in_force)) return -1;
  if (!isInForce(a.in_force) && isInForce(b.in_force)) return 1;
  return a.name.localeCompare(b.name);
});
```

**Step 3: Update `src/components/policies/policies-list.tsx`**

Add the import at the top:
```ts
import { isInForce } from "@/lib/utils";
```

Replace line 39:
```ts
// BEFORE:
const isActive = doc.in_force === "true";

// AFTER:
const isActive = isInForce(doc.in_force);
```

**Step 4: Update `src/components/policies/version-history-panel.tsx`**

Add the import at the top:
```ts
import { isInForce } from "@/lib/utils";
```

Replace line 57:
```ts
// BEFORE:
const isCurrent = v.in_force === "true";

// AFTER:
const isCurrent = isInForce(v.in_force);
```

**Step 5: Verify — TypeScript build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

**Step 6: Commit**

```bash
git add src/lib/utils.ts src/app/policies/page.tsx src/components/policies/policies-list.tsx src/components/policies/version-history-panel.tsx
git commit -m "fix: normalize in_force check in Policies tab to handle AI-tagged documents"
```

---

### Task 2: Dark Mode toggle in sidebar

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

**Note:** `next-themes` is already in `package.json` — no install needed.

**Step 1: Update `src/app/layout.tsx`**

The file currently looks like this (read it first to confirm line numbers):
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
// ...

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
        <Toaster />
      </body>
    </html>
  );
}
```

Replace it with:
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Document Analyzer",
  description: "AI-powered document analysis and contract management platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <main className="flex-1 overflow-auto">
                {children}
              </main>
            </SidebarInset>
          </SidebarProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Key changes:
- `suppressHydrationWarning` on `<html>` — required by `next-themes` to prevent SSR mismatch warning
- `ThemeProvider` wraps everything inside `<body>`
- `attribute="class"` — applies `.dark` class (matches the CSS custom variant `@custom-variant dark (&:is(.dark *))` in `globals.css`)
- `defaultTheme="system"` — follows OS preference by default
- `enableSystem` — allows the "system" option
- `disableTransitionOnChange` — prevents a flash of unstyled content on theme change

**Step 2: Update `src/components/layout/app-sidebar.tsx`**

The full updated file (read current file first to confirm imports match):

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Search, ClipboardCheck, Settings, MessageSquare, Layers, Shield, Package, LayoutDashboard, Sun, Moon, Monitor } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Documents", href: "/documents", icon: FileText },
  { title: "Policies", href: "/policies", icon: Shield },
  { title: "Analyze", href: "/analyze", icon: Search },
  { title: "Ask Library", href: "/ask", icon: MessageSquare },
  { title: "Process", href: "/process", icon: Layers },
  { title: "Contracts", href: "/contracts", icon: ClipboardCheck },
  { title: "Product Hub", href: "/product-hub", icon: Package },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [overdueCount, setOverdueCount] = useState(0);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    async function fetchOverdue() {
      try {
        const res = await fetch("/api/obligations?filter=all");
        if (res.ok) {
          const data = await res.json();
          setOverdueCount(data.stats?.overdue || 0);
        }
      } catch {
        // ignore
      }
    }
    fetchOverdue();
    const interval = setInterval(fetchOverdue, 60000);
    return () => clearInterval(interval);
  }, []);

  function cycleTheme() {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  }

  function ThemeIcon() {
    if (theme === "dark") return <Moon className="h-4 w-4" />;
    if (theme === "light") return <Sun className="h-4 w-4" />;
    return <Monitor className="h-4 w-4" />;
  }

  function themeLabel() {
    if (theme === "dark") return "Dark";
    if (theme === "light") return "Light";
    return "System";
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-2" />
          <h1 className="text-lg font-semibold tracking-tight">
            ComplianceA
          </h1>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 py-4">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.title}</span>
                    {item.href === "/contracts" && overdueCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="ml-auto h-5 min-w-5 px-1.5 text-xs"
                      >
                        {overdueCount}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="border-t px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={cycleTheme}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          title="Toggle theme"
        >
          <ThemeIcon />
          <span className="text-xs">{themeLabel()}</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
```

Key additions:
- `SidebarFooter` imported from `@/components/ui/sidebar`
- `Sun`, `Moon`, `Monitor` icons from `lucide-react`
- `useTheme` from `next-themes` for reading/setting theme
- `Button` imported from `@/components/ui/button`
- `cycleTheme()` cycles light → dark → system → light
- `SidebarFooter` at the bottom with the toggle button

**Step 3: Verify — TypeScript build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

**Step 4: Manual verification**

Run `npm run dev` and open `http://localhost:3000`:
1. The sidebar footer shows a theme icon + label (e.g., "System", "Light", or "Dark")
2. Clicking it cycles through the three themes
3. The app visually switches between light and dark
4. Refreshing the page preserves the selected theme
5. When set to "System", the app follows the OS dark/light preference

**Step 5: Commit**

```bash
git add src/app/layout.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat: add dark/light/system theme toggle to sidebar"
```
