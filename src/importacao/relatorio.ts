// Relatório HTML da importação (dados/relatorio-importacao.html): autónomo, legível por quem não programa.
// Todo o texto passa por escaparHtml. Função pura: recebe o resultado e devolve o HTML.

import { dormidasDasCarrinhas } from '../dominio/dormidas';
import { indexar } from '../dominio/indices';
import { type AvisoContrato, ocupacaoCasa } from '../dominio/ocupacao';
import type { Pessoa } from '../dominio/tipos';
import { type ResultadoImportacao, type Resumo, resumir } from './processar';
import type { CampoComparado, LinhaContagem, TipoNormalizacao } from './tipos';

/** protegido = a base de dados tem gravações feitas no programa e não se usou --forcar. */
export type ModoRelatorio = 'ensaio' | 'aplicado' | 'recusado' | 'protegido' | 'falhou';

export interface FicheiroLido {
  nome: string;
  pasta: string;
  modificadoEm: Date | null;
  /** Ex.: "não encontrado". */
  nota: string | null;
}

export interface MetaRelatorio {
  agora: Date;
  modo: ModoRelatorio;
  /** Caminho da base de dados (quando se tentou gravar). */
  bd: string | null;
  loteId: number | null;
  /** Mensagem do erro quando a gravação falhou (ou foi recusada por proteger as gravações do programa). */
  falha: string | null;
  ficheiros: FicheiroLido[];
}

export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const e = escaparHtml;

const formatoData = new Intl.DateTimeFormat('pt-PT', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Luxembourg',
});

// --- Peças de HTML ---

type Celula = string | number | null | { texto: string | number | null; classe?: string };

function td(c: Celula, tag: 'td' | 'th' = 'td'): string {
  const obj = typeof c === 'object' && c !== null ? c : { texto: c };
  const classes = [typeof obj.texto === 'number' ? 'n' : '', obj.classe ?? ''].filter(Boolean).join(' ');
  const texto = obj.texto === null || obj.texto === '' ? '—' : String(obj.texto);
  return `<${tag}${classes ? ` class="${e(classes)}"` : ''}>${e(texto)}</${tag}>`;
}

function tabela(cabecalhos: string[], linhas: Celula[][], rodape?: Celula[]): string {
  if (linhas.length === 0) return '<p class="nada">Nada a assinalar.</p>';
  const cab = `<thead><tr>${cabecalhos.map((c) => td(c, 'th')).join('')}</tr></thead>`;
  const corpo = `<tbody>${linhas.map((l) => `<tr>${l.map((c) => td(c)).join('')}</tr>`).join('')}</tbody>`;
  const pe = rodape ? `<tfoot><tr>${rodape.map((c) => td(c)).join('')}</tr></tfoot>` : '';
  return `<div class="rolar"><table>${cab}${corpo}${pe}</table></div>`;
}

function lista(itens: string[]): string {
  if (itens.length === 0) return '<p class="nada">Nenhum.</p>';
  return `<ul>${itens.map((i) => `<li>${e(i)}</li>`).join('')}</ul>`;
}

function p(texto: string, classe?: string): string {
  return `<p${classe ? ` class="${classe}"` : ''}>${e(texto)}</p>`;
}

function secao(id: string, titulo: string, corpo: string): string {
  return `<section id="${id}"><h2>${e(titulo)}</h2>${corpo}</section>`;
}

function soma(valores: (number | null)[]): number | null {
  const n = valores.filter((v) => v !== null);
  return n.length > 0 ? n.reduce((a, b) => a + b, 0) : null;
}

// --- Secções ---

const TITULOS = [
  ['resumo', '1. Resumo'],
  ['casas', '2. Contagens por casa'],
  ['carrinhas', '3. Contagens por carrinha'],
  ['clientes', '4. Contagens por cliente'],
  ['michael', '5. Diferenças entre a lista e o ficheiro do Michael'],
  ['confirmar', '6. Pessoas "a confirmar"'],
  ['normalizacoes', '7. Normalizações aplicadas'],
  ['dormidas', '8. Carrinhas sem passageiros e onde dorme cada carrinha'],
  ['contrato', '9. Casas acima do contrato'],
  ['falta', '10. Campos em falta'],
] as const;

function titulo(id: (typeof TITULOS)[number][0]): string {
  return TITULOS.find(([i]) => i === id)?.[1] ?? id;
}

function caixaEstado(meta: MetaRelatorio, s: Resumo): string {
  switch (meta.modo) {
    case 'ensaio':
      return `<div class="caixa ensaio"><b>Modo de ensaio: nada foi gravado.</b> ${e(
        s.errosBloqueantes > 0
          ? `Há ${s.errosBloqueantes} erro(s) bloqueante(s): é preciso corrigi-los antes de gravar.`
          : 'Para gravar na base de dados local: npm run importar -- --aplicar',
      )}</div>`;
    case 'aplicado':
      return `<div class="caixa ok"><b>Gravado na base de dados.</b> ${e(
        `${meta.bd ?? ''} — lote de importação nº ${meta.loteId ?? '?'}.`,
      )}</div>`;
    case 'recusado':
      return `<div class="caixa erro"><b>Não foi gravado.</b> ${e(
        `Há ${s.errosBloqueantes} erro(s) bloqueante(s). A base de dados ficou como estava.`,
      )}</div>`;
    case 'protegido':
      return `<div class="caixa erro"><b>Não foi gravado: a base de dados ficou como estava.</b> ${e(
        meta.falha ?? '',
      )}</div>`;
    case 'falhou':
      return `<div class="caixa erro"><b>A gravação falhou; a base de dados ficou como estava.</b> ${e(
        meta.falha ?? '',
      )}</div>`;
  }
}

function secaoResumo(r: ResultadoImportacao, meta: MetaRelatorio, s: Resumo): string {
  const numeros: [string, string][] = [
    ['Pessoas', `${s.pessoas}`],
    ['Da folha Pessoal / extra', `${s.pessoasLista} / ${s.pessoasExtra}`],
    ['Fora das casas CMF', `${s.foraDasCasas} (${s.foraDasCasasAConfirmar} a confirmar)`],
    ['Sem transporte da empresa', `${s.semTransporte} (${s.semTransporteAConfirmar} a confirmar)`],
    ['Pessoas a confirmar', `${s.aConfirmar}`],
    ['Erros bloqueantes', `${s.errosBloqueantes}`],
    ['Avisos', `${s.avisos}`],
  ];
  const caixas = numeros.map(([t, v]) => `<div><b>${e(v)}</b>${e(t)}</div>`).join('');
  const gravado = meta.modo === 'aplicado' ? 'O que foi gravado' : 'O que será gravado com --aplicar';
  const bloqueantes = r.erros.filter((x) => x.bloqueante);
  const avisos = r.erros.filter((x) => !x.bloqueante);
  const linhaErro = (x: { mensagem: string; onde?: string }) =>
    x.onde ? `${x.mensagem} (${x.onde})` : x.mensagem;

  return secao(
    'resumo',
    titulo('resumo'),
    caixaEstado(meta, s) +
      `<div class="numeros">${caixas}</div>` +
      '<h3>Pessoas por cliente</h3>' +
      tabela(
        ['Cliente', 'Pessoas'],
        s.porCliente.map((c) => [c.nome, c.pessoas]),
        ['Total', s.pessoas],
      ) +
      `<h3>${e(gravado)}</h3>` +
      tabela(
        ['O quê', 'Quantos'],
        [
          ['Clientes', s.clientes],
          ['Locais (moradas no mapa)', s.locais],
          ['Casas', s.casas],
          ['Carrinhas', s.carrinhas],
          ['Obras', s.obras],
          ['Pessoas', s.pessoas],
          ['Lote de importação (histórico)', 1],
        ],
      ) +
      p(
        'A gravação apaga tudo o que está na base de dados local (incluindo o histórico) e grava de novo, de uma só vez.',
        'nota',
      ) +
      '<h3>Erros bloqueantes</h3>' +
      p('Impedem a gravação. Corrigir no Excel ou em dados-iniciais e voltar a correr.', 'nota') +
      lista(bloqueantes.map(linhaErro)) +
      '<h3>Avisos</h3>' +
      p('Não impedem a gravação.', 'nota') +
      lista(avisos.map(linhaErro)) +
      '<h3>Ficheiros lidos</h3>' +
      tabela(
        ['Ficheiro', 'Pasta', 'Modificado em', 'Nota'],
        meta.ficheiros.map((f) => [
          f.nome,
          f.pasta,
          f.modificadoEm ? formatoData.format(f.modificadoEm) : null,
          f.nota,
        ]),
      ),
  );
}

/** Tabela de contagens: documento e Michael realçados quando não batem com a lista. */
function tabelaContagens(nome: string, capacidade: string | null, linhas: LinhaContagem[]): string {
  const cab = [nome, ...(capacidade ? [capacidade] : []), 'Documento', 'Lista', 'Michael'];
  const corpo = linhas.map((l): Celula[] => {
    const michael =
      l.michael === null
        ? null
        : l.michaelDeclarado !== null && l.michaelDeclarado !== l.michael
          ? `${l.michael} (escreveu ${l.michaelDeclarado})`
          : l.michael;
    return [
      l.rotulo,
      ...(capacidade ? [l.capacidade] : []),
      { texto: l.documento, classe: l.documento !== null && l.documento !== l.lista ? 'dif difere' : '' },
      {
        texto: l.lista,
        classe: l.capacidade !== null && l.lista > l.capacidade ? 'excesso' : '',
      },
      {
        texto: michael,
        classe:
          `${typeof michael === 'string' ? 'n' : ''} ${l.michael !== null && l.michael !== l.lista ? 'dif difere' : ''}`.trim(),
      },
    ];
  });
  const rodape: Celula[] = [
    'Total',
    ...(capacidade ? [soma(linhas.map((l) => l.capacidade))] : []),
    soma(linhas.map((l) => l.documento)),
    soma(linhas.map((l) => l.lista)),
    soma(linhas.map((l) => l.michael)),
  ];
  return tabela(cab, corpo, rodape);
}

const LEGENDA_CONTAGENS = p(
  'Documento = especificação de 02/10/2026; Lista = o que vai ser importado; Michael = nomes contados na folha dele ' +
    '(entre parênteses, o número que ele escreveu por baixo, quando é diferente). ' +
    'Amarelo com ≠: não bate com a lista. Vermelho a negrito: mais pessoas do que lugares.',
  'nota',
);

function rotulosPessoa(r: ResultadoImportacao) {
  const ind = indexar({ versao: 0, geradoEm: '', ...r.entidades });
  const fora = 'Fora das casas CMF';
  const sem = 'Sem transporte da empresa';
  return {
    ind,
    casa: (p: Pessoa) => (p.casaId ? (ind.casas.get(p.casaId)?.nome ?? p.casaId) : fora),
    carrinha: (p: Pessoa) =>
      p.carrinhaId ? (ind.carrinhas.get(p.carrinhaId)?.matricula ?? p.carrinhaId) : sem,
    cliente: (p: Pessoa) => ind.clientes.get(p.clienteId)?.nome ?? p.clienteId,
  };
}

const NOME_CAMPO: Record<CampoComparado, string> = { casa: 'Casa', carrinha: 'Carrinha', cliente: 'Cliente' };

function secaoMichael(r: ResultadoImportacao): string {
  const d = r.discrepancias;
  if (!d.michaelDisponivel) {
    return secao(
      'michael',
      titulo('michael'),
      p('O ficheiro do Michael não foi lido: não há cruzamento.', 'nota'),
    );
  }
  const rot = rotulosPessoa(r);
  const porCampo = (c: CampoComparado) => d.diferencas.filter((x) => x.campo === c).length;
  const folhas = r.michael?.folhas;
  const contagens = [
    `${porCampo('casa')} diferença(s) de casa`,
    `${porCampo('carrinha')} diferença(s) de carrinha`,
    `${porCampo('cliente')} diferença(s) de cliente`,
    `${d.soNoMichael.length} nome(s) só no Michael`,
    `${d.soNaLista.length} pessoa(s) só na lista`,
    `${d.repetidosNoMichael.length} nome(s) repetido(s) numa folha do Michael`,
  ];

  return secao(
    'michael',
    titulo('michael'),
    p(
      'Manda a lista mestra; o ficheiro do Michael só serve para cruzar. Os nomes casam sem acentos nem maiúsculas ' +
        'e através dos nomes alternativos de dados-iniciais/importacao.json.',
      'nota',
    ) +
      p(
        `Folhas lidas: ${[folhas?.casas, folhas?.viaturas, folhas?.empresas].filter(Boolean).join(' · ')}`,
        'nota',
      ) +
      lista(contagens) +
      '<h3>Pessoas com casa, carrinha ou cliente diferente</h3>' +
      tabela(
        ['Pessoa', 'Campo', 'Lista', 'Michael'],
        d.diferencas.map((x) => [
          x.nomeCurto,
          NOME_CAMPO[x.campo],
          x.lista,
          { texto: x.michael, classe: 'dif' },
        ]),
      ) +
      '<h3>No Michael mas não na lista</h3>' +
      tabela(
        ['Nome no Michael', 'Onde aparece', 'Nota'],
        d.soNoMichael.map((x) => [
          x.nomeMichael,
          x.onde.join('; '),
          x.naFolhaExtra
            ? 'Está na folha "Não estão na lista": fica de fora por decisão.'
            : x.parecido
              ? {
                  texto: `Talvez seja "${x.parecido}" (nome parecido): juntar a aliasesMichael.`,
                  classe: 'dif',
                }
              : null,
        ]),
      ) +
      '<h3>Na lista mas não no Michael</h3>' +
      tabela(
        ['Pessoa', 'Casa', 'Carrinha', 'Cliente'],
        d.soNaLista.flatMap((x) => {
          const pessoa = rot.ind.pessoas.get(x.pessoaId);
          return pessoa
            ? [[pessoa.nomeCurto, rot.casa(pessoa), rot.carrinha(pessoa), rot.cliente(pessoa)]]
            : [];
        }),
      ) +
      '<h3>Lista à parte do Michael: pessoas sem casa (a salmão)</h3>' +
      p(
        'Na folha das casas há uma lista de nomes sem título (F24 para baixo, a salmão): pessoas que ele tem sem casa.',
        'nota',
      ) +
      tabela(
        ['Nome no Michael', 'Na lista', 'Casa na lista'],
        d.semCasaMichael.map((x) => [x.nomeMichael, x.nomeCurto ?? 'não está na lista', x.casaLista]),
      ) +
      '<h3>Nomes repetidos numa folha do Michael</h3>' +
      tabela(
        ['Nome', 'Folha', 'Onde'],
        d.repetidosNoMichael.map((x) => [x.nomeMichael, x.folha, x.onde.join('; ')]),
      ) +
      '<h3>Nomes do Michael lidos como outro nome</h3>' +
      tabela(
        ['Nome no Michael', 'Pessoa da lista'],
        d.aliasesUsados.map((x) => [x.nomeMichael, x.nomeCurto]),
      ),
  );
}

function secaoConfirmar(r: ResultadoImportacao): string {
  return secao(
    'confirmar',
    titulo('confirmar'),
    p(
      'Pessoas cuja casa ou carrinha veio vazia ou desconhecida. Entram em "Fora das casas CMF" ou ' +
        '"Sem transporte da empresa" e ficam marcadas para confirmar no mapa.',
      'nota',
    ) +
      tabela(
        ['Pessoa', 'Porquê', 'Observações na lista'],
        r.pendentes.map((x) => [x.nomeCurto, x.motivos.join(' '), x.observacoes]),
      ),
  );
}

const NOME_NORMALIZACAO: Record<TipoNormalizacao, string> = {
  numero: 'Nº sem espaços',
  casa: 'Nome da casa',
  carrinha: 'Matrícula',
  cliente: 'Cliente',
  nomeAlternativo: 'Nome alternativo (para a pesquisa)',
};

function secaoNormalizacoes(r: ResultadoImportacao): string {
  const ordem: TipoNormalizacao[] = ['numero', 'casa', 'carrinha', 'cliente', 'nomeAlternativo'];
  const linhas = [...r.normalizacoes].sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo));
  return secao(
    'normalizacoes',
    titulo('normalizacoes'),
    p('O valor original do Nº também fica guardado.', 'nota') +
      tabela(
        ['Tipo', 'No Excel', 'Fica', 'Pessoas'],
        linhas.map((n) => [NOME_NORMALIZACAO[n.tipo], n.de, n.para, n.nota ?? n.pessoas]),
      ),
  );
}

function secaoDormidas(r: ResultadoImportacao): string {
  const { ind } = rotulosPessoa(r);
  const estado = { versao: 0, geradoEm: '', ...r.entidades };
  const dormidas = dormidasDasCarrinhas(estado, ind);
  const vazias = r.entidades.carrinhas.filter((c) => (ind.passageiros.get(c.id)?.length ?? 0) === 0);
  const linhas = r.entidades.carrinhas.map((c): Celula[] => {
    const passageiros = ind.passageiros.get(c.id) ?? [];
    const d = dormidas.get(c.id);
    const casa = d?.casaId ? ind.casas.get(d.casaId) : undefined;
    const naCasa = casa ? passageiros.filter((x) => x.casaId === casa.id).length : 0;
    const porque = casa
      ? `${naCasa} de ${passageiros.length} passageiro(s) moram lá`
      : passageiros.length === 0
        ? 'Sem passageiros'
        : 'Nenhum passageiro mora numa casa CMF';
    const confianca =
      d?.confianca === 'definida' ? 'definida' : d?.confianca === 'sugerida' ? 'sugestão' : '—';
    return [c.matricula, passageiros.length, casa?.nome ?? null, confianca, porque];
  });
  return secao(
    'dormidas',
    titulo('dormidas'),
    '<h3>Carrinhas sem passageiros</h3>' +
      lista(vazias.map((c) => [c.matricula, c.modelo, c.nota].filter(Boolean).join(' — '))) +
      '<h3>Onde dorme cada carrinha (sugestão)</h3>' +
      p(
        'Ainda não está definido onde dorme cada carrinha. Sugere-se a casa onde mora a maioria dos passageiros; ' +
          'o Rafael confirma depois. Nada disto é gravado.',
        'nota',
      ) +
      tabela(['Carrinha', 'Passageiros', 'Casa', 'Estado', 'Porquê'], linhas),
  );
}

const NOME_AVISO: Partial<Record<AvisoContrato, string>> = {
  acima_maximo: 'Acima do máximo do contrato',
  acima_tolerado: 'Acima do tolerado',
};

function secaoContrato(r: ResultadoImportacao): string {
  const { ind } = rotulosPessoa(r);
  const linhas = r.entidades.casas.flatMap((c): Celula[][] => {
    const oc = ocupacaoCasa(c, ind.moradores.get(c.id)?.length ?? 0);
    const aviso = NOME_AVISO[oc.aviso];
    if (!aviso) return [];
    return [
      [
        c.nome,
        oc.ocupados,
        oc.lotacao,
        oc.usados,
        c.maxContrato,
        c.tolerado,
        { texto: aviso, classe: oc.aviso === 'acima_tolerado' ? 'excesso' : 'dif' },
        c.notaContrato,
      ],
    ];
  });
  const excesso = r.entidades.casas.filter((c) => (ind.moradores.get(c.id)?.length ?? 0) > c.lotacao);
  return secao(
    'contrato',
    titulo('contrato'),
    p(
      'Lugares usados = o maior entre a lotação (moradores + vagas) e os moradores. Compara-se com o máximo do ' +
        'contrato e com o tolerado pelo senhorio. Casas sem máximo fixado não entram.',
      'nota',
    ) +
      tabela(
        ['Casa', 'Moradores', 'Lotação', 'Lugares usados', 'Máx. contrato', 'Tolerado', 'Aviso', 'Nota'],
        linhas,
      ) +
      '<h3>Casas com mais moradores do que lugares</h3>' +
      lista(
        excesso.map(
          (c) => `${c.nome}: ${ind.moradores.get(c.id)?.length ?? 0} moradores para ${c.lotacao} lugares`,
        ),
      ),
  );
}

function secaoFalta(r: ResultadoImportacao): string {
  const { pessoas, casas, carrinhas, locais } = r.entidades;
  const linhas: [string, number, number][] = [
    ['Pessoas sem telefone', pessoas.filter((x) => x.telefone === null).length, pessoas.length],
    ['Pessoas sem informação de carta', pessoas.filter((x) => x.temCarta === null).length, pessoas.length],
    ['Pessoas sem validade da carta', pessoas.filter((x) => x.cartaValidade === null).length, pessoas.length],
    ['Pessoas sem Nº', pessoas.filter((x) => x.numero === null).length, pessoas.length],
    ['Casas sem senhorio', casas.filter((x) => x.senhorio === null).length, casas.length],
    ['Casas sem equipamento', casas.filter((x) => x.equipamento === null).length, casas.length],
    ['Casas sem apartamento definido', casas.filter((x) => x.apartamento === null).length, casas.length],
    ['Casas sem máximo de contrato', casas.filter((x) => x.maxContrato === null).length, casas.length],
    [
      'Carrinhas sem onde dorme',
      carrinhas.filter((x) => x.dormeCasaId === null && x.dormeLocalId === null).length,
      carrinhas.length,
    ],
    ['Carrinhas sem modelo', carrinhas.filter((x) => x.modelo === null).length, carrinhas.length],
    ['Locais sem coordenadas', locais.filter((x) => x.lat === null || x.lng === null).length, locais.length],
  ];
  const escritorio = locais.filter((x) => x.tipo === 'escritorio').length;
  const oficinas = locais.filter((x) => x.tipo === 'oficina').length;
  return secao(
    'falta',
    titulo('falta'),
    p('Só contagens. Estes dados não existem nos Excel e preenchem-se mais tarde.', 'nota') +
      tabela(
        ['Em falta', 'Quantos', 'De'],
        linhas.map(([t, n, de]) => [t, { texto: n, classe: n > 0 ? 'dif' : '' }, de]),
      ) +
      p(`Locais de escritório: ${escritorio}. Oficinas: ${oficinas}.`, 'nota'),
  );
}

export const ESTILO = `
:root { color-scheme: light; --fundo: #f6f7f9; --texto: #1f2328; --suave: #59636e; --linha: #d0d7de;
  --dif: #fff3bf; --excesso: #ffc9c9; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--fundo); color: var(--texto);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 26px; margin: 0 0 4px; }
h2 { font-size: 20px; margin: 40px 0 8px; padding-top: 12px; border-top: 2px solid var(--linha); }
h3 { font-size: 16px; margin: 20px 0 6px; }
.nota, .sub, .nada { color: var(--suave); }
.nada { font-style: italic; }
nav ol { columns: 2; padding-left: 20px; }
nav a { color: #0b5cad; }
.rolar { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; background: #fff; margin: 8px 0 16px; font-size: 14px; }
th, td { border: 1px solid var(--linha); padding: 4px 8px; text-align: left; vertical-align: top; }
th { background: #eef1f4; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
tfoot td { font-weight: 600; background: #f1f3f5; }
.dif { background: var(--dif); }
/* Não depender só da cor (daltonismo, impressão a preto e branco). */
.difere::after { content: " ≠"; font-weight: 700; }
.excesso { background: var(--excesso); font-weight: 600; }
.caixa { padding: 12px 16px; border-radius: 6px; margin: 12px 0; border: 1px solid var(--linha); background: #fff; }
.caixa.ensaio { border-color: #1971c2; background: #e7f5ff; }
.caixa.ok { border-color: #2b8a3e; background: #ebfbee; }
.caixa.erro { border-color: #c92a2a; background: #fff5f5; }
.numeros { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; margin: 12px 0; }
.numeros div { background: #fff; border: 1px solid var(--linha); border-radius: 6px; padding: 8px 12px; color: var(--suave); }
.numeros b { display: block; font-size: 20px; color: var(--texto); }
@media (max-width: 600px) { nav ol { columns: 1; } }
`;

export function gerarRelatorioHtml(r: ResultadoImportacao, meta: MetaRelatorio): string {
  const s = resumir(r);
  const d = r.discrepancias;
  const indice = TITULOS.map(([id, t]) => `<li><a href="#${id}">${e(t)}</a></li>`).join('');
  const alternativas = r.entidades.carrinhas
    .filter((c) => c.matriculasAlternativas.length > 0)
    .map(
      (c) =>
        `${c.matricula} também aparece como ${c.matriculasAlternativas.join(', ')} (é a mesma carrinha).`,
    );
  const corpo = [
    secaoResumo(r, meta, s),
    secao('casas', titulo('casas'), LEGENDA_CONTAGENS + tabelaContagens('Casa', 'Lotação', d.contagensCasas)),
    secao(
      'carrinhas',
      titulo('carrinhas'),
      LEGENDA_CONTAGENS +
        alternativas.map((t) => p(t, 'nota')).join('') +
        tabelaContagens('Carrinha', 'Lugares', d.contagensCarrinhas),
    ),
    secao(
      'clientes',
      titulo('clientes'),
      LEGENDA_CONTAGENS + tabelaContagens('Cliente', null, d.contagensClientes),
    ),
    secaoMichael(r),
    secaoConfirmar(r),
    secaoNormalizacoes(r),
    secaoDormidas(r),
    secaoContrato(r),
    secaoFalta(r),
  ].join('\n');

  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório de importação</title>
<style>${ESTILO}</style>
</head>
<body>
<main>
<h1>Relatório de importação — Mapa CMF</h1>
${p(`Gerado em ${formatoData.format(meta.agora)}. Contém nomes de pessoas: não partilhar nem pôr no git.`, 'sub')}
<nav><ol>${indice}</ol></nav>
${corpo}
</main>
</body>
</html>
`;
}
