# Rota de Entregas

Ferramenta pessoal para ordenar as paradas de uma rota de entregas.

Lê os endereços de prints da lista de paradas, localiza cada um no mapa,
agrupa as entregas próximas e calcula a sequência mais curta pelas ruas.
Abre cada parada no Waze ou no Google Maps, em trechos que respeitam o
limite de pontos do Maps.

Instalável no Android: ao compartilhar prints com o app, a rota é montada
automaticamente.

Os dados ficam apenas no navegador de quem usa. Nada é enviado a servidores
além das consultas de endereço (OpenStreetMap, ViaCEP/AwesomeAPI) e de rota (OSRM).
