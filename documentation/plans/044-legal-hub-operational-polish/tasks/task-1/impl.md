## Task 1 Complete -- Case Activity Log Tab

- Created: `src/components/legal-hub/case-activity-tab.tsx` (new file)
  - Fetches `GET /api/legal-hub/cases/${caseId}/activity` using useState + useEffect pattern (consistent with CaseDocumentsTab)
  - Sorts entries by `created_at` descending (newest first) client-side
  - Maps 9 known action types to i18n labels via `LegalHub.activity.action.*` keys
  - Unknown actions fall back to raw action string
  - Parses `details` JSON for meaningful summaries (status_changed shows old->new, document actions show name, etc.)
  - Loading skeleton: 5 rows of `<Skeleton className="h-12 w-full" />`
  - Error state: centered `text-destructive` message using `activity.loadError` key
  - Empty state: centered `text-muted-foreground` message using `activity.noActivity` key
  - Each entry: bordered row with action label, optional detail summary, and formatted timestamp

- Modified: `src/components/legal-hub/case-detail-page.tsx`
  - Added `"activity"` to `TabKey` union type (line 19)
  - Imported `History` icon from lucide-react (line 4)
  - Imported `CaseActivityTab` component (line 12)
  - Added 5th tab entry to TABS array with key "activity", labelKey "tab.activity", History icon (line 29)
  - Added conditional render block `{activeTab === "activity" && <CaseActivityTab caseId={caseId} />}` (lines 139-141)

- Modified: `messages/en.json`
  - Added `tab.activity: "Activity"` to `LegalHub.tab` object
  - Added `LegalHub.activity` namespace with `noActivity`, `loadError`, and 9 action labels under `action.*`

- Modified: `messages/pl.json`
  - Added `tab.activity: "Historia"` to `LegalHub.tab` object
  - Added `LegalHub.activity` namespace with Polish translations for all keys

- Exports: `CaseActivityTab` component from `src/components/legal-hub/case-activity-tab.tsx`
- `npx tsc --noEmit` passes cleanly
