## Task 5 Complete — Add separator before "My Law Firm" in Legal Hub sidebar

- Modified: `src/components/layout/app-sidebar.tsx`
  - Added import: `import { Separator } from "@/components/ui/separator";` (line 25)
  - Wrapped the existing `orgRole !== "member"` conditional block (lines 269-284) with a Fragment, inserting `<Separator className="my-1" />` before the `<SidebarMenuItem>` for My Law Firm
- No i18n files changed (no new strings needed)
- `npx tsc --noEmit` passes with zero errors
- No other sidebar items moved or reordered
