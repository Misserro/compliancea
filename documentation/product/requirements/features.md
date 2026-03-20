# Features Documentation

This document describes the key features and capabilities of ComplianceA.

## Document Management

### Document Library
- **Upload documents** - PDF and DOCX file support
- **Category assignment** - Organize by department (Finance, Compliance, Operations, HR, Board, IT)
- **Status tracking** - Draft, In Review, Approved, Archived, Disposed
- **Search and filter** - Real-time search by name, filter by status and category
- **Batch operations** - Process all unprocessed, retag all documents
- **Metadata editing** - Update document properties after upload

### Document Processing
- **Text extraction** - Extract text from PDF and DOCX files
- **Auto-tagging** - AI-powered metadata extraction (doc_type, jurisdiction, client, sensitivity)
- **Duplicate detection** - Content hash and file hash matching
- **Semantic analysis** - Near-duplicate detection via embedding similarity
- **Policy evaluation** - Automatic retention and approval requirement assignment

### Document Types
- Contracts (with obligation extraction)
- Policies
- Procedures
- Reports
- Correspondence
- Presentations
- Generic documents

## Analysis & Search

### Document Analyzer
Upload a document and generate:
- **Full Translation** - Translate to 5 languages (English, Polish, German, French, Spanish)
- **Summary** - Concise document summary
- **Key Points** - Extract main points with department tags
- **Department To-Dos** - Generate action items organized by department
- **Export options** - DOCX (translation), CSV (todos)

### Ask the Library
- **Semantic search** - Natural language questions across document library
- **Document selection** - Search entire library or specific documents
- **Source attribution** - Results show document name, relevance score, category
- **Confidence scoring** - Color-coded confidence levels (high/medium/low)
- **Context-aware answers** - AI generates answers citing specific documents

### Cross-Reference Analysis
Two modes for handling external documents:

**Regulator Query Mode:**
- Upload regulator documents
- Cross-reference with library documents
- Generate response templates
- Pre-fill answers with library data
- Output table with questions, answers, sources, confidence

**Questionnaire Mode:**
- Accept PDF, DOCX, or Excel questionnaires
- Paste text or upload file
- Auto-generate answers from library
- Review interface with:
  - Editable answer fields
  - Evidence documents with relevance scores
  - Confidence indicators
  - Bulk approval (all or high-confidence only)
- Export as CSV

## Contract Management

### Contract Processing
- **Automatic detection** - Identifies contract documents during processing
- **Full text storage** - Stores complete contract text (no chunking)
- **Metadata extraction** - Contracting parties, dates (signature, commencement, expiry)
- **Obligation extraction** - AI extracts contractual obligations with details

### Obligation Tracking
- **Lifecycle stages** - not_signed -> signed -> active -> terminated
- **Categories** - Payments, Termination, Legal, Others
- **Due dates** - Track deadlines with recurrence support
- **Ownership** - Assign owners and escalation contacts
- **Evidence management** - Attach proof documents and notes
- **Status tracking** - Active, Inactive, Met, Waived, Finalized

### Contract Lifecycle
- **State transitions** - Sign -> Activate -> Terminate contracts
- **Automatic task creation** - Create tasks for active obligations
- **Obligation activation** - Stage-based obligation activation
- **Upcoming obligations** - Dashboard showing next 30 days
- **Overdue tracking** - Identify missed deadlines

### Invoice Management
- **Invoice records** - Track invoices per contract: amount (numeric), currency (EUR/USD/PLN/etc.), date of issue, date of payment, paid status
- **File attachments** - Upload invoice PDF and separate payment confirmation file (bank transfer receipt, etc.) per invoice
- **Overdue detection** - Visual warning when payment due date has passed and invoice is not marked paid
- **Financial summary** - Total invoiced and total paid per contract (numeric aggregation)
- **Edit and delete** - Full CRUD lifecycle per invoice record

### Contract Documents
- **Multiple documents per contract** - Attach amendments, addenda, exhibits, and other supporting documents to a contract
- **Upload new** - Upload a new file (PDF/DOCX) directly as a contract attachment (stored separately from the main Documents library)
- **Link existing** - Link any document already in the Documents library to a contract
- **Document types** - Classify attachments as: amendment, addendum, exhibit, other
- **Download** - Download any attached document file directly from the contract view

## Compliance & Audit

### Audit Trail
- **Complete history** - Every action logged with timestamp
- **Entity tracking** - Track changes to documents, tasks, obligations
- **Searchable logs** - Filter by entity type, action, date range
- **Compliance reporting** - Generate audit reports

### Legal Holds
- **Hold creation** - Place documents under legal hold
- **Scope definition** - Define which documents are affected
- **Release management** - Track hold status and release dates
- **Retention override** - Prevent disposal during hold

### Policy Rules
- **Automated classification** - Rules match document metadata
- **Actions supported:**
  - Set retention period
  - Require approval
  - Add tags
  - Flag for review
- **Condition matching** - Match by doc_type, jurisdiction, tags, client

## Integration Features

### Google Drive Sync
- **Service account auth** - Authenticate with service account credentials
- **Folder monitoring** - Monitor specific Drive folder
- **Periodic sync** - Configurable sync interval (default: 30 minutes)
- **Change detection** - Track modified and deleted documents
- **Task creation** - Create review tasks for changes
- **Format support** - PDF, DOCX, Google Docs (exported as PDF)

### Q&A Cards
- **Reusable answers** - Save approved answers for frequent questions
- **Semantic matching** - Match questions to existing Q&A cards
- **Evidence tracking** - Link supporting documents to answers
- **Version control** - Track answer updates over time

## Legal Hub — Template Authoring (Plan 032)

### Professional Template Editor
- **Rich text toolbar** — Bold, italic, underline, heading levels (H1/H2/H3), ordered and unordered lists
- **Text alignment** — Left, center, right, and justified alignment for formal document layout
- **Font family selection** — Choose from legal-standard typefaces (Times New Roman, Arial, Calibri, etc.)
- **Font size control** — Per-character font size (range: 8pt–24pt); default 12pt per Polish court standards
- **Table support** — Insert and edit tables for structured claim breakdowns, cost schedules, and party data
- **Shared editor component** — Same rich editor used in both template authoring and generated document editing

### Professional DOCX Export
- **Fidelity export** — All formatting preserved in the exported .docx: bold, italic, underline, headings, lists, tables, alignment, fonts
- **A4 page layout** — Exported documents use A4 page size with Polish court standard margins (top/bottom 2.5 cm, left 3.5 cm, right 2.5 cm)
- **Page number footer** — Automatic page numbering in the footer of every exported document
- **Polish character support** — ą, ę, ź, ż, ó, ś, ć, ń correctly rendered in DOCX output

### System Templates (Law-Firm Grade)
- **Wezwanie do zapłaty** — Pre-formatted payment demand letter with court header, party blocks, formal salutation, claim section, payment deadline clause, and signature block
- **Pozew** — Pre-formatted civil complaint with full court heading, article citations, claim enumeration, evidence list, and signature block
- **Replika** — Pre-formatted reply brief with formal reference to defendant's response, counter-arguments section, and signature block
- System templates cannot be deleted; serve as professional starting-point templates for all new organizations

## Organization Management (Plan 027+)

### User Permission System (Plan 031)
- **Feature-level access control** — Org admins can configure per-user access levels for each feature area: Documents, Contracts, Legal Hub (Cases), Policies, and QA Cards
- **Action levels** — Four levels per feature: `none` (no access, section hidden), `view` (read-only), `edit` (create + modify), `full` (create + modify + delete)
- **Owner/admin bypass** — Org owners and admins always have full access to all features; permission checks only apply to `member` role users
- **Org default template** — Org admin sets a default permission template applied to new members; default is `full` for all features
- **Per-user overrides** — Org admin can override permissions for any individual member independently of the default template
- **Immediate enforcement** — Permission changes take effect on the next request (DB re-hydrated on every JWT callback, no re-login required)
- **UI feature hiding** — Sidebar navigation and page action buttons (upload, create, delete) are conditionally hidden based on the user's effective permission level

### Global Admin (Plan 030)
- **Super admin role** — A system-level `is_super_admin` flag on the users table, separate from per-org roles. Super admins operate across all organizations.
- **Admin panel** — Dedicated `/admin` section (outside the normal app layout) listing all organizations with status, member count, and management actions.
- **Org creation** — Super admin can create new organizations (name + slug) and optionally invite the first org owner via the existing invite link system.
- **Org soft-delete** — Super admin can mark an org for deletion; org becomes immediately inaccessible to all members. Data retained for 30 days, then permanently deleted.
- **Org restore** — Within the 30-day window, super admin can restore a soft-deleted org.
- **Super admin seeding** — First super admin is bootstrapped via `SUPER_ADMIN_EMAIL` env var during `initDb()`. Subsequent super admins must be promoted via the admin panel.
- **No data access** — Super admin can manage org lifecycle but cannot read org documents, cases, or contracts (management only; no org membership assumed).

### Storage Configuration (Plan 029)
- **Per-org S3 storage** — Each org can configure an S3-compatible bucket (AWS S3, Cloudflare R2, MinIO) as their file storage backend
- **Coexist approach** — Existing files stay on the local Railway `/data` volume; new uploads go to S3 when configured; download path checks `storage_backend` column to route correctly
- **Org-namespaced local paths** — Files stored under `DOCUMENTS_DIR/org-{id}/` prefix for multi-tenant isolation (even on local backend)
- **Encrypted credentials** — S3 access keys encrypted with AES-256-GCM using `STORAGE_ENCRYPTION_KEY` env var before storage in DB
- **Test before save** — Admin can test S3 connection (bucket access) before committing credentials
- **R2/MinIO support** — Custom endpoint URL field allows any S3-compatible provider

### Multi-Tenancy
- **Org isolation** - All data is scoped to the user's active organization; no cross-org data access
- **Default org** - A "Default Organization" is auto-created on first run; all existing data is backfilled
- **Session context** - JWT carries `orgId`, `orgRole`, and `orgName`; enforced on every request

### Org Settings
- **Name editing** - Owners and admins can rename the organization
- **Org details** - View org name, slug, creation date, and member count at `/settings/org`
- **Sidebar identity** - Active org name displayed in sidebar header

### Member Management
- **Members list** - View all org members with roles and join dates at `/org/members`
- **Role management** - Owners can set any role; admins can toggle `member` ↔ `admin`
- **Remove members** - Owners and admins can remove members; cannot remove self
- **No-org guard** - Users without org membership are redirected to `/no-org`

### Member Invite Flow (Plan 028)
- **Copy-link invites** - Owners and admins generate shareable invite links (no email required)
- **Role assignment** - Invite specifies the role the recipient will receive (`member` or `admin`)
- **7-day expiry** - Invite links expire after 7 days; re-invite generates a new token
- **Pending invite management** - List, revoke, and re-invite from the members page
- **Existing user acceptance** - Clicking an invite link while logged in auto-enrolls the user
- **New user acceptance** - Clicking an invite link while logged out prompts registration then auto-enrolls
- **Single-use tokens** - Each invite token is consumed on acceptance and cannot be reused

### Org Switcher (Plan 028)
- **Multi-org membership** - A user may belong to multiple orgs (e.g. accepted multiple invites)
- **Sidebar switcher** - Dropdown in sidebar header to switch active org; only shown when user has 2+ orgs
- **Session switch** - Switching org updates JWT context (`orgId`, `orgRole`, `orgName`) without re-login

## User Workflows

### Workflow 1: Document Ingestion
1. Upload document via Documents page
2. Assign category (optional)
3. Process document (extract metadata, generate embeddings)
4. Review extracted metadata and tags
5. Search, filter, or analyze document

### Workflow 2: Regulatory Response
1. Receive regulator questionnaire
2. Upload to Analyze & Ask > Cross-Reference section
3. Review auto-generated answers
4. Edit answers and add evidence
5. Approve answers (all or high-confidence only)
6. Export as CSV for submission

### Workflow 3: Contract Obligation Management
1. Upload contract document
2. Process document (automatic obligation extraction)
3. Review extracted obligations
4. Sign contract (activates signing-stage obligations)
5. Activate contract (activates active-stage obligations)
6. Monitor upcoming obligations on Contracts page
7. Mark obligations as met with evidence
8. Terminate contract when needed

### Workflow 4: Semantic Search
1. Navigate to Analyze & Ask > Ask the Library
2. Select search scope (all documents or specific ones)
3. Enter natural language question
4. Review AI-generated answer with sources
5. Check source relevance and confidence scores

## Configuration & Settings

### AI Optimization
- **Use Haiku** - Faster/cheaper model for extraction (claude-3-haiku)
- **Skip translation** - Don't translate if already in target language
- **Relevance threshold** - Minimum similarity score for search results (0-100)
- **Minimum results** - Guarantee minimum number of results regardless of threshold

### Maintenance Operations
- **Database cleanup** - Remove orphaned records
- **Tag processing** - Reprocess document tags
- **Retention management** - Apply retention policies
- **Statistics** - View system usage and database size
