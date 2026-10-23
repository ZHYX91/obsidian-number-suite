# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

O Number Suite mostra números em títulos, legendas, referências, notas de rodapé e notas de fim no Obsidian. A exibição na tela não modifica o Markdown. Gravar os números no texto é uma operação separada.

Este é um **guia resumido** para tarefas comuns. Os detalhes sobre H7–H9, vínculo entre legendas e objetos, referências estáveis, notas de rodapé e notas finais ficam nos guias avançados em [inglês](../advanced.en.md) e [chinês simplificado](../advanced.zh-CN.md).

<!-- section: installation -->
## Instalação

Requer Obsidian 1.12.7 ou mais recente no computador ou Android. O funcionamento no iOS ainda não foi verificado.

1. Em Configurações → Plugins da comunidade → Explorar, procure Number Suite, instale e ative.
2. Para instalar manualmente, baixe o ZIP da versão em [GitHub Releases](https://github.com/ZHYX91/obsidian-number-suite/releases) e coloque a pasta extraída `number-suite` em `.obsidian/plugins/`. Você também pode copiar `main.js`, `manifest.json` e `styles.css` da mesma versão para `.obsidian/plugins/number-suite/`.
3. Recarregue o Obsidian e ative o plugin. Não misture arquivos de versões diferentes.

<!-- section: quick-start -->
## Comece por aqui

1. Em **Configurações → Number Suite → Numeração de títulos**, ative **“Mostrar números virtuais”**.
2. Abra a pré-visualização ao vivo ou o modo de leitura. Os números aparecem ao lado dos títulos, mas o arquivo não muda.
3. Para salvar números no Markdown, abra a nota atual na barra lateral do Number Suite. Escolha escrever ou renumerar, confira a prévia e confirme.

<!-- section: captions -->
## Legendas e referências

Acima de uma imagem, tabela, equação isolada ou bloco de código, escreva uma linha com `Figure:`, `Table:`, `Equation:` ou `Code:`. Essas palavras-chave devem ficar em inglês. As legendas podem mostrar números. Para referências dentro da mesma nota, use `@[[#Título]]`; links comuns `[[#...]]` continuam iguais. Notas de rodapé `[^id]` e notas de fim `[^endnote:id]` têm contagens separadas.

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

As configurações globais estão divididas em Geral, títulos, legendas, referências, notas de rodapé e de fim, operações de arquivo e visualizações. Idioma e estilo de numeração são escolhidos separadamente. Na barra lateral direita, a nota atual permite alterar apenas uma nota. Voltar a seguir a configuração global remove somente essa exceção e mantém as outras Properties. O sumário do documento e o mapa mental de títulos, somente para leitura, levam ao texto original.

<!-- section: limitations -->
## Escopo e limitações

- Cada arquivo Markdown usa um único estilo de numeração. Legendas e referências também são resolvidas no mesmo arquivo.
- Títulos e legendas em listas, citações, exemplos de código, blocos HTML e frontmatter não entram na numeração. Notas e referências no texto comum de listas continuam disponíveis.
- Em Structural Tables, a ação de legenda exige conferir o arquivo, o texto e o intervalo exato. Um item desativado explica quando a versão é antiga ou a tabela não é compatível. Nesses casos, adicione ou edite a legenda no modo fonte.
- H7–H9 são uma extensão do Number Suite e do DocWen. O sumário e os links de títulos nativos do Obsidian podem não reconhecê-los; IDs de bloco oferecem destinos estáveis.

<!-- section: privacy-and-support -->
## Privacidade e ajuda

O plugin funciona localmente, sem rede ou telemetria. A exibição de números não altera as notas. Confira a prévia antes de gravar, remover ou refazer números. Alterar o texto de um título pode afetar links existentes. Ao relatar um problema, inclua versões, passos e um exemplo pequeno de Markdown sem conteúdo privado.

[Guia completo em inglês](../../README.md) · [Relatar um problema](https://github.com/ZHYX91/obsidian-number-suite/issues/new/choose) · [Licença MIT](../../LICENSE)
