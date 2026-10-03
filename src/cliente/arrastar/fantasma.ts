// O fantasma: o nome a seguir o ponteiro durante o arrasto, com a previsão do alvo por baixo.
// Criado à mão no <body> (fora do React): mexe-se a cada quadro e não deve re-desenhar componentes.
// Os estilos estão em arrastar.css.

import type { NivelLotacao } from '../../dominio/ocupacao';
import { ATRIBUTO_FANTASMA } from './alvo';
import { posicaoFantasma } from './deslizar';
import type { Ponteiro } from './maquina';
import type { PartesPrevisao } from './previsao';

export interface Fantasma {
  posicionar(x: number, y: number): void;
  /** null = não há alvo debaixo do ponteiro. */
  definirPrevisao(partes: PartesPrevisao | null, nivel: NivelLotacao | null): void;
  remover(): void;
}

interface OpcoesFantasma {
  nome: string;
  /** "+2" quando se levam mais pessoas; null só com uma. */
  mais: string | null;
  corFundo: string;
  corTexto: string;
  ponteiro: Ponteiro;
}

const SEM_ALVO = 'Largue numa casa, carrinha ou obra · Esc cancela';

function elemento(classe: string, texto?: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

export function criarFantasma({ nome, mais, corFundo, corTexto, ponteiro }: OpcoesFantasma): Fantasma {
  const raiz = document.createElement('div');
  raiz.className = 'arrasto-fantasma';
  raiz.setAttribute(ATRIBUTO_FANTASMA, '');
  // O que importa é anunciado pela região "status" do motor; o fantasma é só visual.
  raiz.setAttribute('aria-hidden', 'true');
  raiz.dataset.ponteiro = ponteiro;

  const cartao = elemento('arrasto-fantasma__nome');
  cartao.style.backgroundColor = corFundo;
  cartao.style.color = corTexto;
  cartao.append(elemento('arrasto-fantasma__texto', nome));
  if (mais) cartao.append(elemento('arrasto-fantasma__mais', mais));

  const previsao = elemento('arrasto-fantasma__alvo');
  raiz.append(cartao, previsao);
  document.body.append(raiz);

  let tamanho = { largura: 0, altura: 0 };
  const medir = () => {
    tamanho = { largura: raiz.offsetWidth, altura: raiz.offsetHeight };
  };

  const fantasma: Fantasma = {
    posicionar(x, y) {
      const p = posicaoFantasma(
        x,
        y,
        tamanho.largura,
        tamanho.altura,
        ponteiro,
        window.innerWidth,
        window.innerHeight,
      );
      raiz.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    },
    definirPrevisao(partes, nivel) {
      previsao.replaceChildren();
      if (!partes) {
        previsao.dataset.vazio = '';
        previsao.removeAttribute('data-nivel');
        previsao.textContent = SEM_ALVO;
      } else {
        delete previsao.dataset.vazio;
        if (nivel) previsao.dataset.nivel = nivel;
        else previsao.removeAttribute('data-nivel');
        previsao.append(elemento('arrasto-fantasma__frase', partes.texto));
        if (partes.resultado !== null) {
          const pastilha = elemento('arrasto-fantasma__resultado');
          if (partes.simbolo) pastilha.append(elemento('arrasto-fantasma__simbolo', partes.simbolo));
          pastilha.append(partes.resultado);
          previsao.append(pastilha);
        }
      }
      medir();
    },
    remover() {
      raiz.remove();
    },
  };
  fantasma.definirPrevisao(null, null);
  return fantasma;
}
