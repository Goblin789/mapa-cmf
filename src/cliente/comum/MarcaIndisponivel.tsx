// Marca de quem está indisponível hoje (M2, docs/m2.md, "Indisponível"), dentro do nome (NomeChip,
// NomeVista): um símbolo discreto e o nome um pouco esbatido (o lugar na carrinha está livre). Com `texto`,
// mostra também, à vista e em letra pequena, "até 12/10" (ou "sem regresso"): no Quadro, na lista lateral,
// na ficha, na Tabela e na reunião (na TV e no telemóvel um title nunca se vê). Sem `texto` (os cartões
// apertados do Mapa) fica só o símbolo, com o "até…" no title e para leitores de ecrã.
// Sem período hoje não mostra nada.
// CONTRATO DO M2: o módulo Indisponível e problemas implementa (este ficheiro é dele).

import type { Id } from '../../dominio/tipos';

export function MarcaIndisponivel({
  pessoaId,
  compacto = false,
  texto = false,
}: {
  pessoaId: Id;
  compacto?: boolean;
  /** Mostra "até 12/10" à vista (tudo menos os cartões do Mapa). */
  texto?: boolean;
}) {
  void pessoaId;
  void compacto;
  void texto;
  return null;
}
