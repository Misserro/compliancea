# Product Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Product Hub tab — a 4-step wizard that captures a feature intake form, attaches Drive document context, selects AI output templates, and streams generated PRD/Tech Spec/Feature Brief/Business Case docs into editable TipTap blocks with export options.

**Architecture:** Two routes: `/product-hub` (card grid list) and `/product-hub/[id]` (4-step wizard). Draft created immediately on "New Feature" click, auto-saved every 30s. AI generation streams NDJSON: raw tokens for live preview, then parsed sections on template completion. TipTap editors per section, version history stored in DB.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, SQLite (sql.js via `lib/db.js`), Claude API (@anthropic-ai/sdk), Voyage AI RAG (`lib/search.js` — already supports `documentIds` filter), TipTap (@tiptap/react + @tiptap/starter-kit), jsPDF, docx npm package, googleapis (already installed)

**Key patterns:**
- DB functions → `lib/db.js` (JS), re-exported via `src/lib/db-imports.ts`, used in API routes as `@/lib/db-imports`
- API routes: `export const runtime = "nodejs"`, call `await ensureDb()` first, return `NextResponse.json()`
- Next.js 15 dynamic params: `{ params }: { params: Promise<{ id: string }> }` — unwrap with `const { id } = await params`
- Prompts loaded: `await fs.readFile(path.join(process.cwd(), "prompts/prompt_prd.md"), "utf-8")`
- Search: `searchDocuments(query, { documentIds: [...], topK: 8 })` + `formatSearchResultsForCitations(results)`

---

### Task 1: Install new npm packages

**Files:**
- Modify: `package.json` (via npm install)

**Step 1: Install packages**

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder jspdf docx
```

**Step 2: Verify**

```bash
node -e "const p = require('./package.json'); ['@tiptap/react','jspdf','docx'].forEach(k => console.log(k, p.dependencies[k] ? 'OK' : 'MISSING'))"
```

Expected: all three print `OK`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install tiptap, jspdf, and docx packages"
```

---

### Task 2: Add product_features table to lib/db.js

**Files:**
- Modify: `lib/db.js` — inside `initDb()`, immediately before the `saveDb()` call (around line 348)

**Step 1: Find the `saveDb()` call near the end of `initDb()` and insert before it:**

```javascript
  // Product Hub: feature definitions and AI-generated documentation
  db.run(`
    CREATE TABLE IF NOT EXISTS product_features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'Untitled Feature',
      intake_form_json TEXT,
      selected_document_ids TEXT,
      free_context TEXT,
      selected_templates TEXT,
      generated_outputs_json TEXT,
      status TEXT DEFAULT 'idea',
      version_history_json TEXT,
      linked_contract_id INTEGER,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_product_features_status ON product_features(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_product_features_created ON product_features(created_at)`);
```

**Step 2: Verify the dev server starts without DB errors**

```bash
curl -s http://localhost:3000/api/documents | python3 -c "import sys,json; d=json.load(sys.stdin); print('DB OK, docs:', len(d.get('documents',[])))"
```

Expected: `DB OK, docs: N`

**Step 3: Commit**

```bash
git add lib/db.js
git commit -m "feat: add product_features table to SQLite schema"
```

---

### Task 3: Add product_features CRUD functions to lib/db.js and db-imports.ts

**Files:**
- Modify: `lib/db.js` — append at the bottom
- Modify: `src/lib/db-imports.ts` — add new exports

**Step 1: Append to the end of `lib/db.js`:**

```javascript
// ============================================
// Product Hub operations
// ============================================

export function createProductFeature(title = 'Untitled Feature') {
  const result = run(
    `INSERT INTO product_features (title, status) VALUES (?, 'idea')`,
    [title]
  );
  return get(`SELECT * FROM product_features WHERE id = ?`, [result.lastInsertRowId]);
}

export function getProductFeatures() {
  return query(`
    SELECT id, title, status, created_by, created_at, updated_at,
           linked_contract_id, selected_document_ids, selected_templates
    FROM product_features
    ORDER BY updated_at DESC, created_at DESC
  `);
}

export function getProductFeature(id) {
  return get(`SELECT * FROM product_features WHERE id = ?`, [id]);
}

export function updateProductFeature(id, fields) {
  const allowed = [
    'title', 'intake_form_json', 'selected_document_ids', 'free_context',
    'selected_templates', 'generated_outputs_json', 'status',
    'version_history_json', 'linked_contract_id', 'created_by'
  ];
  const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (updates.length === 0) return;
  const setClauses = updates.map(([k]) => `${k} = ?`).join(', ');
  const values = updates.map(([, v]) => v);
  run(
    `UPDATE product_features SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [...values, id]
  );
}

export function deleteProductFeature(id) {
  run(`DELETE FROM product_features WHERE id = ?`, [id]);
}
```

**Step 2: Add to `src/lib/db-imports.ts` — append after the last export:**

```typescript
  createProductFeature,
  getProductFeatures,
  getProductFeature,
  updateProductFeature,
  deleteProductFeature,
```

(These go inside the existing `export { ... }` block.)

**Step 3: Commit**

```bash
git add lib/db.js src/lib/db-imports.ts
git commit -m "feat: add product_features CRUD functions"
```

---

### Task 4: Add TypeScript types for Product Hub

**Files:**
- Modify: `src/lib/types.ts` — append at the end

**Step 1: Append to `src/lib/types.ts`:**

```typescript
// ============================================
// Product Hub types
// ============================================

export interface ProductFeature {
  id: number;
  title: string;
  intake_form_json: string | null;
  selected_document_ids: string | null;
  free_context: string | null;
  selected_templates: string | null;
  generated_outputs_json: string | null;
  status: 'idea' | 'in_spec' | 'in_review' | 'approved' | 'in_development' | 'shipped';
  version_history_json: string | null;
  linked_contract_id: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntakeForm {
  sectionA: {
    problemStatement: string;
    persona: string;
    statusQuo: string;
    whyNow: string;
  };
  sectionB: {
    featureDescription: string;
    userFlow: string;
    outOfScope: string;
    acceptanceCriteria: string;
  };
  sectionC: {
    constraints: string;
    kpis: string;
    systems: string;
    mustHave: string;
    shouldHave: string;
    niceToHave: string;
  };
}

export interface GeneratedOutputs {
  [template: string]: {
    sections: Record<string, string>;
    gaps: string[];
  };
}

export const FEATURE_STATUSES = [
  'idea', 'in_spec', 'in_review', 'approved', 'in_development', 'shipped'
] as const;

export type FeatureStatus = typeof FEATURE_STATUSES[number];

export const STATUS_LABELS: Record<FeatureStatus, string> = {
  idea: 'Idea',
  in_spec: 'In Spec',
  in_review: 'In Review',
  approved: 'Approved',
  in_development: 'In Development',
  shipped: 'Shipped',
};

export const STATUS_COLORS: Record<FeatureStatus, string> = {
  idea: 'bg-gray-100 text-gray-700',
  in_spec: 'bg-blue-100 text-blue-700',
  in_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  in_development: 'bg-purple-100 text-purple-700',
  shipped: 'bg-emerald-100 text-emerald-700',
};

export const TEMPLATES = [
  {
    id: 'feature_brief',
    name: 'Feature Brief',
    audience: 'PM, Stakeholders',
    description: '1-page summary: problem, solution, scope, KPIs',
    promptFile: 'prompts/prompt_feature_brief.md',
  },
  {
    id: 'prd',
    name: 'PRD',
    audience: 'Product, Design',
    description: 'Full requirements doc with user stories and acceptance criteria',
    promptFile: 'prompts/prompt_prd.md',
  },
  {
    id: 'tech_spec',
    name: 'Tech Spec',
    audience: 'Engineering',
    description: 'Functional + non-functional requirements, data model hints, API considerations',
    promptFile: 'prompts/prompt_tech_spec.md',
  },
  {
    id: 'business_case',
    name: 'Business Case',
    audience: 'Management',
    description: 'Business justification, ROI estimation, risks, team dependencies',
    promptFile: 'prompts/prompt_business_case.md',
  },
] as const;

export type TemplateId = 'feature_brief' | 'prd' | 'tech_spec' | 'business_case';

// Sections per template — used to render Step 4 output blocks
export const TEMPLATE_SECTIONS: Record<TemplateId, { id: string; label: string }[]> = {
  feature_brief: [
    { id: 'summary', label: 'Executive Summary' },
    { id: 'problem', label: 'Problem Statement' },
    { id: 'solution', label: 'Proposed Solution' },
    { id: 'scope', label: 'Scope & Out of Scope' },
    { id: 'kpis', label: 'Success Metrics (KPIs)' },
    { id: 'open_questions', label: 'Open Questions' },
  ],
  prd: [
    { id: 'problem_statement', label: 'Problem Statement' },
    { id: 'user_personas', label: 'User Personas' },
    { id: 'user_stories', label: 'User Stories + Acceptance Criteria' },
    { id: 'functional_requirements', label: 'Functional Requirements' },
    { id: 'non_functional_requirements', label: 'Non-Functional Requirements' },
    { id: 'out_of_scope', label: 'Out of Scope' },
    { id: 'success_metrics', label: 'Success Metrics (KPIs)' },
    { id: 'risks_dependencies', label: 'Risks & Dependencies' },
    { id: 'open_questions', label: 'Open Questions' },
  ],
  tech_spec: [
    { id: 'overview', label: 'Technical Overview' },
    { id: 'functional_requirements', label: 'Functional Requirements' },
    { id: 'non_functional_requirements', label: 'Non-Functional Requirements' },
    { id: 'data_model', label: 'Data Model' },
    { id: 'api_design', label: 'API Design' },
    { id: 'dependencies', label: 'Dependencies & Integrations' },
    { id: 'open_questions', label: 'Open Questions' },
  ],
  business_case: [
    { id: 'executive_summary', label: 'Executive Summary' },
    { id: 'business_problem', label: 'Business Problem' },
    { id: 'proposed_solution', label: 'Proposed Solution' },
    { id: 'roi_estimation', label: 'ROI & Value Assessment' },
    { id: 'risks', label: 'Risks' },
    { id: 'team_dependencies', label: 'Team & Dependencies' },
    { id: 'open_questions', label: 'Open Questions' },
  ],
};
```

**Step 2: Verify TypeScript compiles:**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add ProductFeature TypeScript types, status constants, and template definitions"
```

---

### Task 5: Add Product Hub sidebar entry

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

**Step 1: Add `Package` to the lucide-react import on line 5:**

Change:
```typescript
import { FileText, Search, ClipboardCheck, Settings, MessageSquare, Layers, Shield } from "lucide-react";
```
To:
```typescript
import { FileText, Search, ClipboardCheck, Settings, MessageSquare, Layers, Shield, Package } from "lucide-react";
```

**Step 2: Add Product Hub entry to `navItems` array between Contracts and Settings:**

```typescript
  { title: "Contracts", href: "/contracts", icon: ClipboardCheck },
  { title: "Product Hub", href: "/product-hub", icon: Package },
  { title: "Settings", href: "/settings", icon: Settings },
```

**Step 3: Verify in browser** — "Product Hub" should appear in the sidebar (will 404 until page is created).

**Step 4: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat: add Product Hub sidebar navigation entry"
```

---

### Task 6: Create GET /api/product-hub and POST /api/product-hub

**Files:**
- Create: `src/app/api/product-hub/route.ts`

**Step 1: Create the file:**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getProductFeatures, createProductFeature } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET() {
  await ensureDb();
  try {
    const features = getProductFeatures();
    return NextResponse.json({ features });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await ensureDb();
  try {
    const body = await req.json().catch(() => ({}));
    const feature = createProductFeature(body.title || 'Untitled Feature');
    return NextResponse.json(feature, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

**Step 2: Test GET**

```bash
curl -s http://localhost:3000/api/product-hub | python3 -m json.tool
```

Expected: `{"features": []}`

**Step 3: Test POST**

```bash
curl -s -X POST http://localhost:3000/api/product-hub \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Feature"}' | python3 -m json.tool
```

Expected: `{"id": 1, "title": "Test Feature", "status": "idea", ...}`

**Step 4: Commit**

```bash
git add src/app/api/product-hub/route.ts
git commit -m "feat: add GET and POST /api/product-hub endpoints"
```

---

### Task 7: Create GET/PATCH/DELETE /api/product-hub/[id]

**Files:**
- Create: `src/app/api/product-hub/[id]/route.ts`

**Step 1: Create the file:**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getProductFeature, updateProductFeature, deleteProductFeature } from "@/lib/db-imports";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const feature = getProductFeature(Number(id));
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ feature });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const feature = getProductFeature(Number(id));
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  updateProductFeature(Number(id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const feature = getProductFeature(Number(id));
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });
  deleteProductFeature(Number(id));
  return NextResponse.json({ ok: true });
}
```

**Step 2: Test (use ID from Task 6 POST result, e.g. 1)**

```bash
curl -s http://localhost:3000/api/product-hub/1 | python3 -m json.tool
curl -s -X PATCH http://localhost:3000/api/product-hub/1 \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Feature"}' | python3 -m json.tool
curl -s http://localhost:3000/api/product-hub/1 | python3 -c "import sys,json; print(json.load(sys.stdin)['feature']['title'])"
```

Expected: `Updated Feature`

**Step 3: Commit**

```bash
git add src/app/api/product-hub/[id]/route.ts
git commit -m "feat: add GET, PATCH, DELETE /api/product-hub/[id] endpoints"
```

---

### Task 8: Create StatusBadge component

**Files:**
- Create: `src/components/product-hub/status-badge.tsx`

**Step 1: Create the file:**

```typescript
"use client";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { FEATURE_STATUSES, STATUS_LABELS, STATUS_COLORS, type FeatureStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: FeatureStatus;
  editable?: boolean;
  onChange?: (status: FeatureStatus) => void;
}

export function StatusBadge({ status, editable = false, onChange }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status;
  const color = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700';

  if (!editable) {
    return (
      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", color)}>
        {label}
      </span>
    );
  }

  return (
    <Select value={status} onValueChange={(v) => onChange?.(v as FeatureStatus)}>
      <SelectTrigger className="h-auto border-0 p-0 shadow-none focus:ring-0 w-auto">
        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer", color)}>
          {label}
        </span>
      </SelectTrigger>
      <SelectContent>
        {FEATURE_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[s])}>
              {STATUS_LABELS[s]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/product-hub/status-badge.tsx
git commit -m "feat: add StatusBadge component with editable select"
```

---

### Task 9: Create ProductFeatureCard component

**Files:**
- Create: `src/components/product-hub/product-feature-card.tsx`

**Step 1: Create the file:**

```typescript
"use client";

import { FileText, ExternalLink, Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./status-badge";
import type { ProductFeature, FeatureStatus } from "@/lib/types";

interface ProductFeatureCardProps {
  feature: ProductFeature;
  onRefresh: () => void;
}

export function ProductFeatureCard({ feature, onRefresh }: ProductFeatureCardProps) {
  const router = useRouter();

  const docCount = (() => {
    try { return (JSON.parse(feature.selected_document_ids ?? '[]') as number[]).length; }
    catch { return 0; }
  })();

  const templates = (() => {
    try { return (JSON.parse(feature.selected_templates ?? '[]') as string[]); }
    catch { return []; }
  })();

  async function handleStatusChange(status: FeatureStatus) {
    await fetch(`/api/product-hub/${feature.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    onRefresh();
  }

  async function handleDuplicate() {
    const res = await fetch('/api/product-hub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `${feature.title} (copy)` }),
    });
    if (res.ok) {
      const newFeature = await res.json();
      await fetch(`/api/product-hub/${newFeature.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intake_form_json: feature.intake_form_json,
          selected_document_ids: feature.selected_document_ids,
          free_context: feature.free_context,
          selected_templates: feature.selected_templates,
        }),
      });
      toast.success('Feature duplicated');
      onRefresh();
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${feature.title}"? This cannot be undone.`)) return;
    await fetch(`/api/product-hub/${feature.id}`, { method: 'DELETE' });
    toast.success('Feature deleted');
    onRefresh();
  }

  return (
    <div className="border rounded-lg p-4 bg-card hover:shadow-sm transition-shadow space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-sm leading-snug flex-1 truncate">{feature.title}</h3>
        <StatusBadge status={feature.status} editable onChange={handleStatusChange} />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>{new Date(feature.created_at).toLocaleDateString()}</span>
        {docCount > 0 && <span>{docCount} document{docCount !== 1 ? 's' : ''}</span>}
        {templates.length > 0 && <span>{templates.length} template{templates.length !== 1 ? 's' : ''}</span>}
      </div>

      <div className="flex items-center gap-1 pt-1">
        <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => router.push(`/product-hub/${feature.id}`)}>
          <ExternalLink className="h-3 w-3 mr-1" /> Open
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleDuplicate}>
          <Copy className="h-3 w-3 mr-1" /> Duplicate
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={handleDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/product-hub/product-feature-card.tsx
git commit -m "feat: add ProductFeatureCard component"
```

---

### Task 10: Create Product Hub list view page

**Files:**
- Create: `src/app/product-hub/page.tsx`

**Step 1: Create the file:**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Package } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProductFeatureCard } from "@/components/product-hub/product-feature-card";
import type { ProductFeature } from "@/lib/types";

export default function ProductHubPage() {
  const router = useRouter();
  const [features, setFeatures] = useState<ProductFeature[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFeatures = useCallback(async () => {
    try {
      const res = await fetch('/api/product-hub');
      if (res.ok) {
        const data = await res.json();
        setFeatures(data.features || []);
      }
    } catch (e) {
      toast.error(`Failed to load features: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  async function handleNewFeature() {
    try {
      const res = await fetch('/api/product-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Feature' }),
      });
      if (!res.ok) throw new Error('Failed to create feature');
      const feature = await res.json();
      router.push(`/product-hub/${feature.id}`);
    } catch (e) {
      toast.error(`Failed to create feature: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Product Hub</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Define features and generate PRDs, Tech Specs, Feature Briefs, and Business Cases with AI.
          </p>
        </div>
        <Button onClick={handleNewFeature}>
          <Plus className="h-4 w-4 mr-2" /> New Feature
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
        </div>
      ) : features.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <Package className="h-12 w-12 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">No features yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click "New Feature" to define your first product feature.
            </p>
          </div>
          <Button onClick={handleNewFeature}><Plus className="h-4 w-4 mr-2" /> New Feature</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <ProductFeatureCard key={f.id} feature={f} onRefresh={loadFeatures} />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify in browser**

Navigate to `http://localhost:3000/product-hub` — should show "No features yet" empty state with "New Feature" button.

Click "New Feature" — should create a draft and navigate to `/product-hub/1` (404 until wizard page is built).

**Step 3: Commit**

```bash
git add src/app/product-hub/page.tsx
git commit -m "feat: add Product Hub list view page"
```

---

### Task 11: Create WizardProgressBar component

**Files:**
- Create: `src/components/product-hub/wizard-progress-bar.tsx`

**Step 1: Create the file:**

```typescript
"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntakeForm } from "@/lib/types";

interface WizardProgressBarProps {
  currentStep: number;
  intakeFormJson?: string | null;
  onStepClick?: (step: number) => void;
}

const STEPS = [
  { number: 1, label: 'Intake Form' },
  { number: 2, label: 'Document Context' },
  { number: 3, label: 'Generate' },
  { number: 4, label: 'Output' },
];

function isIntakeComplete(intakeFormJson: string | null | undefined): boolean {
  if (!intakeFormJson) return false;
  try {
    const f = JSON.parse(intakeFormJson) as IntakeForm;
    return !!(
      f.sectionA?.problemStatement?.trim() &&
      f.sectionA?.persona?.trim() &&
      f.sectionA?.statusQuo?.trim() &&
      f.sectionB?.featureDescription?.trim() &&
      f.sectionB?.userFlow?.trim() &&
      f.sectionB?.acceptanceCriteria?.trim() &&
      f.sectionC?.kpis?.trim()
    );
  } catch { return false; }
}

export function WizardProgressBar({ currentStep, intakeFormJson, onStepClick }: WizardProgressBarProps) {
  const completedSteps = new Set<number>();
  if (isIntakeComplete(intakeFormJson)) completedSteps.add(1);

  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const isActive = currentStep === step.number;
        const isCompleted = completedSteps.has(step.number);
        const isPast = step.number < currentStep;

        return (
          <div key={step.number} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => onStepClick?.(step.number)}
              disabled={!onStepClick}
              className={cn(
                "flex flex-col items-center gap-1 min-w-0",
                onStepClick && "cursor-pointer",
              )}
            >
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors",
                isActive && "border-primary bg-primary text-primary-foreground",
                (isCompleted || isPast) && !isActive && "border-primary bg-primary/10 text-primary",
                !isActive && !isCompleted && !isPast && "border-muted-foreground/30 text-muted-foreground",
              )}>
                {isCompleted && !isActive ? <Check className="h-4 w-4" /> : step.number}
              </div>
              <span className={cn(
                "text-xs whitespace-nowrap",
                isActive ? "text-foreground font-medium" : "text-muted-foreground",
              )}>
                {step.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 mx-2 mb-5 transition-colors",
                isPast || isCompleted ? "bg-primary" : "bg-muted-foreground/20",
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/product-hub/wizard-progress-bar.tsx
git commit -m "feat: add WizardProgressBar component"
```

---

### Task 12: Create Step1IntakeForm component

**Files:**
- Create: `src/components/product-hub/step1-intake-form.tsx`

**Step 1: Create the file:**

```typescript
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { IntakeForm } from "@/lib/types";

const EMPTY_INTAKE: IntakeForm = {
  sectionA: { problemStatement: '', persona: '', statusQuo: '', whyNow: '' },
  sectionB: { featureDescription: '', userFlow: '', outOfScope: '', acceptanceCriteria: '' },
  sectionC: { constraints: '', kpis: '', systems: '', mustHave: '', shouldHave: '', niceToHave: '' },
};

interface TextareaFieldProps {
  label: string;
  value: string;
  required?: boolean;
  error?: string;
  rows?: number;
  onChange: (v: string) => void;
}

function TextareaField({ label, value, required, error, rows = 3, onChange }: TextareaFieldProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={cn(
          "w-full rounded-md border bg-background px-3 py-2 text-sm resize-y",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          error && "border-destructive focus:ring-destructive",
        )}
      />
      <div className="flex justify-between items-start">
        {error ? <p className="text-xs text-destructive">{error}</p> : <span />}
        <span className="text-xs text-muted-foreground ml-auto">{value.length} chars</span>
      </div>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, subtitle, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <div>
          <p className="text-sm font-medium">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

interface Step1IntakeFormProps {
  value: IntakeForm;
  onChange: (intake: IntakeForm) => void;
  onContinue: () => void;
}

export function Step1IntakeForm({ value, onChange, onContinue }: Step1IntakeFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function updateA(field: keyof IntakeForm['sectionA'], v: string) {
    onChange({ ...value, sectionA: { ...value.sectionA, [field]: v } });
    if (errors[`A_${field}`]) setErrors(e => { const n = { ...e }; delete n[`A_${field}`]; return n; });
  }
  function updateB(field: keyof IntakeForm['sectionB'], v: string) {
    onChange({ ...value, sectionB: { ...value.sectionB, [field]: v } });
    if (errors[`B_${field}`]) setErrors(e => { const n = { ...e }; delete n[`B_${field}`]; return n; });
  }
  function updateC(field: keyof IntakeForm['sectionC'], v: string) {
    onChange({ ...value, sectionC: { ...value.sectionC, [field]: v } });
    if (errors[`C_${field}`]) setErrors(e => { const n = { ...e }; delete n[`C_${field}`]; return n; });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!value.sectionA.problemStatement.trim()) e.A_problemStatement = 'Required';
    if (!value.sectionA.persona.trim()) e.A_persona = 'Required';
    if (!value.sectionA.statusQuo.trim()) e.A_statusQuo = 'Required';
    if (!value.sectionB.featureDescription.trim()) e.B_featureDescription = 'Required';
    if (!value.sectionB.userFlow.trim()) e.B_userFlow = 'Required';
    if (!value.sectionB.acceptanceCriteria.trim()) e.B_acceptanceCriteria = 'Required';
    if (!value.sectionC.kpis.trim()) e.C_kpis = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleContinue() {
    if (validate()) onContinue();
  }

  return (
    <div className="space-y-4">
      <CollapsibleSection title="Section A: Problem & Context" subtitle="Describe the problem this feature solves">
        <TextareaField label="What problem does this feature solve?" required value={value.sectionA.problemStatement} error={errors.A_problemStatement} onChange={(v) => updateA('problemStatement', v)} rows={3} />
        <TextareaField label="Who has this problem? (persona / department / role)" required value={value.sectionA.persona} error={errors.A_persona} onChange={(v) => updateA('persona', v)} rows={2} />
        <TextareaField label="What happens today without this feature?" required value={value.sectionA.statusQuo} error={errors.A_statusQuo} onChange={(v) => updateA('statusQuo', v)} rows={3} />
        <TextareaField label="Why are we solving this now?" value={value.sectionA.whyNow} onChange={(v) => updateA('whyNow', v)} rows={2} />
      </CollapsibleSection>

      <CollapsibleSection title="Section B: Feature Definition" subtitle="Define what the feature does and how it works">
        <TextareaField label="What does this feature do? (1–2 sentences)" required value={value.sectionB.featureDescription} error={errors.B_featureDescription} onChange={(v) => updateB('featureDescription', v)} rows={2} />
        <TextareaField label="What steps does the user take to use it? (describe the flow)" required value={value.sectionB.userFlow} error={errors.B_userFlow} onChange={(v) => updateB('userFlow', v)} rows={4} />
        <TextareaField label="What is explicitly OUT of scope?" value={value.sectionB.outOfScope} onChange={(v) => updateB('outOfScope', v)} rows={2} />
        <TextareaField label="What are the acceptance criteria? (when is this 'done'?)" required value={value.sectionB.acceptanceCriteria} error={errors.B_acceptanceCriteria} onChange={(v) => updateB('acceptanceCriteria', v)} rows={4} />
      </CollapsibleSection>

      <CollapsibleSection title="Section C: Constraints & Success Metrics" subtitle="Define how success is measured">
        <TextareaField label="Are there technical, legal, or budget constraints?" value={value.sectionC.constraints} onChange={(v) => updateC('constraints', v)} rows={2} />
        <TextareaField label="What KPIs or success metrics should this feature achieve?" required value={value.sectionC.kpis} error={errors.C_kpis} onChange={(v) => updateC('kpis', v)} rows={3} />
        <TextareaField label="Which systems or integrations must be considered?" value={value.sectionC.systems} onChange={(v) => updateC('systems', v)} rows={2} />
        <div className="space-y-2">
          <Label className="text-xs font-medium">Prioritize requirements (MoSCoW)</Label>
          <div className="grid grid-cols-3 gap-3">
            {([['mustHave', 'Must Have'], ['shouldHave', 'Should Have'], ['niceToHave', 'Nice to Have']] as const).map(([field, label]) => (
              <div key={field} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <textarea
                  value={value.sectionC[field]}
                  onChange={(e) => updateC(field, e.target.value)}
                  rows={4}
                  placeholder={`List ${label.toLowerCase()} requirements...`}
                  className="w-full rounded-md border bg-background px-3 py-2 text-xs resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      <div className="flex justify-end">
        <Button onClick={handleContinue}>Continue to Document Context →</Button>
      </div>
    </div>
  );
}

export { EMPTY_INTAKE };
```

**Step 2: Commit**

```bash
git add src/components/product-hub/step1-intake-form.tsx
git commit -m "feat: add Step1IntakeForm component with collapsible sections and validation"
```

---

### Task 13: Create Step2DocumentContext component

**Files:**
- Create: `src/components/product-hub/step2-document-context.tsx`

**Step 1: Create the file:**

```typescript
"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Document } from "@/lib/types";

const FILTER_CATEGORIES = [
  { label: 'All', value: 'all' },
  { label: 'Regulatory & Compliance', value: 'regulatory', types: ['regulation', 'compliance', 'standard'] },
  { label: 'Specifications', value: 'specs', types: ['prd', 'specification', 'architecture', 'report'] },
  { label: 'User Research', value: 'research', types: ['research', 'feedback'] },
  { label: 'Contracts / SLAs', value: 'contracts', types: ['contract', 'sla'] },
];

interface Step2DocumentContextProps {
  selectedDocIds: number[];
  freeContext: string;
  onChange: (docIds: number[], freeContext: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function Step2DocumentContext({ selectedDocIds, freeContext, onChange, onBack, onContinue }: Step2DocumentContextProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/documents')
      .then(r => r.json())
      .then(d => setDocuments((d.documents || []).filter((doc: Document) => doc.processed)));
  }, []);

  const filtered = useMemo(() => {
    let result = documents;
    if (activeFilter !== 'all') {
      const cat = FILTER_CATEGORIES.find(c => c.value === activeFilter);
      if (cat?.types) result = result.filter(d => d.doc_type && cat.types!.includes(d.doc_type));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(d => d.name.toLowerCase().includes(q));
    }
    return result;
  }, [documents, activeFilter, search]);

  function toggleDoc(id: number) {
    const next = selectedDocIds.includes(id)
      ? selectedDocIds.filter(d => d !== id)
      : [...selectedDocIds, id];
    onChange(next, freeContext);
  }

  const hoveredDoc = hoveredId ? documents.find(d => d.id === hoveredId) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: document picker */}
        <div className="lg:col-span-2 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Select Reference Documents</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Choose documents from your Drive library to include as context.</p>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {FILTER_CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setActiveFilter(cat.value)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  activeFilter === cat.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-muted-foreground/30 hover:border-primary/50",
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Document list */}
          <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4 text-center">No documents found.</p>
            ) : filtered.map(doc => {
              const selected = selectedDocIds.includes(doc.id);
              return (
                <button
                  key={doc.id}
                  onClick={() => toggleDoc(doc.id)}
                  onMouseEnter={() => setHoveredId(doc.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors",
                    selected && "bg-primary/5",
                  )}
                >
                  <div className={cn(
                    "h-4 w-4 rounded border-2 flex-shrink-0 transition-colors",
                    selected ? "bg-primary border-primary" : "border-muted-foreground/40",
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{doc.name}</p>
                    <div className="flex gap-2 mt-0.5">
                      {doc.doc_type && <span className="text-[10px] text-muted-foreground">{doc.doc_type}</span>}
                      {doc.added_at && <span className="text-[10px] text-muted-foreground">{new Date(doc.added_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: summary + preview */}
        <div className="space-y-3">
          <div className="border rounded-lg p-3 bg-muted/20 space-y-1">
            <p className="text-xs font-semibold">Selection Summary</p>
            <p className="text-xs text-muted-foreground">
              {selectedDocIds.length} document{selectedDocIds.length !== 1 ? 's' : ''} selected
              {freeContext.trim() ? ` + free text (${freeContext.trim().length} chars)` : ''}
            </p>
            {selectedDocIds.length > 0 && (
              <div className="pt-1 space-y-1">
                {selectedDocIds.map(id => {
                  const doc = documents.find(d => d.id === id);
                  return doc ? (
                    <div key={id} className="flex items-center justify-between gap-2">
                      <span className="text-[11px] truncate">{doc.name}</span>
                      <button onClick={() => toggleDoc(id)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </div>

          {/* Hover preview */}
          {hoveredDoc && (
            <div className="border rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold truncate">{hoveredDoc.name}</p>
              <p className="text-[11px] text-muted-foreground line-clamp-4">
                {hoveredDoc.full_text?.slice(0, 300) ?? 'No preview available.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Free context */}
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Additional Context</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Paste emails, Slack messages, meeting notes, or stakeholder requests.</p>
        </div>
        <textarea
          value={freeContext}
          onChange={(e) => onChange(selectedDocIds, e.target.value)}
          rows={5}
          placeholder="Paste any additional context here…"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground text-right">{freeContext.length} chars</p>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={onContinue}>Continue to Templates →</Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/product-hub/step2-document-context.tsx
git commit -m "feat: add Step2DocumentContext with document picker and free context field"
```

---

### Task 14: Create Step3TemplateSelector component

**Files:**
- Create: `src/components/product-hub/step3-template-selector.tsx`

**Step 1: Create the file:**

```typescript
"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATES, type TemplateId } from "@/lib/types";

interface Step3TemplateSelectorProps {
  selectedTemplates: TemplateId[];
  generating: boolean;
  onChange: (templates: TemplateId[]) => void;
  onBack: () => void;
  onGenerate: () => void;
}

export function Step3TemplateSelector({
  selectedTemplates, generating, onChange, onBack, onGenerate
}: Step3TemplateSelectorProps) {
  function toggle(id: TemplateId) {
    onChange(
      selectedTemplates.includes(id)
        ? selectedTemplates.filter(t => t !== id)
        : [...selectedTemplates, id]
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Select Output Templates</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose one or more documents to generate. Each will be a separate tab in the output view.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TEMPLATES.map(t => {
          const selected = selectedTemplates.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              disabled={generating}
              className={cn(
                "text-left p-4 rounded-lg border-2 transition-all space-y-1",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/20 hover:border-primary/40 bg-background",
                generating && "opacity-50 cursor-not-allowed",
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{t.name}</p>
                <div className={cn(
                  "h-4 w-4 rounded border-2 flex-shrink-0 transition-colors",
                  selected ? "bg-primary border-primary" : "border-muted-foreground/40",
                )} />
              </div>
              <p className="text-[11px] text-primary/70 font-medium">{t.audience}</p>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={onBack} disabled={generating}>← Back</Button>
        <Button
          onClick={onGenerate}
          disabled={selectedTemplates.length === 0 || generating}
          className="min-w-36"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
          ) : (
            `Generate ${selectedTemplates.length > 0 ? `(${selectedTemplates.length})` : ''}`
          )}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/product-hub/step3-template-selector.tsx
git commit -m "feat: add Step3TemplateSelector with toggle cards"
```

---

### Task 15: Create streaming generate endpoint

**Files:**
- Create: `src/app/api/product-hub/[id]/generate/route.ts`

**Step 1: Create the file:**

```typescript
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import { ensureDb } from "@/lib/server-utils";
import { getProductFeature, updateProductFeature } from "@/lib/db-imports";
import { searchDocuments, formatSearchResultsForCitations } from "../../../../../lib/search.js";
import type { TemplateId, IntakeForm } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const TEMPLATE_PROMPT_FILES: Record<TemplateId, string> = {
  feature_brief: 'prompts/prompt_feature_brief.md',
  prd: 'prompts/prompt_prd.md',
  tech_spec: 'prompts/prompt_tech_spec.md',
  business_case: 'prompts/prompt_business_case.md',
};

const SECTION_DELIMITER = /===SECTION:\s*(\w+)===/g;

function buildIntakeText(intake: IntakeForm): string {
  const { sectionA: a, sectionB: b, sectionC: c } = intake;
  return [
    `## Section A: Problem & Context`,
    `Problem: ${a.problemStatement}`,
    `Persona: ${a.persona}`,
    `Status quo: ${a.statusQuo}`,
    a.whyNow ? `Why now: ${a.whyNow}` : '',
    `\n## Section B: Feature Definition`,
    `Feature description: ${b.featureDescription}`,
    `User flow: ${b.userFlow}`,
    b.outOfScope ? `Out of scope: ${b.outOfScope}` : '',
    `Acceptance criteria: ${b.acceptanceCriteria}`,
    `\n## Section C: Constraints & Success Metrics`,
    c.constraints ? `Constraints: ${c.constraints}` : '',
    `KPIs: ${c.kpis}`,
    c.systems ? `Systems/integrations: ${c.systems}` : '',
    `\n### MoSCoW Prioritization`,
    `Must Have:\n${c.mustHave || '(none specified)'}`,
    `Should Have:\n${c.shouldHave || '(none specified)'}`,
    `Nice to Have:\n${c.niceToHave || '(none specified)'}`,
  ].filter(Boolean).join('\n');
}

function parseSections(rawText: string): { sections: Record<string, string>; gaps: string[] } {
  const sections: Record<string, string> = {};
  const gaps: string[] = [];
  const parts = rawText.split(/===SECTION:\s*(\w+)===/);

  // parts[0] is preamble (before first section), then alternating [sectionName, content, sectionName, content, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const sectionId = parts[i].toLowerCase().trim();
    const content = (parts[i + 1] || '').trim();
    sections[sectionId] = content;

    // Detect AI-flagged gaps (⚠️ markers)
    const gapMatches = content.match(/⚠️[^\n]+/g);
    if (gapMatches) gaps.push(...gapMatches.map(g => g.replace('⚠️', '').trim()));
  }

  return { sections, gaps };
}

export async function POST(req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 500 });
  }

  const feature = getProductFeature(Number(id));
  if (!feature) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

  const body = await req.json();
  const templates: TemplateId[] = body.templates || [];
  const intakeFormJson: string = body.intake_form_json || feature.intake_form_json || '{}';
  const selectedDocIds: number[] = JSON.parse(body.selected_document_ids || feature.selected_document_ids || '[]');
  const freeContext: string = body.free_context || feature.free_context || '';

  let intake: IntakeForm;
  try { intake = JSON.parse(intakeFormJson); }
  catch { return new Response(JSON.stringify({ error: 'Invalid intake_form_json' }), { status: 400 }); }

  const encoder = new TextEncoder();
  const allOutputs: Record<string, { sections: Record<string, string>; gaps: string[] }> = {};

  // Preserve existing outputs for untouched templates
  try {
    const existing = JSON.parse(feature.generated_outputs_json || '{}');
    Object.assign(allOutputs, existing);
  } catch { /* ignore */ }

  // Push version snapshot before overwriting
  const history = (() => {
    try { return JSON.parse(feature.version_history_json || '[]'); } catch { return []; }
  })();
  if (feature.generated_outputs_json) {
    history.push({
      timestamp: new Date().toISOString(),
      trigger: 'generate',
      templates,
      snapshot: JSON.parse(feature.generated_outputs_json),
    });
    if (history.length > 20) history.shift();
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

      try {
        const intakeText = buildIntakeText(intake);

        // RAG: fetch relevant chunks from selected documents
        const ragResults = selectedDocIds.length > 0
          ? await searchDocuments(intakeText, { documentIds: selectedDocIds, topK: 8 })
          : [];
        const ragContext = formatSearchResultsForCitations(ragResults);

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        for (const templateId of templates) {
          emit({ type: 'template_start', template: templateId });

          const promptFile = TEMPLATE_PROMPT_FILES[templateId];
          const systemPrompt = await fs.readFile(path.join(process.cwd(), promptFile), 'utf-8');

          const userPrompt = [
            `# Intake Form\n${intakeText}`,
            ragResults.length > 0 ? `\n# Relevant Document Excerpts\n${ragContext}` : '',
            freeContext ? `\n# Additional Context\n${freeContext}` : '',
            `\n# Output Instructions\nOutput each section preceded by a delimiter on its own line in the format:\n===SECTION: section_id===\n\nUse the exact section IDs defined in the template structure. Start immediately with the first section delimiter.`,
          ].filter(Boolean).join('\n\n');

          let rawOutput = '';

          const response = await anthropic.messages.create({
            model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
            max_tokens: 8192,
            stream: true,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          });

          for await (const chunk of response) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              const text = chunk.delta.text;
              rawOutput += text;
              emit({ type: 'raw_token', template: templateId, content: text });
            }
          }

          const parsed = parseSections(rawOutput);
          allOutputs[templateId] = parsed;

          emit({ type: 'template_complete', template: templateId, sections: parsed.sections, gaps: parsed.gaps });
        }

        // Persist results
        updateProductFeature(Number(id), {
          generated_outputs_json: JSON.stringify(allOutputs),
          selected_templates: JSON.stringify(templates),
          version_history_json: JSON.stringify(history),
        });

        emit({ type: 'done', feature_id: Number(id) });
      } catch (e) {
        emit({ type: 'error', message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

**Step 2: Test the endpoint with curl (requires a feature with intake data)**

```bash
curl -s -X POST http://localhost:3000/api/product-hub/1/generate \
  -H "Content-Type: application/json" \
  -d '{
    "templates": ["feature_brief"],
    "intake_form_json": "{\"sectionA\":{\"problemStatement\":\"Test problem\",\"persona\":\"PM\",\"statusQuo\":\"Manual process\",\"whyNow\":\"\"},\"sectionB\":{\"featureDescription\":\"A test feature\",\"userFlow\":\"User clicks button\",\"outOfScope\":\"\",\"acceptanceCriteria\":\"Feature works\"},\"sectionC\":{\"constraints\":\"\",\"kpis\":\"Reduce time by 50%\",\"systems\":\"\",\"mustHave\":\"\",\"shouldHave\":\"\",\"niceToHave\":\"\"}}",
    "selected_document_ids": "[]",
    "free_context": ""
  }' | head -20
```

Expected: streaming NDJSON lines appearing, ending with `{"type":"done",...}`.

**Step 3: Commit**

```bash
git add src/app/api/product-hub/[id]/generate/route.ts
git commit -m "feat: add streaming AI generate endpoint for product hub"
```

---

### Task 16: Create OutputSection and Step4OutputViewer components (TipTap)

**Files:**
- Create: `src/components/product-hub/output-section.tsx`
- Create: `src/components/product-hub/step4-output-viewer.tsx`

**Step 1: Create `src/components/product-hub/output-section.tsx`:**

```typescript
"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OutputSectionProps {
  sectionId: string;
  label: string;
  content: string;
  streaming: boolean;
  gaps: string[];
  onRegenerate: (sectionId: string) => void;
  onChange: (sectionId: string, content: string) => void;
}

export function OutputSection({
  sectionId, label, content, streaming, gaps, onRegenerate, onChange,
}: OutputSectionProps) {
  const isOpenQuestions = sectionId === 'open_questions';

  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editable: !streaming,
    onUpdate: ({ editor }) => {
      onChange(sectionId, editor.getHTML());
    },
  });

  // Sync streaming content into editor
  useEffect(() => {
    if (editor && !streaming) {
      const currentHTML = editor.getHTML();
      if (currentHTML !== content) {
        editor.commands.setContent(content || '', false);
      }
    }
  }, [content, streaming, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!streaming);
  }, [streaming, editor]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
        <h4 className="text-sm font-semibold">{label}</h4>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onRegenerate(sectionId)}
          disabled={streaming}
        >
          <RotateCcw className="h-3 w-3 mr-1" /> Regenerate
        </Button>
      </div>

      {/* Gap warnings */}
      {isOpenQuestions && gaps.length > 0 && (
        <div className="px-4 pt-3 space-y-1">
          {gaps.map((gap, i) => (
            <div key={i} className="flex gap-2 p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <span>⚠️</span>
              <span>{gap}</span>
            </div>
          ))}
        </div>
      )}

      <div className={cn(
        "px-4 py-3 prose prose-sm max-w-none min-h-[80px]",
        streaming && "animate-pulse opacity-70",
        "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[60px]",
      )}>
        {editor ? <EditorContent editor={editor} /> : (
          <p className="text-muted-foreground text-xs">Loading editor…</p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create `src/components/product-hub/step4-output-viewer.tsx`:**

```typescript
"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OutputSection } from "./output-section";
import { TEMPLATES, TEMPLATE_SECTIONS, type TemplateId, type GeneratedOutputs } from "@/lib/types";

interface Step4OutputViewerProps {
  selectedTemplates: TemplateId[];
  outputs: GeneratedOutputs;
  streamingTemplate: TemplateId | null;
  streamingRawText: Record<TemplateId, string>;
  onRegenerate: (template: TemplateId, section?: string) => void;
  onOutputChange: (template: TemplateId, sectionId: string, content: string) => void;
  onRegenerateAll: () => void;
}

export function Step4OutputViewer({
  selectedTemplates, outputs, streamingTemplate, streamingRawText,
  onRegenerate, onOutputChange, onRegenerateAll,
}: Step4OutputViewerProps) {
  const [activeTab, setActiveTab] = useState<TemplateId>(selectedTemplates[0]);

  const templateDef = TEMPLATES.find(t => t.id === activeTab);
  const sections = TEMPLATE_SECTIONS[activeTab] ?? [];
  const templateOutput = outputs[activeTab];
  const isStreaming = streamingTemplate === activeTab;
  const rawText = streamingRawText[activeTab] ?? '';

  return (
    <div className="space-y-4">
      {/* Tab bar + Regenerate All */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 border-b flex-1">
          {selectedTemplates.map(tid => {
            const def = TEMPLATES.find(t => t.id === tid);
            return (
              <button
                key={tid}
                onClick={() => setActiveTab(tid)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === tid
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {def?.name ?? tid}
                {streamingTemplate === tid && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={onRegenerateAll} disabled={!!streamingTemplate}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Regenerate All
        </Button>
      </div>

      {/* Active template content */}
      {isStreaming && !templateOutput ? (
        // Raw streaming view before first template_complete
        <div className="border rounded-lg p-4 bg-muted/20 min-h-[200px]">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Generating {templateDef?.name}…</p>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{rawText}</pre>
        </div>
      ) : templateOutput ? (
        <div className="space-y-3">
          {sections.map(section => (
            <OutputSection
              key={section.id}
              sectionId={section.id}
              label={section.label}
              content={templateOutput.sections[section.id] ?? ''}
              streaming={isStreaming}
              gaps={templateOutput.gaps ?? []}
              onRegenerate={(sid) => onRegenerate(activeTab, sid)}
              onChange={(sid, content) => onOutputChange(activeTab, sid, content)}
            />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
          No output yet. Click Generate in Step 3.
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/product-hub/output-section.tsx src/components/product-hub/step4-output-viewer.tsx
git commit -m "feat: add OutputSection (TipTap) and Step4OutputViewer components"
```

---

### Task 17: Create streaming regenerate-section endpoint

**Files:**
- Create: `src/app/api/product-hub/[id]/regenerate/route.ts`

**Step 1: Create the file:**

```typescript
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import { ensureDb } from "@/lib/server-utils";
import { getProductFeature, updateProductFeature } from "@/lib/db-imports";
import { searchDocuments, formatSearchResultsForCitations } from "../../../../../lib/search.js";
import type { TemplateId, IntakeForm } from "@/lib/types";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

const TEMPLATE_PROMPT_FILES: Record<TemplateId, string> = {
  feature_brief: 'prompts/prompt_feature_brief.md',
  prd: 'prompts/prompt_prd.md',
  tech_spec: 'prompts/prompt_tech_spec.md',
  business_case: 'prompts/prompt_business_case.md',
};

function buildIntakeText(intake: IntakeForm): string {
  const { sectionA: a, sectionB: b, sectionC: c } = intake;
  return [
    `Problem: ${a.problemStatement}`, `Persona: ${a.persona}`,
    `Status quo: ${a.statusQuo}`, `Feature: ${b.featureDescription}`,
    `User flow: ${b.userFlow}`, `Acceptance criteria: ${b.acceptanceCriteria}`,
    `KPIs: ${c.kpis}`,
    c.mustHave ? `Must Have: ${c.mustHave}` : '',
  ].filter(Boolean).join('\n');
}

export async function POST(req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const feature = getProductFeature(Number(id));
  if (!feature) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

  const body = await req.json();
  const template: TemplateId = body.template;
  const sectionId: string = body.section;

  const intake: IntakeForm = JSON.parse(feature.intake_form_json || '{}');
  const selectedDocIds: number[] = JSON.parse(feature.selected_document_ids || '[]');
  const freeContext: string = feature.free_context || '';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const systemPrompt = await fs.readFile(path.join(process.cwd(), TEMPLATE_PROMPT_FILES[template]), 'utf-8');
        const ragResults = selectedDocIds.length > 0
          ? await searchDocuments(buildIntakeText(intake), { documentIds: selectedDocIds, topK: 5 })
          : [];

        const userPrompt = [
          `# Task\nRegenerate ONLY the "${sectionId}" section of the ${template.replace('_', ' ')} document.`,
          `# Intake Form\n${buildIntakeText(intake)}`,
          ragResults.length > 0 ? `# Document Context\n${formatSearchResultsForCitations(ragResults)}` : '',
          freeContext ? `# Additional Context\n${freeContext}` : '',
          `# Output\nOutput only the content for the "${sectionId}" section. Do not include any section headers or delimiters. Start directly with the content.`,
        ].filter(Boolean).join('\n\n');

        let rawOutput = '';
        const response = await anthropic.messages.create({
          model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
          max_tokens: 3000,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            rawOutput += chunk.delta.text;
            emit({ type: 'token', content: chunk.delta.text });
          }
        }

        // Update this section in stored outputs
        const allOutputs = JSON.parse(feature.generated_outputs_json || '{}');
        if (!allOutputs[template]) allOutputs[template] = { sections: {}, gaps: [] };
        allOutputs[template].sections[sectionId] = rawOutput.trim();
        updateProductFeature(Number(id), { generated_outputs_json: JSON.stringify(allOutputs) });

        emit({ type: 'done', section: sectionId, content: rawOutput.trim() });
      } catch (e) {
        emit({ type: 'error', message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Accel-Buffering': 'no' },
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/product-hub/[id]/regenerate/route.ts
git commit -m "feat: add streaming regenerate-section endpoint"
```

---

### Task 18: Create ExportMenu component

**Files:**
- Create: `src/components/product-hub/export-menu.tsx`

**Step 1: Create the file:**

```typescript
"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { TEMPLATE_SECTIONS, TEMPLATES, type TemplateId, type GeneratedOutputs } from "@/lib/types";

interface ExportMenuProps {
  featureTitle: string;
  activeTemplate: TemplateId;
  outputs: GeneratedOutputs;
  featureId: number;
}

function outputsToMarkdown(title: string, templateId: TemplateId, outputs: GeneratedOutputs): string {
  const templateDef = TEMPLATES.find(t => t.id === templateId);
  const sections = TEMPLATE_SECTIONS[templateId] ?? [];
  const output = outputs[templateId];
  if (!output) return '';

  const lines = [`# ${title} — ${templateDef?.name ?? templateId}`, ''];
  for (const section of sections) {
    lines.push(`## ${section.label}`, '');
    // Strip HTML tags for markdown
    const content = (output.sections[section.id] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    lines.push(content, '');
  }
  return lines.join('\n');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportMenu({ featureTitle, activeTemplate, outputs, featureId }: ExportMenuProps) {
  function handleMarkdown() {
    const md = outputsToMarkdown(featureTitle, activeTemplate, outputs);
    if (!md) { toast.error('No content to export'); return; }
    const blob = new Blob([md], { type: 'text/markdown' });
    downloadBlob(blob, `${featureTitle}-${activeTemplate}.md`);
    toast.success('Markdown downloaded');
  }

  async function handleDocx() {
    try {
      const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');
      const sections = TEMPLATE_SECTIONS[activeTemplate] ?? [];
      const output = outputs[activeTemplate];
      if (!output) { toast.error('No content to export'); return; }

      const children = sections.flatMap(section => {
        const content = (output.sections[section.id] ?? '').replace(/<[^>]+>/g, '').trim();
        return [
          new Paragraph({ text: section.label, heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ children: [new TextRun(content)] }),
          new Paragraph(''),
        ];
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({ text: featureTitle, heading: HeadingLevel.TITLE }),
            new Paragraph({ text: TEMPLATES.find(t => t.id === activeTemplate)?.name ?? activeTemplate, heading: HeadingLevel.HEADING_1 }),
            new Paragraph(''),
            ...children,
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, `${featureTitle}-${activeTemplate}.docx`);
      toast.success('DOCX downloaded');
    } catch (e) {
      toast.error(`Export failed: ${String(e)}`);
    }
  }

  async function handlePdf() {
    try {
      const { jsPDF } = await import('jspdf');
      const sections = TEMPLATE_SECTIONS[activeTemplate] ?? [];
      const output = outputs[activeTemplate];
      if (!output) { toast.error('No content to export'); return; }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      let y = 20;

      function addText(text: string, fontSize: number, bold = false, color = [0, 0, 0] as [number, number, number]) {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setTextColor(...color);
        const lines = doc.splitTextToSize(text, maxWidth);
        if (y + lines.length * (fontSize * 0.4) > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage(); y = 20;
        }
        doc.text(lines, margin, y);
        y += lines.length * (fontSize * 0.4) + 4;
      }

      addText(featureTitle, 18, true);
      addText(TEMPLATES.find(t => t.id === activeTemplate)?.name ?? activeTemplate, 14, false, [80, 80, 80]);
      y += 4;

      for (const section of sections) {
        const content = (output.sections[section.id] ?? '').replace(/<[^>]+>/g, '').trim();
        if (!content) continue;
        addText(section.label, 13, true);
        addText(content, 10);
        y += 3;
      }

      doc.save(`${featureTitle}-${activeTemplate}.pdf`);
      toast.success('PDF downloaded');
    } catch (e) {
      toast.error(`Export failed: ${String(e)}`);
    }
  }

  async function handleSaveToDrive() {
    try {
      const md = outputsToMarkdown(featureTitle, activeTemplate, outputs);
      const res = await fetch(`/api/product-hub/${featureId}/export-drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: activeTemplate, content: md, title: featureTitle }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Saved to Google Drive and added to Documents tab');
    } catch (e) {
      toast.error(`Drive export failed: ${String(e)}`);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleMarkdown}>Markdown (.md)</DropdownMenuItem>
        <DropdownMenuItem onClick={handleDocx}>Word Document (.docx)</DropdownMenuItem>
        <DropdownMenuItem onClick={handlePdf}>PDF (.pdf)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSaveToDrive}>Save to Google Drive</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/product-hub/export-menu.tsx
git commit -m "feat: add ExportMenu with Markdown, DOCX, PDF, and Drive export options"
```

---

### Task 19: Create Drive export API endpoint

**Files:**
- Create: `src/app/api/product-hub/[id]/export-drive/route.ts`

**Step 1: Create the file:**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getProductFeature } from "@/lib/db-imports";
import { getGDriveClient } from "../../../../../lib/gdrive.js";
import { getAppSetting } from "@/lib/db-imports";
import { addDocument, updateDocumentMetadata, run } from "@/lib/db-imports";
import path from "path";
import fs from "fs/promises";
import { DOCUMENTS_DIR } from "../../../../../lib/paths.js";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const feature = getProductFeature(Number(id));
  if (!feature) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { template, content, title } = body;

  try {
    // Save locally first (as .md file)
    const filename = `${title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-')}-${template}.md`;
    const localPath = path.join(DOCUMENTS_DIR, filename);
    await fs.writeFile(localPath, content, 'utf-8');

    // Add to documents table
    const docId = addDocument(filename, localPath, 'product-hub', 'Product Specs');
    updateDocumentMetadata(docId, {
      doc_type: 'product_spec',
      status: 'draft',
      tags: JSON.stringify([template, 'product-hub', 'ai-generated']),
    });

    // Upload to Drive if configured
    let driveFileId: string | null = null;
    try {
      const drive = await getGDriveClient();
      const folderId = await getAppSetting('gdriveFolderId');
      if (drive && folderId) {
        const { Readable } = await import('stream');
        const fileRes = await drive.files.create({
          requestBody: {
            name: filename,
            mimeType: 'text/plain',
            parents: [folderId],
          },
          media: {
            mimeType: 'text/plain',
            body: Readable.from([content]),
          },
          fields: 'id',
        });
        driveFileId = fileRes.data.id ?? null;

        // Link gdrive_file_id to the document
        if (driveFileId) {
          run(`UPDATE documents SET gdrive_file_id = ?, sync_status = 'synced' WHERE id = ?`, [driveFileId, docId]);
        }
      }
    } catch (driveErr) {
      console.warn('Drive upload failed (non-fatal):', driveErr);
    }

    return NextResponse.json({ ok: true, documentId: docId, driveFileId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/product-hub/[id]/export-drive/route.ts
git commit -m "feat: add Drive export endpoint that saves to local docs and optionally uploads to Drive"
```

---

### Task 20: Create VersionHistoryDrawer component

**Files:**
- Create: `src/components/product-hub/version-history-drawer.tsx`

**Step 1: Create the file:**

```typescript
"use client";

import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { GeneratedOutputs } from "@/lib/types";

interface VersionSnapshot {
  timestamp: string;
  trigger: 'generate' | 'regenerate' | 'manual';
  templates: string[];
  snapshot: GeneratedOutputs;
}

interface VersionHistoryDrawerProps {
  versionHistoryJson: string | null;
  onRestore: (snapshot: GeneratedOutputs) => void;
}

export function VersionHistoryDrawer({ versionHistoryJson, onRestore }: VersionHistoryDrawerProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const history: VersionSnapshot[] = (() => {
    try { return JSON.parse(versionHistoryJson || '[]').reverse(); }
    catch { return []; }
  })();

  const selected = selectedIndex !== null ? history[selectedIndex] : null;

  if (history.length === 0) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <History className="h-3.5 w-3.5 mr-1.5" /> History
      </Button>
    );
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm">
          <History className="h-3.5 w-3.5 mr-1.5" /> History ({history.length})
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[480px] sm:w-[580px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-sm">Version History</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 overflow-hidden">
          {/* Snapshot list */}
          <div className="w-44 border-r overflow-y-auto">
            {history.map((v, i) => (
              <button
                key={i}
                onClick={() => setSelectedIndex(i)}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-xs border-b hover:bg-muted/40 transition-colors",
                  selectedIndex === i && "bg-muted",
                )}
              >
                <p className="font-medium">{new Date(v.timestamp).toLocaleDateString()}</p>
                <p className="text-muted-foreground">{new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-muted-foreground mt-0.5 capitalize">{v.trigger}</p>
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {selected ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {new Date(selected.timestamp).toLocaleString()} — {selected.trigger}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onRestore(selected.snapshot)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Restore
                  </Button>
                </div>
                {Object.entries(selected.snapshot).map(([templateId, output]) => (
                  <div key={templateId} className="border rounded p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{templateId}</p>
                    {Object.entries(output.sections).slice(0, 2).map(([sectionId, content]) => (
                      <div key={sectionId}>
                        <p className="text-xs font-medium">{sectionId}</p>
                        <p className="text-[11px] text-muted-foreground line-clamp-3">
                          {(content as string).replace(/<[^>]+>/g, '').slice(0, 200)}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                Select a version to preview
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/product-hub/version-history-drawer.tsx
git commit -m "feat: add VersionHistoryDrawer with preview and restore"
```

---

### Task 21: Create ContractLinkDialog component

**Files:**
- Create: `src/components/product-hub/contract-link-dialog.tsx`

**Step 1: Create the file:**

```typescript
"use client";

import { useState, useEffect } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Document } from "@/lib/types";

interface ContractLinkDialogProps {
  featureId: number;
  linkedContractId: number | null;
  onLinked: (contractId: number | null, contractName: string | null) => void;
}

export function ContractLinkDialog({ featureId, linkedContractId, onLinked }: ContractLinkDialogProps) {
  const [open, setOpen] = useState(false);
  const [contracts, setContracts] = useState<Document[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      fetch('/api/documents')
        .then(r => r.json())
        .then(d => setContracts(
          (d.documents || []).filter((doc: Document) => doc.doc_type === 'contract')
        ));
    }
  }, [open]);

  const filtered = contracts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSelect(contract: Document | null) {
    await fetch(`/api/product-hub/${featureId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linked_contract_id: contract?.id ?? null }),
    });
    onLinked(contract?.id ?? null, contract?.name ?? null);
    toast.success(contract ? `Linked to ${contract.name}` : 'Contract link removed');
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Link2 className="h-3.5 w-3.5 mr-1.5" />
          {linkedContractId ? 'Change Contract Link' : 'Link to Contract'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link to Contract</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Search contracts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-sm"
          />
          <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
            {linkedContractId && (
              <button
                onClick={() => handleSelect(null)}
                className="w-full text-left px-3 py-2.5 text-xs text-destructive hover:bg-muted/40"
              >
                Remove contract link
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4 text-center">No contracts found.</p>
            ) : filtered.map(c => (
              <button
                key={c.id}
                onClick={() => handleSelect(c)}
                className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <p className="text-xs font-medium">{c.name}</p>
                {c.added_at && (
                  <p className="text-[11px] text-muted-foreground">{new Date(c.added_at).toLocaleDateString()}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/product-hub/contract-link-dialog.tsx
git commit -m "feat: add ContractLinkDialog component"
```

---

### Task 22: Create the wizard page — wire all steps with auto-save

**Files:**
- Create: `src/app/product-hub/[id]/page.tsx`

This is the main orchestrator. It owns all state and delegates to step components.

**Step 1: Create the file:**

```typescript
"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WizardProgressBar } from "@/components/product-hub/wizard-progress-bar";
import { Step1IntakeForm, EMPTY_INTAKE } from "@/components/product-hub/step1-intake-form";
import { Step2DocumentContext } from "@/components/product-hub/step2-document-context";
import { Step3TemplateSelector } from "@/components/product-hub/step3-template-selector";
import { Step4OutputViewer } from "@/components/product-hub/step4-output-viewer";
import { StatusBadge } from "@/components/product-hub/status-badge";
import { ExportMenu } from "@/components/product-hub/export-menu";
import { VersionHistoryDrawer } from "@/components/product-hub/version-history-drawer";
import { ContractLinkDialog } from "@/components/product-hub/contract-link-dialog";
import type {
  ProductFeature, IntakeForm, GeneratedOutputs, FeatureStatus, TemplateId,
} from "@/lib/types";

type SaveStatus = 'saved' | 'saving' | 'unsaved';

export default function ProductHubFeaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [feature, setFeature] = useState<ProductFeature | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [generating, setGenerating] = useState(false);
  const [streamingTemplate, setStreamingTemplate] = useState<TemplateId | null>(null);
  const [streamingRawText, setStreamingRawText] = useState<Record<string, string>>({});
  const [outputs, setOutputs] = useState<GeneratedOutputs>({});
  const [editingTitle, setEditingTitle] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<Partial<ProductFeature>>({});

  // Load feature on mount
  useEffect(() => {
    fetch(`/api/product-hub/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.feature) {
          setFeature(d.feature);
          try { setOutputs(JSON.parse(d.feature.generated_outputs_json || '{}')); } catch { /**/ }
          // If feature has outputs, go straight to step 4
          if (d.feature.generated_outputs_json) setCurrentStep(4);
        }
      })
      .catch(() => toast.error('Failed to load feature'));
  }, [id]);

  // Debounced auto-save
  const scheduleSave = useCallback((patch: Partial<ProductFeature>) => {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await fetch(`/api/product-hub/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingPatchRef.current),
        });
        pendingPatchRef.current = {};
        setSaveStatus('saved');
      } catch {
        setSaveStatus('unsaved');
      }
    }, 2000);
  }, [id]);

  function updateFeature(patch: Partial<ProductFeature>) {
    setFeature(prev => prev ? { ...prev, ...patch } : null);
    scheduleSave(patch);
  }

  // Intake form helpers
  const intakeForm: IntakeForm = (() => {
    try { return JSON.parse(feature?.intake_form_json || '{}'); } catch { return EMPTY_INTAKE; }
  })();

  function handleIntakeChange(intake: IntakeForm) {
    updateFeature({ intake_form_json: JSON.stringify(intake) });
  }

  // Step 2 helpers
  const selectedDocIds: number[] = (() => {
    try { return JSON.parse(feature?.selected_document_ids || '[]'); } catch { return []; }
  })();

  function handleContextChange(docIds: number[], freeContext: string) {
    updateFeature({ selected_document_ids: JSON.stringify(docIds), free_context: freeContext });
  }

  // Step 3 helpers
  const selectedTemplates: TemplateId[] = (() => {
    try { return JSON.parse(feature?.selected_templates || '[]'); } catch { return []; }
  })();

  function handleTemplatesChange(templates: TemplateId[]) {
    updateFeature({ selected_templates: JSON.stringify(templates) });
  }

  // Generation
  async function handleGenerate() {
    if (!feature || selectedTemplates.length === 0) return;
    setGenerating(true);
    setStreamingRawText({});

    try {
      const res = await fetch(`/api/product-hub/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templates: selectedTemplates,
          intake_form_json: feature.intake_form_json,
          selected_document_ids: feature.selected_document_ids,
          free_context: feature.free_context,
        }),
      });

      if (!res.ok) throw new Error('Generation failed');
      setCurrentStep(4);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'template_start') {
              setStreamingTemplate(event.template);
            } else if (event.type === 'raw_token') {
              setStreamingRawText(prev => ({
                ...prev,
                [event.template]: (prev[event.template] ?? '') + event.content,
              }));
            } else if (event.type === 'template_complete') {
              setOutputs(prev => ({
                ...prev,
                [event.template]: { sections: event.sections, gaps: event.gaps ?? [] },
              }));
              setStreamingTemplate(null);
            } else if (event.type === 'done') {
              // Refresh feature to get saved outputs + version history
              const refreshed = await fetch(`/api/product-hub/${id}`).then(r => r.json());
              if (refreshed.feature) setFeature(refreshed.feature);
            } else if (event.type === 'error') {
              toast.error(`Generation error: ${event.message}`);
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (e) {
      toast.error(`Generation failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
      setStreamingTemplate(null);
    }
  }

  // Section regeneration
  async function handleRegenerate(template: TemplateId, section?: string) {
    if (!section) { handleGenerate(); return; }
    setStreamingTemplate(template);

    try {
      const res = await fetch(`/api/product-hub/${id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, section }),
      });
      if (!res.ok) throw new Error('Regeneration failed');

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'done') {
              setOutputs(prev => ({
                ...prev,
                [template]: {
                  sections: { ...(prev[template]?.sections ?? {}), [event.section]: event.content },
                  gaps: prev[template]?.gaps ?? [],
                },
              }));
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      toast.error(`Regeneration failed: ${String(e)}`);
    } finally {
      setStreamingTemplate(null);
    }
  }

  function handleOutputChange(template: TemplateId, sectionId: string, content: string) {
    setOutputs(prev => ({
      ...prev,
      [template]: {
        sections: { ...(prev[template]?.sections ?? {}), [sectionId]: content },
        gaps: prev[template]?.gaps ?? [],
      },
    }));
    // Auto-save outputs
    updateFeature({ generated_outputs_json: JSON.stringify({
      ...outputs,
      [template]: {
        sections: { ...(outputs[template]?.sections ?? {}), [sectionId]: content },
        gaps: outputs[template]?.gaps ?? [],
      },
    })});
  }

  function handleVersionRestore(snapshot: GeneratedOutputs) {
    setOutputs(snapshot);
    updateFeature({ generated_outputs_json: JSON.stringify(snapshot) });
    toast.success('Version restored');
  }

  if (!feature) {
    return <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => router.push('/product-hub')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>

        {editingTitle ? (
          <Input
            autoFocus
            value={feature.title}
            onChange={(e) => updateFeature({ title: e.target.value })}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
            className="h-8 text-base font-semibold w-60"
          />
        ) : (
          <button onClick={() => setEditingTitle(true)} className="text-base font-semibold hover:underline decoration-dashed underline-offset-4">
            {feature.title}
          </button>
        )}

        <StatusBadge
          status={feature.status}
          editable
          onChange={(status) => updateFeature({ status })}
        />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : '●'}
          </span>
          {currentStep === 4 && (
            <>
              <VersionHistoryDrawer
                versionHistoryJson={feature.version_history_json}
                onRestore={handleVersionRestore}
              />
              <ExportMenu
                featureTitle={feature.title}
                activeTemplate={selectedTemplates[0] ?? 'prd'}
                outputs={outputs}
                featureId={feature.id}
              />
              <ContractLinkDialog
                featureId={feature.id}
                linkedContractId={feature.linked_contract_id}
                onLinked={(contractId) => updateFeature({ linked_contract_id: contractId })}
              />
            </>
          )}
        </div>
      </div>

      {/* Progress */}
      <WizardProgressBar
        currentStep={currentStep}
        intakeFormJson={feature.intake_form_json}
        onStepClick={(step) => {
          if (step < currentStep || (step === 4 && Object.keys(outputs).length > 0)) {
            setCurrentStep(step);
          }
        }}
      />

      {/* Steps */}
      {currentStep === 1 && (
        <Step1IntakeForm
          value={intakeForm}
          onChange={handleIntakeChange}
          onContinue={() => setCurrentStep(2)}
        />
      )}

      {currentStep === 2 && (
        <Step2DocumentContext
          selectedDocIds={selectedDocIds}
          freeContext={feature.free_context ?? ''}
          onChange={handleContextChange}
          onBack={() => setCurrentStep(1)}
          onContinue={() => setCurrentStep(3)}
        />
      )}

      {currentStep === 3 && (
        <Step3TemplateSelector
          selectedTemplates={selectedTemplates}
          generating={generating}
          onChange={handleTemplatesChange}
          onBack={() => setCurrentStep(2)}
          onGenerate={handleGenerate}
        />
      )}

      {currentStep === 4 && (
        <Step4OutputViewer
          selectedTemplates={selectedTemplates.length > 0 ? selectedTemplates : Object.keys(outputs) as TemplateId[]}
          outputs={outputs}
          streamingTemplate={streamingTemplate}
          streamingRawText={streamingRawText}
          onRegenerate={handleRegenerate}
          onOutputChange={handleOutputChange}
          onRegenerateAll={handleGenerate}
        />
      )}
    </div>
  );
}
```

**Step 2: Test in browser**

1. Navigate to `http://localhost:3000/product-hub`
2. Click "New Feature" — should navigate to `/product-hub/1`
3. Fill in the Step 1 form and click Continue
4. Select documents in Step 2 and click Continue
5. Select a template in Step 3 and click Generate
6. Watch the streaming output appear in Step 4 tabs

**Step 3: Commit**

```bash
git add src/app/product-hub/[id]/page.tsx
git commit -m "feat: add Product Hub wizard page with auto-save and streaming generation"
```

---

### Task 23: Update database schema documentation

**Files:**
- Modify: `docs/database-schema.md` — append product_features table description

**Step 1: Append to the end of `docs/database-schema.md`:**

```markdown
---

### product_features

Feature definitions and AI-generated product documentation.

**Columns:**

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique feature identifier |
| title | TEXT | Feature display name |
| intake_form_json | TEXT | JSON: Step 1 form answers (sections A, B, C) |
| selected_document_ids | TEXT | JSON array of document IDs used as context |
| free_context | TEXT | Free-text context from Step 2 |
| selected_templates | TEXT | JSON array: template IDs selected for generation |
| generated_outputs_json | TEXT | JSON: generated content per template with sections and gaps |
| status | TEXT | Pipeline status (idea, in_spec, in_review, approved, in_development, shipped) |
| version_history_json | TEXT | JSON array of output snapshots (max 20, oldest dropped) |
| linked_contract_id | INTEGER | FK to documents.id (linked contract) |
| created_by | TEXT | Creator identifier |
| created_at | DATETIME | Creation timestamp |
| updated_at | DATETIME | Last update timestamp |

**Indexes:**
- PRIMARY KEY (id)
- INDEX (status)
- INDEX (created_at)
```

**Step 2: Commit**

```bash
git add docs/database-schema.md
git commit -m "docs: add product_features table to database schema documentation"
```

---

## Execution Checklist

- [ ] Task 1: Install packages
- [ ] Task 2: DB table
- [ ] Task 3: CRUD functions + db-imports
- [ ] Task 4: TypeScript types
- [ ] Task 5: Sidebar entry
- [ ] Task 6: GET + POST list/create API
- [ ] Task 7: GET + PATCH + DELETE single API
- [ ] Task 8: StatusBadge component
- [ ] Task 9: ProductFeatureCard component
- [ ] Task 10: List view page
- [ ] Task 11: WizardProgressBar component
- [ ] Task 12: Step1IntakeForm component
- [ ] Task 13: Step2DocumentContext component
- [ ] Task 14: Step3TemplateSelector component
- [ ] Task 15: Streaming generate endpoint
- [ ] Task 16: OutputSection + Step4OutputViewer (TipTap)
- [ ] Task 17: Streaming regenerate endpoint
- [ ] Task 18: ExportMenu component
- [ ] Task 19: Drive export API endpoint
- [ ] Task 20: VersionHistoryDrawer component
- [ ] Task 21: ContractLinkDialog component
- [ ] Task 22: Wizard page (orchestrates all steps)
- [ ] Task 23: Update database schema docs
