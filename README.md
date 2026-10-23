# Lume · Favorito automático com Groq

Hub público e compacto (286 px), sem lista ou contagem de questões detectadas. Lê, responde e marca as alternativas, com notificações em cada etapa. Versão **3.1.1**.

## Instalar o bookmarklet

1. Abra **https://lume-groq-hub.vercel.app**.
2. Exiba a barra de favoritos com `Ctrl+Shift+B` e arraste **Lume automático** para ela.
3. Abra a atividade na Sala do Futuro, com a sua sessão já conectada, e clique no favorito. O hub inicia automaticamente na própria página.

O acesso é público: não exige código de acesso ou chave da Groq do visitante. Se o navegador não permitir arrastar o botão, use **Copiar bookmarklet**, crie um favorito e cole o código no campo de endereço desse favorito.

O bookmarklet é um carregador pequeno de `/bookmarklet.js`, para evitar um endereço de favorito com dezenas de milhares de caracteres. Ele carrega a versão atual do hub, mantém a atividade aberta e evita painéis duplicados. O painel continua oferecendo pausar, minimizar, mover e desfazer a última marcação.

Após uma atualização, feche o hub no **×** e clique no mesmo favorito para carregar a nova versão. O hub que já estava aberto continua usando a versão anterior até ser fechado. Recarregar a atividade também remove esse hub.

## Uso

- **Pausar automático** interrompe a consulta em andamento e a busca por novas questões.
- **Iniciar automático** retoma a leitura; questões concluídas não são consultadas novamente na mesma sessão.
- As notificações mostram **Questão detectada**, **Buscando resposta…**, **Resposta detectada**, **Marcando respostas…** e **Respostas: 1**, **Respostas: 2**, etc. O contador aumenta somente após confirmar a marcação da questão.
- **Desfazer** pausa o automático e restaura a última seleção quando a questão e a seleção continuam iguais.
- A engrenagem **Ajustes** permite escolher o modelo e indicar seletores personalizados, se necessário.
- Arraste o cabeçalho para mover o painel. Use minimizar ou `Alt+Shift+G` para mostrar/ocultar. Fechar cancela as solicitações e remove o hub da página.

O hub acompanha novas questões carregadas enquanto estiver ativo. Não troca páginas nem finaliza a atividade. Sugestões de baixa confiança também são marcadas automaticamente; quando a Groq não indica uma alternativa, a questão é ignorada. A IA pode errar.

## API pública e dados

A chave da Groq fica exclusivamente na variável secreta **GROQ_API_KEY** da Vercel. Não está no GitHub, no site, no favorito ou no script enviado ao navegador. A integração usa `openai/gpt-oss-120b`, com a opção `openai/gpt-oss-20b`.

Com **PUBLIC_HUB=true**, `/api/solve` aceita questões sem token. A origem da Sala do Futuro e os endereços confiáveis da implantação são permitidos por CORS; outras origens são recusadas. As alternativas, o enunciado, os modelos e o tamanho da consulta são validados no servidor.

Há limites de **20 consultas por IP/minuto** e **60 consultas totais/minuto por instância**. São controles em memória, com tamanho limitado, e não uma cota global distribuída. Pausar ou fechar o hub impede novas consultas automáticas.

Somente o texto da questão e das alternativas, além do modelo escolhido, é enviado ao servidor e à Groq. O hub não usa o RA ou a senha do portal, nem envia automaticamente cookies ou o restante da página. Não grava credenciais no navegador.

Se `PUBLIC_HUB` não for `true`, o endpoint mantém o modo privado e exige `HUB_ACCESS_TOKEN`. Essa variável não é usada pelo favorito público.

## Compatibilidade

O leitor atende controles HTML `radio` e `checkbox` e controles acessíveis com `role="radio"` ou `role="checkbox"`. Antes de marcar, verifica se o enunciado, as alternativas e os elementos ainda correspondem à questão consultada. Depois, confere se a seleção realmente ocorreu.

Os componentes SINGLE e MULTI da Sala do Futuro usam controles MUI com o texto da alternativa em um bloco separado. O leitor reconhece essas linhas e agrupa as caixas de seleção sem depender de um atributo `name`. Esse formato foi reproduzido em testes de navegador a partir dos componentes públicos da plataforma. Quando não reconhece alternativas, o painel informa a falha de leitura.

Layouts próprios, questões discursivas, ordenação, arrastar e soltar, canvas, Shadow DOM de outros componentes e frames de outro domínio podem exigir adaptadores específicos. Não há OCR: imagens, gráficos, áudio e vídeo não são enviados ao modelo.

Nos seletores personalizados, indique o bloco de cada questão, o enunciado dentro dele e os controles de alternativas. Exemplo da demonstração:

```text
Bloco: fieldset.question
Enunciado: [data-question-text]
Alternativas: input[type="radio"], input[type="checkbox"]
```

O site da atividade precisa permitir o carregamento HTTPS de `/bookmarklet.js` e chamadas à API da Vercel. A política da página pública da Sala do Futuro foi verificada e permite essas conexões; a atividade autenticada específica ainda não foi validada. Caso o navegador ou o site bloqueie o favorito, o instalador oferece **Usar pelo console** como alternativa. A política do site também pode bloquear as consultas da API.

## Publicação pelo GitHub

O repositório está conectado à Vercel. Commits na branch `main` geram a implantação de produção. `vercel.json` configura a compilação e a saída estática em `dist`, junto da função Node.js em `api/solve.js`.

Variáveis de produção:

```text
GROQ_API_KEY       Secret: chave da Groq
PUBLIC_HUB        Config: true
GROQ_MODEL        Config: openai/gpt-oss-120b
ALLOWED_ORIGINS    Opcional: origens exatas separadas por vírgulas
```

## Desenvolvimento

```sh
npm run build
npm test
npm run test:browser
```

Os testes de navegador usam Playwright e Chromium. `CHROMIUM_PATH` substitui o caminho padrão `/usr/bin/chromium`. As chamadas de IA são simuladas nesses testes. `dist/demo.html` contém questões para testar o hub; o instalador público fica em `dist/index.html`.

`src/page-adapter.js` faz a leitura e seleção. `src/groq-client.js` consulta a Groq no servidor. `src/hosted-client.js` conecta o hub à API. `src/hub.js` contém o painel. O build gera os arquivos do console e o script carregado pelo favorito.
