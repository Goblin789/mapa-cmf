// Leitura das folhas da lista mestra: "Pessoal" e "Não estão na lista".
// As colunas encontram-se pelo cabeçalho (indiferente a acentos e maiúsculas), não pela posição.

import { chaveNome, textoBruto, textoCelula } from './celulas';
import type { ErroImportacao, LinhaLista } from './tipos';

type CampoLista =
  | 'numero'
  | 'apelidos'
  | 'nome'
  | 'nomeCurto'
  | 'cliente'
  | 'casa'
  | 'carrinha'
  | 'observacoes';

/** Cabeçalhos aceites para cada campo (já normalizados). */
const CABECALHOS: Record<CampoLista, string[]> = {
  numero: ['nº', 'n.º', 'no', 'n.o', 'numero'],
  apelidos: ['apelidos'],
  nome: ['nome'],
  nomeCurto: ['nome no mapa', 'nome no excel'],
  cliente: ['cliente'],
  casa: ['casa'],
  carrinha: ['carrinha'],
  observacoes: ['observacoes'],
};

interface Tabela {
  /** Linha do cabeçalho (base 0). */
  linhaCabecalho: number;
  colunas: Partial<Record<CampoLista, number>>;
}

/** Procura o cabeçalho nas primeiras linhas: é a linha que tem a coluna `ancora`. */
function encontrarCabecalho(linhas: unknown[][], ancora: string): Tabela | null {
  for (let i = 0; i < Math.min(linhas.length, 10); i++) {
    const chaves = (linhas[i] ?? []).map((v) => {
      const t = textoCelula(v);
      return t ? chaveNome(t) : null;
    });
    if (!chaves.includes(ancora)) continue;
    const colunas: Partial<Record<CampoLista, number>> = {};
    for (const [campo, aceites] of Object.entries(CABECALHOS) as [CampoLista, string[]][]) {
      const j = chaves.findIndex((c) => c !== null && aceites.includes(c));
      if (j >= 0) colunas[campo] = j;
    }
    return { linhaCabecalho: i, colunas };
  }
  return null;
}

interface LeituraFolha {
  linhas: LinhaLista[];
  erros: ErroImportacao[];
}

function lerTabela(
  linhas: unknown[][],
  folha: string,
  ancora: string,
  obrigatorios: CampoLista[],
  criar: (valor: (campo: CampoLista) => unknown, linha: number) => LinhaLista | ErroImportacao,
): LeituraFolha {
  const tabela = encontrarCabecalho(linhas, ancora);
  if (!tabela) {
    return {
      linhas: [],
      erros: [{ bloqueante: true, mensagem: `Não encontrei o cabeçalho (coluna "${ancora}").`, onde: folha }],
    };
  }
  const emFalta = obrigatorios.filter((c) => tabela.colunas[c] === undefined);
  if (emFalta.length > 0) {
    return {
      linhas: [],
      erros: [{ bloqueante: true, mensagem: `Faltam colunas: ${emFalta.join(', ')}.`, onde: folha }],
    };
  }

  const resultado: LeituraFolha = { linhas: [], erros: [] };
  for (let i = tabela.linhaCabecalho + 1; i < linhas.length; i++) {
    const linha = linhas[i] ?? [];
    const valor = (campo: CampoLista) => {
      const j = tabela.colunas[campo];
      return j === undefined ? null : linha[j];
    };
    const vazia = Object.values(tabela.colunas).every((j) => textoBruto(linha[j]) === null);
    if (vazia) continue;
    const r = criar(valor, i + 1);
    if ('mensagem' in r) resultado.erros.push(r);
    else resultado.linhas.push(r);
  }
  return resultado;
}

/** Folha "Pessoal": Nº, Apelidos, Nome, Nome no mapa, Cliente, Casa, Carrinha, Observações. */
export function lerFolhaPessoal(linhas: unknown[][], folha = 'Pessoal'): LeituraFolha {
  return lerTabela(
    linhas,
    folha,
    'nome no mapa',
    ['numero', 'apelidos', 'nome', 'nomeCurto', 'cliente', 'casa', 'carrinha'],
    (valor, linha) => {
      const nomeCurto = textoCelula(valor('nomeCurto'));
      if (!nomeCurto) {
        return { bloqueante: true, mensagem: 'Linha sem "Nome no mapa".', onde: `${folha}, linha ${linha}` };
      }
      return {
        folha,
        linha,
        numero: textoBruto(valor('numero')),
        apelidos: textoCelula(valor('apelidos')) ?? '',
        nome: textoCelula(valor('nome')) ?? '',
        nomeCurto,
        cliente: textoCelula(valor('cliente')),
        casa: textoCelula(valor('casa')),
        carrinha: textoCelula(valor('carrinha')),
        observacoes: textoCelula(valor('observacoes')),
      };
    },
  );
}

/** Parte um nome curto: a primeira palavra é o nome, o resto são os apelidos. */
export function partirNomeCurto(nomeCurto: string): { nome: string; apelidos: string } {
  const [nome = '', ...resto] = nomeCurto.split(' ');
  return { nome, apelidos: resto.join(' ') };
}

/** Folha "Não estão na lista": Nome no Excel, Cliente, Casa, Carrinha, Observações. Sem Nº. */
export function lerFolhaExtra(linhas: unknown[][], folha = 'Não estão na lista'): LeituraFolha {
  return lerTabela(
    linhas,
    folha,
    'nome no excel',
    ['nomeCurto', 'cliente', 'casa', 'carrinha'],
    (valor, linha) => {
      const nomeCurto = textoCelula(valor('nomeCurto'));
      if (!nomeCurto) {
        return {
          bloqueante: false,
          mensagem: 'Linha sem "Nome no Excel" (ignorada).',
          onde: `${folha}, linha ${linha}`,
        };
      }
      return {
        folha,
        linha,
        numero: null,
        ...partirNomeCurto(nomeCurto),
        nomeCurto,
        cliente: textoCelula(valor('cliente')),
        casa: textoCelula(valor('casa')),
        carrinha: textoCelula(valor('carrinha')),
        observacoes: textoCelula(valor('observacoes')),
      };
    },
  );
}
