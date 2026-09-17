/**
 * Acesso a dados de dispositivos. Fala SQL e vocabulário de negócio; não sabe
 * que existe HTTP.
 */
import { randomUUID } from "node:crypto";
import type {
  AlterarDispositivoTransporte,
  CriarDispositivoTransporte,
  DispositivoDesconhecidoTransporte,
  DispositivoTransporte,
  FiltroDispositivosTransporte,
} from "@avansat/contratos";
import { ErroHttp } from "../../infra/http";
import { ERRO_PG, codigoPg, consultar, restricaoPg } from "../../infra/postgres";

type LinhaDispositivo = {
  id: string;
  serie: string;
  familia: string;
  apelido: string | null;
  situacao: string;
  veiculo: string | null;
  observacao: string | null;
  decl_modelo: string | null;
  decl_protocolo: string | null;
  decl_canais: number | null;
  decl_evidencia: string | null;
  decl_ip: string | null;
  visto_em: Date | null;
  versao: number;
  criado_em: Date;
  atualizado_em: Date;
};

const COLUNAS = `id, serie, familia, apelido, situacao, veiculo, observacao,
  decl_modelo, decl_protocolo, decl_canais, decl_evidencia, decl_ip, visto_em,
  versao, criado_em, atualizado_em`;

/**
 * Traduz linha para transporte. É o único lugar onde as duas formas se
 * encontram, e ele garante duas coisas:
 *
 * - **Chave ausente não existe.** Todo campo do contrato sai daqui preenchido,
 *   com nulo quando for o caso. Chave que some faz a tela decidir errado sem o
 *   compilador reclamar.
 * - **Data vira ISO com fuso.** `toISOString` sempre, nunca o `toString` do
 *   objeto Date, que muda com o fuso do processo.
 */
function paraTransporte(l: LinhaDispositivo): DispositivoTransporte {
  return {
    id: l.id,
    serie: l.serie,
    familia: l.familia as DispositivoTransporte["familia"],
    apelido: l.apelido,
    situacao: l.situacao as DispositivoTransporte["situacao"],
    veiculo: l.veiculo,
    observacao: l.observacao,
    declarado: {
      modelo: l.decl_modelo,
      protocolo: l.decl_protocolo,
      canais: l.decl_canais,
      evidencia_versao: l.decl_evidencia,
      visto_em: l.visto_em ? l.visto_em.toISOString() : null,
      ip: l.decl_ip,
    },
    versao: l.versao,
    criado_em: l.criado_em.toISOString(),
    atualizado_em: l.atualizado_em.toISOString(),
  };
}

export async function listar(
  cliente: string,
  filtro: FiltroDispositivosTransporte,
): Promise<{ itens: DispositivoTransporte[]; proximo_cursor: string | null; total: number }> {
  const where: string[] = ["cliente_id = $1"];
  const valores: unknown[] = [cliente];

  const adicionar = (condicao: string, valor: unknown) => {
    valores.push(valor);
    where.push(condicao.replace("$?", `$${valores.length}`));
  };

  if (filtro.situacao) adicionar("situacao = $?", filtro.situacao);
  if (filtro.familia) adicionar("familia = $?", filtro.familia);
  if (filtro.sem_veiculo === true) where.push("veiculo is null");
  if (filtro.sem_veiculo === false) where.push("veiculo is not null");
  if (filtro.busca) {
    adicionar("(serie ilike $? or coalesce(apelido,'') ilike $? or coalesce(veiculo,'') ilike $?)", `%${filtro.busca}%`);
    // O mesmo valor serve para os três campos: repete o índice do parâmetro.
    const i = valores.length;
    where[where.length - 1] = where[where.length - 1]!.replace(/\$\?/g, `$${i}`);
  }
  // Cursor é a própria série do último item da página anterior, que é única
  // por cliente e ordenável. Offset seria mais simples e erra quando alguém
  // cadastra um aparelho no meio da paginação.
  if (filtro.cursor) adicionar("serie > $?", filtro.cursor);

  const condicao = where.join(" and ");
  valores.push(filtro.limite + 1);

  const linhas = await consultar<LinhaDispositivo>(
    `select ${COLUNAS} from dispositivos where ${condicao} order by serie limit $${valores.length}`,
    valores,
  );

  const contagem = await consultar<{ total: string }>(
    `select count(*)::text as total from dispositivos where cliente_id = $1`,
    [cliente],
  );

  const temMais = linhas.length > filtro.limite;
  const pagina = temMais ? linhas.slice(0, filtro.limite) : linhas;
  return {
    itens: pagina.map(paraTransporte),
    proximo_cursor: temMais ? (pagina[pagina.length - 1]?.serie ?? null) : null,
    total: Number(contagem[0]?.total ?? 0),
  };
}

export async function obter(cliente: string, id: string): Promise<DispositivoTransporte> {
  const linhas = await consultar<LinhaDispositivo>(
    `select ${COLUNAS} from dispositivos where cliente_id = $1 and id = $2`,
    [cliente, id],
  );
  const linha = linhas[0];
  // Id de outro cliente cai aqui e vira 404, nunca 403: um 403 contaria ao
  // chamador que aquele id existe em algum lugar.
  if (!linha) throw new ErroHttp("nao_encontrado", `Dispositivo ${id} não encontrado.`);
  return paraTransporte(linha);
}

export async function criar(
  cliente: string,
  entrada: CriarDispositivoTransporte,
): Promise<DispositivoTransporte> {
  const id = randomUUID();
  try {
    const linhas = await consultar<LinhaDispositivo>(
      `insert into dispositivos
         (cliente_id, id, serie, familia, apelido, situacao, veiculo, observacao)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning ${COLUNAS}`,
      [cliente, id, entrada.serie, entrada.familia, entrada.apelido,
       entrada.situacao, entrada.veiculo, entrada.observacao],
    );
    // Cadastrado: sai da fila de desconhecidos, se estava nela.
    await consultar(`delete from dispositivos_desconhecidos where upper(serie) = upper($1) and familia = $2`,
      [entrada.serie, entrada.familia]);
    return paraTransporte(linhas[0]!);
  } catch (erro) {
    throw traduzirConflito(erro, entrada.serie, entrada.veiculo);
  }
}

export async function alterar(
  cliente: string,
  id: string,
  mudancas: AlterarDispositivoTransporte,
): Promise<DispositivoTransporte> {
  const atual = await obter(cliente, id); // 404 antes de qualquer outra coisa

  // Versão defasada é conflito, não erro de validação: os dois lados mandaram
  // dado válido, e o que falhou foi a suposição de estar editando a versão
  // corrente. Sem isto o último a salvar apaga o trabalho do primeiro.
  if (mudancas.versao !== atual.versao) {
    throw new ErroHttp(
      "conflito",
      `Dispositivo alterado por outra pessoa: você editou a versão ${mudancas.versao}, a atual é ${atual.versao}.`,
    );
  }

  const campos: string[] = [];
  const valores: unknown[] = [cliente, id, atual.versao];
  const definir = (coluna: string, valor: unknown) => {
    valores.push(valor);
    campos.push(`${coluna} = $${valores.length}`);
  };
  if (mudancas.apelido !== undefined) definir("apelido", mudancas.apelido);
  if (mudancas.situacao !== undefined) definir("situacao", mudancas.situacao);
  if (mudancas.veiculo !== undefined) definir("veiculo", mudancas.veiculo);
  if (mudancas.observacao !== undefined) definir("observacao", mudancas.observacao);
  if (mudancas.familia !== undefined) definir("familia", mudancas.familia);

  if (campos.length === 0) return atual;

  try {
    const linhas = await consultar<LinhaDispositivo>(
      `update dispositivos
          set ${campos.join(", ")}, versao = versao + 1, atualizado_em = now()
        where cliente_id = $1 and id = $2 and versao = $3
        returning ${COLUNAS}`,
      valores,
    );
    const linha = linhas[0];
    // Ninguém casou: alguém alterou entre o obter e o update. Mesma resposta
    // do conflito de versão acima, porque é o mesmo problema com outro timing.
    if (!linha) throw new ErroHttp("conflito", "Dispositivo alterado durante a edição. Recarregue.");
    return paraTransporte(linha);
  } catch (erro) {
    if (erro instanceof ErroHttp) throw erro;
    throw traduzirConflito(erro, atual.serie, mudancas.veiculo ?? null);
  }
}

export async function remover(cliente: string, id: string): Promise<void> {
  const linhas = await consultar<{ id: string }>(
    `delete from dispositivos where cliente_id = $1 and id = $2 returning id`,
    [cliente, id],
  );
  if (linhas.length === 0) throw new ErroHttp("nao_encontrado", `Dispositivo ${id} não encontrado.`);
}

export async function desconhecidos(limite: number): Promise<DispositivoDesconhecidoTransporte[]> {
  const linhas = await consultar<{
    serie: string; familia: string; modelo: string | null;
    placa_declarada: string | null; ip: string | null; tentativas: number;
    primeira_em: Date; ultima_em: Date;
  }>(
    `select serie, familia, modelo, placa_declarada, ip, tentativas, primeira_em, ultima_em
       from dispositivos_desconhecidos order by ultima_em desc limit $1`,
    [limite],
  );
  return linhas.map((l) => ({
    serie: l.serie,
    familia: l.familia as DispositivoDesconhecidoTransporte["familia"],
    modelo: l.modelo,
    placa_declarada: l.placa_declarada,
    ip: l.ip,
    tentativas: l.tentativas,
    primeira_em: l.primeira_em.toISOString(),
    ultima_em: l.ultima_em.toISOString(),
  }));
}

/**
 * Traduz violação de unicidade em conflito com mensagem que diz o que fazer.
 *
 * Deixar o erro cru do Postgres vazar daria 500 num caso que é 409, e mostraria
 * nome de índice para o operador.
 */
function traduzirConflito(erro: unknown, serie: string, veiculo: string | null): unknown {
  if (codigoPg(erro) !== ERRO_PG.UNICO) return erro;
  const indice = restricaoPg(erro) ?? "";
  if (indice.includes("serie")) {
    return new ErroHttp("conflito", `Já existe um dispositivo com a série ${serie}.`, { serie: "Série já cadastrada." });
  }
  if (indice.includes("veiculo")) {
    return new ErroHttp("conflito", `O veículo ${veiculo} já tem um dispositivo.`, { veiculo: "Veículo já tem dispositivo." });
  }
  return new ErroHttp("conflito", "Registro em conflito com um existente.");
}
