# Lume · BatataHub

Hub público e compacto (286 px), sem lista ou contagem de questões detectadas. Marca alternativas, preenche lacunas e textos, monta frases com blocos de palavras e lê imagens das questões, com notificações em cada etapa. Versão **3.8.1**. O painel usa tons de verde grafite e lima, com ícones próprios, estados visuais de execução e conclusão e animações que respeitam a preferência por movimento reduzido.

## Instalar o bookmarklet

1. Abra **https://batata-hub.vercel.app/lume.html**.
2. Você também encontra o **Lume** na aba **Scripts** do BatataHub. Exiba a barra de favoritos com `Ctrl+Shift+B` e arraste **Lume automático** para ela.
3. Abra a atividade na Sala do Futuro, com a sua sessão já conectada, e clique no favorito. O hub abre na própria página. Clique em **Responder tarefa** para começar.

O acesso é público: não exige código de acesso ou chave do serviço de IA do visitante. Se o navegador não permitir arrastar o botão, use **Copiar bookmarklet**, crie um favorito e cole o código no campo de endereço desse favorito.

O bookmarklet é um carregador pequeno de `/bookmarklet.js`, para evitar um endereço de favorito com dezenas de milhares de caracteres. Ele carrega a versão atual do hub, mantém a atividade aberta e evita painéis duplicados. O painel continua oferecendo pausar, minimizar, mover e desfazer a última marcação.

Após uma atualização, feche o hub no **×** e clique no mesmo favorito para carregar a nova versão. O hub que já estava aberto continua usando a versão anterior até ser fechado. Recarregar a atividade também remove esse hub.

## Uso

- **Responder tarefa** inicia somente a atividade aberta. Uma notificação no centro superior mostra o nome da tarefa.
- A próxima questão é consultada assim que o preenchimento anterior é confirmado, sem pausas fixas entre questões. O cache e o bloqueio após um limite da API continuam ativos.
- Ao atingir um limite, o botão mostra **Aguarde N s** e respeita a espera informada pela API; sem uma espera válida, usa 60 segundos. Trocar de atividade ou fechar e reabrir o hub na mesma aba conserva esse prazo em memória. Ao liberar, aguarda seu clique para continuar.
- **Pausar tarefa** interrompe a consulta em andamento. Retomar a mesma tarefa preserva a contagem e as questões já preenchidas.
- Ao preencher todas as questões, o botão muda para **Tarefa concluída** e fica desativado. Abrir outra atividade zera o contador e aguarda um novo clique; consultas pendentes da tarefa anterior são canceladas.
- As notificações mostram **Questão detectada**, **Buscando resposta…**, **Resposta detectada**, **Marcando respostas…** e **Respostas: 1**, **Respostas: 2**, etc. O contador pertence à tarefa atual e aumenta somente após confirmar o preenchimento da questão. Isso não indica correção ou nota.
- Quando a Sala mostra um texto-base em cartões INFO ou SECTION anteriores à questão, o leitor inclui o material visível mais próximo no enunciado e também prepara suas imagens. Uma nova seção delimita esse contexto; perguntas e respostas de outros cartões não são copiadas. Alterações no texto-base invalidam uma resposta pendente.
- Se a IA não puder responder, o aviso mostra a justificativa também nas questões de alternativas, sem contar uma resposta preenchida.
- Nas lacunas, o hub abre os menus para ler as opções, fecha-os e consulta o serviço de IA uma vez para o conjunto. Depois preenche cada campo, mesmo quando a Sala remove as palavras escolhidas dos outros menus. O contador aumenta uma vez pela questão completa.
- Nas questões de texto, exige uma resposta JSON com formato estrito e preenche o campo **Responder** respeitando os limites de caracteres. As notificações mostram **Questão de texto detectada** e **Preenchendo respostas…**.
- Nos blocos de palavras **CLOUD**, lê o banco completo e clica nos blocos na ordem da frase. Palavras repetidas são preservadas como blocos diferentes. O serviço de IA monta a sequência com os textos dos blocos; o cliente os converte para os índices originais, sem uma segunda consulta. Esse cuidado reduz erros de posição, mas não garante uma resposta correta. Mostra **Ordenando palavras…** e conta uma resposta após confirmar toda a sequência. **Desfazer** restaura a seleção anterior, inclusive uma frase parcialmente montada.
- Nas questões com imagens, mostra **Lendo imagens…** e **Analisando imagens…**. Envia até três imagens do enunciado e das alternativas junto com o texto; usa automaticamente o modelo de visão. Alternativas compostas apenas por imagens também recebem identificação própria. Imagem indisponível, formato não suportado ou excesso de imagens interrompe a consulta com um aviso.
- **Desfazer** pausa a tarefa e restaura a última seleção quando a questão e a seleção continuam iguais.
- A engrenagem **Ajustes** permite escolher o modelo e indicar seletores personalizados, se necessário.
- Arraste o cabeçalho para mover o painel. Use minimizar ou `Alt+Shift+G` para mostrar/ocultar. Fechar cancela as solicitações e remove o hub da página.

O hub acompanha novas questões da mesma tarefa enquanto estiver ativo. Quando a página informa o total de questões, aguarda todas; sem esse total, usa o conjunto reconhecido após a página estabilizar. Questões ignoradas ou com erro não são anunciadas como tarefa concluída. Não troca páginas nem entrega a atividade. Sugestões de baixa confiança também são marcadas automaticamente; quando o serviço de IA não indica uma alternativa, a questão é ignorada. A IA pode errar.

## API pública e dados

A chave do serviço de IA fica exclusivamente na variável secreta **GROQ_API_KEY** da Vercel. Não está no GitHub, no site, no favorito ou no script enviado ao navegador. As questões de texto usam `openai/gpt-oss-120b`, com a opção `openai/gpt-oss-20b`. Questões com imagens usam automaticamente `qwen/qwen3.8-27b`, modelo de visão disponível no plano gratuito e atualmente em prévia no serviço de IA. Consulte a [documentação de visão](https://console.groq.com/docs/vision).

Com **PUBLIC_HUB=true**, `/api/solve` aceita questões sem token. A origem da Sala do Futuro e os endereços confiáveis da implantação são permitidos por CORS; outras origens são recusadas. As alternativas, o enunciado, os modelos e o tamanho da consulta são validados no servidor.

O preflight também aceita os cabeçalhos de rastreamento adicionados pela instrumentação da Sala do Futuro (`Request-Id`, `Request-Context`, `Traceparent`, `Tracestate`, `Baggage`). O teste de CORS usa servidores locais reais e um `fetch` instrumentado; não intercepta a API no Playwright.

Há limites de **20 consultas por IP/minuto** e **60 consultas totais/minuto por instância**. São controles em memória, com tamanho limitado, e não uma cota global distribuída. Pausar ou fechar o hub impede novas consultas automáticas. A chave gratuita é compartilhada pelos visitantes públicos, portanto os limites reais de solicitações e tokens do provedor continuam valendo.

Cada instância ativa do servidor reaproveita até 64 respostas válidas por 30 minutos, identificadas pelo modelo e pelo conteúdo completo da questão, incluindo imagens. Pedidos idênticos em andamento compartilham uma consulta; erros e abstenções não são guardados como respostas. Durante um limite do provedor, a instância conserva a espera por modelo para evitar chamadas repetidas. Esse cache e essa espera são temporários e locais à instância, não um armazenamento ou controle global.

A conta gratuita do serviço de IA pode ser usada com os modelos oferecidos, sujeita às cotas da organização no [Console do serviço de IA](https://console.groq.com/docs/rate-limits). Quando o serviço de IA retorna 429, não há nova tentativa automática. O servidor preserva `Retry-After` (ou usa 60 segundos) e o painel bloqueia novas consultas durante a contagem regressiva. Os pedidos textuais enviam instruções apenas do formato atual e usam um limite de saída adequado ao tipo de questão. Imagens consomem mais tokens da cota gratuita: o serviço de IA documenta 2.048 tokens de entrada por imagem. O envio usa uma única consulta por questão, com até três imagens; dados de imagem não são repetidos no texto do pedido. O corpo da API é limitado a 3 MB com imagens e 48 KB sem imagens; o orçamento de texto continua em 32.000 caracteres.

Somente o enunciado, as alternativas ou opções das lacunas, os limites do campo de texto, as imagens reconhecidas dentro da questão e o modelo são enviados ao servidor e ao serviço de IA. O nome da tarefa e o restante da página ficam no navegador. Imagens são compactadas no navegador quando possível; se uma imagem pública bloquear a captura por CORS, seu endereço HTTPS pode ser encaminhado ao serviço de IA. O servidor não baixa endereços de imagens. O hub não usa o RA ou a senha do portal, nem envia automaticamente cookies ou o restante da página. Não grava credenciais no navegador.

Se `PUBLIC_HUB` não for `true`, o endpoint mantém o modo privado e exige `HUB_ACCESS_TOKEN`. Essa variável não é usada pelo favorito público.

## Compatibilidade

O leitor atende controles HTML `radio`, `checkbox`, `select` e campos de texto reconhecidos, além dos controles acessíveis correspondentes. Antes de preencher, verifica se o enunciado, os campos e as opções ainda correspondem à questão consultada. Depois, confere se o preenchimento realmente ocorreu.

Os componentes SINGLE e MULTI da Sala do Futuro usam controles MUI com o texto da alternativa em um bloco separado. O leitor reconhece essas linhas e agrupa as caixas de seleção sem depender de um atributo `name`. Esse formato foi reproduzido em testes de navegador a partir dos componentes públicos da plataforma. Quando não reconhece alternativas, o painel informa a falha de leitura.

Os componentes **FILL_WORDS**, **TEXT** e **TEXT_AI** da Sala também são reconhecidos. Os menus MUI são lidos somente quando abertos e o texto é preenchido com os eventos do campo nativo. Os testes reproduzem o banco de palavras compartilhado, os menus em portal e os limites de caracteres que a Sala mostra abaixo do campo.

Nas discursivas, o formulário real inclui um campo invisível chamado `hidden`. O leitor verifica o atributo HTML de ocultação para não confundir esse campo com o formulário inteiro. Limites de caracteres são lidos por rótulo; um máximo não informado usa o padrão de 3.000 caracteres, sem capturar o contador vizinho. Quando a IA se abstém de escrever, a notificação mostra o motivo.

O formato **CLOUD** é identificado pelo painel **Resposta do Aluno** e seu banco de palavras. O leitor inclui os blocos já selecionados que a Sala mantém ocultos no banco, e usa os botões das palavras para restaurar a resposta. Não aciona a entrega da atividade.

Redações em editores próprios, outros formatos de ordenação por arrastar e soltar, canvas, Shadow DOM de outros componentes e frames de outro domínio podem exigir adaptadores específicos. Imagens PNG, JPEG e WebP podem ser analisadas pelo modelo de visão, incluindo textos e gráficos legíveis. A captura usa no máximo 2.000 pixels no maior lado e tem orçamento de tamanho; detalhes pequenos ou borrados podem não ser lidos corretamente. Canvas, SVG, GIF, áudio e vídeo exigem suporte específico e não são enviados como se fossem imagens válidas.

Nos seletores personalizados, indique o bloco de cada questão, o enunciado dentro dele e os controles de alternativas. Exemplo da demonstração:

```text
Bloco: fieldset.question
Enunciado: [data-question-text]
Alternativas: input[type="radio"], input[type="checkbox"]
```

O site da atividade precisa permitir o carregamento HTTPS de `/bookmarklet.js` e chamadas à API da Vercel. A política da página pública da Sala do Futuro foi verificada e permite essas conexões; a atividade autenticada específica ainda não foi validada. Caso o navegador ou o site bloqueie o favorito, o instalador oferece **Usar pelo console** como alternativa. A política do site também pode bloquear as consultas da API.

## Publicação pelo GitHub

O Lume aparece como um novo script em **https://batata-hub.vercel.app/scripts.html**, com instalador em `/lume.html` e arquivos públicos em `/scripts/lume/`. O instalador resolve seus arquivos a partir do endereço de `install.js`, para funcionar tanto no BatataHub quanto no endereço anterior. A rota `/api/lume/solve` do BatataHub encaminha as consultas ao servidor existente; as chaves continuam somente no servidor.

O repositório está conectado à Vercel. Commits na branch `main` geram a implantação de produção. `vercel.json` configura a compilação e a saída estática em `dist`, junto da função Node.js em `api/solve.js`.

Variáveis de produção:

```text
GROQ_API_KEY       Secret: chave do serviço de IA
PUBLIC_HUB        Config: true
GROQ_MODEL        Config: openai/gpt-oss-120b
GROQ_VISION_MODEL Opcional: qwen/qwen3.8-27b (padrão automático)
ALLOWED_ORIGINS    Opcional: origens exatas separadas por vírgulas
```

## Desenvolvimento

```sh
npm run build
npm test
npm run test:browser
```

Os testes de navegador usam Playwright e Chromium. `CHROMIUM_PATH` substitui o caminho padrão `/usr/bin/chromium`. As chamadas de IA são simuladas nesses testes. `dist/demo.html` contém questões para testar o hub; o instalador público fica em `dist/index.html`.

`src/page-adapter.js` faz a leitura e seleção. `src/groq-client.js` consulta o provedor de IA no servidor. Os nomes técnicos legados `GROQ_*`, a URL real do provedor e os identificadores usados pelos favoritos antigos permanecem compatíveis; a marca pública é BatataHub. `src/hosted-client.js` conecta o hub à API. `src/hub.js` contém o painel. O build gera `hub.js`, o script carregado pelo favorito e o alias legado `hub-groq.js`.
