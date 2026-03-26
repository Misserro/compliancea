"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface FirmMember {
  user_id: number;
  name: string;
  email: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  specialization: string | null;
  bar_registration_number: string | null;
  assigned_case_count: number;
}

interface MemberRosterProps {
  members: FirmMember[];
  onProfileUpdated: () => void;
}

interface ProfileFormState {
  first_name: string;
  last_name: string;
  phone: string;
  specialization: string;
  bar_registration_number: string;
}

export function MemberRoster({ members, onProfileUpdated }: MemberRosterProps) {
  const [editingMember, setEditingMember] = useState<FirmMember | null>(null);
  const [formState, setFormState] = useState<ProfileFormState>({
    first_name: "",
    last_name: "",
    phone: "",
    specialization: "",
    bar_registration_number: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const openEdit = (member: FirmMember) => {
    setEditingMember(member);
    setFormState({
      first_name: member.first_name || "",
      last_name: member.last_name || "",
      phone: member.phone || "",
      specialization: member.specialization || "",
      bar_registration_number: member.bar_registration_number || "",
    });
    setError("");
    setSaving(false);
  };

  const closeEdit = () => {
    setEditingMember(null);
    setError("");
    setSaving(false);
  };

  const handleFieldChange = (field: keyof ProfileFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!editingMember || saving) return;
    setSaving(true);
    setError("");

    try {
      const body: Record<string, string | number | null> = {
        target_user_id: editingMember.user_id,
        first_name: formState.first_name.trim() || null,
        last_name: formState.last_name.trim() || null,
        phone: formState.phone.trim() || null,
        specialization: formState.specialization.trim() || null,
        bar_registration_number:
          formState.bar_registration_number.trim() || null,
      };

      const res = await fetch("/api/org/members/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update profile");
        setSaving(false);
        return;
      }

      closeEdit();
      onProfileUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Zespół kancelarii
      </h4>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium">Imie</th>
              <th className="text-left px-3 py-2 font-medium">Nazwisko</th>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium">Telefon</th>
              <th className="text-left px-3 py-2 font-medium">
                Specjalizacja
              </th>
              <th className="text-left px-3 py-2 font-medium">Nr wpisu</th>
              <th className="text-right px-3 py-2 font-medium">Sprawy</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr
                key={member.user_id}
                className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-3 py-2">
                  {member.first_name || (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {member.last_name || (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {member.email}
                </td>
                <td className="px-3 py-2">
                  {member.phone || (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {member.specialization || (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {member.bar_registration_number || (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {member.assigned_case_count}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => openEdit(member)}
                    className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    aria-label={`Edit profile for ${member.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Brak czlonkow
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit profile modal */}
      <Dialog
        open={editingMember !== null}
        onOpenChange={(open) => {
          if (!open) closeEdit();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Edytuj profil{" "}
              {editingMember
                ? `- ${editingMember.name}`
                : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="edit-first-name" className="text-sm font-medium">
                Imie
              </Label>
              <Input
                id="edit-first-name"
                value={formState.first_name}
                onChange={(e) =>
                  handleFieldChange("first_name", e.target.value)
                }
                placeholder="Imie"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="edit-last-name" className="text-sm font-medium">
                Nazwisko
              </Label>
              <Input
                id="edit-last-name"
                value={formState.last_name}
                onChange={(e) =>
                  handleFieldChange("last_name", e.target.value)
                }
                placeholder="Nazwisko"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="edit-phone" className="text-sm font-medium">
                Telefon
              </Label>
              <Input
                id="edit-phone"
                value={formState.phone}
                onChange={(e) => handleFieldChange("phone", e.target.value)}
                placeholder="Telefon"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label
                htmlFor="edit-specialization"
                className="text-sm font-medium"
              >
                Specjalizacja
              </Label>
              <Input
                id="edit-specialization"
                value={formState.specialization}
                onChange={(e) =>
                  handleFieldChange("specialization", e.target.value)
                }
                placeholder="Specjalizacja"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label
                htmlFor="edit-bar-number"
                className="text-sm font-medium"
              >
                Nr wpisu
              </Label>
              <Input
                id="edit-bar-number"
                value={formState.bar_registration_number}
                onChange={(e) =>
                  handleFieldChange(
                    "bar_registration_number",
                    e.target.value
                  )
                }
                placeholder="Nr wpisu na liste"
                className="mt-1.5"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={closeEdit}
                disabled={saving}
                className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Zapisywanie..." : "Zapisz"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
