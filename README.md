# Lume · Hub Groq para o console

Painel flutuante compacto (286 px), sem lista, prévia ou contagem de questões detectadas. Responde e marca automaticamente, com notificações em cada etapa. Versão **3.0.1**, com instalador e API para Vercel.

## Instalador hospedado

Abra o site publicado, informe seu **código de acesso** e clique em **Copiar script**. Cole o conteúdo no console da atividade. O hub já inicia automaticamente com a conexão configurada. O botão de download gera o mesmo script em um arquivo `.js`.

O código de acesso identifica o seu hub; ele não é a chave da Groq. A chave fica exclusivamente na variável secreta `GROQ_API_KEY` da Vercel. Não há token real ou chave de API no código do repositório ou no site público. O script gerado para uso pessoal contém o código de acesso e deve permanecer privado.

## Publicar pelo GitHub na Vercel

1. Envie este projeto a um repositório GitHub e importe-o na Vercel como **Other**. O arquivo `vercel.json` configura a compilação e a pasta `dist` automaticamente.
2. Em **Environment Variables**, crie como Secret as variáveis `GROQ_API_KEY` e `HUB_ACCESS_TOKEN` para Production. O código do hub deve ser um valor aleatório base64url de 43 caracteres (32 bytes).
3. Opcionalmente, configure `GROQ_MODEL` e `ALLOWED_ORIGINS` (lista de origens exatas separadas por vírgulas). A Sala do Futuro é permitida por padrão.
4. Publique a branch de produção. Os próximos commits seguem o deploy automático da integração GitHub/Vercel.

O endpoint `/api/solve` exige `Authorization: Bearer <código de acesso>`, valida o enunciado e as alternativas e chama a Groq no servidor. Preflight e erros incluem CORS para origens permitidas. Há limite de tamanho, tempo de consulta e um orçamento de 60 chamadas/minuto por instância; este último não é uma cota distribuída de gastos.

É possível abrir o instalador por um link pessoal com fragmento `#token=...`. O fragmento é removido imediatamente e não é enviado ao servidor. Não publique esse link ou o código de acesso.

## Uso direto sem servidor

Esta opção mantém a chave na memória da página, em vez de usar a API hospedada.

1. Entre na Sala do Futuro normalmente e abra a atividade com as questões carregadas.
2. Abra `dist/hub-groq.js` como texto e copie **todo** o conteúdo.
3. Abra as ferramentas do navegador (`F12` ou `Ctrl+Shift+J`), entre na aba **Console**, cole o script e pressione Enter.
4. No hub, abra **Ajustes**, informe sua chave da Groq e mantenha o modelo sugerido ou use outro modelo de texto disponível na sua conta.
5. Clique em **Salvar e iniciar**. O hub lê as questões carregadas, consulta a Groq e marca as respostas em sequência. Depois, continua aguardando novas questões na página.

A chave da Groq deve ser informada no painel, não no chat. O script não utiliza o RA ou a senha do portal: aproveita a página que você já abriu no navegador.

## Controles

- **Iniciar automático** ativa a leitura, a resposta e a marcação, sem escolher questões ou iniciar cada resposta manualmente. Enquanto ativo, o hub acompanha as mudanças na página e processa novas questões, sem repetir as já concluídas.
- **Pausar automático** interrompe a consulta em andamento e a busca por novas questões.
- As notificações mostram **Questão detectada**, **Buscando resposta…**, **Resposta detectada**, **Marcando respostas…** e **Respostas: 1**, **Respostas: 2**, etc. O contador aumenta somente quando a marcação da questão é confirmada, independentemente do número de alternativas.
- **Desfazer** pausa o automático e restaura a última seleção feita pelo hub quando a questão e a seleção continuam iguais. A contagem diminui se uma marcação confirmada for desfeita.
- A engrenagem **Ajustes** abre a chave, o modelo e os seletores personalizados.
- Arraste o cabeçalho para mover o painel. Minimize pelo cabeçalho e use `Alt+Shift+G` para reabrir. Executar o script novamente traz o painel existente para frente.
- Fechar o painel cancela as solicitações e limpa a chave da memória do hub. Recarregar a página remove o script.

## Compatibilidade e limites

O leitor atende grupos de alternativas com controles HTML `radio` e `checkbox`, além de controles acessíveis com `role="radio"` e `role="checkbox"`. Ele verifica se a questão continua igual antes de marcar e confere se o controle realmente ficou selecionado.

O layout da Sala do Futuro pode variar por tipo de atividade. O hub acompanha as questões que forem carregadas na página enquanto estiver ativo; ele não troca páginas nem finaliza a atividade. Controles próprios, questões discursivas, ordenação, arrastar e soltar, canvas e conteúdo de frames de outro domínio precisam de um adaptador específico. Não há OCR: questões que dependem de imagens, áudio ou vídeo podem não ter contexto suficiente para responder. As sugestões da IA podem conter erros, inclusive quando a confiança declarada é alta.

Todas as sugestões válidas, inclusive as de baixa confiança, são marcadas automaticamente. Quando a Groq não indica nenhuma alternativa, a questão é ignorada e uma notificação avisa. Erros de API pausam o automático; após corrigir a causa, use **Iniciar automático** para tentar novamente. Falhas de marcação não causam tentativas infinitas.

Se a leitura automática não identificar corretamente uma questão, os **seletores avançados** em Ajustes permitem indicar o bloco repetido de cada questão, o enunciado dentro desse bloco e os controles das alternativas. Exemplo para a demonstração:

```text
Bloco da questão: fieldset.question
Enunciado: [data-question-text]
Alternativas: input[type="radio"], input[type="checkbox"]
```

Não use seletores de botões de envio como alternativas. Os seletores devem apontar para os controles de resposta.

O navegador precisa permitir chamadas HTTPS para `api.groq.com`. Erros de rede podem ser causados por conexão, CORS ou pela política de conteúdo do portal. Limites de uso, modelos indisponíveis e chaves inválidas são apresentados no painel.

## Dados

A chave é mantida somente em memória; não é gravada em cookies, localStorage ou no arquivo. Como qualquer script colado no console, ele executa no contexto da página. A chave não fica protegida de outros scripts que já estejam executando nessa página. Prefira uma chave dedicada e com limite de gastos.

Enquanto o automático estiver ativo, o hub envia diretamente à Groq o texto das novas questões e das alternativas detectadas, além do modelo escolhido. Não envia automaticamente o restante da página, cookies, RA ou senha do portal. Não existe servidor intermediário neste projeto.

## Demonstração e desenvolvimento

Abra `dist/demo.html` no navegador para testar o painel com duas questões de exemplo. O modo direto da demonstração precisa da sua chave para responder. O instalador fica em `dist/index.html` e deve ser servido via HTTPS.

```sh
node scripts/build.mjs
node --test test/*.test.mjs
```

Os testes de navegador são executados com `npm run test:browser`, usando Playwright e Chromium. No Linux, o caminho padrão é `/usr/bin/chromium`; os testes de integração aceitam `CHROMIUM_PATH`. Os testes interceptam as chamadas à Groq com respostas simuladas, sem chave real e sem envio à plataforma escolar.

Verificação na Sala do Futuro: a página pública e o formulário de login foram acessados, mas o portal retornou um erro de conexão na tentativa de autenticação. A leitura das questões dessa atividade específica ainda precisa ser conferida na sua sessão. Nenhuma alteração foi feita na atividade escolar durante essa verificação.

`src/page-adapter.js` faz leitura, verificação e seleção. `src/groq-client.js` faz a chamada à Groq e valida a resposta. `src/hub.js` contém a interface e a coordenação. O build junta os três em um único arquivo para colar no console.
