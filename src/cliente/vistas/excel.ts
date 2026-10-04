// Exportar para Excel: três folhas — Pessoas (as colunas da tabela), Casas e Carrinhas (como as folhas
// do Michael, um nome por célula com o fundo da cor do cliente). Exporta o que se vê: no modo de edição,
// a simulação (o ficheiro diz "simulação" no nome).
// As linhas montam-se em funções puras (testadas); a biblioteca (write-excel-file, versão do browser)
// só se descarrega quando se carrega no botão (import dinâmico).

import type { Cell, CellObject, SheetData } from 'write-excel-file/browser';
import { COR_TEXTO_NOMES, clienteEfetivoId } from '../../dominio/cores';
import type { Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import { formatarMatricula } from '../../dominio/matricula';
import { type NivelLotacao, ocupacaoCarrinha, ocupacaoCasa } from '../../dominio/ocupacao';
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
import { linhasDaTabela, ORDEM_INICIAL, ordenarLinhas, textoAConfirmar } from './linhasTabela';

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

/** Cabeçalho "Moradores" (ou "Passageiros") a ocupar as colunas dos nomes. */
function cabecalhoNomes(rotulo: string, colunas: number): Cell[] {
  const n = Math.max(1, colunas);
  return [cabecalho(rotulo, n > 1 ? { columnSpan: n } : {}), ...Array.from({ length: n - 1 }, () => null)];
}

// --- Folhas ---------------------------------------------------------------------------------------

export function folhaPessoas(estado: Estado, ind: Indices): FolhaExcel {
  const linhas = ordenarLinhas(linhasDaTabela(estado, ind), ORDEM_INICIAL);
  return {
    nome: 'Pessoas',
    larguras: [LARGURA_NOME, 30, 12, 16, 22, 26, 11, 10, 18],
    linhas: [
      ['Nome', 'Nome completo', 'Nº', 'Cliente', 'Obra', 'Casa', 'Carrinha', 'Condutor', 'A confirmar'].map(
        (t) => cabecalho(t),
      ),
      ...linhas.map((l): Cell[] => [
        celulaNome(l.pessoa, ind),
        texto(l.nomeCompleto),
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
    larguras: [26, 28, 10, 8, 26, ...Array.from({ length: maxNomes }, () => LARGURA_NOME)],
    linhas: [
      [
        cabecalho('Casa'),
        cabecalho('Morada'),
        cabecalho('Lotação', { align: 'center' }),
        cabecalho('Livres', { align: 'right' }),
        cabecalho('Carrinhas que lá dormem'),
        ...cabecalhoNomes('Moradores', maxNomes),
      ],
      ...linhasCasas.map(({ casa, moradores, oc, carrinhas }): Cell[] => [
        texto(casa.nome, { fontWeight: 'bold' }),
        texto(ind.locais.get(casa.localId)?.nome),
        celulaLotacao(oc.ocupados, oc.lotacao, oc.nivel),
        numero(oc.livres),
        texto(carrinhas),
        ...moradores.map((p) => celulaNome(p, ind)),
      ]),
      [
        texto(ROTULO_FORA_DAS_CASAS, { fontWeight: 'bold', fontStyle: 'italic' }),
        null,
        texto(String(fora.length), { align: 'center', fontWeight: 'bold' }),
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
    const oc = ocupacaoCarrinha(carrinha, todos.length);
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
    larguras: [12, 10, 22, 8, 10, LARGURA_NOME, 28, ...Array.from({ length: maxNomes }, () => LARGURA_NOME)],
    linhas: [
      [
        cabecalho('Matrícula'),
        cabecalho('Tipo'),
        cabecalho('Marca e modelo'),
        cabecalho('Lugares', { align: 'right' }),
        cabecalho('Ocupação', { align: 'center' }),
        cabecalho('Condutor'),
        cabecalho('Onde dorme'),
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
        ...sem.map((p) => celulaNome(p, ind)),
      ],
    ],
  };
}

/** As três folhas do ficheiro, pela ordem: Pessoas, Casas, Carrinhas. */
export function montarFolhasExcel(estado: Estado, ind: Indices, dormidas: Map<Id, Dormida>): FolhaExcel[] {
  return [
    folhaPessoas(estado, ind),
    folhaCasas(estado, ind, dormidas),
    folhaCarrinhas(estado, ind, dormidas),
  ];
}

/** "Mapa CMF 2026-10-04.xlsx" (data do Luxemburgo); com alterações por guardar, "… (simulação).xlsx". */
export function nomeFicheiroExcel(agora: Date, simulacao = false): string {
  return `Mapa CMF ${dataISOLuxemburgo(agora)}${simulacao ? ' (simulação)' : ''}.xlsx`;
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

/** Monta o ficheiro e entrega-o ao browser para guardar. A biblioteca só se descarrega aqui. */
export async function exportarExcel(
  estado: Estado,
  ind: Indices,
  dormidas: Map<Id, Dormida>,
  simulacao: boolean,
): Promise<void> {
  const { default: escreverXlsx } = await import('write-excel-file/browser');
  const folhas = montarFolhasExcel(estado, ind, dormidas);
  const conteudo = await escreverXlsx(
    folhas.map((f) => ({
      data: f.linhas,
      sheet: f.nome,
      columns: f.larguras.map((width) => ({ width })),
      stickyRowsCount: 1,
    })),
    { fontFamily: 'Calibri', fontSize: 11 },
  ).toBlob();
  descarregar(conteudo, nomeFicheiroExcel(new Date(), simulacao));
}
