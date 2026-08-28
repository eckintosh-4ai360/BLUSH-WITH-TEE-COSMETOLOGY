"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ScrollText,
  Trash2,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import { toast } from "@blush/ui/components/ui/sonner";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { trpc } from "@/lib/trpc";

export type TermSection = {
  title: string;
  body: string;
};

export type TermsData = {
  sections: TermSection[];
  footer: string;
};

const DEFAULT_OFFICIAL_TERMS: TermsData = {
  sections: [
    {
      title: "Discipline and Personal Hygiene",
      body: "Discipline and personal hygiene is of utmost importance to the school, therefore all students must look very neat and smart always. Indecently dressed students will not be allowed inside the school premises.",
    },
    {
      title: "Student to Model for Each Other",
      body: "During practical sessions, student are expected to model for each other. If for any reason a student cannot do so, by reason of any medical condition, he or she must notify the school on enrollment with necessary evidence. Students shall provide models for practicals from outside when needed.",
    },
    {
      title: "Prescribed Dress Code Appearance",
      body: "In a bid to inculcate a Professional appearance in students, they are to be in the prescribed uniforms at all times. All students must wear the prescribed school uniform.\n\n• Uniforms: School t-shirt and Lacoste from Tuesday to Thursday. Mufti on Friday.\n• Footwear (loafers/flat shoes/Crocs/sandals): No talking shoes or high heeled foot-wears are allowed.\n• Accessories: With the exception of wedding rings and earrings, no other form of accessories or body jewelries are allowed during and around classes' hours.",
    },
    {
      title: "Class Attendance",
      body: "Punctuality and regularity to class must be ensured. The instructor reserves every right to sanction late comers accordingly. Reporting time for school is 8am.",
    },
    {
      title: "Appearance During Practical",
      body: "Students must ensure that during practical hours, they wear their protective cloth (overalls or aprons/therapy shoes/gloves and others). No student will be permitted to work without it, hence, will not be allowed in class.",
    },
    {
      title: "School Property",
      body: "Students are expected to handle all school properties including tools and equipment with a sense of responsibility or else damages caused to any school property is payable.",
    },
    {
      title: "Compliance with School Rules and Regulation",
      body: "Every student is entitled to the acquaintance with the rules and regulations governing the school and is expected to comply by them accordingly. Breach of the rules shall warrant sanctions like warnings or suspension.",
    },
    {
      title: "Good Behavior",
      body: "Every student is expected to put up a good and accommodating behavior with a high level of comportment, courtesy, discipline, and good moral values.",
    },
    {
      title: "Respect for Student Leadership",
      body: "Every student must be ready to accord the student leadership (seniors), the respect due it. They must also comply with bye-laws which would emerge from their end to help ensure sanity in school.",
    },
    {
      title: "Graduation Requirement",
      body: "All students are to note that, if you do not meet your requirements for the end of a course, you are not graduating but rather re-sit and perfect without any cost involved. Students are requested to do all final project works before having access to graduate. Full payment of school fees and graduation fees are to be settled before a certificate will be given.",
    },
  ],
  footer: "FEES PAID IS STRICTLY NON REFUNDABLE",
};

export function TermsSettings({ readOnly }: { readOnly: boolean }) {
  const query = trpc.platform.settings.useQuery();
  const utils = trpc.useUtils();

  const [sections, setSections] = useState<TermSection[]>(DEFAULT_OFFICIAL_TERMS.sections);
  const [footer, setFooter] = useState<string>(DEFAULT_OFFICIAL_TERMS.footer);
  const [isDirty, setIsDirty] = useState(false);

  // Find school.terms entry from query data
  useEffect(() => {
    if (!query.data) return;
    const schoolGroup = query.data.find(g => g.category === "school");
    const termsEntry = schoolGroup?.entries.find(e => e.key === "school.terms");

    if (termsEntry && termsEntry.value && typeof termsEntry.value === "object") {
      const val = termsEntry.value as { sections?: TermSection[]; footer?: string };
      if (Array.isArray(val.sections) && val.sections.length > 0) {
        setSections(val.sections);
      }
      if (typeof val.footer === "string") {
        setFooter(val.footer);
      }
    }
  }, [query.data]);

  const saveMutation = trpc.platform.updateSetting.useMutation({
    onSuccess: () => {
      toast.success("School Terms & Conditions successfully updated!");
      setIsDirty(false);
      utils.platform.settings.invalidate();
    },
    onError: err => toast.error(`Failed to save terms: ${err.message}`),
  });

  function handleAddSection() {
    setSections(prev => [
      ...prev,
      {
        title: `New Policy Clause ${prev.length + 1}`,
        body: "",
      },
    ]);
    setIsDirty(true);
  }

  function handleRemoveSection(index: number) {
    setSections(prev => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  }

  function handleMoveSection(index: number, direction: "up" | "down") {
    setSections(prev => {
      const copy = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= copy.length) return prev;
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
    setIsDirty(true);
  }

  function handleUpdateSection(index: number, field: "title" | "body", value: string) {
    setSections(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
    setIsDirty(true);
  }

  function handleResetToDefault() {
    if (window.confirm("Reset all terms and conditions to the official default school document?")) {
      setSections(DEFAULT_OFFICIAL_TERMS.sections);
      setFooter(DEFAULT_OFFICIAL_TERMS.footer);
      setIsDirty(true);
    }
  }

  function handleSave() {
    saveMutation.mutate({
      key: "school.terms",
      value: {
        sections,
        footer: footer.trim(),
      },
    });
  }

  return (
    <article className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#faeaf6] text-[#8f0d6b]">
            <ScrollText className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">
                Terms &amp; Conditions Governing the School
              </h3>
              <Badge variant="outline" className="border-[#8f0d6b]/30 text-[#8f0d6b] text-[10px]">
                Public Policy
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground max-w-xl">
              Configured terms are automatically published to the client app footer link (<b>/terms</b>)
              and shown in the online student admission application portal.
            </p>
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetToDefault}
              disabled={saveMutation.isPending}
              className="text-xs gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Default
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending || (!isDirty && query.isSuccess)}
              className="bg-[#8f0d6b] text-white hover:bg-[#720a55] text-xs gap-1.5 shadow-sm"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Changes
            </Button>
          </div>
        )}
      </div>

      {/* Rules list */}
      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            School Policy Clauses ({sections.length})
          </Label>
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddSection}
              className="text-xs text-[#8f0d6b] hover:bg-[#faeaf6] gap-1 h-8"
            >
              <Plus className="h-3.5 w-3.5" /> Add Clause
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {sections.map((section, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-border/70 bg-muted/20 p-4 transition-all hover:border-[#8f0d6b]/30"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-1">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#8f0d6b] text-white text-[11px] font-bold">
                    {idx + 1}
                  </span>
                  <Input
                    value={section.title}
                    disabled={readOnly}
                    placeholder="Clause Title (e.g. Discipline and Personal Hygiene)"
                    onChange={e => handleUpdateSection(idx, "title", e.target.value)}
                    className="h-8 text-xs font-semibold bg-background border-border"
                  />
                </div>

                {!readOnly && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={idx === 0}
                      onClick={() => handleMoveSection(idx, "up")}
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={idx === sections.length - 1}
                      onClick={() => handleMoveSection(idx, "down")}
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveSection(idx)}
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      title="Delete clause"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              <Textarea
                value={section.body}
                disabled={readOnly}
                rows={3}
                placeholder="Details and requirements of this school rule/policy..."
                onChange={e => handleUpdateSection(idx, "body", e.target.value)}
                className="text-xs bg-background border-border resize-y leading-relaxed"
              />
            </div>
          ))}
        </div>

        {/* Footer Disclaimer */}
        <div className="pt-4 border-t border-border/50">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Bottom Notice / Refund Policy Disclaimer
          </Label>
          <Input
            value={footer}
            disabled={readOnly}
            placeholder="e.g. FEES PAID IS STRICTLY NON REFUNDABLE"
            onChange={e => {
              setFooter(e.target.value);
              setIsDirty(true);
            }}
            className="text-xs font-bold text-destructive bg-background border-destructive/30"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Prominently highlighted at the bottom of the public Terms page and admission forms.
          </p>
        </div>
      </div>
    </article>
  );
}
