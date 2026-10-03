// Título da página com a marca CMF: o logótipo (no mínimo 120 px de largura, com a margem livre do
// manual de marca) seguido de "Mapa" em Archivo. Quando o logótipo não cabe na linha do cabeçalho
// (abaixo de 1680 px, ver tema.css) fica só o símbolo + "Mapa", como o manual manda.
// Continua a ser o <h1> da página: o texto acessível é "Mapa CMF" (as imagens são decorativas).
// Medidas e margens em tema.css (.marca…); ficheiros em public/marca/.

export function Marca({ className = '' }: { className?: string }) {
  return (
    <h1 className={`marca flex shrink-0 items-center ${className}`}>
      <span className="sr-only">Mapa CMF</span>
      <img
        className="marca-logotipo"
        src="/marca/cmf-logo.svg"
        alt=""
        width={120}
        height={45}
        decoding="async"
      />
      <img
        className="marca-simbolo"
        src="/marca/cmf-marca.svg"
        alt=""
        width={16}
        height={30}
        decoding="async"
      />
      <span className="marca-filete" aria-hidden="true" />
      <span className="marca-titulo" aria-hidden="true">
        Mapa
      </span>
    </h1>
  );
}
