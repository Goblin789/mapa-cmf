// Tabela, "Editar…" (o Rafael, 05/10/2026: "não aceito" que os dados da pessoa e "Saiu da empresa…" só se
// mudem no Mapa e no Quadro): que botões tem cada linha em cada modo, quando a ficha da pessoa abre na
// Tabela, quando se esquece e o que faz o clique na linha. Só dados fictícios (estadoTeste.ts).

import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { indexar } from '../../dominio/indices';
import { haFichaDaPessoa } from '../paineis/fichas';
import { estadoVistas } from './estadoTeste';
import {
  acaoLinhaDaFicha,
  botoesDaLinha,
  cliqueTiraOFoco,
  type EstadoParaEditar,
  editarQueFica,
  FILTROS_INICIAIS,
  type FocoTabela,
  type LinhaDaFicha,
  linhasDaTabela,
  marcadaDepoisDoClique,
  seguirEditar,
} from './linhasTabela';

const estado = estadoVistas();
const linhas = linhasDaTabela(estado, indexar(estado), { comQuemSaiu: true });
const ativa = linhas.find((l) => !l.saiu);
const saiu = linhas.find((l) => l.saiu);
if (!ativa || !saiu) throw new Error('Faltam linhas de quem está e de quem saiu nos dados fictícios');

describe('Tabela: os botões a seguir ao nome', () => {
  it('fora do modo de edição: só "Ver no mapa", com o texto (a partir de md); sem "Editar…"', () => {
    for (const l of linhas.filter((x) => !x.saiu)) {
      expect(botoesDaLinha(l, false)).toEqual([{ tipo: 'ver-no-mapa', comTexto: true }]);
    }
  });

  it('no modo de edição: "Editar…" (com o texto a partir de md) e "Ver no mapa" só com o ícone', () => {
    for (const l of linhas.filter((x) => !x.saiu)) {
      expect(botoesDaLinha(l, true)).toEqual([
        { tipo: 'editar', comTexto: true },
        { tipo: 'ver-no-mapa', comTexto: false },
      ]);
    }
  });

  it('quem saiu: só "Voltou à empresa…" nos dois modos (sem "Editar…" nem "Ver no mapa")', () => {
    expect(botoesDaLinha(saiu, false)).toEqual([{ tipo: 'voltou', comTexto: true }]);
    expect(botoesDaLinha(saiu, true)).toEqual([{ tipo: 'voltou', comTexto: true }]);
  });
});

describe('Tabela: a ficha da pessoa', () => {
  const id = ativa.pessoa.id;
  const outra = linhas.find((l) => !l.saiu && l.pessoa.id !== id)?.pessoa.id ?? '';
  const focoNela: FocoTabela = { tipo: 'pessoa', id };

  it('abre só pelo "Editar…" no modo de edição, e só a dessa pessoa', () => {
    const editar = editarQueFica(id, focoNela, true);
    expect(editar).toBe(id);
    expect(haFichaDaPessoa('tabela', ativa.pessoa, { modoEdicao: true, editar })).toBe(true);
    // A mesma pessoa em foco pela pesquisa (sem "Editar…"): só o realce da linha.
    expect(haFichaDaPessoa('tabela', ativa.pessoa, { modoEdicao: true, editar: null })).toBe(false);
  });

  it('esquece-se quando o foco muda (✕/Esc, pesquisa de outra pessoa, ligações) ou se sai do modo de edição', () => {
    expect(editarQueFica(id, null, true)).toBeNull();
    expect(editarQueFica(id, { tipo: 'pessoa', id: outra }, true)).toBeNull();
    expect(editarQueFica(id, { tipo: 'casa', id: 'casa-1' }, true)).toBeNull();
    // Guardar e Cancelar.
    expect(editarQueFica(id, focoNela, false)).toBeNull();
    expect(editarQueFica(null, focoNela, true)).toBeNull();
  });

  it('fora do modo de edição nunca há ficha da pessoa na Tabela', () => {
    for (const l of linhas) {
      expect(haFichaDaPessoa('tabela', l.pessoa, { modoEdicao: false, editar: l.pessoa.id })).toBe(false);
    }
  });

  it('depois de "Saiu da empresa…" a ficha fecha (a linha passa a ter só "Voltou à empresa…")', () => {
    const saiuAgora = { ...ativa.pessoa, ativa: false };
    expect(haFichaDaPessoa('tabela', saiuAgora, { modoEdicao: true, editar: id })).toBe(false);
    expect(botoesDaLinha({ saiu: true }, true).map((b) => b.tipo)).toEqual(['voltou']);
  });

  it('o clique numa linha só seleciona: não fecha a ficha do "Editar…"; tira o foco a quem só está realçado', () => {
    // Com a ficha aberta, clicar noutra linha (ou na dela) não lhe tira o foco.
    expect(cliqueTiraOFoco(id, id)).toBe(false);
    // Uma pessoa em foco pela pesquisa (sem ficha): o clique tira-lhe o foco, como antes.
    expect(cliqueTiraOFoco(id, null)).toBe(true);
    expect(cliqueTiraOFoco(null, null)).toBe(false);
    // No modo de edição nenhuma linha fica marcada (a seleção é o realce).
    expect(marcadaDepoisDoClique(outra, null, true, id)).toBeNull();
  });
});

describe('Tabela: o "Editar…" esquece-se também com a Tabela noutra vista (seguirEditar)', () => {
  const id = ativa.pessoa.id;
  const outra = linhas.find((l) => !l.saiu && l.pessoa.id !== id)?.pessoa.id ?? '';
  // A loja da app (foco e modo de edição) e a da Tabela (editar), como no Tabela.tsx.
  const montar = () => {
    const loja = createStore<EstadoParaEditar>()(() => ({ foco: null, modoEdicao: true }));
    let editar: string | null = null;
    const desligar = seguirEditar(
      loja,
      () => editar,
      (e) => {
        editar = e;
      },
    );
    // O clique no "Editar…": guarda a pessoa e põe-na em foco.
    const clicarEditar = (p: string) => {
      editar = p;
      loja.setState({ foco: { tipo: 'pessoa', id: p } });
    };
    return { loja, clicarEditar, desligar, editar: () => editar };
  };

  it('✕ no Quadro e depois o nome dela no Quadro: ao voltar à Tabela a ficha não abre sozinha', () => {
    const { loja, clicarEditar, editar } = montar();
    clicarEditar(id);
    // Vai ao Quadro (a Tabela desmonta-se; o foco fica nela) e fecha a ficha lá.
    loja.setState({ foco: null });
    expect(editar()).toBeNull();
    // O nome dela no Quadro (ou a pesquisa do cabeçalho no Mapa) volta a pô-la em foco.
    loja.setState({ foco: { tipo: 'pessoa', id } });
    expect(editarQueFica(editar(), loja.getState().foco, true)).toBeNull();
  });

  it('Guardar ou Cancelar noutra vista também o esquece', () => {
    const { loja, clicarEditar, editar } = montar();
    clicarEditar(id);
    loja.setState({ modoEdicao: false });
    expect(editar()).toBeNull();
    // Voltar a Editar com a mesma pessoa em foco não reabre a ficha.
    loja.setState({ modoEdicao: true });
    expect(editarQueFica(editar(), loja.getState().foco, true)).toBeNull();
  });

  it('o foco vai para outra pessoa ou para uma casa: esquece-se', () => {
    const { loja, clicarEditar, editar } = montar();
    clicarEditar(id);
    loja.setState({ foco: { tipo: 'pessoa', id: outra } });
    expect(editar()).toBeNull();
    clicarEditar(id);
    loja.setState({ foco: { tipo: 'casa', id: 'casa-1' } });
    expect(editar()).toBeNull();
  });

  it('enquanto o foco fica nela (Editar… → Quadro → Tabela), a ficha continua', () => {
    const { loja, clicarEditar, editar } = montar();
    clicarEditar(id);
    loja.setState({ foco: { tipo: 'pessoa', id } });
    expect(editar()).toBe(id);
    expect(editarQueFica(editar(), loja.getState().foco, true)).toBe(id);
  });

  it('desligar deixa de seguir a loja', () => {
    const { loja, clicarEditar, desligar, editar } = montar();
    clicarEditar(id);
    desligar();
    loja.setState({ foco: null });
    expect(editar()).toBe(id);
  });
});

describe('Tabela: a linha da ficha aberta fica à vista (acaoLinhaDaFicha)', () => {
  const id = ativa.pessoa.id;
  const filtros = FILTROS_INICIAIS;
  const comCasa = { ...FILTROS_INICIAIS, casas: new Set(['casa-1']) };
  const em = (indice: number, f = filtros, quem: string | null = id): LinhaDaFicha => ({
    id: quem,
    indice,
    filtros: f,
  });

  it('ao abrir e ao fechar não faz nada (o "Editar…" já pôs a linha à vista)', () => {
    expect(acaoLinhaDaFicha(em(-1, filtros, null), em(1))).toBe('nada');
    expect(acaoLinhaDaFicha(em(1), em(-1, filtros, null))).toBe('nada');
    // Trocar de pessoa ("Editar…" noutra linha) também é abrir.
    expect(acaoLinhaDaFicha(em(1, filtros, 'p-outra'), em(5))).toBe('nada');
  });

  it('a ficha muda o nome com a Tabela por Nome: a linha muda de lugar e volta a pôr-se à vista', () => {
    expect(acaoLinhaDaFicha(em(1), em(136))).toBe('mostrar');
    // E ao desfazer, volta ao lugar de antes: outra vez à vista.
    expect(acaoLinhaDaFicha(em(136), em(1))).toBe('mostrar');
    // Sem mudar de lugar (telefone, carta), não mexe na caixa.
    expect(acaoLinhaDaFicha(em(1), em(1))).toBe('nada');
  });

  it('"Mudar casa…" com o filtro Casa: a linha deixa de passar o filtro e limpam-se os filtros', () => {
    expect(acaoLinhaDaFicha(em(3, comCasa), em(-1, comCasa))).toBe('limpar-filtros');
    // Depois de limpos a linha volta a ver-se: põe-se à vista.
    expect(acaoLinhaDaFicha(em(-1, comCasa), em(40, filtros))).toBe('mostrar');
  });

  it('quem escreve no filtro (ou escolhe outro) e esconde a linha fica com o filtro como o pôs', () => {
    const comTexto = { ...FILTROS_INICIAIS, texto: 'zzz' };
    expect(acaoLinhaDaFicha(em(3), em(-1, comTexto))).toBe('nada');
    // Continuar a escrever com a linha escondida também não.
    expect(acaoLinhaDaFicha(em(-1, comTexto), em(-1, { ...comTexto, texto: 'zzzz' }))).toBe('nada');
  });
});
