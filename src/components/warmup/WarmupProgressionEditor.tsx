import { Minus, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_WARMUP_STAGES, resolveWarmupProgression, validateWarmupStages, warmupStageLimit, type ProgressionMode, type ProgressionStage, type ProgressionSettings } from "@/lib/warmup-progression";
export function WarmupProgressionEditor({ mode, stages, limit, settings, onChange }: {
  mode: ProgressionMode; stages: ProgressionStage[]; limit: number; settings: ProgressionSettings | null;
  onChange: (patch: { progression_mode?: ProgressionMode; progression_stages?: ProgressionStage[]; manual_daily_limit?: number }) => void;
}) {
  const error = validateWarmupStages(stages);
  const current = resolveWarmupProgression(settings ?? {}, false);
  return <section className="space-y-3 border-b border-border pb-5">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Automatic Warmup Progression</h3>
      <Switch aria-label="Enable automatic progression" checked={mode === "automatic"} onCheckedChange={checked => onChange({ progression_mode: checked ? "automatic" : "manual" })} /></div>
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant={mode === "automatic" ? "default" : "outline"} onClick={() => onChange({ progression_mode: "automatic" })}>Automatic</Button>
      <Button size="sm" variant={mode === "manual" ? "default" : "outline"} onClick={() => onChange({ progression_mode: "manual" })}>Manual</Button>
      {mode === "legacy" && <span className="text-xs text-muted-foreground">Existing schedule · review before switching</span>}
    </div>
    {settings?.progression_review_required && <p className="text-xs text-muted-foreground">Existing mailbox: review its start date and current limit before enabling progression.</p>}
    {mode === "manual" && <div className="space-y-2"><Label htmlFor="manual-warmup-limit">Manual daily limit</Label><div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Decrease daily limit" onClick={() => onChange({ manual_daily_limit: Math.max(1, limit - 1) })}><Minus className="size-4" /></Button>
      <Input id="manual-warmup-limit" className="w-24" type="number" min={1} max={400} value={limit} onChange={e => onChange({ manual_daily_limit: Number(e.target.value) })} />
      <Button variant="outline" size="icon" aria-label="Increase daily limit" onClick={() => onChange({ manual_daily_limit: Math.min(400, limit + 1) })}><Plus className="size-4" /></Button>
      <Button variant="ghost" size="sm" onClick={() => onChange({ progression_mode: "automatic" })}><RotateCcw className="mr-1 size-4" />Reset to automatic</Button>
    </div></div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-xs"><thead><tr>{["Stage", "Start Day", "End Day", "Min Emails/Day", "Max Emails/Day", ""].map((text, i) => <th key={i} className="pb-2 text-left font-medium">{text}</th>)}</tr></thead><tbody>
      {stages.map((stage, index) => <tr key={index}><td className="pr-2">Stage {index + 1}</td>{(["start_day", "end_day", "min_emails", "max_emails"] as const).map(key => <td key={key} className="p-1"><Input aria-label={`Stage ${index + 1} ${key.replaceAll("_", " ")}`} className="h-8 w-20" type="number" min={1} value={stage[key]} onChange={e => onChange({ progression_stages: stages.map((s, i) => i === index ? { ...s, [key]: Number(e.target.value) } : s) })} /></td>)}
      <td><Button variant="ghost" size="icon" aria-label={`Remove stage ${index + 1}`} disabled={stages.length === 1} onClick={() => onChange({ progression_stages: stages.filter((_, i) => i !== index) })}><Trash2 className="size-3.5" /></Button></td></tr>)}
    </tbody></table></div>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={stages.length >= 12} onClick={() => { const last = stages.at(-1); if (last) onChange({ progression_stages: [...stages, { start_day: last.end_day + 1, end_day: last.end_day + 7, min_emails: last.max_emails, max_emails: Math.min(400, last.max_emails + 10) }] }); }}><Plus className="mr-1 size-3.5" />Add stage</Button>
      <Button size="sm" variant="ghost" onClick={() => onChange({ progression_stages: DEFAULT_WARMUP_STAGES.map(s => ({ ...s })) })}><RotateCcw className="mr-1 size-3.5" />Restore default schedule</Button></div>
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : <div className="flex flex-wrap gap-2">{Array.from({ length: 7 }, (_, i) => current.day + i).map(day => <span key={day} className="text-xs text-muted-foreground">Day {day}: {mode === "manual" ? limit : warmupStageLimit(day, stages).limit}/day</span>)}</div>}
  </section>;
}