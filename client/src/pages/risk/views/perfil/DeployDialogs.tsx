import { AlertTriangle, Check, CircleCheck, CircleX, Loader2, RotateCcw, Upload } from "lucide-react";
import { Modal, formatDateTime } from "../../shared";
import { itensDoEmbarque, type ConfiguracaoVeiculo, type ResultadoEmbarque, type Validacao } from "../../domain";

export type FaseEmbarque = "revisao" | "enviando" | "resultado";

export function DeployReviewDialog({ config, validacoes, fase, resultado, onClose, onConfirmar, onTentarNovamente }: {
  config: ConfiguracaoVeiculo;
  validacoes: Validacao[];
  fase: FaseEmbarque;
  resultado: ResultadoEmbarque | null;
  onClose: () => void;
  onConfirmar: () => void;
  onTentarNovamente: () => void;
}) {
  const erros = validacoes.filter((v) => v.nivel === "erro");
  const avisos = validacoes.filter((v) => v.nivel === "aviso");
  const itens = itensDoEmbarque(config);

  if (fase === "enviando") {
    return <Modal title={`Embarcando em ${config.veiculo}`} description="O equipamento responde item a item." onClose={() => { /* bloqueado durante o envio */ }}>
      <div className="wsp-enviando"><Loader2 size={22} className="girando" /><p>Enviando {itens.length} itens ao equipamento…</p></div>
    </Modal>;
  }

  if (fase === "resultado" && resultado) {
    return <Modal
      title={resultado.estado === "sucesso" ? "Embarque concluído" : resultado.estado === "parcial" ? "Embarque parcial" : "Embarque falhou"}
      description={`${config.veiculo} · ${formatDateTime(resultado.em)} · ${resultado.por}`}
      onClose={onClose}
    >
      <DeployResultPanel resultado={resultado} />
      <div className="modal-actions">
        {resultado.estado === "sucesso"
          ? <button className="primary-btn" onClick={onClose}><Check size={13} /> Fechar</button>
          : <>
              <button className="secondary-btn" onClick={onClose}>Fechar</button>
              <button className="primary-btn" onClick={onTentarNovamente}><RotateCcw size={13} /> Tentar novamente os rejeitados</button>
            </>}
      </div>
    </Modal>;
  }

  return <Modal title={`Revisar e embarcar em ${config.veiculo}`} description={`${config.frota} · ${config.mudancas.length} alteração(ões) desde o último embarque`} onClose={onClose} wide>
    {erros.length ? <div className="wsp-validacoes erro">
      <p className="wsp-validacoes-titulo"><AlertTriangle size={14} /> {erros.length} problema(s) impedem o embarque</p>
      <ul>{erros.map((e, i) => <li key={i}>{e.mensagem}</li>)}</ul>
    </div> : null}

    {avisos.length ? <div className="wsp-validacoes aviso">
      <p className="wsp-validacoes-titulo"><AlertTriangle size={14} /> {avisos.length} aviso(s) — não impedem o embarque</p>
      <ul>{avisos.map((a, i) => <li key={i}>{a.mensagem}</li>)}</ul>
    </div> : null}

    <div className="wsp-revisao-grid">
      <section>
        <h3>O que mudou</h3>
        {config.mudancas.length
          ? <ul className="wsp-mudancas">{config.mudancas.map((m) => <li key={m.id}>
              <span>{m.descricao}</span>
              <small>{formatDateTime(m.em)} · {m.por}</small>
            </li>)}</ul>
          : <p className="wsp-vazio">Nenhuma alteração pendente.</p>}
      </section>
      <section>
        <h3>O que será enviado</h3>
        <ul className="wsp-itens-embarque">{itens.map((i) => <li key={i.id}>{i.nome}</li>)}</ul>
        <p className="wsp-ajuda menor">
          Alvo: <strong>{config.veiculo}</strong> · versão no equipamento hoje: {config.versaoEmbarcada ?? "nenhuma"}
          {config.sincronizadoEm ? ` · última sincronização ${formatDateTime(config.sincronizadoEm)}` : " · nunca sincronizado"}
        </p>
      </section>
    </div>

    <div className="modal-actions">
      <button className="secondary-btn" onClick={onClose}>Cancelar</button>
      <button className="primary-btn" disabled={erros.length > 0 || !config.mudancas.length} onClick={onConfirmar}>
        <Upload size={13} /> {erros.length ? "Corrija os problemas para embarcar" : `Embarcar ${itens.length} itens`}
      </button>
    </div>
  </Modal>;
}

export function DeployResultPanel({ resultado }: { resultado: ResultadoEmbarque }) {
  const aceitos = resultado.itens.filter((i) => i.estado === "aceito");
  const rejeitados = resultado.itens.filter((i) => i.estado === "rejeitado");
  return <div className="wsp-resultado">
    <p className="wsp-resultado-resumo">
      <span className="ok"><CircleCheck size={14} /> {aceitos.length} aceito(s)</span>
      {rejeitados.length ? <span className="falha"><CircleX size={14} /> {rejeitados.length} rejeitado(s)</span> : null}
    </p>
    <ul className="wsp-resultado-itens">{resultado.itens.map((i) => <li key={i.id} className={i.estado}>
      {i.estado === "aceito" ? <CircleCheck size={14} /> : <CircleX size={14} />}
      <span><strong>{i.nome}</strong>{i.motivo ? <small>{i.motivo}</small> : null}</span>
    </li>)}</ul>
  </div>;
}
