import { useState } from "react";
import { ArrowLeft, CalendarDays, Check, Clock3, Eye, Plus, Save, Trash2, UserRound, X } from "lucide-react";
import { PageHeader, Tag, Toggle } from "../shared";

type ScheduleKind = "Padrão" | "Personalizada";
type CalculationBase = "Parcial" | "Total";

type WorkSchedule = {
  id: string;
  kind: ScheduleKind;
  name: string;
  active: boolean;
  startDay: string;
  normalHours: string;
  overtime: string;
  maxDriving: string;
  minMeal: string;
  maxMeal: string;
  weeklyRest: string;
  interjourney: string;
  stopThreshold: string;
  minimumRest: string;
  nightStart: string;
  nightEnd: string;
  pattern: "weekdays" | "weekend" | "six_and_sunday" | "custom";
  weekdays: string[];
  dsrDay: string;
  calculationBase: CalculationBase;
  calculationPercent: 50 | 100;
  useHolidays: boolean;
  linkedDrivers: string[];
  locationPunch: boolean;
};

const driverOptions = ["Carlos Mendes", "Ana Paula Costa", "Rafael Nunes", "Marcos Silva", "Juliana Reis"];
const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const defaultSchedule = (id: string, name: string, kind: ScheduleKind, pattern: WorkSchedule["pattern"], normalHours: string): WorkSchedule => ({
  id, kind, name, active: true, startDay: "00:00", normalHours, overtime: "01:00", maxDriving: "05:30", minMeal: "01:00", maxMeal: "02:00", weeklyRest: "35:00", interjourney: "11:00", stopThreshold: "00:10", minimumRest: "00:10", nightStart: "22:00", nightEnd: "05:00", pattern, weekdays: pattern === "weekdays" ? ["Seg", "Ter", "Qua", "Qui", "Sex"] : pattern === "custom" ? ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] : ["Sáb", "Dom"], dsrDay: "Domingo", calculationBase: "Parcial", calculationPercent: 100, useHolidays: true, linkedDrivers: kind === "Padrão" ? [] : ["Carlos Mendes", "Ana Paula Costa"], locationPunch: false,
});

const initialSchedules: WorkSchedule[] = [
  defaultSchedule("ESC-001", "Modelo Padrão", "Padrão", "weekdays", "08:00"),
  defaultSchedule("ESC-002", "Jornada Diurna", "Personalizada", "custom", "07:00"),
  { ...defaultSchedule("ESC-003", "Jornada Noturna", "Personalizada", "custom", "06:30"), active: false, nightStart: "21:00", nightEnd: "05:00", linkedDrivers: ["Marcos Silva"] },
];

const emptySchedule = (): WorkSchedule => ({ ...defaultSchedule(`ESC-${Date.now()}`, "", "Personalizada", "custom", "08:00"), linkedDrivers: [] });

export function WorkSchedulesView({ onToast, onBack }: { onToast: (message: string) => void; onBack: () => void }) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [editing, setEditing] = useState<WorkSchedule | null>(null);

  const save = (schedule: WorkSchedule) => {
    const exists = schedules.some((item) => item.id === schedule.id);
    setSchedules((current) => exists ? current.map((item) => item.id === schedule.id ? schedule : item) : [...current, schedule]);
    setEditing(null);
    onToast(`Escala “${schedule.name}” ${exists ? "atualizada" : "criada"} com sucesso.`);
  };
  const toggle = (schedule: WorkSchedule) => {
    if (schedule.kind === "Padrão") { onToast("A escala padrão deve permanecer ativa."); return; }
    setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, active: !item.active } : item));
    onToast(`Escala “${schedule.name}” ${schedule.active ? "inativada" : "ativada"}.`);
  };
  const remove = (schedule: WorkSchedule) => {
    if (schedule.active || schedule.kind === "Padrão") { onToast("Inative a escala personalizada antes de excluir."); return; }
    setSchedules((current) => current.filter((item) => item.id !== schedule.id));
    onToast(`Escala “${schedule.name}” removida.`);
  };

  if (editing) return <ScheduleEditor initial={editing} onBack={() => setEditing(null)} onSave={save} />;

  return <div className="schedules-page">
    <PageHeader eyebrow="Configurações de jornada" title="Escalas de trabalho" description="Defina limites, dias trabalhados, descanso semanal e os motoristas vinculados a cada escala." action="Nova escala" actionIcon={Plus} onAction={() => setEditing(emptySchedule())} />
    <div className="schedules-back-row"><button className="panel-link" onClick={onBack}><ArrowLeft size={12} /> Voltar para Jornada</button><span>{schedules.length} escala(s) configurada(s)</span></div>
    <section className="panel schedules-table-panel">
      <div className="schedules-table-wrap"><table className="schedules-table"><thead><tr><th>TIPO</th><th>NOME</th><th>JORNADA</th><th>REFEIÇÃO MÁX.</th><th>REFEIÇÃO MÍN.</th><th>REPOUSO SEM.</th><th>H.E.</th><th>INTERJORNADA</th><th>HORÁRIO NOTURNO</th><th>TEMPO MÁX. DIREÇÃO</th><th>STATUS</th><th /></tr></thead><tbody>{schedules.map((schedule) => <tr key={schedule.id}><td><Tag tone={schedule.kind === "Padrão" ? "blue" : "teal"}>{schedule.kind}</Tag></td><td><strong>{schedule.name}</strong><small>{schedule.linkedDrivers.length ? `${schedule.linkedDrivers.length} motorista(s)` : "Aplicada por padrão"}</small></td><td><span className="schedule-time">{schedule.normalHours}</span></td><td>{schedule.maxMeal}</td><td>{schedule.minMeal}</td><td>{schedule.weeklyRest}</td><td>{schedule.overtime}</td><td>{schedule.interjourney}</td><td>Das {schedule.nightStart} às {schedule.nightEnd}</td><td>{schedule.maxDriving}</td><td><Toggle checked={schedule.active} onChange={() => toggle(schedule)} /></td><td><div className="schedule-row-actions"><button title="Ver ou editar escala" onClick={() => setEditing({ ...schedule })}><Eye size={13} /></button>{schedule.kind !== "Padrão" ? <button title={schedule.active ? "Inative antes de excluir" : "Excluir escala"} disabled={schedule.active} onClick={() => remove(schedule)}><Trash2 size={13} /></button> : null}</div></td></tr>)}</tbody></table></div>
    </section>
  </div>;
}

function ScheduleEditor({ initial, onBack, onSave }: { initial: WorkSchedule; onBack: () => void; onSave: (schedule: WorkSchedule) => void }) {
  const [form, setForm] = useState(initial);
  const patch = <K extends keyof WorkSchedule>(key: K, value: WorkSchedule[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleWeekday = (day: string) => patch("weekdays", form.weekdays.includes(day) ? form.weekdays.filter((item) => item !== day) : [...form.weekdays, day]);
  const toggleDriver = (driver: string) => patch("linkedDrivers", form.linkedDrivers.includes(driver) ? form.linkedDrivers.filter((item) => item !== driver) : [...form.linkedDrivers, driver]);
  const valid = form.name.trim() && form.weekdays.length > 0;
  return <div className="schedule-editor">
    <div className="schedule-editor-top"><button className="secondary-btn" onClick={onBack}><ArrowLeft size={13} /> Voltar</button><div><span>{form.kind === "Padrão" ? "Escala padrão" : "Escala personalizada"}</span><h1>{form.name || "Nova escala"}</h1></div><button className="primary-btn" disabled={!valid} onClick={() => onSave({ ...form, name: form.name.trim() })}><Save size={13} /> Salvar escala</button></div>

    <div className="schedule-editor-content">
      <section className="panel schedule-section">
        <header><div><span>01</span><div><strong>Identificação e limites</strong><small>Parâmetros utilizados para calcular a jornada.</small></div></div>{form.kind !== "Padrão" ? <Toggle checked={form.active} onChange={(value) => patch("active", value)} label={form.active ? "Ativa" : "Inativa"} /> : <Tag tone="blue">Padrão do sistema</Tag>}</header>
        <div className="schedule-form-grid">
          <label className="wide"><span>Nome da escala *</span><input value={form.name} disabled={form.kind === "Padrão"} onChange={(event) => patch("name", event.target.value)} placeholder="Ex.: Jornada regional diurna" /></label>
          <TimeField label="Início do dia de jornada" value={form.startDay} onChange={(value) => patch("startDay", value)} />
          <TimeField label="Jornada normal" value={form.normalHours} onChange={(value) => patch("normalHours", value)} />
          <TimeField label="Horas extras permitidas" value={form.overtime} onChange={(value) => patch("overtime", value)} />
          <TimeField label="Tempo máximo de direção" value={form.maxDriving} onChange={(value) => patch("maxDriving", value)} />
          <TimeField label="Refeição mínima" value={form.minMeal} onChange={(value) => patch("minMeal", value)} />
          <TimeField label="Refeição máxima" value={form.maxMeal} onChange={(value) => patch("maxMeal", value)} />
          <TimeField label="Repouso semanal" value={form.weeklyRest} onChange={(value) => patch("weeklyRest", value)} />
          <TimeField label="Interjornada mínima" value={form.interjourney} onChange={(value) => patch("interjourney", value)} />
          <TimeField label="Mínimo para considerar parada" value={form.stopThreshold} onChange={(value) => patch("stopThreshold", value)} />
          <TimeField label="Tempo mínimo de repouso" value={form.minimumRest} onChange={(value) => patch("minimumRest", value)} />
          <label><span>Início horário noturno</span><input type="time" value={form.nightStart} onChange={(event) => patch("nightStart", event.target.value)} /></label>
          <label><span>Fim horário noturno</span><input type="time" value={form.nightEnd} onChange={(event) => patch("nightEnd", event.target.value)} /></label>
        </div>
      </section>

      <section className="panel schedule-section">
        <header><div><span>02</span><div><strong>Dias trabalhados</strong><small>Escolha um padrão ou personalize os dias da semana.</small></div></div></header>
        <div className="schedule-patterns">{([{"id":"weekdays","label":"Segunda a sexta"},{"id":"weekend","label":"Fim de semana"},{"id":"six_and_sunday","label":"Seis + sábado"},{"id":"custom","label":"Personalizada"}] as { id: WorkSchedule["pattern"]; label: string }[]).map((option) => <button key={option.id} className={form.pattern === option.id ? "active" : ""} onClick={() => patch("pattern", option.id)}>{form.pattern === option.id ? <Check size={12} /> : null}{option.label}</button>)}</div>
        {form.pattern === "custom" ? <div className="schedule-weekdays">{weekDays.map((day) => <button key={day} className={form.weekdays.includes(day) ? "active" : ""} onClick={() => toggleWeekday(day)}>{day}</button>)}</div> : null}
      </section>

      <section className="panel schedule-section">
        <header><div><span>03</span><div><strong>Descanso semanal remunerado</strong><small>Parâmetros para o cálculo do DSR.</small></div></div></header>
        <div className="schedule-dsr"><label><span>Dia do descanso semanal</span><select value={form.dsrDay} onChange={(event) => patch("dsrDay", event.target.value)}>{["Domingo", "Segunda-feira", "Sábado"].map((day) => <option key={day}>{day}</option>)}</select></label><div><span>Base de cálculo</span><div className="schedule-choice"><button className={form.calculationBase === "Parcial" ? "active" : ""} onClick={() => patch("calculationBase", "Parcial")}>Parcial</button><button className={form.calculationBase === "Total" ? "active" : ""} onClick={() => patch("calculationBase", "Total")}>Total</button></div></div><div><span>Percentual de cálculo</span><div className="schedule-choice"><button className={form.calculationPercent === 50 ? "active" : ""} onClick={() => patch("calculationPercent", 50)}>50%</button><button className={form.calculationPercent === 100 ? "active" : ""} onClick={() => patch("calculationPercent", 100)}>100%</button></div></div></div>
      </section>

      <section className="panel schedule-section schedule-options">
        <header><div><span>04</span><div><strong>Aplicação da escala</strong><small>Feriados, motoristas vinculados e registro de localização.</small></div></div></header>
        <div className="schedule-switch-row"><div><strong>Usar feriados no cálculo da jornada</strong><small>Considera o calendário nacional e regional.</small></div><Toggle checked={form.useHolidays} onChange={(value) => patch("useHolidays", value)} /></div>
        <div className="schedule-drivers"><span>Motoristas vinculados</span><div>{driverOptions.map((driver) => <button key={driver} className={form.linkedDrivers.includes(driver) ? "active" : ""} onClick={() => toggleDriver(driver)}>{form.linkedDrivers.includes(driver) ? <Check size={11} /> : <UserRound size={11} />}{driver}{form.linkedDrivers.includes(driver) ? <X size={10} /> : null}</button>)}</div><small>Sem vínculo, a escala pode ser atribuída posteriormente no cadastro do motorista.</small></div>
        <div className="schedule-switch-row"><div><strong>Exigir localização no registro de ponto</strong><small>Salva a posição informada pelo dispositivo junto à marcação.</small></div><Toggle checked={form.locationPunch} onChange={(value) => patch("locationPunch", value)} /></div>
      </section>
    </div>
  </div>;
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><div className="schedule-time-field"><Clock3 size={12} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="00:00" /><i>hh:mm</i></div></label>;
}
