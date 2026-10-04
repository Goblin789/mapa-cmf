// Porta de entrada: sem sessão mostra o ecrã "Entrar com a conta Microsoft"; com sessão mostra a app.
//
// CONTRATO DO M1 — implementação por fazer (peça "login").

import type { ReactNode } from 'react';

export function Portao({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
