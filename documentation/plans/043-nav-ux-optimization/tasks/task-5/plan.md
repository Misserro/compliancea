## Task 5 Plan — Add separator before "My Law Firm" in Legal Hub sidebar

### Goal

Add a visual `<Separator />` immediately before the "My Law Firm" sidebar item inside the Legal Hub group, within the existing orgRole guard so it is only visible to admin/owner users.

### Files to Modify

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | 1) Add `Separator` import from `@/components/ui/separator`. 2) Wrap the existing My Law Firm conditional block to include a `<Separator className="my-1" />` before the `<SidebarMenuItem>`, using a Fragment. |

### Specific Changes

**app-sidebar.tsx line 268-281 — current code:**
```tsx
{sessionData?.user?.orgRole !== "member" && (
  <SidebarMenuItem>
    ...My Law Firm...
  </SidebarMenuItem>
)}
```

**After:**
```tsx
{sessionData?.user?.orgRole !== "member" && (
  <>
    <Separator className="my-1" />
    <SidebarMenuItem>
      ...My Law Firm...
    </SidebarMenuItem>
  </>
)}
```

**Import addition:** Add `import { Separator } from "@/components/ui/separator";` after existing imports.

### No i18n changes needed

No new strings are introduced.

### Risks

None — single-line addition inside an existing conditional block.

### Success Criteria Verification

- Separator renders only when orgRole is not "member" (same guard)
- No sidebar items are moved or reordered
- `npx tsc --noEmit` passes
- en.json and pl.json are unchanged
