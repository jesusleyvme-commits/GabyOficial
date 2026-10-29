---
name: kaio-cloudflare
description: Use quando pedirem para preparar este projeto para a Cloudflare ("preparar para a Cloudflare", "publicar na Cloudflare", "Cloudflare Workers"). Deixa o projeto pronto para o GeckoAi publicar — quem publica é o GeckoAi, nunca você.
---

# Preparar o projeto para a Cloudflare

Quem publica o site é o GeckoAi. A sua tarefa é SÓ deixar o projeto pronto:
criar ou ajustar a configuração do Wrangler (`wrangler.jsonc` na raiz) e
garantir que o build funciona. Quando você terminar, o GeckoAi confere e
publica sozinho.

## O nome do site

O GeckoAi informa o nome do site no pedido. Use EXATAMENTE esse nome no campo
`"name"` do `wrangler.jsonc` e em qualquer referência do projeto a ele
mesmo (`"services": [{ "service": "..." }]`). Não invente outro nome.

## Receitas

### Site Vite / React de uma página só (SPA)

Crie `wrangler.jsonc` na raiz:

```jsonc
{
  "name": "<nome informado pelo GeckoAi>",
  "compatibility_date": "2025-09-24",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

Confira no `vite.config` a pasta de saída do build (`build.outDir`, padrão
`dist`) e use a mesma em `"directory"`. Rode o script `build` do
`package.json` e confirme que a pasta foi gerada.

### Site só com arquivos HTML (sem build)

Crie `wrangler.jsonc` na raiz com `"assets": { "directory": "." }` (sem
`not_found_handling`, a menos que o site seja SPA) e crie `.assetsignore`
na raiz, uma entrada por linha:

```
node_modules
.git
.wrangler
.env
.env.*
wrangler.jsonc
.opencode
.agents
.vscode
```

### Next.js

Rode na raiz:

    npx opennextjs-cloudflare migrate

Ele instala o adaptador, cria `wrangler.jsonc`, `open-next.config.ts` e
ajusta o `package.json`. Depois abra o `wrangler.jsonc` e coloque o nome
informado no `"name"` E no `"service"` do `WORKER_SELF_REFERENCE`. Não
configure cache em R2/KV. Se o `migrate` avisar que não configurou o cache,
tudo bem — o cache é opcional.

### Outros tipos (servidor Express, Python, PHP…)

Não tente adaptar. Explique ao usuário, em linguagem simples, que este tipo de
projeto não é publicado na Cloudflare pelo GeckoAi e que a aba Vercel da
janela "Publicar" funciona com ele.

## Proibido

- Publicar: `wrangler deploy`, `npm run deploy`, `opennextjs-cloudflare deploy`
  ou qualquer outro envio. Quem publica é o GeckoAi.
- `wrangler login` ou `wrangler logout`.
- Mudar o `"name"` para algo diferente do que o GeckoAi informou.
- Apagar ou mover arquivos e pastas do projeto.
- Criar KV, R2, D1, filas ou qualquer outro recurso na conta da Cloudflare.
- Colocar chaves secretas (tokens, senhas, service role) no `wrangler.jsonc`
  ou em `vars`. O GeckoAi pede os segredos ao usuário e guarda na Cloudflare.

## Quando terminar

Diga em uma frase o que mudou no projeto e termine com a linha:

PRONTO PARA A CLOUDFLARE

Responda sempre no idioma do usuário.
