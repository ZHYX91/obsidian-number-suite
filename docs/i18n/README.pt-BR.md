# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

O Number Suite mostra números em títulos, legendas, referências, notas de rodapé e notas de fim no Obsidian. A exibição na tela não modifica o Markdown. Gravar os números no texto é uma operação separada.

Este é um **guia resumido** para tarefas comuns. Os detalhes sobre H7–H9, vínculo entre legendas e objetos, referências estáveis, notas de rodapé e notas finais ficam nos guias avançados em [inglês](../advanced.md) e [chinês simplificado](../advanced.zh-CN.md).

<!-- section: installation -->
## Instalação

Requer Obsidian 1.12.7 ou mais recente no computador ou Android. O funcionamento no iOS ainda não foi verificado.

1. Em Configurações → Plugins da comunidade → Explorar, procure Number Suite, instale e ative.
2. Para instalar manualmente, baixe o ZIP da versão em [GitHub Releases](https://github.com/ZHYX91/obsidian-number-suite/releases) e coloque a pasta extraída `number-suite` em `.obsidian/plugins/`. Você também pode copiar `main.js`, `manifest.json` e `styles.css` da mesma versão para `.obsidian/plugins/number-suite/`.
3. Recarregue o Obsidian e ative o plugin. Não misture arquivos de versões diferentes.

**Atualização manual:** Na pasta existente do plugin, substitua apenas `main.js`, `manifest.json` e `styles.css` por arquivos da mesma versão. Preserve `data.json` para manter suas configurações. Preserve também os arquivos `recovery.json` e `recovery.pending.json`, se existirem: eles contêm dados para desfazer e recuperar operações em lote. Não os sobrescreva nem exclua durante a atualização.

<!-- section: quick-start -->
## Comece por aqui

1. Em **Configurações → Number Suite → Numeração de títulos**, ative **“Mostrar números virtuais”**.
2. Abra a pré-visualização ao vivo ou o modo de leitura. Os números aparecem ao lado dos títulos, mas o arquivo não muda.
3. Para salvar os números no Markdown, abra **Nota atual → Editar o texto**. Escolha gravar ou renumerar, confira a prévia e confirme.

As opções de cada nota são salvas em Properties; a exibição em si não reescreve títulos. A prévia agrupa alterações e avisos por arquivo e mostra suas quantidades. Expanda um arquivo e carregue mais resultados para conferir tudo. Desativar o plugin interrompe novas gravações de lotes ou de Desfazer; uma gravação já iniciada ainda pode terminar. Se não for possível reverter com segurança, mantenha `recovery.json` na pasta do plugin e confira as notas primeiro.

A nota atual mostra de forma compacta o nome, o estado automático e três opções principais; o salvamento em andamento e os erros continuam visíveis. Ações em uma única nota abrem uma página de prévia na barra lateral, com destino fixo e Voltar/Cancelar/Aplicar. Trocar de nota não muda o destino; mudanças no texto exigem uma nova prévia. Lotes mantêm uma janela ampla. O modo de estrutura mostra seu nome, botões de movimento, destino destacado e linhas de inserção antes/depois, com motivos breves para destinos inválidos ou fontes indisponíveis.

<!-- section: captions -->
## Legendas e referências

Acima de uma imagem, tabela, equação isolada ou bloco de código, escreva uma linha com `Figure:`, `Table:`, `Equation:` ou `Code:`. Essas palavras-chave devem ficar em inglês. As legendas podem mostrar números. Para referências dentro da mesma nota, use `@[[#Título]]`. Use `@[[#^block-id]]` quando o ID do bloco pertencer a um título ou a uma legenda. Links para blocos de parágrafos comuns mantêm o comportamento padrão do Obsidian. Notas de rodapé `[^id]` e notas de fim `[^endnote:id]` têm contagens separadas.

```markdown
Figure: Architecture

![[architecture.png]]
```

Ao mover uma legenda ou corrigir as letras maiúsculas da palavra-chave, os IDs de bloco na mesma linha ou nas linhas seguintes permanecem com a legenda. As referências de bloco continuam apontando para ela.

<!-- section: numbering -->
## Estilos e cuidado com os arquivos

Há estilos hierárquicos, exemplos para documentos oficiais e jurídicos chineses e formatos de chinês tradicional, japonês, coreano e algarismos arábico-índicos. Mudar o idioma não troca automaticamente o estilo. Escolher um estilo não grava nada no Markdown. Escrever, remover e renumerar títulos, criar legendas e acrescentar IDs de referência podem modificar arquivos. Confira a prévia e faça backup: links para títulos podem deixar de funcionar. Os níveis 7 a 9 são uma extensão.

<!-- section: settings -->
## Onde ajustar as opções

Os ajustes de operações em lote ficam em **Gravar e limpar**, os de links em **Links e referências** e a aparência dos números em **Exibição e aparência**.


As configurações têm sete abas. Geral ativa por padrão o aprimoramento da estrutura nativa. Desativar preserva preferências e nunca ativa o plugin principal. O menu de exibição da estrutura salva quatro opções compartilhadas: números, níveis sem número, H7–H9 e legendas; elas afetam somente a estrutura. O número calculado aparece com fundo preenchido e o número gravado visível, com contorno. Os dois podem aparecer juntos. Se não houver número, você pode mostrar o nível (Hn). Nota atual herda ou substitui separadamente números virtuais, visibilidade dos números gravados e estilo, com estado automático. Regras de início e salto ficam recolhidas e são adicionadas conforme necessário. Desativar mantém as escolhas; gravação e limpeza ainda exigem prévia. Folhas do mapa não exibem 0. Layout e profundidade ficam no menu secundário; botões de movimento e destinos só aparecem no modo de ajuste da estrutura.

Em um esquema que começa em H2, defina o número inicial como 4 e a quantidade de seções a ignorar como 1. O primeiro H2 não vazio e todos os seus subtítulos ficam sem numeração. O H2 seguinte recebe `4` e seu primeiro H3 recebe `4.1`. **Remover regra** apaga as duas configurações desse nível.

<!-- section: limitations -->
## Escopo e limitações

- Cada arquivo Markdown usa um único estilo de numeração. Legendas e referências também são resolvidas no mesmo arquivo.
- Títulos e legendas em listas, citações, exemplos de código, blocos HTML e frontmatter não entram na numeração. Notas e referências no texto comum de listas continuam disponíveis.
- Em Structural Tables, a ação de legenda exige conferir o arquivo, o texto e o intervalo exato. Um item desativado explica quando a versão é antiga ou a tabela não é compatível. Nesses casos, adicione ou edite a legenda no modo fonte.

<!-- section: privacy-and-support -->
## Privacidade e ajuda

O plugin funciona localmente, sem rede ou telemetria. A exibição de números não altera as notas. Confira a prévia antes de gravar, remover ou refazer números. Alterar o texto de um título pode afetar links existentes. Ao relatar um problema, inclua versões, passos e um exemplo pequeno de Markdown sem conteúdo privado.

[Guia completo em inglês](../../README.md) · [Relatar um problema](https://github.com/ZHYX91/obsidian-number-suite/issues/new/choose) · [Licença MIT](../../LICENSE)
