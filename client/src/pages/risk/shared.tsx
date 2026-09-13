import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown, Plus, X } from "lucide-react";

export type IconType = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

/** Estado persistido em localStorage (camada mock do projeto). */
export function useStoredState<T>(key: string, initial: T): [T, (next: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* localStorage opcional */ }
  }, [key, value]);
  return [value, setValue];
}

export function PageHeader({ eyebrow, title, description, action, actionIcon: ActionIcon = Plus, onAction }: { eyebrow: string; title: string; description: string; action?: string; actionIcon?: IconType; onAction?: () => void }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="page-desc">{description}</p></div>{action ? <button className="primary-btn" onClick={onAction}><ActionIcon size={14} />{action}</button> : <div className="date-chip"><CalendarDays size={14} /> 08 set 2026 <ChevronDown size={13} /></div>}</div>;
}

export function KpiCard({ label, value, meta, icon: Icon, tone = "teal", trend }: { label: string; value: string; meta: string; icon: IconType; tone?: string; trend?: "up" | "down" }) {
  return <div className="kpi-card animate-rise"><div className="kpi-top"><span>{label}</span><span className={`kpi-icon ${tone}`}><Icon size={15} /></span></div><div className="kpi-value">{value}</div><div className="kpi-meta">{trend === "up" ? <ArrowUpRight size={12} className="delta-up" /> : trend === "down" ? <ArrowDownRight size={12} className="delta-down" /> : null}<span className={trend === "up" ? "delta-up" : trend === "down" ? "delta-down" : ""}>{meta}</span></div></div>;
}

export function Modal({ title, description, onClose, children, wide }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onClick={onClose}><div className={`modal ${wide ? "modal-wide" : ""}`} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><div className="modal-title">{title}</div>{description ? <div className="modal-desc">{description}</div> : null}</div><button className="close-btn" onClick={onClose} aria-label="Fechar"><X size={15} /></button></div>{children}</div></div>;
}

export function Tag({ tone = "neutral", children }: { tone?: "neutral" | "teal" | "amber" | "red" | "blue" | "dark"; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label?: string }) {
  return <button type="button" role="switch" aria-checked={checked} className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><span className="toggle-knob" />{label ? <span className="toggle-label">{label}</span> : null}</button>;
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (next: T) => void; options: { id: T; label: string; count?: number }[] }) {
  return <div className="segmented">{options.map((option) => <button key={option.id} className={value === option.id ? "active" : ""} onClick={() => onChange(option.id)}>{option.label}{option.count !== undefined ? <span className="segmented-count">{option.count}</span> : null}</button>)}</div>;
}

export function SectionTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return <div className="panel-header"><div><div className="panel-title">{title}</div>{subtitle ? <div className="panel-subtitle">{subtitle}</div> : null}</div>{children}</div>;
}

export function Callout({ tone = "info", icon: Icon, title, children }: { tone?: "info" | "warn" | "danger" | "ok"; icon?: IconType; title: string; children?: ReactNode }) {
  return <div className={`callout callout-${tone}`}>{Icon ? <Icon size={15} /> : null}<div><strong>{title}</strong>{children ? <div>{children}</div> : null}</div></div>;
}

export const formatDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
