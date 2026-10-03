// Formato das matrículas luxemburguesas, igual no ecrã, no histórico e nas mensagens do servidor.

/** "CF5001" → "CF 5001"; "KS 9412" fica igual; o resto passa sem mudança. */
export function formatarMatricula(matricula: string): string {
  const m = /^([A-Za-z]{1,3})\s*-?\s*(\d{1,5})$/.exec(matricula.trim());
  return m ? `${(m[1] as string).toUpperCase()} ${m[2]}` : matricula.trim();
}
