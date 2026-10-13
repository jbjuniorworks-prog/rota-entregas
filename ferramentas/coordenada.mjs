// A coordenada de uma linha copiada do Google Maps, para as ferramentas que gravam portas no banco.
// Mesma regra do app (coordenadaNoTexto, em logica/texto.ts), e o teste de lá compara as duas link
// por link: a porta gravada aqui vale para todos os motoristas, então ler outro ponto do mesmo link
// é gravar a porta errada como confirmada.
//
// No link de lugar do Google o `!3d!4d` é a PORTA e o `@` é só o enquadramento do mapa: em links
// reais os dois chegaram a diferir 250 m. Por isso a ordem aqui não é decorativa. O lugar aberto a
// partir de outro (a avenida, por exemplo) traz os dois pares: o do lugar de antes primeiro e o do
// lugar do link por último (Poesia Art Home, 13/10: o primeiro era a avenida, a 1,8 km).
// Literais de regex, não strings montadas: `'\d'` numa string JS vira só `d`, e a coordenada
// deixava de ser achada sem erro nenhum.
const PORTA = /!3d(-?\d{1,3}\.\d{4,})!4d(-?\d{1,3}\.\d{4,})/g;
const CONSULTA = /[?&](?:q|query|destination|ll)=(-?\d{1,3}\.\d{4,})(?:,|%2C)(-?\d{1,3}\.\d{4,})/i;
const ENQUADRAMENTO = /@(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/;
const PAR_SOLTO = /(-?\d{1,3}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/;

export function coordenada(linha) {
  const portas = [...linha.matchAll(PORTA)];
  if (portas.length) {
    const m = portas[portas.length - 1];
    return {lat: +m[1], lng: +m[2]};
  }
  for (const re of [CONSULTA, ENQUADRAMENTO]) {
    const m = linha.match(re);
    if (m) return {lat: +m[1], lng: +m[2]};
  }
  const m = linha.replace(/https?:\/\/\S+/g, ' ').match(PAR_SOLTO);
  return m ? {lat: +m[1], lng: +m[2]} : null;
}
