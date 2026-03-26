"use client";

import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEPARTMENTS } from "@/lib/constants";

interface UploadSectionProps {
  onUploadComplete: () => void;
  onStatusMessage: (message: string, type: "success" | "error" | "info") => void;
}

export function UploadSection({ onUploadComplete, onStatusMessage }: UploadSectionProps) {
  const t = useTranslations('Documents');
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      onStatusMessage(t('upload.selectFile'), "error");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (category) {
        formData.append("category", category);
      }

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        onStatusMessage(t('upload.uploaded', { name: data.document?.name || file.name }), "success");
        if (fileInputRef.current) fileInputRef.current.value = "";
        setCategory("");
        onUploadComplete();
      } else {
        onStatusMessage(data.error || "Upload failed", "error");
      }
    } catch (err) {
      onStatusMessage(`Upload error: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="upload-file">{t('upload.label')}</Label>
            <Input
              id="upload-file"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              className="mt-1.5"
            />
          </div>
          <div className="w-[180px]">
            <Label htmlFor="upload-category">{t('upload.category')}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="upload-category" className="mt-1.5">
                <SelectValue placeholder={t('upload.noCategory')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('upload.noCategory')}</SelectItem>
                {DEPARTMENTS.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleUpload} disabled={uploading}>
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? t('upload.uploading') : t('upload.button')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
