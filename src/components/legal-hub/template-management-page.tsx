"use client";

import { useState } from "react";
import { Plus, ArrowLeft, Wand2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CaseTemplate } from "@/lib/types";
import { TemplateList } from "./template-list";
import { TemplateForm } from "./template-form";
import { TemplateWizard } from "./template-wizard";
import { BlueprintManagement } from "./blueprint-management";

type PageView = "list" | "form" | "wizard" | "blueprints";

export function TemplateManagementPage() {
  const [view, setView] = useState<PageView>("list");
  const [editingTemplate, setEditingTemplate] = useState<CaseTemplate | null>(
    null
  );
  const [wizardInitialContent, setWizardInitialContent] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleNew = () => {
    setEditingTemplate(null);
    setWizardInitialContent("");
    setView("form");
  };

  const handleWizard = () => {
    setView("wizard");
  };

  const handleEdit = (template: CaseTemplate) => {
    setEditingTemplate(template);
    setWizardInitialContent("");
    setView("form");
  };

  const handleSaved = () => {
    setView("list");
    setEditingTemplate(null);
    setWizardInitialContent("");
    setRefreshTrigger((t) => t + 1);
  };

  const handleCancel = () => {
    setView("list");
    setEditingTemplate(null);
    setWizardInitialContent("");
  };

  const handleDeleted = () => {
    setRefreshTrigger((t) => t + 1);
  };

  const handleWizardComplete = (html: string) => {
    setWizardInitialContent(html);
    setEditingTemplate(null);
    setView("form");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Szablony dokumentów</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Zarządzaj szablonami do generowania dokumentów
          </p>
        </div>
        {view === "list" && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setView("blueprints")}
            >
              <Settings2 className="w-4 h-4 mr-2" />
              Zarządzaj planami
            </Button>
            <Button variant="outline" size="sm" onClick={handleWizard}>
              <Wand2 className="w-4 h-4 mr-2" />
              Kreator
            </Button>
            <Button size="sm" onClick={handleNew}>
              <Plus className="w-4 h-4 mr-2" />
              Ręcznie
            </Button>
          </div>
        )}
      </div>

      {view === "list" && (
        <TemplateList
          refreshTrigger={refreshTrigger}
          onEdit={handleEdit}
          onDeleted={handleDeleted}
        />
      )}

      {view === "form" && (
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Wróć do listy
          </Button>
          <TemplateForm
            template={editingTemplate}
            onSaved={handleSaved}
            onCancel={handleCancel}
            initialContent={wizardInitialContent || undefined}
          />
        </div>
      )}

      {view === "wizard" && (
        <TemplateWizard
          onComplete={handleWizardComplete}
          onCancel={handleCancel}
        />
      )}

      {view === "blueprints" && (
        <BlueprintManagement onBack={() => setView("list")} />
      )}
    </div>
  );
}
