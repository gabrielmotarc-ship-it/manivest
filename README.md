# Apuração 2026 — widget de iPhone

Widget para a tela inicial (e tela bloqueada) do iPhone com a apuração **ao vivo** das Eleições 2026:
percentual de urnas apuradas e votos de cada candidato, lidos direto dos arquivos públicos de
resultado do **TSE** (a mesma fonte oficial usada pelos infográficos de apuração da imprensa).
Tocar no widget abre a [apuração ao vivo do O Globo](https://infograficos.oglobo.globo.com/politica/eleicoes-2026/apuracao-resultado-ao-vivo-2026.html#/presidente?tipo=apuracao&turno=1).

Ele roda no app gratuito **[Scriptable](https://apps.apple.com/app/scriptable/id1405459188)**, que
permite criar widgets próprios sem precisar de Xcode nem de conta de desenvolvedor da Apple.

## Instalação (2 minutos)

1. Instale o **Scriptable** pela App Store e abra-o uma vez.
2. No Scriptable, toque em **+**, cole o conteúdo de [`scriptable/Instalar.js`](scriptable/Instalar.js)
   e toque em ▶︎. Ele baixa o script **Apuração 2026** (rode de novo quando quiser atualizar).
   - Alternativa: crie um script novo chamado `Apuração 2026` e cole direto o conteúdo de
     [`scriptable/Apuracao2026.js`](scriptable/Apuracao2026.js).
3. Na tela inicial, segure num espaço vazio › **Editar** › **Adicionar widget** › **Scriptable**,
   escolha o tamanho (pequeno, médio ou grande) e adicione.
4. Segure o widget › **Editar widget** › em **Script** escolha `Apuração 2026`.
   O toque no widget já abre a página do O Globo (não precisa configurar nada).

Para a **tela bloqueada**, adicione um widget do Scriptable lá também (formatos em linha,
retangular ou circular) e escolha o mesmo script.

## Escolhendo o que acompanhar

No campo **Parameter** do widget (opcional):

| Parâmetro        | Mostra                                   |
| ---------------- | ---------------------------------------- |
| *(vazio)*        | Presidente, Brasil                       |
| `presidente mg`  | Presidente, só votos de MG               |
| `governador sp`  | Governador de SP                         |
| `senador rj`     | Senador do RJ                            |
| `t1` / `t2`      | Força o 1º ou o 2º turno                 |
| `demo`           | Dados fictícios, para testar o visual    |

Dá para ter vários widgets ao mesmo tempo, cada um com um parâmetro (ex.: um de presidente e outro
de governador). Sem `t1`/`t2`, o widget passa sozinho para o 2º turno quando o TSE publicar os
dados dele.

Rodando o script dentro do app, aparece a lista completa de candidatos com votos.

## Como funciona

- Os códigos das eleições vêm do índice oficial do TSE (`comum/config/ele-c.json`); se ele não
  responder, usa os de 2026: federal **6257** (1º turno) / **6258** (2º) e estadual **6259** / **6260**.
- O resultado vem de
  `https://resultados.tse.jus.br/oficial/ele2026/<eleição>/dados/<uf>/<uf>-c<cargo>-e<eleição>-u.json`.
- O último resultado fica salvo no aparelho: sem internet, o widget mostra o dado anterior com o aviso
  "Offline".
- O widget pede atualização a cada minuto, mas **quem decide a frequência é o iOS** (normalmente a
  cada 5–15 min). Para ver o dado mais novo na hora, toque no widget ou abra o script no Scriptable.

Projeto independente, sem vínculo com o TSE nem com o O Globo.
