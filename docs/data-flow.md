# Data Flow Documentation

This document describes how data moves through the ComplianceA system for key operations.

## Document Processing Flow

### Standard Document Processing

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database
    participant FileSystem
    participant Claude
    participant Voyage

    User->>Frontend: Upload document (PDF/DOCX)
    Frontend->>Backend: POST /api/documents/upload
    Backend->>FileSystem: Save file to disk
    Backend->>Database: Create document record
    Backend-->>Frontend: Return document ID

    User->>Frontend: Click "Process"
    Frontend->>Backend: POST /api/documents/:id/process
    Backend->>FileSystem: Read file
    Backend->>Backend: Extract text (pdf-parse/mammoth)
    Backend->>Backend: Compute content + file hash
    Backend->>Database: Check for duplicates

    Backend->>Claude: Extract metadata (doc_type, tags, etc)
    Claude-->>Backend: Return metadata
    Backend->>Database: Update document metadata

    Backend->>Backend: Chunk text (~500 words)
    Backend->>Voyage: Generate embeddings for chunks
    Voyage-->>Backend: Return embedding vectors
    Backend->>Database: Store chunks + embeddings

    Backend->>Backend: Evaluate policy rules
    Backend->>Database: Apply retention/tags

    Backend->>Database: Check semantic duplicates
    Backend->>Database: Log to audit_log
    Backend-->>Frontend: Return processed document
    Frontend-->>User: Show success + metadata
```

**Key Steps:**
1. **Upload** - File saved to disk, metadata record created
2. **Extract** - Text extraction via pdf-parse (PDF) or mammoth (DOCX)
3. **Hash** - Compute content hash (text) and file hash (binary)
4. **Duplicate Detection** - Check for exact matches
5. **Auto-tag** - Claude extracts doc_type, jurisdiction, client, sensitivity
6. **Chunk** - Split text into ~500-word chunks with 50-word overlap
7. **Embed** - Generate 1024-dim vectors via Voyage AI
8. **Store** - Save chunks and embeddings to database
9. **Policy** - Evaluate and apply retention/classification rules
10. **Semantic Duplicates** - Compare embeddings (threshold: 0.92)
11. **Audit** - Log action to audit_log

### Contract Processing Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database
    participant Claude

    User->>Frontend: Upload contract
    Frontend->>Backend: POST /api/documents/upload
    Backend->>Database: Create document record

    User->>Frontend: Click "Process"
    Frontend->>Backend: POST /api/documents/:id/process
    Backend->>Backend: Extract text
    Backend->>Backend: Compute hashes

    Backend->>Claude: Extract metadata
    Claude-->>Backend: doc_type="contract" + metadata
    Backend->>Database: Store full_text (no chunking)
    Backend->>Database: Set status="unsigned"

    Backend->>Claude: Extract obligations
    Note over Claude: Analyze contract for:<br/>- Parties<br/>- Dates<br/>- Obligations by stage<br/>- Categories<br/>- Due dates
    Claude-->>Backend: Return structured obligations

    Backend->>Database: Create contract_obligations records
    Backend->>Database: Create tasks for not_signed stage
    Backend-->>Frontend: Return contract + obligations
    Frontend-->>User: Show contract with obligations
```

**Key Differences from Standard:**
- **No chunking** - Full text stored in `full_text` column
- **No embeddings** - Contracts aren't searchable semantically (use full-text search instead)
- **Obligation extraction** - Claude extracts structured obligation data
- **Lifecycle** - Status starts as "unsigned"
- **Auto-tasks** - Tasks created for not_signed stage obligations

## Semantic Search Flow

### Ask the Library

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database
    participant Claude
    participant Voyage

    User->>Frontend: Enter question
    Frontend->>Backend: POST /api/ask (question + selected doc IDs)

    alt Tag-based Pre-filtering Enabled
        Backend->>Claude: Extract tags from query
        Claude-->>Backend: Return relevant tags
        Backend->>Database: Score documents by tag overlap
        Backend->>Backend: Filter to top candidates
    end

    Backend->>Voyage: Generate query embedding
    Voyage-->>Backend: Return query vector

    Backend->>Database: Fetch chunks from selected documents
    Backend->>Backend: Compute cosine similarity
    Backend->>Backend: Filter by relevance threshold
    Backend->>Backend: Sort by similarity score

    Backend->>Backend: Format search results
    Note over Backend: Group by document:<br/>Document Name<br/>- Chunk 1<br/>- Chunk 2

    Backend->>Claude: Generate answer with context
    Note over Claude: System prompt:<br/>- Answer question<br/>- Cite sources<br/>- Use document names
    Claude-->>Backend: Return natural answer

    Backend-->>Frontend: Return answer + sources
    Frontend-->>User: Show answer with citations
```

**Key Features:**
- **Two-stage filtering** - Tag-based pre-filter + semantic search
- **Cosine similarity** - Compare query vector with chunk vectors
- **Relevance threshold** - Configurable minimum similarity (default: 0.7)
- **Source attribution** - Results include document name + relevance %

## Questionnaire Processing Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database
    participant Claude
    participant Voyage

    User->>Frontend: Upload questionnaire (PDF/DOCX/Excel)
    Frontend->>Backend: POST /api/desk/questionnaire

    Backend->>Backend: Parse file (extract questions)
    Backend->>Voyage: Generate embeddings for questions
    Voyage-->>Backend: Return question vectors

    loop For each question
        Backend->>Database: Check for existing Q&A card
        alt Q&A Card Found
            Backend->>Backend: Use saved answer
        else No Q&A Card
            Backend->>Database: Semantic search library
            Backend->>Backend: Rank documents by relevance
            Backend->>Claude: Generate answer with context
            Claude-->>Backend: Return drafted answer
        end
    end

    Backend-->>Frontend: Return questions + answers + evidence
    Frontend-->>User: Show review interface

    User->>Frontend: Edit answers, approve selections
    Frontend->>Backend: POST /api/desk/questionnaire/approve
    Backend->>Database: Create Q&A cards for approved answers
    Backend->>Database: Log to audit
    Backend-->>Frontend: Return confirmation
    Frontend-->>User: Show success + export option
```

**Key Steps:**
1. **Parse** - Extract questions from file
2. **Embed** - Generate vectors for all questions
3. **Match** - Check for existing Q&A cards (semantic match)
4. **Search** - For new questions, search library documents
5. **Generate** - Claude drafts answers with evidence
6. **Review** - User edits and approves answers
7. **Save** - Create Q&A cards for reuse
8. **Export** - CSV with questions, answers, sources

## Contract Lifecycle Flow

```mermaid
stateDiagram-v2
    [*] --> unsigned: Upload contract
    unsigned --> signed: Sign action
    signed --> active: Activate action
    active --> terminated: Terminate action
    terminated --> [*]

    note right of unsigned
        Obligations: not_signed stage
        Tasks: Created automatically
    end note

    note right of signed
        Obligations: signed stage activated
        Tasks: Created for signed stage
    end note

    note right of active
        Obligations: active stage activated
        Tasks: Monitor due dates
    end note

    note right of terminated
        Obligations: terminated stage activated
        Tasks: Exit procedures
    end note
```

**State Transitions:**

**Sign Contract (unsigned → signed):**
1. Update document status to "signed"
2. Activate obligations in "signed" stage
3. Deactivate obligations in "not_signed" stage
4. Create tasks for signed-stage obligations

**Activate Contract (signed → active):**
1. Update document status to "active"
2. Activate obligations in "active" stage
3. Deactivate obligations in "signed" stage
4. Create tasks for active-stage obligations

**Terminate Contract (active → terminated):**
1. Update document status to "terminated"
2. Activate obligations in "terminated" stage
3. Deactivate obligations in "active" stage
4. Create tasks for termination obligations

## Google Drive Sync Flow

```mermaid
sequenceDiagram
    participant Cron
    participant Backend
    participant GDrive
    participant Database
    participant FileSystem

    Cron->>Backend: Trigger sync (every 30 min)
    Backend->>GDrive: List files in folder
    GDrive-->>Backend: Return file metadata

    loop For each file
        Backend->>Database: Check if exists
        alt New File
            Backend->>GDrive: Download file
            GDrive-->>Backend: Return file content
            Backend->>FileSystem: Save to gdrive/ folder
            Backend->>Database: Create document record
            Backend->>Database: Create review task
        else Modified File
            Backend->>GDrive: Download updated file
            Backend->>FileSystem: Overwrite cached file
            Backend->>Database: Update modified_time
            Backend->>Database: Create review task
        else Deleted File (not in GDrive)
            Backend->>Database: Update sync_status="deleted"
            Backend->>Database: Create review task
        end
    end

    Backend-->>Cron: Sync complete
```

**Key Features:**
- **Periodic polling** - Runs every N minutes (configurable)
- **Change detection** - Compare modified times
- **Local cache** - Files stored in gdrive/ folder
- **Task creation** - Review tasks for changes
- **Deletion tracking** - Mark as deleted, don't auto-remove

## Data Export Flows

### Translation Export (DOCX)

```
User uploads document → Process → Claude translates → Format as DOCX → Download
```

### Todo Export (CSV)

```
User uploads document → Process → Claude extracts todos by department → Format as CSV → Download
```

### Questionnaire Export (CSV)

```
User uploads questionnaire → Process → Generate answers → User approves → Format as CSV → Download
Columns: Question Number, Question, Answer, Confidence, Sources
```

## Error Handling Patterns

**File Processing Errors:**
- PDF parsing failure → Return error, log to audit
- DOCX parsing failure → Return error, log to audit
- File not found → Return 404

**API Errors:**
- Claude API error → Retry with exponential backoff, log error
- Voyage API error → Retry, log error
- Rate limiting → Queue request, retry later

**Database Errors:**
- Write failure → Rollback transaction, return error
- Duplicate key → Return conflict error

**All errors logged to audit_log for compliance tracking.**
