"use client";

import { useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RegulatorSection } from "./regulator-section";
import { QuestionnaireSection } from "./questionnaire-section";
import { NdaSection } from "./nda-section";
import type { Document } from "@/lib/types";

interface DeskSectionProps {
  documents: Document[];
}

type DeskMode = "regulator" | "questionnaire" | "nda";

export function DeskSection({ documents }: DeskSectionProps) {
  const [mode, setMode] = useState<DeskMode>("regulator");

  return (
    <div className="space-y-4">
      <RadioGroup
        value={mode}
        onValueChange={(v) => setMode(v as DeskMode)}
        className="flex gap-6"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="regulator" id="mode-regulator" />
          <Label htmlFor="mode-regulator" className="cursor-pointer">
            Regulator Query
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="questionnaire" id="mode-questionnaire" />
          <Label htmlFor="mode-questionnaire" className="cursor-pointer">
            Questionnaire
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="nda" id="mode-nda" />
          <Label htmlFor="mode-nda" className="cursor-pointer">
            NDA Review
          </Label>
        </div>
      </RadioGroup>

      <Separator />

      {mode === "regulator" && <RegulatorSection documents={documents} />}
      {mode === "questionnaire" && <QuestionnaireSection documents={documents} />}
      {mode === "nda" && <NdaSection documents={documents} />}
    </div>
  );
}
