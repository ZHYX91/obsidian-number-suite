# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

O Number Suite mostra números em títulos, legendas, referências, notas de rodapé e notas de fim no Obsidian. A exibição na tela não modifica o Markdown. Gravar os números no texto é uma operação separada.

## Comece por aqui

1. Em **Configurações → Number Suite → Numeração de títulos**, ative os números virtuais (`Show virtual numbers`).
2. Abra a pré-visualização ao vivo ou o modo de leitura. Os números aparecem ao lado dos títulos, mas o arquivo não muda.
3. Para salvar números no Markdown, abra a nota atual na barra lateral do Number Suite. Escolha escrever ou renumerar, confira a prévia e confirme.

## Legendas e referências

Acima de uma imagem, tabela, equação isolada ou bloco de código, escreva uma linha com `Figure:`, `Table:`, `Equation:` ou `Code:`. Essas palavras-chave devem ficar em inglês. As legendas podem mostrar números. Para referências dentro da mesma nota, use `@[[#Título]]`; links comuns `[[#...]]` continuam iguais. Notas de rodapé `[^id]` e notas de fim `[^endnote:id]` têm contagens separadas.

```markdown
Figure: Architecture

![[architecture.png]]
```

## Estilos e cuidado com os arquivos

Há estilos hierárquicos, exemplos para documentos oficiais e jurídicos chineses e formatos de chinês tradicional, japonês, coreano e algarismos arábico-índicos. Mudar o idioma não troca automaticamente o estilo. Escolher um estilo não grava nada no Markdown. Escrever, remover e renumerar títulos, criar legendas e acrescentar IDs de referência podem modificar arquivos. Confira a prévia e faça backup: links para títulos podem deixar de funcionar. Os níveis 7 a 9 são uma extensão.

## Instalação e ajuda

Requer Obsidian 1.12.7 ou superior no computador ou Android; o iOS ainda não foi validado. Instale pelos plugins da comunidade ou copie `main.js`, `manifest.json` e `styles.css` da mesma versão para `.obsidian/plugins/number-suite/`. O plugin funciona localmente, sem telemetria. O [manual detalhado em inglês](../../README.md) explica as regras e limitações.

[Issues](https://github.com/ZHYX91/obsidian-number-suite/issues)
