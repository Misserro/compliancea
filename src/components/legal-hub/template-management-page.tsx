"use client";

import { useState } from "react";
import { Plus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CaseTemplate } from "@/lib/types";
import { TemplateList } from "./template-list";
import { TemplateForm } from "./template-form";

export function TemplateManagementPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CaseTemplate | null>(
    null
  );
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleNew = () => {
    setEditingTemplate(null);
    setShowForm(true);
  };

  const handleEdit = (template: CaseTemplate) => {
    setEditingTemplate(template);
    setShowForm(true);
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingTemplate(null);
    setRefreshTrigger((t) => t + 1);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingTemplate(null);
  };

  const handleDeleted = () => {
    setRefreshTrigger((t) => t + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage templates for document generation
          </p>
        </div>
        {!showForm && (
          <Button onClick={handleNew} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
        )}
      </div>

      {showForm ? (
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to list
          </Button>
          <TemplateForm
            template={editingTemplate}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        </div>
      ) : (
        <TemplateList
          refreshTrigger={refreshTrigger}
          onEdit={handleEdit}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
