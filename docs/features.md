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
- **Lifecycle stages** - not_signed → signed → active → terminated
- **Categories** - Payments, Termination, Legal, Others
- **Due dates** - Track deadlines with recurrence support
- **Ownership** - Assign owners and escalation contacts
- **Evidence management** - Attach proof documents and notes
- **Status tracking** - Active, Inactive, Met, Waived, Finalized

### Contract Lifecycle
- **State transitions** - Sign → Activate → Terminate contracts
- **Automatic task creation** - Create tasks for active obligations
- **Obligation activation** - Stage-based obligation activation
- **Upcoming obligations** - Dashboard showing next 30 days
- **Overdue tracking** - Identify missed deadlines

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
