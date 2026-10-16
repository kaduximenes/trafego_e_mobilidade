# COR • Tráfego e Mobilidade Urbana

Painel operacional do Centro de Operações e Resiliência (COR) para monitoramento
de tráfego e mobilidade urbana do Rio de Janeiro.

## O que o painel mostra

| Fonte | Conteúdo | Intervalo de atualização |
|---|---|---|
| **Hexagon / COR** | Ocorrências abertas, classificadas pelos POPs | 60 s |
| **Waze for Cities** | Congestionamento, alertas e trechos com retenção | 120 s |
| **Dataprom / Antares** | Saúde dos controladores semafóricos | 60 s |
| **Tixxi** | Rede de câmeras (status de cada equipamento) | sob demanda |

Inclui ainda o **índice de saúde da infraestrutura** (média da disponibilidade de
semáforos e câmeras, com peso igual por rede) e o indicador de **frescura das
fontes**, que sinaliza quando um painel está exibindo dado defasado.

## Histórico e replay

O painel é em tempo real, mas as fontes não têm histórico: a API do COR, por
exemplo, só devolve ocorrências *abertas* — não existe "como estava às 14h30".
O histórico é construído capturando o estado a cada coleta.

| Rota | Para que serve |
|---|---|
| `POST /api/collect` | Coleta as 4 fontes, grava métricas, frame e tabelas derivadas |
| `GET /api/metrics?from&to&source` | Série temporal das métricas consolidadas |
| `GET /api/frames?from&to` | Instantes disponíveis (insumo da linha do tempo) |
| `GET /api/snapshot?at=` | Estado do mapa em um instante (replay) |
| `GET /api/occurrences?open=` | Ciclo de vida: abertura, fechamento e duração |
| `GET /api/state-changes?entity=` | Transições de estado de semáforos e câmeras |

A **linha do tempo** na base do mapa permite voltar no tempo, avançar quadro a
quadro, reproduzir em 1×/4×/12×, escolher o período coberto (6 h a 7 dias) e
retornar ao vivo. Em modo histórico, o mapa e o painel desenham o frame daquele
momento pelo mesmo pipeline de renderização, com um aviso fixo de **MODO
HISTÓRICO** para o operador não confundir passado com agora.

A lista de frames é recarregada a cada 5 minutos, para que a linha do tempo
incorpore as coletas novas sem exigir recarregar a página.

### O que é gravado

| Tabela | Conteúdo | Cadência | Retenção |
|---|---|---|---|
| `metric_sample` | Métricas consolidadas por fonte | 15 min | indefinida |
| `frame` | Estado compacto para o replay | 15 min | **90 dias** (podada automaticamente) |
| `occurrence` | Abertura/fechamento com duração | por mudança | indefinida |
| `state_change` | Transições de estado | por mudança | 1 ano |
| `entity_state` | Estado corrente por entidade | a cada coleta | — |

Um frame ocupa ~190 KB de JSON (**~35 KB** no Postgres, que comprime `jsonb`).
A 15 min de cadência são ~96 frames/dia, ou seja, cerca de **100 MB/mês**.

Como o frame responde por ~95% do volume, é a única tabela que precisa de poda.
A cada coleta os frames anteriores ao corte (padrão 90 dias, configurável em
`HISTORY_RETENTION_DAYS`) são removidos, levando o estado estacionário a
**~300 MB** — dentro do 1 GB do Neon e dos 500 MB do Supabase. As tabelas
analíticas nunca são podadas: são pequenas e são o valor de longo prazo.

Quer manter tudo? `HISTORY_RETENTION_DAYS=0` desliga a poda.

### Como o ciclo de vida é detectado

Como o endpoint do COR só devolve ocorrências abertas, uma ocorrência *encerrou*
quando desaparece entre duas leituras consecutivas. Isso é feito por comparação
de snapshots — nenhuma API nova é necessária.

**Importante:** quando uma fonte falha, nada é concluído sobre ela. Se a API do
COR der timeout, as ocorrências **não** são marcadas como fechadas; a coleta fica
registrada como indisponível (`ok=false`) para que a lacuna seja explícita em vez
de virar um encerramento falso. Há teste automatizado cobrindo esse caso.

## Estrutura

```
shared/
  domain/          regras puras (normalização e agregação), usadas pela UI e pelo coletor
  history/         coletor, store (Postgres/arquivo) e rotas HTTP do histórico
  proxyRoutes.js   destinos dos proxies (COR, Antares, Tixxi)
  wazeFeed.js      busca, enxugamento e cache do feed do Waze
server/            servidor Express de produção (proxy + estáticos + histórico)
src/
  components/      UI (mapa, painéis, linha do tempo)
  contexts/        cursor temporal
  hooks/           carga e polling de cada fonte
  services/        transporte das APIs externas
```

A separação em `shared/domain` garante que o histórico use **exatamente** as mesmas
funções de agregação da tela — não existe segunda implementação das regras.

## Configuração

Copie `.env.example` para `.env`. As variáveis com prefixo `VITE_` são embutidas
no bundle do navegador em tempo de build; **nunca coloque segredos novos nelas**.

### Desenvolvimento

```bash
npm install
cp .env.example .env   # preencha as credenciais
npm run dev            # http://localhost:5173
```

O coletor aceita tanto `TIXXI_*` quanto `VITE_TIXXI_*`, para não obrigar a
duplicar o mesmo segredo só porque o consumidor mudou.

### Testes e verificação

```bash
npm test        # suíte do domínio, coletor, store e rotas
npm run lint    # oxlint
npm run build   # build de produção
npm run verify:db   # SQL de produção contra o Postgres real do .env
```

`npm run verify:db` é o teste que a suíte **não** consegue fazer: aponta para o
banco configurado em `DATABASE_URL` e executa os mesmos comandos de produção
(criação de schema, upsert de métricas, frame com `jsonb`/`text[]`, ciclo de vida
das ocorrências, transições de estado e poda). Use antes de confiar em um banco
novo — por exemplo ao migrar de serviço ou trocar de projeto. Ele usa marcadores
próprios e apaga o que criou, sem tocar nos dados coletados.

O driver Postgres também é exercitado com SQL de verdade em `npm test`:
`shared/history/postgresStore.test.js` roda os mesmos comandos contra um Postgres
em memória (`pg-mem`, dependência de desenvolvimento). Isso pega nomes de coluna,
casts e sintaxe inválidos, que de outra forma só apareceriam no primeiro deploy
com `DATABASE_URL` definido.

Duas limitações conhecidas do emulador, ambas contornadas nos testes e conferidas
depois contra um Postgres real (Neon):

- ele não mantém um índice parcial após `UPDATE`, então o índice
  `occurrence_open_idx` é removido dentro do teste que filtra ocorrências
  encerradas. No Postgres real o índice é correto e serve justamente o filtro de
  ocorrências abertas — comportamento confirmado executando o mesmo SQL contra o
  Neon, onde `open=false` encontra a ocorrência encerrada;
- ele rejeita `CREATE TABLE IF NOT EXISTS` na segunda execução, então a
  idempotência de `ensureSchema` não é exercitada pela suíte. Foi verificada
  manualmente contra o Neon, executando `ensureSchema` três vezes seguidas sem
  erro.

## Produção

O deploy é descrito em `render.yaml`. Três pontos exigem atenção:

1. **O histórico precisa de banco persistente.** Sem `DATABASE_URL`, o servidor
   usa um driver de arquivo que **perde tudo** a cada deploy/restart. Opções
   gratuitas que persistem de verdade:

   | Serviço | Free | Duração com a poda de 90 dias |
   |---|---|---|
   | **Neon** | 1 GB/projeto, free permanente | nunca enche (~300 MB) |
   | **Supabase** | 500 MB (pausa após 1 semana inativo) | nunca enche |

   > ⚠️ O Postgres gratuito do próprio Render **expira em 30 dias** — não use.
   >
   > A pausa por inatividade do Supabase não afeta este projeto: o coletor
   > escreve a cada 15 minutos, o que conta como atividade.

   Confirme em `/healthz`, que reporta `history.persistent` e `retentionDays`.
   O endpoint existe também no `npm run dev` (mesmo handler), então dá para
   validar o banco antes de subir qualquer deploy.

   Passo a passo:

   1. Crie o projeto no Neon (plano free, sem cartão) e copie a connection string.
      Prefira o host **pooled** (com sufixo `-pooler`) e `sslmode=verify-full`.
   2. Ponha em `.env` — que é ignorado pelo git, então o segredo não é versionado:

      ```bash
      DATABASE_URL=postgresql://usuario:senha@ep-xxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=verify-full
      COLLECT_SECRET=<32 bytes aleatórios>
      ```

   3. Suba o servidor e confirme antes de seguir:

      ```bash
      npm run dev
      curl http://localhost:5173/healthz
      # history: { driver: "postgres", persistent: true, ... }

      curl -X POST -H "x-collect-secret: SEU_SEGREDO" http://localhost:5173/api/collect
      curl http://localhost:5173/api/snapshot   # available: true, com o frame coletado
      ```

   As tabelas são criadas no boot por `ensureSchema`, de forma idempotente — não
   é preciso rodar migração à mão.

2. **A coleta é agendada externamente.** No plano gratuito do Render o web service
   hiberna após alguns minutos sem acesso, então um `setInterval` dentro do
   processo deixaria buracos no histórico — justamente nos horários sem operador.
   O workflow `.github/workflows/collect-metrics.yml` chama `POST /api/collect` a
   cada 15 minutos. Configure os secrets do repositório:
   - `HISTORY_BASE_URL` — URL pública do serviço
   - `COLLECT_SECRET` — o mesmo valor configurado no servidor

3. **As câmeras são acessadas pelo gateway público do Tixxi** em
   `https://api.tixxi.rio/stream/`, que leva o caminho no query string
   (`/stream/?api/auth/login`, `/stream/?api/cameras`). A API interna do COR
   (`10.50.3.96:8000`) não é alcançável da hospedagem. As credenciais
   `api_key`/`email`/`password` permanecem no servidor. `TIXXI_TARGET` aceita
   outro gateway no mesmo formato. Se a autenticação ou a coleta de câmeras falharem, a
   amostra fica indisponível, sem afetar as demais fontes.

## Dependências: advisory conhecido

`npm audit` reporta 3 vulnerabilidades *high* em `braces`, alcançado por
`http-proxy-middleware → micromatch → braces`.

- O advisory (GHSA-vfj7-8cjw-p6xm) afeta `braces <= 3.0.3`, e **3.0.3 é a última
  versão publicada** — não existe correção upstream hoje.
- O "fix" que o npm propõe é rebaixar o `http-proxy-middleware` de 4.2.0 para
  0.2.0, um downgrade quebrável que reintroduziria problemas antigos. **Não faça isso.**
- **Não é explorável neste projeto:** a falha é um DoS por padrões profundamente
  aninhados, e os padrões passados ao `micromatch` são os prefixos de rota
  definidos em `shared/proxyRoutes.js` — estáticos, sob nosso controle, nunca
  entrada do usuário.

Revise quando houver versão corrigida do `braces`.
