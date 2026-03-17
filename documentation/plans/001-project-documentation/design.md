# Project Documentation Design

## Overview

Create comprehensive developer-focused documentation for the ComplianceA document analyzer application. This documentation will serve as a reference for current and future maintainers to understand the system architecture, features, and technical implementation.

## Requirements

- Documentation must NOT be in the application or shown to end users
- High-level overview focusing on: architecture, main features, tech stack, component connections
- Multiple focused markdown documents organized by topic
- Analyze existing codebase to document current implementation
- Include visual diagrams for clarity

## Document Structure

The documentation will be created in a `/docs` directory at the project root with the following files:

### `overview.md`
- Project name and purpose (compliance document analyzer)
- Quick feature summary
- Links to other documentation files
- Getting started pointer

### `architecture.md`
- System layers diagram (Client → Next.js App → Express API → SQLite DB → External APIs)
- Component breakdown (Frontend, Backend, Database, AI Integration)
- Deployment architecture (Railway hosting)
- Mermaid diagrams for visual clarity

### `features.md`
- Organized by domain:
  - Document Management
  - Contract Management
  - Obligations Tracking
  - Q&A Cards
  - Legal Holds
  - Settings
- Each feature with brief description and key capabilities
- User workflows at high level

### `tech-stack.md`
- Frontend: Next.js 15, React 19, Radix UI, Tailwind CSS
- Backend: Express.js, Node.js 18+
- Database: SQLite with sql.js
- AI/ML: Anthropic Claude API, Voyage embeddings
- Document processing: pdf-parse, mammoth, xlsx
- Deployment: Railway

### `data-flow.md`
- Document upload → processing → storage → retrieval flow
- AI analysis workflow (document → chunks → embeddings → Claude analysis)
- Google Drive sync flow
- Mermaid sequence diagrams

### `database-schema.md`
- Key tables: documents, chunks, qa_cards, obligations, tasks, legal_holds, lineage, app_settings
- Relationships between tables
- Key fields and their purposes
- Entity-relationship diagram

### `api-endpoints.md`
- REST API structure (/api/*)
- Main endpoint categories:
  - documents
  - contracts
  - obligations
  - qa-cards
  - tasks
  - legal-holds
  - settings
- Request/response patterns

## Analysis Approach

### 1. Backend Analysis (server.js + lib/)
- Parse server.js to understand API endpoints, middleware, and request handlers
- Review lib/ directory for database operations, document processing, and business logic
- Map out the data models and database operations

### 2. Frontend Analysis (src/app/ + src/components/)
- Explore page routes in src/app/ to understand feature areas
- Review components to understand UI patterns and user interactions
- Identify how frontend communicates with backend APIs

### 3. Configuration & Integration
- Review package.json for dependencies and understand the tech stack
- Check .env.example for external integrations (Claude API, Voyage API, Google Drive)
- Look at next.config.mjs and other config files for deployment settings

### 4. Document Processing Pipeline
- Trace how documents flow from upload → parsing → chunking → embedding → analysis
- Understand the AI integration points with Claude and Voyage

### 5. Create Diagrams
- Use Mermaid syntax for architecture diagrams (layers, components)
- Create sequence diagrams for key data flows
- Entity-relationship diagram for database schema

## Documentation Style & Format

### Writing Style
- Clear, concise technical writing
- Present tense, active voice
- Bullet points and tables for scanability
- Code snippets where helpful (file paths, key functions)
- No marketing language - purely technical reference

### Markdown Conventions
- H1 (#) for document title
- H2 (##) for major sections
- H3 (###) for subsections
- Code blocks with language tags for syntax highlighting
- Mermaid diagrams embedded in markdown using ```mermaid blocks
- Tables for structured data (endpoints, tech stack components)
- Links between docs using relative paths

### Diagram Standards
- Mermaid graph TD/LR for architecture diagrams
- Mermaid sequenceDiagram for data flows
- Mermaid erDiagram for database relationships
- Keep diagrams simple and focused on one concept per diagram

## File Organization

```
/docs
├── overview.md
├── architecture.md
├── features.md
├── tech-stack.md
├── data-flow.md
├── database-schema.md
└── api-endpoints.md
```

## Implementation Notes

- Each document will start with a brief description of its purpose
- Cross-references will help navigate between related concepts
- Documentation will be version-controlled alongside code
- Focus on "what" and "how" rather than "why" (high-level overview)
- Each document should be standalone but reference others where relevant

## Success Criteria

- All seven documentation files created in /docs directory
- Each file contains accurate information based on codebase analysis
- Visual diagrams aid understanding of complex concepts
- Documentation is navigable and cross-referenced
- New developers can understand the system architecture and features from reading the docs
