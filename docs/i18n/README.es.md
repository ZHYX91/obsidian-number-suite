# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite muestra números en títulos, leyendas, referencias, notas al pie y notas finales de Obsidian. Puedes verlos sin modificar Markdown. Guardar números dentro del texto requiere otra operación.

## Primeros pasos

1. En **Ajustes → Number Suite → Numeración de títulos**, activa los números virtuales (`Show virtual numbers`).
2. Abre la vista previa en directo o la vista de lectura. Los números aparecen junto a los títulos, pero el archivo sigue igual.
3. Para guardar los números en Markdown, abre la nota actual en la barra lateral de Number Suite. Elige escribir números o renumerar, revisa la vista previa y confirma.

## Leyendas y referencias

Encima de una imagen, tabla, ecuación independiente o bloque de código, escribe una línea que empiece por `Figure:`, `Table:`, `Equation:` o `Code:`. Estas palabras clave se escriben en inglés. Las leyendas pueden mostrar números. Las referencias dentro de la misma nota usan `@[[#Título]]`; los enlaces normales `[[#...]]` no cambian. Las notas al pie `[^id]` y las notas finales `[^endnote:id]` se numeran por separado.

```markdown
Figure: Architecture

![[architecture.png]]
```

## Estilos y seguridad

Hay estilos jerárquicos, ejemplos para documentos oficiales y jurídicos chinos y formatos de chino tradicional, japonés, coreano y dígitos arábigo-índicos. Cambiar el idioma no cambia automáticamente el estilo elegido. Elegir un estilo no escribe nada en Markdown. Escribir, quitar o renumerar títulos, crear leyendas o añadir identificadores de referencia sí puede modificar archivos. Revisa la vista previa y haz una copia de seguridad; algunos enlaces pueden dejar de funcionar. Los títulos de niveles 7 a 9 usan sintaxis ampliada.

## Instalación y ayuda

Necesitas Obsidian 1.12.7 o posterior en escritorio o Android; iOS todavía no se ha verificado. Instala el complemento desde la comunidad o copia `main.js`, `manifest.json` y `styles.css` de la misma versión a `.obsidian/plugins/number-suite/`. Funciona sin telemetría ni conexión a Internet. Consulta el [manual completo en inglés](../../README.md) para conocer las reglas y limitaciones.

[Issues](https://github.com/ZHYX91/obsidian-number-suite/issues)
