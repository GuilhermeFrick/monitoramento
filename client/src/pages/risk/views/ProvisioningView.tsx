import { useMemo, useState } from "react";
import { AlertTriangle, Check, Eraser, HardDriveUpload, Layers, Pin, RefreshCw, Send, X } from "lucide-react";
import { Callout, KpiCard, Modal, PageHeader, SectionTitle, Tag, formatDateTime, useStoredState } from "../shared";
import { STORAGE, catalogo, embarquesIniciais, equipamentos, newId, tipoItemLabel, type CatalogoItem, type Embarque, type ItemEmbarque, type PerfilOperacional, type PontoDeControle, type TipoItemEmbarque } from "../domain";

type Validacao = { ok: boolean; erros: string[] };

function validarEmissao(selecionados: CatalogoItem[], veiculo: string, embarques: Embarque[], pontos: PontoDeControle[]): Validacao {
  const erros: string[] = [];
  const aceitosNoEquipamento = new Set(embarques.filter((e) => e.veiculo === veiculo).flatMap((e) => e.itens.filter((i) => i.aceite === "aceito").map((i) => i.referencia)));
  const idsSelecionados = new Set(selecionados.map((s) => s.id));
  for (const item of selecionados) {
    for (const dep of item.dependeDe) {
      if (!aceitosNoEquipamento.has(dep) && !idsSelecionados.has(dep)) erros.push(`${item.nome} referencia ${dep}, que ainda não foi embarcado neste equipamento. Inclua-o no embarque.`);
    }
  }
  const pontosSelecionados = selecionados.filter((s) => s.tipo === "ponto").map((s) => pontos.find((p) => p.id === s.id)).filter((p): p is PontoDeControle => Boolean(p));
  for (const ponto of pontosSelecionados) {
    for (const outro of ponto.sobrepoe) {
      const outroPonto = pontos.find((p) => p.id === outro);
      if (outroPonto && ponto.precedencia === null && outroPonto.precedencia === null && (idsSelecionados.has(outro) || aceitosNoEquipamento.has(outro))) erros.push(`${ponto.nome} sobrepõe ${outroPonto.nome} sem precedência declarada.`);
    }
  }
  return { ok: erros.length === 0, erros: Array.from(new Set(erros)) };
}

export function ProvisioningView({ pontos, perfis, onToast }: { pontos: PontoDeControle[]; perfis: PerfilOperacional[]; onToast: (message: string) => void }) {
  const [embarques, setEmbarques] = useStoredState<Embarque[]>(STORAGE.embarques, embarquesIniciais);
  const [tab, setTab] = useState<"embarques" | "catalogo">("embarques");
  const [selectedId, setSelectedId] = useState(embarques[0]?.id ?? "");
  const [showEmit, setShowEmit] = useState(false);
  const [showClean, setShowClean] = useState(false);
  const embarque = embarques.find((e) => e.id === selectedId) ?? embarques[0];
  const catalogoAtual = useMemo<CatalogoItem[]>(() => catalogo.map((item) => { const p = perfis.find((x) => x.id === item.id); const pc = pontos.find((x) => x.id === item.id); return p ? { ...item, versao: p.versao, nome: p.nome } : pc ? { ...item, versao: pc.versao, nome: pc.nome, dependeDe: [pc.politica.perfil] } : item; }), [perfis, pontos]);
  const pendentes = embarques.flatMap((e) => e.itens).filter((i) => i.aceite === "pendente").length;
  const rejeitados = embarques.flatMap((e) => e.itens).filter((i) => i.aceite === "rejeitado").length;

  const simularResposta = () => { setEmbarques((c) => c.map((e) => e.id === embarque.id ? { ...e, itens: e.itens.map((i) => i.aceite === "pendente" ? { ...i, aceite: "aceito", respondidoEm: new Date().toISOString() } : i) } : e)); onToast("Equipamento respondeu: itens pendentes aceitos."); };
  const reenviar = (item: ItemEmbarque) => { setEmbarques((c) => c.map((e) => e.id === embarque.id ? { ...e, itens: e.itens.map((i) => i.id === item.id ? { ...i, aceite: "pendente", motivo: undefined, respondidoEm: undefined } : i) } : e)); onToast(`${item.nome} reenviado ao ${embarque.equipamento}.`); };
  const emitir = (veiculo: string, itens: CatalogoItem[]) => { const eq = equipamentos.find((e) => e.veiculo === veiculo)!; const novo: Embarque = { id: newId("EMB"), veiculo, equipamento: eq.equipamento, emitidoEm: new Date().toISOString(), emitidoPor: "Larissa Martins", itens: itens.map((i) => ({ id: newId("i"), tipo: i.tipo, referencia: i.id, nome: i.nome, versao: i.versao, aceite: "pendente" })) }; setEmbarques((c) => [novo, ...c]); setSelectedId(novo.id); setShowEmit(false); onToast(`Embarque ${novo.id} emitido para ${eq.equipamento} com ${itens.length} item(ns). Aguardando aceite individual.`); };
  const limpar = (veiculo: string) => { const eq = equipamentos.find((e) => e.veiculo === veiculo)!; const fixos = pontos.filter((p) => p.fixo); const novo: Embarque = { id: newId("EMB"), veiculo, equipamento: eq.equipamento, emitidoEm: new Date().toISOString(), emitidoPor: "Larissa Martins", itens: [{ id: newId("i"), tipo: "jornada", referencia: "LIMPEZA", nome: "Limpeza da política embarcada (jornada, pontos, cercas, perfis)", versao: 0, aceite: "pendente" }, ...fixos.map((p) => ({ id: newId("i"), tipo: "ponto" as const, referencia: p.id, nome: `${p.nome} (fixo · mantido)`, versao: p.versao, aceite: "aceito" as const, respondidoEm: new Date().toISOString() }))] }; setEmbarques((c) => [novo, ...c]); setSelectedId(novo.id); setShowClean(false); onToast(`Limpeza emitida para ${eq.equipamento}. ${fixos.length} ponto(s) fixo(s) preservado(s).`); };

  return <>
    <PageHeader eyebrow="O que está no equipamento" title="Provisionamento" description="Catálogo versionado do qual os embarques são emitidos. Cada item é aceito ou rejeitado individualmente pelo equipamento." action="Emitir embarque" actionIcon={Send} onAction={() => setShowEmit(true)} />
    <div className="kpi-grid"><KpiCard label="Embarques emitidos" value={String(embarques.length).padStart(2, "0")} meta="Últimas 24 h" icon={HardDriveUpload} /><KpiCard label="Itens aguardando aceite" value={String(pendentes).padStart(2, "0")} meta="Equipamentos ainda não responderam" icon={RefreshCw} tone="amber" /><KpiCard label="Itens rejeitados" value={String(rejeitados).padStart(2, "0")} meta="Corrigir e reenviar" icon={AlertTriangle} tone="red" /><KpiCard label="Itens no catálogo" value={String(catalogoAtual.length)} meta={`${perfis.filter((p) => p.status === "publicado").length} perfis publicados`} icon={Layers} /></div>
    <div className="segmented" style={{ marginBottom: 16 }}><button className={tab === "embarques" ? "active" : ""} onClick={() => setTab("embarques")}>Embarques</button><button className={tab === "catalogo" ? "active" : ""} onClick={() => setTab("catalogo")}>Catálogo versionado</button></div>

    {tab === "embarques" ? <div className="split-layout">
      <div className="panel" style={{ padding: 0 }}>
        <div className="toolbar"><div><div className="panel-title">Embarques</div><div className="panel-subtitle">Por equipamento</div></div><button className="secondary-btn" onClick={() => setShowClean(true)}><Eraser size={13} /> Limpar política</button></div>
        <div className="list-select">{embarques.map((e) => { const a = e.itens.filter((i) => i.aceite === "aceito").length; const r = e.itens.filter((i) => i.aceite === "rejeitado").length; const p = e.itens.length - a - r; return <button key={e.id} className={`list-select-item ${e.id === embarque.id ? "active" : ""}`} onClick={() => setSelectedId(e.id)}><span className="list-select-main"><strong>{e.veiculo} · {e.equipamento}</strong><small>{e.id} · {formatDateTime(e.emitidoEm)} · {e.emitidoPor}</small></span><span className="accept-summary"><span className="ok">{a}</span><span className="pend">{p}</span><span className="rej">{r}</span></span></button>; })}</div>
      </div>
      <div className="panel">
        <SectionTitle title={`${embarque.id} · ${embarque.veiculo}`} subtitle={`${embarque.equipamento} · emitido ${formatDateTime(embarque.emitidoEm)} por ${embarque.emitidoPor}`}>{embarque.itens.some((i) => i.aceite === "pendente") ? <button className="soft-btn" onClick={simularResposta}><RefreshCw size={13} /> Consultar equipamento</button> : <Tag tone="teal"><Check size={10} /> respondido</Tag>}</SectionTitle>
        <Callout tone="info" icon={Check} title="Aceite é por item, não por embarque">O equipamento confirma cada item separadamente. Um item rejeitado não invalida os demais.</Callout>
        <div className="accept-list" style={{ marginTop: 14 }}>{embarque.itens.map((item) => <div key={item.id} className={`accept-item ${item.aceite}`}><span className={`accept-icon ${item.aceite}`}>{item.aceite === "aceito" ? <Check size={12} /> : item.aceite === "rejeitado" ? <X size={12} /> : <RefreshCw size={12} />}</span><div><div className="feed-title">{item.nome}{item.nome.includes("fixo") ? <Pin size={10} style={{ marginLeft: 6 }} /> : null}</div><div className="feed-desc">{tipoItemLabel[item.tipo]} · {item.referencia}{item.versao ? ` · v${item.versao}` : ""}{item.respondidoEm ? ` · respondido ${formatDateTime(item.respondidoEm)}` : " · aguardando"}</div>{item.motivo ? <div className="reject-reason"><AlertTriangle size={11} /> {item.motivo}</div> : null}</div><div>{item.aceite === "rejeitado" ? <button className="secondary-btn" onClick={() => reenviar(item)}>Reenviar</button> : <Tag tone={item.aceite === "aceito" ? "teal" : "amber"}>{item.aceite === "aceito" ? "Aceito" : "Pendente"}</Tag>}</div></div>)}</div>
      </div>
    </div> : null}

    {tab === "catalogo" ? <div className="panel" style={{ padding: 0 }}>
      <div className="toolbar"><div><div className="panel-title">Catálogo versionado</div><div className="panel-subtitle">Somente itens publicados podem ser embarcados</div></div></div>
      <div className="table-wrap"><table><thead><tr><th>ITEM</th><th>TIPO</th><th>VERSÃO</th><th>PUBLICADO</th><th>DEPENDE DE</th><th>EQUIPAMENTOS</th></tr></thead><tbody>{catalogoAtual.map((item) => { const n = embarques.flatMap((e) => e.itens).filter((i) => i.referencia === item.id && i.aceite === "aceito").length; return <tr key={item.id}><td><div className="vehicle-name">{item.nome}</div><div className="vehicle-meta">{item.id}</div></td><td><Tag>{tipoItemLabel[item.tipo]}</Tag></td><td>v{item.versao}</td><td>{formatDateTime(item.publicadoEm)}</td><td style={{ fontSize: 10 }}>{item.dependeDe.length ? item.dependeDe.join(", ") : "—"}</td><td>{n}</td></tr>; })}</tbody></table></div>
    </div> : null}

    {showEmit ? <EmitModal catalogo={catalogoAtual} embarques={embarques} pontos={pontos} onClose={() => setShowEmit(false)} onEmit={emitir} /> : null}
    {showClean ? <CleanModal pontos={pontos} onClose={() => setShowClean(false)} onClean={limpar} /> : null}
  </>;
}

function EmitModal({ catalogo: itens, embarques, pontos, onClose, onEmit }: { catalogo: CatalogoItem[]; embarques: Embarque[]; pontos: PontoDeControle[]; onClose: () => void; onEmit: (veiculo: string, itens: CatalogoItem[]) => void }) {
  const [veiculo, setVeiculo] = useState(equipamentos[0].veiculo);
  const [ids, setIds] = useState<string[]>(["RG-2048", "PC-005"]);
  const selecionados = itens.filter((i) => ids.includes(i.id));
  const validacao = validarEmissao(selecionados, veiculo, embarques, pontos);
  const grupos = (Object.keys(tipoItemLabel) as TipoItemEmbarque[]).map((tipo) => ({ tipo, itens: itens.filter((i) => i.tipo === tipo) })).filter((g) => g.itens.length);
  return <Modal title="Emitir embarque" description="Selecione o equipamento e os itens do catálogo. A validação roda antes do envio." onClose={onClose} wide>
    <div className="form-field"><label>Equipamento de destino</label><select value={veiculo} onChange={(e) => setVeiculo(e.target.value)}>{equipamentos.map((e) => <option key={e.veiculo} value={e.veiculo}>{e.veiculo} · {e.equipamento} · {e.linha} fw {e.firmware}</option>)}</select></div>
    <div className="catalog-pick">{grupos.map((g) => <div key={g.tipo}><div className="detail-label">{tipoItemLabel[g.tipo]}</div>{g.itens.map((item) => { const on = ids.includes(item.id); return <label key={item.id} className={`check-item ${on ? "on" : ""}`}><input type="checkbox" checked={on} onChange={() => setIds((c) => on ? c.filter((x) => x !== item.id) : [...c, item.id])} /><span><strong>{item.nome}</strong><small>{item.id} · v{item.versao}{item.dependeDe.length ? ` · depende de ${item.dependeDe.join(", ")}` : ""}</small></span></label>; })}</div>)}</div>
    {selecionados.length && !validacao.ok ? <div className="validation-box"><div className="validation-title"><AlertTriangle size={13} /> Emissão bloqueada · {validacao.erros.length} erro(s) de validação</div><ul>{validacao.erros.map((erro) => <li key={erro}>{erro}</li>)}</ul></div> : selecionados.length ? <Callout tone="ok" icon={Check} title="Validação concluída">Todas as referências estão embarcadas ou incluídas neste envio. Sem sobreposição pendente.</Callout> : null}
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!selecionados.length || !validacao.ok} onClick={() => onEmit(veiculo, selecionados)}><Send size={13} /> Emitir {selecionados.length} item(ns)</button></div>
  </Modal>;
}

function CleanModal({ pontos, onClose, onClean }: { pontos: PontoDeControle[]; onClose: () => void; onClean: (veiculo: string) => void }) {
  const [veiculo, setVeiculo] = useState(equipamentos[1].veiculo);
  const [confirm, setConfirm] = useState("");
  const fixos = pontos.filter((p) => p.fixo);
  return <Modal title="Limpar política embarcada" description="Zera jornada, pontos de controle, cercas e perfis do equipamento. Pontos marcados como fixos são preservados." onClose={onClose}>
    <div className="form-field"><label>Equipamento</label><select value={veiculo} onChange={(e) => setVeiculo(e.target.value)}>{equipamentos.map((e) => <option key={e.veiculo} value={e.veiculo}>{e.veiculo} · {e.equipamento}</option>)}</select></div>
    <Callout tone="warn" icon={Pin} title={`${fixos.length} ponto(s) fixo(s) sobrevivem à limpeza`}>{fixos.map((p) => p.nome).join(" · ")}</Callout>
    <div className="form-field" style={{ marginTop: 14 }}><label>Digite LIMPAR para confirmar</label><input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="LIMPAR" /></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn danger-btn" disabled={confirm !== "LIMPAR"} onClick={() => onClean(veiculo)}><Eraser size={13} /> Emitir limpeza</button></div>
  </Modal>;
}
