# Plan 027 — Polish Legal Templates

**Status:** Awaiting approval
**Module:** Legal Hub — Templates
**Depends on:** Plan 022 (Legal Hub base), `lib/templateEngine.js`

---

## Problem Statement

The Legal Hub ships with no pre-built templates. Lawyers must author every document from scratch, which is time-consuming and error-prone. Three foundational Polish legal documents — a payment demand letter, a civil claim, and a reply brief — should be available out of the box, pre-wired to all auto-resolved case tokens.

---

## Goal

1. Seed 3 professional Polish legal templates into every deployment via `initDb()`, idempotently.
2. Protect those templates from accidental deletion (backend 403 + UI button hidden).
3. Expose 6 additional tokens (already engine-supported but hidden from users) in the variable reference panel.

---

## Architecture

```
initDb() [lib/db.js]
    ├── ALTER TABLE case_templates ADD COLUMN is_system_template INTEGER DEFAULT 0
    └── initSystemTemplates()
            └── INSERT by name (idempotent check) × 3 templates

Template list UI [template-list.tsx]
    └── hide Delete button when template.is_system_template === 1

DELETE /api/legal-hub/templates/[id] [route.ts]
    └── return 403 if existing.is_system_template === 1

PATCH /api/legal-hub/templates/[id] [route.ts]
    └── is_system_template excluded from allowedKeys (cannot be overwritten)

Template editor [template-form.tsx]
    └── VARIABLE_REFERENCE extended with 6 additional tokens

CaseTemplate interface [src/lib/types.ts]
    └── is_system_template?: number added
```

The template engine (`lib/templateEngine.js`) and the case generation tab (`case-generate-tab.tsx`) require **no changes** — they already handle all tokens used in the 3 templates generically.

---

## Variable Mapping

### Auto-resolved tokens (replaced by `fillTemplate`)

| Token | Source |
|---|---|
| `{{today}}` | JS `new Date()` formatted pl-PL |
| `{{case.reference_number}}` | `legal_cases.reference_number` |
| `{{case.title}}` | `legal_cases.title` |
| `{{case.court}}` | `legal_cases.court` |
| `{{case.court_division}}` | `legal_cases.court_division` |
| `{{case.judge}}` | `legal_cases.judge` |
| `{{case.status}}` | `legal_cases.status` |
| `{{case.summary}}` | `legal_cases.summary` |
| `{{case.claim_value}}` | `legal_cases.claim_value` |
| `{{case.claim_currency}}` | `legal_cases.claim_currency` |
| `{{case.claim_description}}` | `legal_cases.claim_description` |
| `{{case.procedure_type}}` | `legal_cases.procedure_type` |
| `{{case.case_type}}` | `legal_cases.case_type` |
| `{{case.internal_number}}` | `legal_cases.internal_number` |
| `{{parties.plaintiff.name}}` | party row where `party_type = 'plaintiff'` |
| `{{parties.plaintiff.address}}` | plaintiff party row |
| `{{parties.plaintiff.notes}}` | plaintiff party row (NIP/REGON if user entered it) |
| `{{parties.defendant.name}}` | party row where `party_type = 'defendant'` |
| `{{parties.defendant.address}}` | defendant party row |
| `{{parties.defendant.notes}}` | defendant party row (NIP/REGON if user entered it) |
| `{{parties.representative.representative_name}}` | first party row with `representative_name` set |
| `{{parties.representative.representative_address}}` | same party row |
| `{{deadlines.next.title}}` | nearest upcoming deadline title |
| `{{deadlines.next.due_date}}` | nearest upcoming deadline date |

### Manual placeholders (remain in generated document for user to complete)

| Placeholder | Purpose |
|---|---|
| `[UZUPEŁNIJ: miejscowość]` | City of execution — no city field in DB |
| `[UZUPEŁNIJ: pełnomocnictwo z dnia …]` | Power of attorney date |
| `[UZUPEŁNIJ: rodzaj stosunku prawnego…]` | Legal basis (contract type, invoice ref) |
| `[UZUPEŁNIJ: rodzaj i wysokość odsetek…]` | Interest type and rate |
| `[UZUPEŁNIJ: kwota łączna]` | Total amount including interest |
| `[UZUPEŁNIJ: numer rachunku bankowego]` | Bank account number — no bank field in DB |
| `[UZUPEŁNIJ: tytuł przelewu…]` | Wire transfer title |
| `[UZUPEŁNIJ: sygnatura akt sądowych]` | Court file reference — no court sygnatura field in DB |
| `[UZUPEŁNIJ: tytuł zawodowy…]` | Professional title (adwokat/radca prawny) |
| `[UZUPEŁNIJ: lista załączników…]` | List of attachments |
| `[UZUPEŁNIJ: wykaz dowodów…]` | List of evidence with theses |
| `[UZUPEŁNIJ: podstawa prawna roszczenia…]` | Specific legal basis for claim |
| `[UZUPEŁNIJ: uzasadnienie właściwości sądu…]` | Court jurisdiction justification |
| `[UZUPEŁNIJ: próby polubownego rozwiązania…]` | Pre-litigation attempt info |
| `[UZUPEŁNIJ: treść zarzutu pozwanego]` | Defendant's objection text |
| `[UZUPEŁNIJ: stanowisko powoda]` | Plaintiff's reply to each objection |

---

## Tasks

- [ ] Task 1: DB Migration + System Template Seeding
- [ ] Task 2: Variable Reference Panel + System Template Protection

---

### Task 1 — DB Migration + System Template Seeding

**Files:** `lib/db.js`

**What to do:**

1. After the `CREATE TABLE IF NOT EXISTS case_templates` block (~line 542), add the column migration following the existing `try/catch` pattern:

```js
try {
  db.run(`ALTER TABLE case_templates ADD COLUMN is_system_template INTEGER DEFAULT 0`);
} catch (e) {
  // Column already exists, ignore
}
```

2. Add an `initSystemTemplates()` function that idempotently seeds the 3 templates. Check existence by `name` with `SELECT COUNT(*) FROM case_templates WHERE name = ?` before each insert. Call it at the end of `initDb()`.

**Template 1 — Wezwanie do zapłaty**

```
name:          "Wezwanie do zapłaty"
description:   "Formalne przedsądowe wezwanie do zapłaty z uzupełnieniem danych sprawy i należności."
document_type: "wezwanie"
is_system_template: 1
template_body:
```

```html
<h1>WEZWANIE DO ZAPŁATY</h1>
<p><strong>[UZUPEŁNIJ: miejscowość]</strong>, dnia {{today}}</p>
<p><strong>Wierzyciel (Mocodawca):</strong><br>{{parties.plaintiff.name}}<br>{{parties.plaintiff.address}}<br>NIP/REGON: {{parties.plaintiff.notes}}</p>
<p><strong>Pełnomocnik wierzyciela:</strong><br>{{parties.representative.representative_name}}<br>{{parties.representative.representative_address}}</p>
<hr>
<p><strong>Dłużnik:</strong><br>{{parties.defendant.name}}<br>{{parties.defendant.address}}<br>NIP/REGON: {{parties.defendant.notes}}</p>
<p>Ref. sprawy: {{case.reference_number}}</p>
<h2>Wezwanie do zapłaty</h2>
<p>Działając jako pełnomocnik {{parties.plaintiff.name}}, na podstawie udzielonego pełnomocnictwa [UZUPEŁNIJ: pełnomocnictwo z dnia …], niniejszym wzywam do niezwłocznego uregulowania zaległego świadczenia pieniężnego.</p>
<h2>I. Podstawa roszczenia</h2>
<p>{{case.claim_description}}</p>
<p>Tytuł prawny: [UZUPEŁNIJ: rodzaj stosunku prawnego, np. umowa z dnia … nr …, faktura VAT nr … z dnia …].</p>
<h2>II. Wysokość roszczenia</h2>
<p>Łączna kwota wymagalnej należności głównej wynosi: <strong>{{case.claim_value}} {{case.claim_currency}}</strong>.</p>
<p>Do powyższej kwoty dolicza się odsetki: [UZUPEŁNIJ: rodzaj i wysokość odsetek, np. ustawowe odsetki za opóźnienie w transakcjach handlowych, naliczane od dnia … do dnia zapłaty].</p>
<p>Łączna kwota zadłużenia na dzień sporządzenia niniejszego pisma (należność główna wraz z odsetkami): [UZUPEŁNIJ: kwota łączna] {{case.claim_currency}}.</p>
<h2>III. Termin i rachunek bankowy do zapłaty</h2>
<p>Wzywam do zapłaty wyżej wymienionej kwoty w terminie do dnia <strong>{{deadlines.next.due_date}}</strong> na rachunek bankowy:</p>
<p>Nr rachunku: [UZUPEŁNIJ: numer rachunku bankowego]<br>Właściciel rachunku: {{parties.plaintiff.name}}<br>Tytuł przelewu: [UZUPEŁNIJ: tytuł przelewu, np. zapłata należności z tytułu umowy/faktury …]</p>
<h2>IV. Skutki braku zapłaty</h2>
<p>W przypadku bezskutecznego upływu powyższego terminu {{parties.plaintiff.name}} zastrzega sobie prawo skierowania sprawy na drogę postępowania sądowego i dochodzenia należności w trybie przymusowym, wraz z żądaniem zwrotu kosztów postępowania, w tym kosztów zastępstwa procesowego.</p>
<p>Z poważaniem,</p>
<p>{{parties.representative.representative_name}}<br>[UZUPEŁNIJ: tytuł zawodowy, np. adwokat/radca prawny]<br>{{parties.representative.representative_address}}</p>
<p><strong>Załączniki:</strong><br>[UZUPEŁNIJ: lista załączników, np. kopia faktury, kopia umowy, kopia pełnomocnictwa]</p>
```

**Template 2 — Pozew**

```
name:          "Pozew"
description:   "Profesjonalny szablon pozwu do wykorzystania w sprawach cywilnych i gospodarczych."
document_type: "pozew"
is_system_template: 1
template_body:
```

```html
<p><strong>[UZUPEŁNIJ: miejscowość]</strong>, dnia {{today}}</p>
<p><strong>{{case.court}}</strong><br>{{case.court_division}}</p>
<p><strong>Powód:</strong><br>{{parties.plaintiff.name}}<br>{{parties.plaintiff.address}}<br>NIP/REGON/PESEL: {{parties.plaintiff.notes}}<br>reprezentowany przez: {{parties.representative.representative_name}}, {{parties.representative.representative_address}}, na podstawie pełnomocnictwa złożonego do akt sprawy</p>
<p><strong>Pozwany:</strong><br>{{parties.defendant.name}}<br>{{parties.defendant.address}}<br>NIP/REGON/PESEL: {{parties.defendant.notes}}</p>
<h1>POZEW O ZAPŁATĘ</h1>
<p>Wartość przedmiotu sporu: <strong>{{case.claim_value}} {{case.claim_currency}}</strong></p>
<h2>I. Żądanie pozwu</h2>
<p>Działając w imieniu i na rzecz powoda {{parties.plaintiff.name}}, na podstawie udzielonego pełnomocnictwa, wnoszę o:</p>
<ol>
  <li>zasądzenie od pozwanego {{parties.defendant.name}} na rzecz powoda {{parties.plaintiff.name}} kwoty <strong>{{case.claim_value}} {{case.claim_currency}}</strong> wraz z odsetkami [UZUPEŁNIJ: rodzaj odsetek, np. ustawowymi odsetkami za opóźnienie w transakcjach handlowych] od dnia [UZUPEŁNIJ: data wymagalności] do dnia zapłaty;</li>
  <li>zasądzenie od pozwanego kosztów postępowania, w tym kosztów zastępstwa procesowego według norm przepisanych;</li>
  <li>[UZUPEŁNIJ: inne żądania, np. nadanie wyrokowi rygoru natychmiastowej wykonalności — usunąć, jeśli nieaktualne].</li>
</ol>
<h2>II. Uzasadnienie</h2>
<h3>Stan faktyczny</h3>
<p>{{case.summary}}</p>
<p>{{case.claim_description}}</p>
<p>[UZUPEŁNIJ: rozszerzony opis stanu faktycznego — okoliczności zawarcia umowy/powstania zobowiązania, wykonania świadczenia przez powoda, daty wymagalności roszczenia, wezwanie do zapłaty z dnia … i jego bezskuteczność]</p>
<h3>Podstawa prawna</h3>
<p>[UZUPEŁNIJ: podstawa prawna roszczenia — np. art. 471 k.c. (odpowiedzialność kontraktowa), art. 535 k.c. (umowa sprzedaży), art. 6 ust. 1 ustawy o terminach zapłaty w transakcjach handlowych, lub inna adekwatna podstawa]</p>
<h3>Właściwość sądu</h3>
<p>[UZUPEŁNIJ: uzasadnienie właściwości miejscowej i rzeczowej sądu — np. właściwość ogólna wg miejsca zamieszkania/siedziby pozwanego (art. 27 k.p.c.), właściwość przemienna wg miejsca wykonania zobowiązania (art. 34 k.p.c.), lub właściwość wyłączna]</p>
<h3>Próby polubownego rozwiązania sporu</h3>
<p>[UZUPEŁNIJ: informacja o podjętych próbach polubownego rozwiązania — np. wezwanie do zapłaty z dnia … pozostało bez odpowiedzi / pozwany odmówił zapłaty. Należy wskazać przyczynę niezachowania przedsądowej próby ugodowej, jeśli art. 187 § 1 pkt 3 k.p.c. tego wymaga]</p>
<h2>III. Dowody</h2>
<p>Na potwierdzenie powyższego powód wnosi o przeprowadzenie następujących dowodów:</p>
<p>[UZUPEŁNIJ: wykaz dowodów z tezami dowodowymi, np.:<br>
1. dowód z dokumentu: umowa z dnia … — na okoliczność zawarcia stosunku zobowiązaniowego i jego treści;<br>
2. dowód z dokumentu: faktura VAT nr … z dnia … — na okoliczność wymagalności roszczenia;<br>
3. dowód z dokumentu: wezwanie do zapłaty z dnia … wraz z dowodem doręczenia — na okoliczność bezskuteczności wezwania;<br>
4. [inne dowody wedle potrzeb]]</p>
<p>Z poważaniem,</p>
<p>{{parties.representative.representative_name}}<br>[UZUPEŁNIJ: tytuł zawodowy, np. adwokat/radca prawny]<br>{{parties.representative.representative_address}}</p>
<p><strong>Załączniki:</strong><br>[UZUPEŁNIJ: lista załączników, np.:<br>
1. Pełnomocnictwo — 1 egz.<br>
2. Odpis pozwu dla pozwanego — 1 egz.<br>
3. Dowód uiszczenia opłaty od pozwu<br>
4. Umowa / faktura / wezwanie do zapłaty]</p>
```

**Template 3 — Replika**

```
name:          "Replika do odpowiedzi na pozew / replika do sprzeciwu od nakazu zapłaty"
description:   "Profesjonalny szablon repliki na odpowiedź na pozew albo na sprzeciw od nakazu zapłaty."
document_type: "replika"
is_system_template: 1
template_body:
```

```html
<p><strong>[UZUPEŁNIJ: miejscowość]</strong>, dnia {{today}}</p>
<p><strong>{{case.court}}</strong><br>{{case.court_division}}</p>
<p>Sygnatura akt: [UZUPEŁNIJ: sygnatura akt sądowych]</p>
<p><strong>Powód:</strong> {{parties.plaintiff.name}}<br><strong>Pozwany:</strong> {{parties.defendant.name}}<br>Pełnomocnik powoda: {{parties.representative.representative_name}}, {{parties.representative.representative_address}}</p>
<h1>REPLIKA DO [UZUPEŁNIJ: ODPOWIEDZI NA POZEW / SPRZECIWU OD NAKAZU ZAPŁATY]</h1>
<p>Działając jako pełnomocnik powoda {{parties.plaintiff.name}}, w odpowiedzi na [UZUPEŁNIJ: odpowiedź na pozew / sprzeciw od nakazu zapłaty] pozwanego {{parties.defendant.name}} z dnia [UZUPEŁNIJ: data pisma pozwanego], wnoszę o:</p>
<h2>I. Wnioski procesowe</h2>
<ol>
  <li>[UZUPEŁNIJ: utrzymanie nakazu zapłaty w mocy / oddalenie powództwa wzajemnego / oddalenie wniosków pozwanego — wedle potrzeb]</li>
  <li>zasądzenie od pozwanego kosztów postępowania, w tym kosztów zastępstwa procesowego.</li>
</ol>
<h2>II. Stanowisko powoda</h2>
<p>Powód podtrzymuje w całości powództwo oraz twierdzenia faktyczne i prawne zawarte w pozwie.</p>
<p>Twierdzenia i zarzuty zawarte w [UZUPEŁNIJ: odpowiedzi na pozew / sprzeciwie] są nieuzasadnione. [UZUPEŁNIJ: ogólna charakterystyka linii obrony pozwanego i dlaczego jest ona bezzasadna]</p>
<h2>III. Odpowiedź na poszczególne zarzuty pozwanego</h2>
<h3>Zarzut 1: [UZUPEŁNIJ: treść zarzutu pozwanego]</h3>
<p>[UZUPEŁNIJ: szczegółowe stanowisko powoda — przyznanie / zaprzeczenie / kontrargumentacja. Przykład: Zarzut ten jest chybiony. Pozwany twierdzi, że …, jednakże …]</p>
<h3>Zarzut 2: [UZUPEŁNIJ: treść zarzutu pozwanego]</h3>
<p>[UZUPEŁNIJ: stanowisko powoda]</p>
<p><em>[Dodać kolejne punkty według liczby zarzutów. Usunąć punkty nieaktualne.]</em></p>
<h2>IV. Wyjaśnienia i uzupełnienie stanu faktycznego</h2>
<p>{{case.summary}}</p>
<p>[UZUPEŁNIJ: wyjaśnienia dotyczące okoliczności podnoszonych lub kwestionowanych przez pozwanego, sprostowanie błędnych twierdzeń, dodatkowe fakty istotne dla rozstrzygnięcia]</p>
<h2>V. Nowe dowody</h2>
<p>[UZUPEŁNIJ: wskazanie nowych dowodów powołanych w replice z uzasadnieniem, że ich powołanie wcześniej nie było możliwe albo potrzeba ich powołania wynikła dopiero z treści odpowiedzi/sprzeciwu. Jeżeli brak nowych dowodów — usunąć ten punkt.]</p>
<h2>Podsumowanie</h2>
<p>Mając na uwadze powyższe, powód wnosi o rozstrzygnięcie zgodne z żądaniami pozwu.</p>
<p>Z poważaniem,</p>
<p>{{parties.representative.representative_name}}<br>[UZUPEŁNIJ: tytuł zawodowy, np. adwokat/radca prawny]<br>{{parties.representative.representative_address}}</p>
<p><strong>Załączniki:</strong><br>[UZUPEŁNIJ: lista nowych załączników powołanych w replice]</p>
```

**Success criteria:**
- App starts without errors.
- `case_templates` table has `is_system_template` column.
- 3 templates visible at `/legal-hub/templates` with `is_system_template = 1`.
- Re-running `initDb()` does not create duplicate templates.
- Existing user-created templates are unaffected.

---

### Task 2 — Variable Reference Panel + System Template Protection

**Files:**
- `src/lib/types.ts`
- `src/components/legal-hub/template-form.tsx`
- `src/components/legal-hub/template-list.tsx`
- `src/app/api/legal-hub/templates/[id]/route.ts`

**`src/lib/types.ts`**

Add `is_system_template?: number` to the `CaseTemplate` interface after `is_active: number`.

**`src/components/legal-hub/template-form.tsx`**

Append 6 entries to the `VARIABLE_REFERENCE` array after the existing last entry:

```ts
{ token: "{{parties.plaintiff.notes}}", description: "Dodatkowe dane powoda (np. NIP/REGON)" },
{ token: "{{parties.defendant.notes}}", description: "Dodatkowe dane pozwanego (np. NIP/REGON)" },
{ token: "{{parties.representative.representative_address}}", description: "Adres pełnomocnika / kancelarii" },
{ token: "{{case.procedure_type}}", description: "Tryb postępowania" },
{ token: "{{case.case_type}}", description: "Typ sprawy" },
{ token: "{{case.internal_number}}", description: "Wewnętrzny numer akt" },
```

**`src/components/legal-hub/template-list.tsx`**

Conditionally hide the Delete button for system templates:

```tsx
{!template.is_system_template && (
  <Button variant="destructive" onClick={() => handleDelete(template.id)}>
    Usuń
  </Button>
)}
```

**`src/app/api/legal-hub/templates/[id]/route.ts`**

In the DELETE handler, after fetching the existing template, add:

```ts
if (existing.is_system_template === 1) {
  return NextResponse.json(
    { error: "System templates cannot be deleted" },
    { status: 403 }
  );
}
```

In the PATCH handler, ensure `is_system_template` is not in `allowedKeys` (add a comment documenting this as intentional).

**Success criteria:**
- Variable reference panel shows all 6 new tokens (total: 24).
- Delete button absent for the 3 system templates.
- `DELETE /api/legal-hub/templates/:id` returns `403` for system template IDs.
- `PATCH` with `{ "is_system_template": 0 }` ignores that field.
- User-created templates can still be deleted and edited normally.
- TypeScript compiles without errors.

---

## Key Files Changed

| File | Change |
|---|---|
| `lib/db.js` | Add `is_system_template` migration; `initSystemTemplates()` seed function; call from `initDb()` |
| `src/lib/types.ts` | Add `is_system_template?: number` to `CaseTemplate` |
| `src/components/legal-hub/template-form.tsx` | Extend `VARIABLE_REFERENCE` with 6 tokens |
| `src/components/legal-hub/template-list.tsx` | Conditionally hide Delete for system templates |
| `src/app/api/legal-hub/templates/[id]/route.ts` | 403 guard on DELETE; document exclusion in PATCH |

---

## Assumptions

1. `parties.notes` is a free-text field; the templates use `{{parties.plaintiff.notes}}` and `{{parties.defendant.notes}}` for NIP/REGON. If a party has no notes, the token resolves to an empty string (existing engine behavior).
2. `{{parties.representative.representative_address}}` resolves via the same generic party-field resolution already used for `representative_name` — confirmed working by the engine implementation in `lib/templateEngine.js:65–66`.
3. Manual `[UZUPEŁNIJ: ...]` placeholders pass through `fillTemplate` unchanged. They are intentional signals for the lawyer to complete before filing.
4. No UI for managing `is_system_template` is needed; the flag is set only at seed time and is immutable thereafter.
5. The court sygnatura (sygnatura akt) is treated as a manual placeholder in all 3 templates because `legal_cases.reference_number` is the firm's internal number, not the court-assigned file reference. This can be revisited if a `court_case_number` column is added in a future plan.
