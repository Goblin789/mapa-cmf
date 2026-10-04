// Exportar para Excel: três folhas — Pessoas (as colunas da tabela: o nome completo com maiúsculas
// normais, como na Tabela), Casas e Carrinhas (como as folhas do Michael, um nome curto por célula com o
// fundo da cor do cliente). Exporta o que se vê: no modo de edição, a simulação (o ficheiro diz
// "simulação" no nome); na Tabela com filtros, a folha Pessoas só com as linhas filtradas, pela ordem da
// Tabela (o ficheiro diz "filtrado"; as folhas Casas e Carrinhas ficam inteiras).
// As linhas montam-se em funções puras (testadas); a biblioteca (write-excel-file, versão do browser)
// só se descarrega quando se carrega no botão (import dinâmico).
// M2: na folha Pessoas, "Indisponível até" (dd/mm/aaaa ou "sem data"; só a data, nunca o motivo); nas
// folhas Casas e Carrinhas, "Problemas abertos" (o número); a ocupação das carrinhas não conta quem está
// indisponível hoje (ocupacaoDaCarrinha).

import type { Cell, CellObject, SheetData } from 'write-excel-file/browser';
import { COR_TEXTO_NOMES, clienteEfetivoId } from '../../dominio/cores';
import type { Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import { formatarMatricula } from '../../dominio/matricula';
import { type NivelLotacao, ocupacaoCasa, ocupacaoDaCarrinha } from '../../dominio/ocupacao';
import { type AlvoProblema, chaveAlvoProblema } from '../../dominio/problemas';
import type { Estado, Id, Pessoa } from '../../dominio/tipos';
import { ESTILO_NIVEL } from '../comum/lotacao';
import { ordenarPorClienteENome } from '../lista/seccoes';
import { condutorDaCarrinha } from '../paineis/condutor';
import { carrinhasQueDormemEm } from '../paineis/fichas';
import {
  ROTULO_FORA_DAS_CASAS,
  ROTULO_SEM_TRANSPORTE,
  ROTULO_TIPO_VEICULO,
  textoDormida,
  textoMarcaModelo,
} from '../paineis/textos';
import { dataISOLuxemburgo } from './horas';
import {
  type LinhaTabela,
  linhasDaTabela,
  ORDEM_INICIAL,
  ordenarLinhas,
  textoAConfirmar,
  textoIndisponivelExcel,
} from './linhasTabela';

export interface FolhaExcel {
  nome: string;
  linhas: SheetData;
  /** Largura de cada coluna, em caracteres. */
  larguras: number[];
}

const FUNDO_CABECALHO = '#DCDCD8';
const LARGURA_NOME = 20;

function cabecalho(texto: string, extra: Partial<CellObject> = {}): CellObject {
  return {
    value: texto,
    type: String,
    fontWeight: 'bold',
    backgroundColor: FUNDO_CABECALHO,
    bottomBorderStyle: 'thin',
    bottomBorderColor: '#575756',
    ...extra,
  };
}

function texto(valor: string | null | undefined, extra: Partial<CellObject> = {}): Cell {
  if (valor === null || valor === undefined || valor === '') return null;
  return { value: valor, type: String, ...extra };
}

function numero(valor: number): CellObject {
  return { value: valor, type: Number, align: 'right' };
}

/** Nome com o fundo da cor do cliente e o texto quase-preto de todos os nomes (como no mapa). */
function celulaNome(p: Pessoa, ind: Indices, nome = p.nomeCurto): CellObject {
  const cliente = ind.clientes.get(clienteEfetivoId(p, ind.obras));
  return {
    value: nome,
    type: String,
    textColor: COR_TEXTO_NOMES,
    ...(cliente ? { backgroundColor: cliente.cor } : {}),
  };
}

/**
 * Cores da ocupação no Excel, como o número da pastilha na app (comum/lotacao.ts): verde-800 e âmbar-800
 * sobre branco; gente a mais a branco sobre vermelho-700. Todas com ≥ 6:1 de contraste. (O corHex de
 * ESTILO_NIVEL é a cor do contorno: o âmbar-600 do "cheio" só dava 3,2:1 como texto.)
 */
export const CORES_LOTACAO_EXCEL: Record<NivelLotacao, { texto: string; fundo?: string }> = {
  livre: { texto: '#016630' },
  cheio: { texto: '#973C00' },
  excesso: { texto: '#FFFFFF', fundo: '#C10007' },
};

/** "9/10" com a cor do nível e o símbolo da pastilha (○ há lugares, ● cheio, ▲ gente a mais). */
function celulaLotacao(ocupados: number, lugares: number, nivel: NivelLotacao): CellObject {
  const { texto: corTexto, fundo } = CORES_LOTACAO_EXCEL[nivel];
  return {
    value: `${ESTILO_NIVEL[nivel].simbolo} ${ocupados}/${lugares}`,
    type: String,
    align: 'center',
    fontWeight: 'bold',
    textColor: corTexto,
    ...(fundo ? { backgroundColor: fundo } : {}),
  };
}

/** M2: número de problemas por resolver da casa/carrinha (vazio sem nenhum). */
function celulaProblemas(ind: Pick<Indices, 'problemasAbertos'>, alvo: AlvoProblema): Cell {
  const n = ind.problemasAbertos.get(chaveAlvoProblema(alvo))?.length ?? 0;
  return n > 0 ? { ...numero(n), align: 'center', textColor: '#973C00', fontWeight: 'bold' } : null;
}

/** Cabeçalho "Moradores" (ou "Passageiros") a ocupar as colunas dos nomes. */
function cabecalhoNomes(rotulo: string, colunas: number): Cell[] {
  const n = Math.max(1, colunas);
  return [cabecalho(rotulo, n > 1 ? { columnSpan: n } : {}), ...Array.from({ length: n - 1 }, () => null)];
}

// --- Folhas ---------------------------------------------------------------------------------------

/**
 * Folha Pessoas: por omissão toda a gente, pelo nome. Da Tabela com filtros vêm as linhas que ela mostra
 * (filtradas e pela ordem dela): "exporta o que se vê".
 */
export function folhaPessoas(
  estado: Estado,
  ind: Indices,
  soEstas: readonly LinhaTabela[] | null = null,
): FolhaExcel {
  const linhas = soEstas ?? ordenarLinhas(linhasDaTabela(estado, ind), ORDEM_INICIAL);
  return {
    nome: 'Pessoas',
    larguras: [30, 12, 16, 22, 26, 11, 10, 16, 18],
    linhas: [
      [
        'Nome',
        'Nº',
        'Cliente',
        'Obra',
        'Casa',
        'Carrinha',
        'Condutor',
        'Indisponível até',
        'A confirmar',
      ].map((t) => cabecalho(t)),
      ...linhas.map((l): Cell[] => [
        // Quem saiu da empresa só vem com "Mostrar quem saiu" (Tabela): diz-se.
        celulaNome(l.pessoa, ind, l.saiu ? `${l.nomeMostrado} (saiu)` : l.nomeMostrado),
        texto(l.numero),
        texto(l.cliente?.nome),
        texto(l.obra?.nome ?? 'sem obra', l.obra ? {} : { fontStyle: 'italic', textColor: '#70706F' }),
        texto(
          l.casa?.nome ?? ROTULO_FORA_DAS_CASAS,
          l.casa ? {} : { fontStyle: 'italic', textColor: '#70706F' },
        ),
        texto(
          l.carrinha ? formatarMatricula(l.carrinha.matricula) : 'sem transporte',
          l.carrinha ? {} : { fontStyle: 'italic', textColor: '#70706F' },
        ),
        texto(l.condutor ? 'Sim' : null, { align: 'center' }),
        texto(textoIndisponivelExcel(l.indisponivel), { align: 'center' }),
        texto(textoAConfirmar(l), { textColor: '#92400E', fontWeight: 'bold' }),
      ]),
    ],
  };
}

export function folhaCasas(estado: Estado, ind: Indices, dormidas: Map<Id, Dormida>): FolhaExcel {
  const casas = [...estado.casas].sort((a, b) => a.ordem - b.ordem);
  const linhasCasas = casas.map((casa) => {
    const moradores = ordenarPorClienteENome(ind.moradores.get(casa.id) ?? [], ind);
    const oc = ocupacaoCasa(casa, moradores.length);
    const carrinhas = carrinhasQueDormemEm(casa.id, ind, dormidas)
      .map(({ carrinha, confianca }) =>
        confianca === 'sugerida'
          ? `≈ ${formatarMatricula(carrinha.matricula)}`
          : formatarMatricula(carrinha.matricula),
      )
      .join(', ');
    return { casa, moradores, oc, carrinhas };
  });
  const fora = ordenarPorClienteENome(ind.foraDasCasas, ind);
  const maxNomes = Math.max(1, fora.length, ...linhasCasas.map((l) => l.moradores.length));
  return {
    nome: 'Casas',
    larguras: [26, 28, 10, 8, 26, 11, ...Array.from({ length: maxNomes }, () => LARGURA_NOME)],
    linhas: [
      [
        cabecalho('Casa'),
        cabecalho('Morada'),
        cabecalho('Lotação', { align: 'center' }),
        cabecalho('Livres', { align: 'right' }),
        cabecalho('Carrinhas que lá dormem'),
        cabecalho('Problemas abertos', { align: 'center' }),
        ...cabecalhoNomes('Moradores', maxNomes),
      ],
      ...linhasCasas.map(({ casa, moradores, oc, carrinhas }): Cell[] => [
        texto(casa.nome, { fontWeight: 'bold' }),
        texto(ind.locais.get(casa.localId)?.nome),
        celulaLotacao(oc.ocupados, oc.lotacao, oc.nivel),
        numero(oc.livres),
        texto(carrinhas),
        celulaProblemas(ind, { tipo: 'casa', id: casa.id }),
        ...moradores.map((p) => celulaNome(p, ind)),
      ]),
      [
        texto(ROTULO_FORA_DAS_CASAS, { fontWeight: 'bold', fontStyle: 'italic' }),
        null,
        texto(String(fora.length), { align: 'center', fontWeight: 'bold' }),
        null,
        null,
        null,
        ...fora.map((p) => celulaNome(p, ind)),
      ],
    ],
  };
}

export function folhaCarrinhas(estado: Estado, ind: Indices, dormidas: Map<Id, Dormida>): FolhaExcel {
  const carrinhas = [...estado.carrinhas].sort(
    (a, b) => a.ordem - b.ordem || a.matricula.localeCompare(b.matricula),
  );
  const linhasCarrinhas = carrinhas.map((carrinha) => {
    const todos = ordenarPorClienteENome(ind.passageiros.get(carrinha.id) ?? [], ind);
    const condutor = condutorDaCarrinha(carrinha, ind);
    const passageiros = todos.filter((p) => p.id !== condutor?.id);
    // Quem está indisponível hoje continua na lista, mas não conta na ocupação (o lugar está livre).
    const oc = ocupacaoDaCarrinha(ind, carrinha);
    const dormidaCarrinha = dormidas.get(carrinha.id);
    const d = textoDormida(dormidaCarrinha, ind);
    const dormida = d.desconhecida
      ? 'por definir'
      : dormidaCarrinha?.confianca === 'sugerida'
        ? `≈ ${d.rotulo} (sugerido)`
        : d.rotulo;
    return { carrinha, condutor, passageiros, oc, dormida, desconhecida: d.desconhecida };
  });
  const sem = ordenarPorClienteENome(ind.semTransporte, ind);
  const maxNomes = Math.max(1, sem.length, ...linhasCarrinhas.map((l) => l.passageiros.length));
  return {
    nome: 'Carrinhas',
    larguras: [
      12,
      10,
      22,
      8,
      10,
      LARGURA_NOME,
      28,
      11,
      ...Array.from({ length: maxNomes }, () => LARGURA_NOME),
    ],
    linhas: [
      [
        cabecalho('Matrícula'),
        cabecalho('Tipo'),
        cabecalho('Marca e modelo'),
        cabecalho('Lugares', { align: 'right' }),
        cabecalho('Ocupação', { align: 'center' }),
        cabecalho('Condutor'),
        cabecalho('Onde dorme'),
        cabecalho('Problemas abertos', { align: 'center' }),
        ...cabecalhoNomes('Passageiros', maxNomes),
      ],
      ...linhasCarrinhas.map(({ carrinha, condutor, passageiros, oc, dormida, desconhecida }): Cell[] => [
        texto(formatarMatricula(carrinha.matricula), { fontWeight: 'bold' }),
        texto(ROTULO_TIPO_VEICULO[carrinha.tipo]),
        texto(textoMarcaModelo(carrinha)),
        numero(carrinha.lugares),
        celulaLotacao(oc.ocupados, oc.lugares, oc.nivel),
        condutor
          ? celulaNome(condutor, ind)
          : texto(passageiros.length > 0 ? 'sem condutor' : null, {
              fontStyle: 'italic',
              textColor: '#70706F',
            }),
        texto(dormida, desconhecida ? { fontStyle: 'italic', textColor: '#70706F' } : {}),
        celulaProblemas(ind, { tipo: 'carrinha', id: carrinha.id }),
        ...passageiros.map((p) => celulaNome(p, ind)),
      ]),
      [
        texto(ROTULO_SEM_TRANSPORTE, { fontWeight: 'bold', fontStyle: 'italic' }),
        null,
        null,
        null,
        texto(String(sem.length), { align: 'center', fontWeight: 'bold' }),
        null,
        null,
        null,
        ...sem.map((p) => celulaNome(p, ind)),
      ],
    ],
  };
}

/**
 * As três folhas do ficheiro, pela ordem: Pessoas, Casas, Carrinhas. `pessoas` = as linhas que a Tabela
 * mostra com filtros (só a folha Pessoas as segue: as Casas e as Carrinhas ficam inteiras, com a lotação).
 */
export function montarFolhasExcel(
  estado: Estado,
  ind: Indices,
  dormidas: Map<Id, Dormida>,
  pessoas: readonly LinhaTabela[] | null = null,
): FolhaExcel[] {
  return [
    folhaPessoas(estado, ind, pessoas),
    folhaCasas(estado, ind, dormidas),
    folhaCarrinhas(estado, ind, dormidas),
  ];
}

/**
 * "Mapa CMF 2026-10-04.xlsx" (data do Luxemburgo); com alterações por guardar, "… (simulação).xlsx"; com
 * os filtros da Tabela, "… (filtrado).xlsx" (ou "(simulação, filtrado)").
 */
export function nomeFicheiroExcel(agora: Date, simulacao = false, filtrado = false): string {
  const notas = [simulacao && 'simulação', filtrado && 'filtrado'].filter(Boolean);
  return `Mapa CMF ${dataISOLuxemburgo(agora)}${notas.length > 0 ? ` (${notas.join(', ')})` : ''}.xlsx`;
}

/** Quanto tempo o endereço do ficheiro fica válido depois de se carregar em descarregar. */
const VALIDADE_DESCARGA_MS = 60_000;

/**
 * Entrega o ficheiro ao browser. Não se usa o toFile() da biblioteca: liberta o endereço ao fim de 100 ms,
 * e o Chrome ainda pode estar a lê-lo (ex.: com "Perguntar onde guardar cada ficheiro"), o que cancela a
 * descarga.
 */
function descarregar(conteudo: Blob, nome: string): void {
  const url = URL.createObjectURL(conteudo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), VALIDADE_DESCARGA_MS);
}

/**
 * Monta o ficheiro e entrega-o ao browser para guardar. A biblioteca só se descarrega aqui. `pessoas` = as
 * linhas que a Tabela mostra (null = toda a gente, como no Quadro ou na Tabela sem filtros nem "Mostrar quem
 * saiu"). `filtrado` põe "(filtrado)" no nome (por omissão, quando vêm linhas).
 */
export async function exportarExcel(
  estado: Estado,
  ind: Indices,
  dormidas: Map<Id, Dormida>,
  simulacao: boolean,
  pessoas: readonly LinhaTabela[] | null = null,
  filtrado = pessoas !== null,
): Promise<void> {
  const { default: escreverXlsx } = await import('write-excel-file/browser');
  const folhas = montarFolhasExcel(estado, ind, dormidas, pessoas);
  const conteudo = await escreverXlsx(
    folhas.map((f) => ({
      data: f.linhas,
      sheet: f.nome,
      columns: f.larguras.map((width) => ({ width })),
      stickyRowsCount: 1,
    })),
    { fontFamily: 'Calibri', fontSize: 11 },
  ).toBlob();
  descarregar(conteudo, nomeFicheiroExcel(new Date(), simulacao, filtrado));
}
