import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AnalyzerSection } from "@/components/analyze/analyzer-section";
import { DeskSection } from "@/components/analyze/desk-section";
import { getAllDocuments } from "@/lib/db-imports";
import { getTranslations } from "next-intl/server";
import type { Document } from "@/lib/types";

export default async function DocumentToolsPage() {
  const t = await getTranslations('Documents');

  let documents: Document[] = [];
  try {
    documents = getAllDocuments() as Document[];
  } catch {
    // Fall back to empty array — DeskSection handles this gracefully
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t('analyze.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('analyze.subtitle')}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('analyze.analyzerTitle')}</CardTitle>
          <CardDescription>
            {t('analyze.analyzerSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyzerSection />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('analyze.selectModeTitle')}</CardTitle>
          <CardDescription>
            {t('analyze.selectModeSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeskSection documents={documents} />
        </CardContent>
      </Card>
    </div>
  );
}
