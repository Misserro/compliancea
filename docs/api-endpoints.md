# API Endpoints Reference

This document describes the REST API endpoints exposed by the Express backend.

## Base URL

```
http://localhost:3000
```

In production: Use the Railway-provided URL.

---

## Document Management

### List All Documents

**Endpoint:** `GET /api/documents`

**Description:** Retrieve all documents in the library.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Contract_2024.pdf",
    "category": "Finance",
    "status": "approved",
    "doc_type": "contract",
    "processed": true,
    "added_at": "2024-01-15T10:30:00Z",
    ...
  }
]
```

---

### Upload Document

**Endpoint:** `POST /api/documents/upload`

**Description:** Upload a new PDF or DOCX document.

**Request:** `multipart/form-data`
- `file` - File to upload
- `category` (optional) - Department category

**Response:**
```json
{
  "id": 123,
  "name": "NewDocument.pdf",
  "path": "/documents/NewDocument.pdf",
  "processed": false
}
```

---

### Process Document

**Endpoint:** `POST /api/documents/:id/process`

**Description:** Extract text, generate embeddings, auto-tag, and extract obligations (if contract).

**Response:**
```json
{
  "document": { ... },
  "chunks": [...],
  "tags": ["confidential", "financial"],
  "obligations": [...],
  "duplicates": []
}
```

---

### Scan Server for Documents

**Endpoint:** `POST /api/documents/scan`

**Description:** Scan local filesystem for new documents.

**Request Body:**
```json
{
  "folder": "/path/to/scan"
}
```

**Response:**
```json
{
  "newDocuments": 5,
  "documents": [...]
}
```

---

### Update Document Category

**Endpoint:** `PATCH /api/documents/:id/category`

**Request Body:**
```json
{
  "category": "Compliance"
}
```

**Response:**
```json
{
  "id": 123,
  "category": "Compliance"
}
```

---

### Update Document Metadata

**Endpoint:** `PATCH /api/documents/:id/metadata`

**Request Body:**
```json
{
  "client": "Acme Corp",
  "jurisdiction": "US-CA",
  "sensitivity": "confidential"
}
```

**Response:**
```json
{
  "id": 123,
  "client": "Acme Corp",
  ...
}
```

---

### Update Document Status

**Endpoint:** `PATCH /api/documents/:id/status`

**Description:** Update document status (draft → in_review → approved → archived → disposed).

**Request Body:**
```json
{
  "status": "approved"
}
```

---

### Delete Document

**Endpoint:** `DELETE /api/documents/:id`

**Description:** Delete document and all related data (chunks, obligations, tasks).

**Response:**
```json
{
  "success": true
}
```

---

### Download Document

**Endpoint:** `GET /api/documents/:id/download`

**Description:** Download or view original document file.

**Response:** Binary file stream (PDF/DOCX)

---

### Get Document Lineage

**Endpoint:** `GET /api/documents/:id/lineage`

**Description:** Get version history and duplicate relationships.

**Response:**
```json
{
  "versions": [...],
  "duplicates": [...]
}
```

---

## Analysis & Search

### Ask the Library

**Endpoint:** `POST /api/ask`

**Description:** Semantic search with AI-generated answer.

**Request Body:**
```json
{
  "question": "What are our payment obligations?",
  "documentIds": [1, 2, 3],
  "useTagFiltering": true,
  "relevanceThreshold": 0.7
}
```

**Response:**
```json
{
  "answer": "Based on the contracts...",
  "sources": [
    {
      "documentId": 1,
      "documentName": "Contract.pdf",
      "relevance": 0.89,
      "content": "..."
    }
  ],
  "tokenUsage": {
    "input": 1200,
    "output": 450
  }
}
```

---

### Analyze Document

**Endpoint:** `POST /api/analyze`

**Description:** Analyze external document (translation, summary, key points, todos).

**Request:** `multipart/form-data`
- `file` - Document to analyze
- `outputs` - JSON array of requested outputs
- `targetLanguage` - Target language for translation

**Response:**
```json
{
  "translation": "...",
  "summary": "...",
  "keyPoints": [...],
  "todos": {
    "Finance": [...],
    "Compliance": [...]
  }
}
```

---

### Cross-Reference Analysis

**Endpoint:** `POST /api/desk/analyze`

**Description:** Cross-reference regulator document with library.

**Request:** `multipart/form-data`
- `file` - Regulator document
- `targetLanguage` - Target language
- `useLibraryData` - Pre-fill with library data

**Response:**
```json
{
  "questions": [
    {
      "number": 1,
      "question": "...",
      "answer": "...",
      "sources": [...],
      "confidence": "high"
    }
  ]
}
```

---

### Process Questionnaire

**Endpoint:** `POST /api/desk/questionnaire`

**Description:** Extract questions and auto-generate answers.

**Request:** `multipart/form-data`
- `file` - Questionnaire (PDF/DOCX/Excel)
- `text` (alternative to file) - Pasted text

**Response:**
```json
{
  "questions": [
    {
      "number": 1,
      "question": "...",
      "answer": "...",
      "evidence": [...],
      "confidence": "high",
      "source": "auto-filled|drafted"
    }
  ]
}
```

---

### Approve Questionnaire Answers

**Endpoint:** `POST /api/desk/questionnaire/approve`

**Description:** Submit approved questionnaire answers and create Q&A cards.

**Request Body:**
```json
{
  "answers": [
    {
      "question": "...",
      "answer": "...",
      "evidence": [...]
    }
  ]
}
```

**Response:**
```json
{
  "savedCards": 5
}
```

---

## Contract Management

### Get Contract Summary

**Endpoint:** `GET /api/documents/:id/contract-summary`

**Description:** Get contract details with obligation summary.

**Response:**
```json
{
  "id": 1,
  "name": "Contract.pdf",
  "status": "active",
  "totalObligations": 15,
  "activeObligations": 8,
  "overdueObligations": 2,
  "nextDeadline": "2024-03-15"
}
```

---

### Contract Lifecycle Action

**Endpoint:** `POST /api/documents/:id/contract-action`

**Description:** Sign, activate, or terminate contract.

**Request Body:**
```json
{
  "action": "activate"
}
```

**Actions:**
- `sign` - unsigned → signed
- `activate` - signed → active
- `terminate` - active → terminated

**Response:**
```json
{
  "status": "active",
  "activatedObligations": 5,
  "createdTasks": 5
}
```

---

### Analyze Contract (Extract Obligations)

**Endpoint:** `POST /api/documents/:id/analyze-contract`

**Description:** Re-analyze contract to extract obligations.

**Response:**
```json
{
  "obligations": [...]
}
```

---

### Get Contract Obligations

**Endpoint:** `GET /api/documents/:id/obligations`

**Description:** List all obligations for a contract.

**Response:**
```json
[
  {
    "id": 1,
    "title": "Monthly Payment",
    "stage": "active",
    "status": "active",
    "due_date": "2024-03-01",
    "category": "payments",
    ...
  }
]
```

---

### Get All Obligations

**Endpoint:** `GET /api/obligations`

**Query Parameters:**
- `filter` - Filter type (upcoming, overdue, all)

**Response:**
```json
[
  {
    "id": 1,
    "document_id": 5,
    "document_name": "Contract.pdf",
    "title": "...",
    "due_date": "2024-03-15",
    ...
  }
]
```

---

### Update Obligation

**Endpoint:** `PATCH /api/obligations/:id`

**Request Body:**
```json
{
  "status": "met",
  "finalization_note": "Completed on time",
  "finalization_document_id": 123
}
```

---

### Add Obligation Evidence

**Endpoint:** `POST /api/obligations/:id/evidence`

**Request Body:**
```json
{
  "evidence": [
    {
      "document_id": 123,
      "description": "Proof of payment"
    }
  ]
}
```

---

### Check Obligation Compliance

**Endpoint:** `POST /api/obligations/:id/check-compliance`

**Description:** AI-powered compliance check for obligation.

**Response:**
```json
{
  "compliant": true,
  "analysis": "...",
  "recommendations": [...]
}
```

---

## Q&A Cards

### Get All Q&A Cards

**Endpoint:** `GET /api/qa-cards`

**Response:**
```json
[
  {
    "id": 1,
    "question_text": "...",
    "approved_answer": "...",
    "evidence_json": [...],
    "status": "active"
  }
]
```

---

### Update Q&A Card

**Endpoint:** `PATCH /api/qa-cards/:id`

**Request Body:**
```json
{
  "approved_answer": "Updated answer",
  "evidence_json": [...]
}
```

---

### Delete Q&A Card

**Endpoint:** `DELETE /api/qa-cards/:id`

---

## Tasks

### Get All Tasks

**Endpoint:** `GET /api/tasks`

**Query Parameters:**
- `status` - Filter by status (open, resolved, dismissed)

**Response:**
```json
[
  {
    "id": 1,
    "title": "Review document",
    "status": "open",
    "due_date": "2024-03-15",
    "owner": "John Doe",
    ...
  }
]
```

---

### Update Task Status

**Endpoint:** `PATCH /api/tasks/:id`

**Request Body:**
```json
{
  "status": "resolved"
}
```

---

## Legal Holds

### Get All Legal Holds

**Endpoint:** `GET /api/legal-holds`

**Response:**
```json
[
  {
    "id": 1,
    "matter_name": "Case XYZ",
    "status": "active",
    "created_at": "2024-01-01"
  }
]
```

---

### Create Legal Hold

**Endpoint:** `POST /api/legal-holds`

**Request Body:**
```json
{
  "matter_name": "Case ABC",
  "scope_json": {
    "doc_types": ["contract"],
    "clients": ["Acme Corp"]
  }
}
```

---

### Release Legal Hold

**Endpoint:** `POST /api/legal-holds/:id/release`

---

## Settings

### Get Settings

**Endpoint:** `GET /api/settings`

**Response:**
```json
{
  "use_haiku": false,
  "skip_translation_if_same_language": true,
  "relevance_threshold": 70,
  "min_results_guarantee": 3
}
```

---

### Update Settings

**Endpoint:** `PATCH /api/settings`

**Request Body:**
```json
{
  "relevance_threshold": 80
}
```

---

### Reset Settings to Defaults

**Endpoint:** `POST /api/settings/reset`

---

### Get Default Settings

**Endpoint:** `GET /api/settings/defaults`

---

## Google Drive Integration

### Scan Google Drive

**Endpoint:** `POST /api/gdrive/scan`

**Description:** Scan configured Google Drive folder for documents.

**Response:**
```json
{
  "newDocuments": 3,
  "updatedDocuments": 1,
  "deletedDocuments": 0
}
```

---

### Get GDrive Status

**Endpoint:** `GET /api/gdrive/status`

**Description:** Check Google Drive connection status.

**Response:**
```json
{
  "connected": true,
  "lastSync": "2024-01-15T10:30:00Z",
  "folderId": "..."
}
```

---

### Get GDrive Settings

**Endpoint:** `GET /api/gdrive/settings`

**Response:**
```json
{
  "folderId": "...",
  "syncInterval": 30,
  "credentialsConfigured": true
}
```

---

### Update GDrive Settings

**Endpoint:** `PATCH /api/gdrive/settings`

**Request Body:**
```json
{
  "folderId": "...",
  "credentials": { ... }
}
```

---

## Audit & Compliance

### Get Audit Log

**Endpoint:** `GET /api/audit`

**Query Parameters:**
- `entity_type` - Filter by entity type
- `entity_id` - Filter by entity ID
- `limit` - Limit number of results
- `offset` - Pagination offset

**Response:**
```json
[
  {
    "id": 1,
    "entity_type": "document",
    "entity_id": 5,
    "action": "processed",
    "details": {...},
    "created_at": "2024-01-15T10:30:00Z"
  }
]
```

---

## Policies

### Get All Policies

**Endpoint:** `GET /api/policies`

**Response:**
```json
[
  {
    "id": 1,
    "name": "Financial Document Retention",
    "action_type": "set_retention",
    "enabled": true
  }
]
```

---

### Create Policy

**Endpoint:** `POST /api/policies`

**Request Body:**
```json
{
  "name": "HR Document Retention",
  "condition_json": {
    "doc_type": "policy",
    "category": "HR"
  },
  "action_type": "set_retention",
  "action_params": {
    "years": 7
  }
}
```

---

### Update Policy

**Endpoint:** `PATCH /api/policies/:id`

---

### Delete Policy

**Endpoint:** `DELETE /api/policies/:id`

---

### Test Policy

**Endpoint:** `POST /api/policies/:id/test`

**Description:** Test policy against documents to see matches.

**Response:**
```json
{
  "matchingDocuments": [...]
}
```

---

## Maintenance

### Run Maintenance

**Endpoint:** `POST /api/maintenance/run`

**Description:** Run database cleanup and maintenance tasks.

**Response:**
```json
{
  "orphanedChunksDeleted": 5,
  "expiredRetentionsProcessed": 2
}
```

---

### Get Maintenance Status

**Endpoint:** `GET /api/maintenance/status`

**Response:**
```json
{
  "lastRun": "2024-01-15T10:30:00Z",
  "status": "idle"
}
```

---

## System

### Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

### Check Embeddings Status

**Endpoint:** `GET /api/embeddings/status`

**Description:** Check if Voyage AI is available.

**Response:**
```json
{
  "available": true,
  "model": "voyage-3-lite"
}
```

---

## Error Responses

All endpoints return standard error responses:

**400 Bad Request:**
```json
{
  "error": "Invalid input",
  "details": "..."
}
```

**404 Not Found:**
```json
{
  "error": "Document not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error",
  "message": "..."
}
```

---

## Request/Response Patterns

**Authentication:**
- No authentication in current implementation
- Add Bearer token authentication if needed

**Content-Type:**
- JSON requests: `Content-Type: application/json`
- File uploads: `Content-Type: multipart/form-data`

**CORS:**
- Allowed origins configured via `ALLOWED_ORIGIN` env var (default: *)

**Rate Limiting:**
- No rate limiting in current implementation
- Add rate limiting middleware if needed
