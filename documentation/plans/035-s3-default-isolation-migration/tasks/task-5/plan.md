# Task 5 — Admin Panel Per-Org Migration UI

## Overview

Add an `OrgMigrationPanel` component to the expandable org row area in the admin panel. Super admins can trigger `local -> platform_s3` or `own_s3 -> platform_s3` migrations per org, see live progress via polling, and receive warnings when prerequisites are not met.

## Files to Create

### `src/components/admin/org-migration-panel.tsx` (new)

**Props:**
```ts
interface OrgMigrationPanelProps {
  orgId: number;
  storagePolicy: string;
  platformConfigured: boolean;
  orgS3Configured: boolean;
}
```

**Behavior:**
- Self-contained expandable section (same pattern as `OrgFeatureFlags` and `OrgMembersPanel` — toggle button with expand/collapse)
- On expand, fetches migration status via `GET /api/admin/migrations/storage/orgs/{orgId}`
- Polls every 2s while status is `running` or `pending` (replicate `StorageMigration` interval + cleanup pattern)
- Clears interval on status change to completed/failed and on component unmount

**UI sections:**
1. **"Migrate Local -> Platform S3" button** — always rendered; disabled with tooltip "Platform S3 not configured" when `!platformConfigured`; disabled while a migration is running
2. **"Migrate Own S3 -> Platform S3" button** — only rendered when `storagePolicy === 'own_s3'`; disabled with tooltip when `!orgS3Configured || !platformConfigured`; disabled while a migration is running
3. **Progress display** — progress bar + counts (migrated/failed/skipped) while running; "Scanning files..." when total=0
4. **Completed summary** — green banner: N migrated, N failed, N skipped, completion timestamp
5. **Failed summary** — red banner with error message and counts
6. **Retry hint** — amber banner when failed > 0, suggesting re-run

**API calls:**
- Trigger: `POST /api/admin/migrations/storage/orgs/{orgId}` with body `{ type: 'local_to_platform_s3' | 'own_s3_to_platform_s3' }`
- Poll: `GET /api/admin/migrations/storage/orgs/{orgId}`

## Files to Modify

### `src/components/admin/admin-org-list.tsx`

- Add `orgS3Configured: boolean` to the `Org` interface
- Import `OrgMigrationPanel` from `./org-migration-panel`
- Add a new `<tr>` with `<td colSpan={7}>` containing `<OrgMigrationPanel>` below the existing feature flags row
- Pass props: `orgId={org.id}`, `storagePolicy={org.storagePolicy}`, `platformConfigured={org.platformConfigured}`, `orgS3Configured={org.orgS3Configured}`

### `src/app/(admin)/admin/page.tsx`

- Import `getOrgSettings` from `@/lib/db-imports`
- For each org, check if it has S3 configured: call `getOrgSettings(org.id)`, convert to key-value map, check for `s3Bucket` key with a truthy value
- Add `orgS3Configured: boolean` to the org mapping
- Also check platform S3 configuration: call `getPlatformSettings()` once, check for `s3Bucket` key → derive `platformConfigured: boolean`
- Pass `platformConfigured` to `AdminOrgList` as a prop

### `src/components/admin/admin-org-list.tsx` (additional change)

- Add `platformConfigured: boolean` to the component props (alongside `orgs`)
- Pass `platformConfigured` down to each `OrgMigrationPanel`

## UI Components Used

From shadcn/ui: `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Button`, `Tooltip`, `TooltipContent`, `TooltipTrigger`, `TooltipProvider`
From lucide-react: `Loader2`, `CheckCircle2`, `XCircle`, `AlertTriangle`, `Database`

## Key Design Decisions

1. **No new DB helper needed** — `getOrgSettings(orgId)` already exists and returns key-value rows. We check for `s3Bucket` key in the admin page server component. No need for `hasOrgS3Config` since the check is a simple one-liner.
2. **platformConfigured derived server-side** — fetched once in admin page.tsx using `getPlatformSettings()`, passed as prop through `AdminOrgList` to each `OrgMigrationPanel`. Avoids N+1 client-side fetches.
3. **Expandable pattern** — matches `OrgFeatureFlags` (toggle button, lazy load on expand) rather than always-visible card.
4. **Independent polling** — each `OrgMigrationPanel` instance manages its own interval ref, so org A's migration doesn't block org B's panel.
5. **Toast notifications** — use `sonner` toast for trigger success/error, matching existing patterns.
