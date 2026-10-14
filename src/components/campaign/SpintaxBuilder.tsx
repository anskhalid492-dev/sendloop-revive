import { useState } from "react";
import { Braces, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildSpintax, SPINTAX_PRESETS } from "@/lib/spintax-builder";

export function SpintaxBuilder({ open, initialText, onClose, onInsert, onRestoreCursor }: {
  open: boolean; initialText: string; onClose: () => void;
  onInsert: (syntax: string) => void; onRestoreCursor: () => void;
}) {
  const [options, setOptions] = useState<string[]>([initialText || "Hi", "Hello"]);
  const { syntax, error } = buildSpintax(options);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md" aria-describedby={undefined}
        onCloseAutoFocus={(event) => { event.preventDefault(); onRestoreCursor(); }}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Braces className="size-5 text-primary" />Spintax Builder</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {options.map((option, index) => (
            <div key={index} className="space-y-1.5">
              <Label htmlFor={`spintax-option-${index}`}>Option {index + 1}</Label>
              <div className="flex items-start gap-2">
                <Textarea id={`spintax-option-${index}`} rows={2} value={option}
                  onChange={(event) => setOptions((prev) => prev.map((value, at) => at === index ? event.target.value : value))} />
                {options.length > 2 && <Button variant="ghost" size="icon" aria-label={`Remove option ${index + 1}`} onClick={() => setOptions((prev) => prev.filter((_, at) => at !== index))}><Trash2 className="size-4" /></Button>}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setOptions((prev) => [...prev, ""])}><Plus className="mr-1.5 size-3.5" />Add Option</Button>
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
            {Object.entries(SPINTAX_PRESETS).map(([name, values]) => <Button key={name} variant="secondary" size="sm" onClick={() => setOptions([...values])}>{name}</Button>)}
          </div>
          <div className="space-y-1.5">
            <Label>Syntax preview</Label>
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/50 p-3 font-mono text-sm" aria-live="polite">{syntax}</pre>
            {error && <p role="status" className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Close</Button><Button disabled={Boolean(error)} onClick={() => onInsert(syntax)}>Insert</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}