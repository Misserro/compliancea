import { CaseDetailPage } from "@/components/legal-hub/case-detail-page";

export default async function CaseDetailPageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <CaseDetailPage caseId={parseInt(id, 10)} />
    </div>
  );
}
