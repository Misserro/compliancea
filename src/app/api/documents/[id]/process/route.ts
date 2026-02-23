import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { ensureDb, extractTextFromPath } from "@/lib/server-utils";
import {
  getDocumentById,
  updateDocumentMetadata,
  updateDocumentProcessed,
  deleteChunksByDocumentId,
  addChunksBatch,
  addLineageEntry,
  insertObligation,
  getObligationById,
  createTaskForObligation,
  getAllDocuments,
  addPendingReplacement,
  getAppSetting,
} from "@/lib/db-imports";
import { chunkText, countWords } from "@/lib/chunker-imports";
import { getEmbedding, embeddingToBuffer, checkEmbeddingStatus } from "@/lib/embeddings-imports";
import { computeContentHash, computeFileHash, findDuplicates, findNearDuplicates } from "@/lib/hashing-imports";
import { extractMetadata } from "@/lib/auto-tagger-imports";
import { logAction } from "@/lib/audit-imports";
import { extractContractTerms } from "@/lib/contracts-imports";
import { evaluateDocument, applyActions } from "@/lib/policies-imports";
import { nameSimilarity } from "@/lib/diff-imports";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const documentId = parseInt(id, 10);

  try {
    const document = getDocumentById(documentId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Check if file still exists
    try {
      await fs.access(document.path);
    } catch {
      return NextResponse.json({ error: "Document file not found on disk" }, { status: 404 });
    }

    // Extract text
    const text = await extractTextFromPath(document.path);
    if (!text) {
      return NextResponse.json({ error: "Could not extract text from document" }, { status: 400 });
    }

    const wordCount = countWords(text);

    // Compute content hash and file hash
    const contentHash = computeContentHash(text);
    let fileHash = null;
    try {
      const fileBuffer = await fs.readFile(document.path);
      fileHash = computeFileHash(fileBuffer);
    } catch {
      // File hash is optional
    }

    // Store hashes
    updateDocumentMetadata(documentId, {
      content_hash: contentHash,
      file_hash: fileHash,
    });

    // Check for duplicates
    let duplicateInfo = null;
    const duplicates = findDuplicates(contentHash, fileHash, documentId);
    if (duplicates.contentMatches.length > 0 || duplicates.fileMatches.length > 0) {
      duplicateInfo = duplicates;
      for (const dup of duplicates.contentMatches) {
        addLineageEntry(documentId, dup.id, "duplicate_of", 1.0);
      }
      logAction("document", documentId, "duplicate_detected", duplicateInfo);
    }

    // Auto-tag document metadata
    let autoTagResult = null;
    try {
      autoTagResult = await extractMetadata(text);

      const metadataUpdate: Record<string, unknown> = {
        doc_type: autoTagResult.doc_type,
        client: autoTagResult.client,
        jurisdiction: autoTagResult.jurisdiction,
        sensitivity: autoTagResult.sensitivity,
        language: autoTagResult.language,
        in_force: autoTagResult.in_force,
        auto_tags: JSON.stringify(autoTagResult.tags),
        tags: JSON.stringify(autoTagResult.tags),
        confirmed_tags: 0,
      };

      // Assign category if AI identified one
      if (autoTagResult.category) {
        metadataUpdate.category = autoTagResult.category;
      }

      // Set status based on document type
      const currentDoc = getDocumentById(documentId);
      const isContractType = autoTagResult.doc_type === "contract" || autoTagResult.doc_type === "agreement";
      if (isContractType) {
        if (!currentDoc.status || currentDoc.status === "draft") {
          metadataUpdate.status = "unsigned";
        }
      } else if (autoTagResult.suggested_status && (!currentDoc.status || currentDoc.status === "draft")) {
        metadataUpdate.status = autoTagResult.suggested_status;
      }

      // Store summary and structured tags in metadata_json
      const existingMeta = currentDoc.metadata_json ? JSON.parse(currentDoc.metadata_json) : {};
      if (autoTagResult.summary) {
        existingMeta.summary = autoTagResult.summary;
      }
      if (autoTagResult.structured_tags) {
        existingMeta.structured_tags = autoTagResult.structured_tags;
      }
      metadataUpdate.metadata_json = JSON.stringify(existingMeta);

      updateDocumentMetadata(documentId, metadataUpdate);

      logAction("document", documentId, "tagged", {
        auto: true,
        doc_type: autoTagResult.doc_type,
        category: autoTagResult.category,
        jurisdiction: autoTagResult.jurisdiction,
        sensitivity: autoTagResult.sensitivity,
        in_force: autoTagResult.in_force,
        suggested_status: autoTagResult.suggested_status,
        tagCount: autoTagResult.tags.length,
      });
    } catch (tagErr: unknown) {
      const msg = tagErr instanceof Error ? tagErr.message : "Unknown error";
      console.warn("Auto-tagging failed:", msg);
    }

    // ---- CONTRACT-SPECIFIC PIPELINE ----
    const taggedDoc = getDocumentById(documentId);
    const isContract = taggedDoc.doc_type === "contract" || taggedDoc.doc_type === "agreement";

    if (isContract) {
      // Store full text for contracts (no chunking)
      updateDocumentMetadata(documentId, { full_text: text });

      // Delete any existing chunks if reprocessing
      deleteChunksByDocumentId(documentId);

      // Mark document as processed
      updateDocumentProcessed(documentId, wordCount);

      // Auto-extract obligations via Claude
      let contractResult = null;
      const createdObligations: unknown[] = [];
      let tasksCreated = 0;

      try {
        contractResult = await extractContractTerms(text);

        // Store contract dates in metadata
        const contractMeta = taggedDoc.metadata_json ? JSON.parse(taggedDoc.metadata_json) : {};
        if (contractResult.parties && contractResult.parties.length > 0) {
          contractMeta.parties = contractResult.parties;
        }
        if (contractResult.effective_date) contractMeta.effective_date = contractResult.effective_date;
        if (contractResult.expiry_date) contractMeta.expiry_date = contractResult.expiry_date;
        updateDocumentMetadata(documentId, { metadata_json: JSON.stringify(contractMeta) });

        // Map contract status to the obligation stage that should be active
        const statusToActiveStage: Record<string, string> = {
          unsigned: "not_signed",
          signed: "signed",
          active: "active",
          terminated: "terminated",
        };
        const currentActiveStage = statusToActiveStage[taggedDoc.status || "unsigned"] || "not_signed";

        // Insert obligations with stage assignments
        const today = new Date().toISOString().split("T")[0];

        for (const ob of contractResult.obligations) {
          const shouldBeActive = ob.stage === currentActiveStage;

          // For payment obligations with multiple due_dates, split into separate records
          if (ob.category === "payments" && ob.due_dates.length > 1) {
            const sortedDueDates = [...ob.due_dates].sort((a: { date?: string }, b: { date?: string }) => (a.date || "").localeCompare(b.date || ""));
            const firstUpcomingIdx = sortedDueDates.findIndex((dd: { date?: string }) => dd.date && dd.date >= today);

            for (let i = 0; i < sortedDueDates.length; i++) {
              const dd = sortedDueDates[i];
              const isNextUpcoming = shouldBeActive && i === firstUpcomingIdx;
              const splitActivation = isNextUpcoming ? "active" : "inactive";
              const splitTitle = dd.label ? `${ob.title} — ${dd.label}` : `${ob.title} — ${dd.date || "N/A"}`;

              const splitDetailsJson = JSON.stringify({
                due_dates: [dd],
                key_values: ob.key_values,
                clause_references: ob.clause_references,
              });

              const obligationId = insertObligation({
                documentId,
                obligationType: ob.category,
                title: splitTitle,
                description: ob.summary,
                clauseReference: ob.clause_references.join(", ") || null,
                dueDate: dd.date || null,
                recurrence: ob.recurrence,
                noticePeriodDays: ob.notice_period_days,
                owner: ob.suggested_owner,
                escalationTo: null,
                proofDescription: ob.proof_description,
                evidenceJson: "[]",
                category: ob.category,
                activation: splitActivation,
                summary: ob.summary,
                detailsJson: splitDetailsJson,
                penalties: ob.penalties,
                stage: ob.stage,
              });

              const created = getObligationById(obligationId);
              createdObligations.push(created);

              if (splitActivation === "active" && dd.date) {
                createTaskForObligation(obligationId, {
                  title: `${dd.label || ob.title}${dd.amount ? ` — ${dd.amount}` : ""} — ${taggedDoc.name}`,
                  description: dd.details || ob.summary,
                  dueDate: dd.date,
                  owner: ob.suggested_owner,
                  escalationTo: null,
                });
                tasksCreated++;
              }
            }
          } else {
            // Non-payment obligations or single due_date: create as single record
            const firstDueDate = ob.due_dates.length > 0 ? ob.due_dates[0].date : null;
            const detailsJson = JSON.stringify({
              due_dates: ob.due_dates,
              key_values: ob.key_values,
              clause_references: ob.clause_references,
            });

            const activation = shouldBeActive ? "active" : "inactive";

            const obligationId = insertObligation({
              documentId,
              obligationType: ob.category,
              title: ob.title,
              description: ob.summary,
              clauseReference: ob.clause_references.join(", ") || null,
              dueDate: firstDueDate,
              recurrence: ob.recurrence,
              noticePeriodDays: ob.notice_period_days,
              owner: ob.suggested_owner,
              escalationTo: null,
              proofDescription: ob.proof_description,
              evidenceJson: "[]",
              category: ob.category,
              activation,
              summary: ob.summary,
              detailsJson,
              penalties: ob.penalties,
              stage: ob.stage,
            });

            const created = getObligationById(obligationId);
            createdObligations.push(created);

            if (activation === "active" && ob.due_dates.length > 0) {
              for (const dd of ob.due_dates) {
                if (dd.date) {
                  createTaskForObligation(obligationId, {
                    title: `${dd.label || ob.title}${dd.amount ? ` — ${dd.amount}` : ""} — ${taggedDoc.name}`,
                    description: dd.details || ob.summary,
                    dueDate: dd.date,
                    owner: ob.suggested_owner,
                    escalationTo: null,
                  });
                  tasksCreated++;
                }
              }
            }
          }
        }

        logAction("document", documentId, "contract_analyzed", {
          obligationsCount: createdObligations.length,
          tasksCreated,
          stages: {
            not_signed: (createdObligations as Array<{ stage: string }>).filter(o => o.stage === "not_signed").length,
            signed: (createdObligations as Array<{ stage: string }>).filter(o => o.stage === "signed").length,
            active: (createdObligations as Array<{ stage: string }>).filter(o => o.stage === "active").length,
            terminated: (createdObligations as Array<{ stage: string }>).filter(o => o.stage === "terminated").length,
          },
        });
      } catch (contractErr: unknown) {
        const msg = contractErr instanceof Error ? contractErr.message : "Unknown error";
        console.warn("Contract obligation extraction failed:", msg);
      }

      logAction("document", documentId, "processed", {
        wordCount,
        chunks: 0,
        isContract: true,
        obligations: createdObligations.length,
        duplicates: duplicateInfo ? duplicates.contentMatches.length : 0,
      });

      const updatedDocument = getDocumentById(documentId);

      return NextResponse.json({
        message: "Contract processed successfully — obligations extracted",
        document: updatedDocument,
        chunks: 0,
        wordCount,
        autoTags: autoTagResult,
        duplicates: duplicateInfo,
        nearDuplicates: [],
        policyActions: null,
        contract: {
          obligations: createdObligations,
          tasksCreated,
          tokenUsage: contractResult ? contractResult.tokenUsage : null,
        },
      });
    }

    // ---- STANDARD DOCUMENT PIPELINE ----
    // Check Voyage AI status
    const embeddingStatus = await checkEmbeddingStatus();
    if (!embeddingStatus.available) {
      return NextResponse.json({ error: embeddingStatus.error }, { status: 503 });
    }

    // Delete existing chunks if reprocessing
    deleteChunksByDocumentId(documentId);

    // Chunk the text
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      return NextResponse.json({ error: "Document produced no chunks" }, { status: 400 });
    }

    // Generate embeddings and store chunks
    const chunksToInsert = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk.content);
      const embeddingBuffer = embeddingToBuffer(embedding);

      chunksToInsert.push({
        documentId,
        content: chunk.content,
        chunkIndex: i,
        embedding: embeddingBuffer,
      });
    }

    // Batch insert chunks
    addChunksBatch(chunksToInsert);

    // Mark document as processed
    updateDocumentProcessed(documentId, wordCount);

    // Store full_text for policy doc types (needed for version diff)
    const policiesSettingRaw = getAppSetting('policies_tab_doc_types');
    const policiesDocTypes: string[] = policiesSettingRaw
      ? JSON.parse(policiesSettingRaw)
      : ['policy', 'procedure'];
    const finalDoc = getDocumentById(documentId);
    if (finalDoc.doc_type && policiesDocTypes.includes(finalDoc.doc_type)) {
      updateDocumentMetadata(documentId, { full_text: text });
    }

    // Version detection: find likely predecessor document
    try {
      if (finalDoc.doc_type && policiesDocTypes.includes(finalDoc.doc_type)) {
        const existingDocs = getAllDocuments().filter(
          (d: { id: number; doc_type: string | null; superseded_by: number | null }) =>
            d.id !== documentId &&
            d.doc_type === finalDoc.doc_type &&
            d.superseded_by === null
        );

        let bestCandidate: { id: number; score: number } | null = null;
        for (const candidate of existingDocs) {
          const score = nameSimilarity(finalDoc.name, candidate.name);
          if (score > 0.6 && (!bestCandidate || score > bestCandidate.score)) {
            bestCandidate = { id: candidate.id, score };
          }
        }

        if (bestCandidate) {
          addPendingReplacement(documentId, bestCandidate.id, bestCandidate.score);
          logAction('document', documentId, 'version_candidate_detected', {
            candidateId: bestCandidate.id,
            confidence: bestCandidate.score,
          });
        }
      }
    } catch (versionErr) {
      const msg = versionErr instanceof Error ? versionErr.message : 'Unknown error';
      console.warn('Version detection failed:', msg);
    }

    // Evaluate policy rules
    let policyResult = null;
    try {
      const enrichedDoc = getDocumentById(documentId);
      const triggeredActions = evaluateDocument(enrichedDoc);
      if (triggeredActions.length > 0) {
        policyResult = applyActions(documentId, triggeredActions);
      }
    } catch (policyErr: unknown) {
      const msg = policyErr instanceof Error ? policyErr.message : "Unknown error";
      console.warn("Policy evaluation failed:", msg);
    }

    // Check for near-duplicates (semantic)
    let nearDuplicates: unknown[] = [];
    try {
      nearDuplicates = findNearDuplicates(documentId, 0.92);
      for (const nd of nearDuplicates as Array<{ documentId: number; similarity: number }>) {
        addLineageEntry(documentId, nd.documentId, "duplicate_of", nd.similarity);
      }
    } catch {
      // Near-duplicate check is optional
    }

    logAction("document", documentId, "processed", {
      wordCount,
      chunks: chunks.length,
      duplicates: duplicateInfo ? duplicates.contentMatches.length : 0,
      nearDuplicates: nearDuplicates.length,
    });

    const updatedDocument = getDocumentById(documentId);

    return NextResponse.json({
      message: "Document processed successfully",
      document: updatedDocument,
      chunks: chunks.length,
      wordCount,
      autoTags: autoTagResult,
      duplicates: duplicateInfo,
      nearDuplicates,
      policyActions: policyResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
