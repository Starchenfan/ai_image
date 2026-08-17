"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import type { ModelParameterSchema } from "@/lib/types";

/**
 * Renders one field from the model's parameter schema.
 * type === number  → numeric input
 * type === select  → radix select
 * type === slider  → radix slider
 * type === boolean → checkbox (none in seed data, but supported)
 * type === text    → text input
 */
export function DynamicField({ field }: { field: ModelParameterSchema }) {
  const value = useStudio((s) => s.parameters[field.key]);
  const setParam = (k: string, v: number | string | boolean) =>
    useStudio.setState((s) => ({
      parameters: { ...s.parameters, [k]: v },
    }));

  const labelEl = (
    <div className="flex items-center justify-between">
      <Label>{field.label}</Label>
      {field.description && (
        <span className="text-[10px] text-ink-3">{field.description}</span>
      )}
    </div>
  );

  if (field.type === "slider" || field.type === "number") {
    const min = field.min ?? 0;
    const max = field.max ?? 100;
    const step = field.step ?? 1;
    const numVal = typeof value === "number" ? value : Number(field.default ?? min);
    return (
      <div className="space-y-1.5">
        {labelEl}
        {field.type === "slider" ? (
          <div className="flex items-center gap-2.5">
            <Slider
              value={[numVal]}
              min={min}
              max={max}
              step={step}
              onValueChange={([v]) => setParam(field.key, v)}
              className="flex-1"
            />
            <span className="w-10 shrink-0 text-right font-mono text-xs text-ink">
              {numVal}
            </span>
          </div>
        ) : (
          <Input
            type="number"
            min={min}
            max={max}
            step={step}
            value={numVal}
            onChange={(e) => setParam(field.key, Number(e.target.value))}
            className="font-mono text-xs"
          />
        )}
      </div>
    );
  }

  if (field.type === "select") {
    const opts = field.options ?? [];
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Select
          value={String(value ?? "")}
          onValueChange={(v) => setParam(field.key, v)}
        >
          <SelectTrigger className="text-xs">
            <SelectValue placeholder="选择…" />
          </SelectTrigger>
          <SelectContent>
            {opts.map((o) => (
              <SelectItem key={String(o)} value={String(o)}>
                {String(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between">
        <Label>{field.label}</Label>
        <button
          role="switch"
          aria-checked={value === true}
          onClick={() => setParam(field.key, !(value === true))}
          className={cn(
            "relative h-5 w-9 rounded-full border transition-colors",
            value === true ? "border-accent bg-accent" : "border-line bg-paper-4"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-ink transition-transform",
              value === true ? "translate-x-4" : "translate-x-0.5"
            )}
          />
        </button>
      </div>
    );
  }

  // text
  return (
    <div className="space-y-1.5">
      {labelEl}
      <Input
        value={String(value ?? "")}
        onChange={(e) => setParam(field.key, e.target.value)}
        className="text-xs"
      />
    </div>
  );
}

/** Advanced params wrapper — collapses fields flagged advanced behind a toggle. */
export function AdvancedParams({
  fields,
}: {
  fields: ModelParameterSchema[];
}) {
  const [open, setOpen] = useState(false);
  const basic = fields.filter((f) => !f.advanced);
  const advanced = fields.filter((f) => f.advanced);

  if (basic.length === 0 && advanced.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="px-1 text-xs font-medium uppercase tracking-wider text-ink-3">
        参数配置
      </h3>
      {basic.map((f) => (
        <DynamicField key={f.key} field={f} />
      ))}
      {advanced.length > 0 && (
        <div className="border-t border-line pt-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between px-1 text-xs text-ink-3 transition-colors hover:text-ink-2"
          >
            <span>高级参数 ({advanced.length})</span>
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
            />
          </button>
          {open && (
            <div className="mt-2.5 space-y-3 animate-fade-in">
              {advanced.map((f) => (
                <DynamicField key={f.key} field={f} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
