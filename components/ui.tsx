import React, { type ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div className="min-w-0">{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1 className="page-title">{title}</h1>{description&&<p className="page-description">{description}</p>}</div>{actions&&<div className="page-actions">{actions}</div>}</header>;
}

export function SectionCard({ title, description, eyebrow, actions, children, className="" }: { title?: string; description?: string; eyebrow?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card section-card ${className}`}><div className="section-heading"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}{title&&<h2 className="section-title">{title}</h2>}{description&&<p className="section-description">{description}</p>}</div>{actions&&<div className="shrink-0">{actions}</div>}</div>{children}</section>;
}

export function KpiCard({ label, value, note, accent="neutral", icon }: { label: string; value: ReactNode; note?: ReactNode; accent?: "neutral"|"green"|"orange"|"blue"|"red"; icon?: ReactNode }) {
  return <article className={`kpi-card kpi-${accent}`}><div className="flex items-start justify-between gap-3"><p className="kpi-label">{label}</p>{icon&&<span className="kpi-icon">{icon}</span>}</div><div className="kpi-value">{value}</div>{note&&<div className="kpi-note">{note}</div>}</article>;
}

export function StatusPanel({ tone="info", title, children, className="" }: { tone?: "info"|"success"|"warning"|"danger"; title?: string; children: ReactNode; className?: string }) {
  return <div className={`status-panel status-${tone} ${className}`} role={tone==="danger"?"alert":"status"}>{title&&<p className="font-black">{title}</p>}<div className={title?"mt-1":""}>{children}</div></div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty-state"><p className="font-black text-slate-700">{title}</p>{children&&<div className="mt-1 text-sm text-slate-500">{children}</div>}</div>;
}

export function SegmentedControl<T extends string>({ value, options, onChange, label }: { value: T; options: { value:T; label:string }[]; onChange:(value:T)=>void; label:string }) {
  return <div className="segmented" role="tablist" aria-label={label}>{options.map(option=><button key={option.value} type="button" role="tab" aria-selected={value===option.value} className={value===option.value?"segmented-active":""} onClick={()=>onChange(option.value)}>{option.label}</button>)}</div>;
}

export function FieldGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <fieldset className="field-group"><legend>{title}</legend>{description&&<p className="field-help">{description}</p>}<div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div></fieldset>;
}
