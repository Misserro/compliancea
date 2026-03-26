# Task 5 Implementation Plan -- Strings: Contracts + Obligations + Dashboard

## Summary

Extract all hardcoded English strings from `src/components/contracts/` (13 files) and `src/app/(app)/dashboard/page.tsx` into the `Contracts` and `Dashboard` namespaces in `messages/en.json` and `messages/pl.json`. Replace each string with a `t('key')` or `useTranslations` call. Also replace `CONTRACT_STATUS_DISPLAY` usage with translation calls, matching the pattern used by Task 3 in Legal Hub.

## Files to Modify

### Message files
- `messages/en.json` -- expand `Contracts` namespace (currently 5 stub keys) to ~150+ keys; add new `Dashboard` namespace (~15 keys)
- `messages/pl.json` -- same keys with Polish translations

### Contract components (all "use client")
All 13 files in `src/components/contracts/`:

1. **contracts-tab.tsx** -- `useTranslations('Contracts')`: "All Contracts", "Close Chat"/"Ask AI", "Add New Contract", "Search by name or vendor...", status filter labels (via `CONTRACT_STATUS_DISPLAY` -> `t('contractStatus.X')`). Remove `CONTRACT_STATUS_DISPLAY` import.
2. **contract-list.tsx** -- empty/error state strings: "No contracts found.", "Use Add New Contract...", "No contracts match your search.", error toasts
3. **contract-card.tsx** -- `CONTRACT_STATUS_DISPLAY` usage (2 places), "Contract Status", "Actions", "No vendor specified", "Expires {date}", "Document", status action labels (STATUS_ACTIONS), confirm dialog text, toast messages. Remove `CONTRACT_STATUS_DISPLAY` import. Use `useLocale()` for `formatDate`.
4. **contract-metadata-display.tsx** -- "Edit Contract Info", "Contract Info", "Our Company", "Vendor", "Signature Date", "Commencement Date", "Expiry Date", "Indefinite", "Contract Name", placeholders
5. **add-contract-dialog.tsx** -- "Add New Contract", "Contract Document", "PDF or DOCX, max 10 MB", "Category", "Select category...", "Cancel", "Add manually", "Add with AI", "Processing contract...", "This may take a moment.", "Uploading contract...", "Contract added -- N obligations extracted", "Closing...", "Retry Processing"
6. **obligations-tab.tsx** -- "Obligations by Contract", "All" filter label, category labels, error toast
7. **upcoming-obligations-section.tsx** -- "Upcoming Obligations (Next 30 Days)", "All" filter, "Today"/"Tomorrow"/"In X days", empty state messages, error message
8. **per-contract-obligations.tsx** -- Status tab labels ("Active"/"Inactive"/"Finalized"/"All"), empty state messages, "No contracts found.", "Failed to load obligations.". Remove `CONTRACT_STATUS_DISPLAY` import.
9. **invoice-section.tsx** -- "Invoices", "Add Invoice", "Total invoiced:", "Total paid:", "N overdue", "No invoices yet.", "Paid"/"Overdue"/"Pending" status labels, "Issued:", "Due:", "Unpay"/"Pay", "Loading invoices...", "Invoice deleted", "Invoice marked as paid/unpaid", dialog text "Delete invoice?"/"This action cannot be undone."
10. **contract-documents-section.tsx** -- "Documents", "Add Document", "No documents attached.", "Linked from library"/"Uploaded", "Loading documents...", "Document removed", dialog text "Remove document?"/"This will remove..."
11. **contract-chat-panel.tsx** -- "Contract Assistant", example prompts (4), "Ask anything about your contracts", "Ask about your contracts...", "Expires", "overdue", "active obligations", "Next:", "Due". Use `useLocale()` for `formatDate`.
12. **add-contract-document-dialog.tsx** -- "Add Contract Document", "Upload new", "Link existing", "File *", "PDF or DOCX. Max 10MB.", "Search library documents", "Search by name...", "Loading documents...", "No matching documents."/"No documents in library.", "Document Type", "Label (optional)", "Cancel", "Saving..."/"Upload"/"Link Document", toast messages
13. **add-invoice-dialog.tsx** -- "Edit Invoice"/"Add Invoice", "Amount *", "Currency", "Description", "Optional description", "Date of Issue", "Date of Payment", "Invoice File", "Payment Confirmation", file hints, "Cancel", "Saving..."/"Update"/"Add Invoice", toast messages

### Dashboard page
- `src/app/(app)/dashboard/page.tsx` -- "Dashboard", "Overview of your compliance workspace.", KPI labels ("Documents", "Overdue", "Contracts"), sub-labels ("N processed", "N active obligations", "N expiring soon"), "Upcoming Obligations", "Next 30 days", "No upcoming deadlines.", "Contracts Expiring Soon", "Next 60 days", "No contracts expiring soon.", "Nd" day format

## Namespace Structure

### Contracts namespace (expanded)
```
Contracts.title
Contracts.allContracts
Contracts.addNewContract
Contracts.searchPlaceholder
Contracts.askAI / closeChat
Contracts.noContracts / noContractsHint / noMatchingContracts
Contracts.loadError
Contracts.contractStatus.unsigned / signed / active / terminated
Contracts.contractStatusLabel
Contracts.actionsLabel
Contracts.noVendor
Contracts.expires
Contracts.document
Contracts.statusAction.* (toSign, inactive, activate, terminate, reactivate)
Contracts.confirmTerminate
Contracts.confirmAction
Contracts.actionSuccess / actionFailed
Contracts.infoUpdated / updateFailed / saveFailed
Contracts.metadata.* (editInfo, contractInfo, contractName, ourCompany, vendor, signatureDate, commencementDate, expiryDate, indefinite, placeholders)
Contracts.addDialog.* (title, contractDocument, fileHint, category, categoryOptional, selectCategory, cancel, addManually, addWithAI, processing, processingHint, uploading, uploadingHint, done, doneObligations, closing, errorRetry)
Contracts.obligations.* (byContract, allFilter, upcoming, upcomingTitle, noUpcoming, noUpcomingCategory, loadError, today, tomorrow, inDays)
Contracts.obligationStatus.* (active, inactive, finalized, all)
Contracts.noObligationsCategory / noObligationsStatus
Contracts.noContractsFound
Contracts.failedToLoadObligations
Contracts.activeCount / overdueCount / finalizedCount
Contracts.invoices.* (title, add, totalInvoiced, totalPaid, overdueCount, noInvoices, paid, overdue, pending, issued, due, pay, unpay, loading, deleted, markedPaid, markedUnpaid, updateFailed, deleteFailed, deleteConfirmTitle, deleteConfirmDesc)
Contracts.documents.* (title, add, noDocuments, linkedFromLibrary, uploaded, loading, removed, removeFailed, deleteConfirmTitle, deleteConfirmDesc)
Contracts.addDocumentDialog.* (title, uploadNew, linkExisting, file, fileHint, searchLibrary, searchPlaceholder, loadingDocs, noMatchingDocs, noLibraryDocs, documentType, labelOptional, labelPlaceholder, cancel, saving, upload, linkDocument, uploaded, linked, selectFile, selectDocument)
Contracts.addInvoiceDialog.* (editTitle, addTitle, amount, currency, description, descriptionPlaceholder, dateOfIssue, dateOfPayment, invoiceFile, paymentConfirmation, fileHint, cancel, saving, update, addInvoice, validAmountError, updated, added, saveFailed)
Contracts.chat.* (title, askAnything, inputPlaceholder, examplePrompts, expires, overdueLabel, activeObligations, next, due)
```

### Dashboard namespace (new)
```
Dashboard.title
Dashboard.subtitle
Dashboard.documents / overdue / contracts (KPI labels)
Dashboard.processedSub / activeObligationsSub / expiringSoonSub
Dashboard.upcomingObligations / next30Days
Dashboard.noUpcomingDeadlines
Dashboard.contractsExpiringSoon / next60Days
Dashboard.noContractsExpiring
Dashboard.daysShort
```

## Approach

1. All components are client components -> use `useTranslations('Contracts')` hook
2. Dashboard is also a client component -> use `useTranslations('Dashboard')`
3. For `CONTRACT_STATUS_DISPLAY` usage: add `Contracts.contractStatus.*` keys and translate at call sites. Do NOT remove `CONTRACT_STATUS_DISPLAY` from constants.ts (it may be used by other tasks; we just stop importing it in our files).
4. For `formatDate` calls using `"en-US"`: add `useLocale()` and pass locale instead of hardcoded locale string
5. For category filter labels (obligation categories): add `Contracts.obligationCategory.*` keys
6. For `CONTRACT_DOCUMENT_TYPES` labels: add `Contracts.documentType.*` keys and translate at usage sites
7. For `DEPARTMENTS` in add-contract-dialog: these are category values from the backend, not display labels -- leave as-is (they are not user-facing display strings that need translation in the scope of this task, they map to DB values)

## Success Criteria Mapping
- Contracts list and obligation list pages fully switch language -> All 13 contract components translated
- Dashboard page switches language -> dashboard/page.tsx translated
- TypeScript compiles clean -> no broken imports, all t() calls reference valid keys

## Risks
- `CONTRACT_STATUS_DISPLAY` is also used by other components outside `src/components/contracts/` -- I will only stop importing it in files within my scope, not remove it from constants.ts
- `DEPARTMENTS` in add-contract-dialog are used as form option values sent to the backend -- translating them would break data integrity. I will NOT translate these.
- `CONTRACT_DOCUMENT_TYPES` labels are display strings -- I will translate these via t() calls
