import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export function Disclosure({ title, children }: { title: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <section className="form-disclosure">
    <button type="button" className="disclosure-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}><ChevronRight size={16} /><span>{title}</span></button>
    <div id={id} className="disclosure-panel" data-open={open} inert={!open} aria-hidden={!open}><div><div className="disclosure-content">{children}</div></div></div>
  </section>;
}
