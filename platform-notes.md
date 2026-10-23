# Sala do Futuro: inspeção pública

Data: 23 de outubro de 2026.

A URL pública da atividade respondeu HTTP 200 com uma estrutura inicial de aplicação de página única: título `Sala do Futuro Aluno`, `<div id="root">` e `<div id="modal">`. O HTML público não contém enunciados ou alternativas.

O código JavaScript público confirma rotas `/atividade/:idAtividade` e `atividade/:idAtividade` para a interface móvel. Há componentes de tema Material UI, como `MuiButton`, `MuiTextField`, `MuiInputBase-root` e `MuiInputLabel-root`; isso não confirma o HTML específico das alternativas.

O estado público do aplicativo inclui `modoQuestaoUnica`, `questoesPorPagina`, `paginaAtual` e `totalDePaginas`. O hub precisa verificar novamente o enunciado e as alternativas antes de marcar, pois uma mudança de questão pode reutilizar elementos.

As únicas referências literais a iframe encontradas no pacote principal referem-se a incorporação de vídeo do YouTube. Não foram encontrados `shadowRoot` ou `customElements` nesse pacote. Essa busca não prova que componentes carregados sob demanda dispensem iframe ou Shadow DOM.

Sem uma atividade autenticada renderizada, não foi possível confirmar os seletores das alternativas, a semântica dos controles ou a compatibilidade da marcação. Não há seletor específico recomendado a partir dessa inspeção.
