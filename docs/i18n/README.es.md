# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite muestra números en títulos, leyendas, referencias, notas al pie y notas finales de Obsidian. Puedes verlos sin modificar Markdown. Guardar números dentro del texto requiere otra operación.

Esta es una **guía breve** para las tareas habituales. La sintaxis avanzada de H7–H9, la asociación entre leyendas y objetos, las referencias estables y las notas se explican en las guías detalladas en [inglés](../advanced.en.md) y [chino simplificado](../advanced.zh-CN.md).

<!-- section: installation -->
## Instalación

Requiere Obsidian 1.12.7 o posterior en escritorio o Android. El comportamiento en iOS aún no está verificado.

1. Busca Number Suite en Ajustes → Complementos de la comunidad → Explorar, instálalo y actívalo.
2. Para instalarlo manualmente, descarga el ZIP de la versión en [GitHub Releases](https://github.com/ZHYX91/obsidian-number-suite/releases) y coloca la carpeta extraída `number-suite` en `.obsidian/plugins/`. También puedes copiar `main.js`, `manifest.json` y `styles.css` de la misma versión a `.obsidian/plugins/number-suite/`.
3. Recarga Obsidian y activa el complemento. No mezcles archivos de versiones distintas.

<!-- section: quick-start -->
## Primeros pasos

1. En **Ajustes → Number Suite → Numeración de títulos**, activa **« Mostrar números virtuales »**.
2. Abre la vista previa en directo o la vista de lectura. Los números aparecen junto a los títulos, pero el archivo sigue igual.
3. Para guardar los números en Markdown, abre la nota actual en la barra lateral de Number Suite. Elige escribir números o renumerar, revisa la vista previa y confirma.

La guía de la nota actual compara el texto de origen, el objetivo y la acción. Las opciones de cada nota se guardan en Properties; la visualización no reescribe los títulos. La vista previa agrupa cambios y avisos por archivo y muestra sus cantidades. Despliega un archivo y carga más resultados para revisarlos todos. Desactivar el complemento detiene nuevas escrituras de lotes o de Deshacer; una escritura ya iniciada puede terminar. Si no se puede revertir con seguridad, conserva `recovery.json` en la carpeta del complemento y revisa primero las notas.

<!-- section: captions -->
## Leyendas y referencias

Encima de una imagen, tabla, ecuación independiente o bloque de código, escribe una línea que empiece por `Figure:`, `Table:`, `Equation:` o `Code:`. Estas palabras clave se escriben en inglés. Las leyendas pueden mostrar números. Las referencias dentro de la misma nota usan `@[[#Título]]`; los enlaces normales `[[#...]]` no cambian. Las notas al pie `[^id]` y las notas finales `[^endnote:id]` se numeran por separado.

```markdown
Figure: Architecture

![[architecture.png]]
```

Al mover una leyenda o corregir las mayúsculas de su palabra clave, se conservan sus ID de bloque en la misma línea o en líneas posteriores. Las referencias de bloque siguen apuntando a esa leyenda.

<!-- section: numbering -->
## Estilos y seguridad

Hay estilos jerárquicos, ejemplos para documentos oficiales y jurídicos chinos y formatos de chino tradicional, japonés, coreano y dígitos arábigo-índicos. Cambiar el idioma no cambia automáticamente el estilo elegido. Elegir un estilo no escribe nada en Markdown. Escribir, quitar o renumerar títulos, crear leyendas o añadir identificadores de referencia sí puede modificar archivos. Revisa la vista previa y haz una copia de seguridad; algunos enlaces pueden dejar de funcionar. Los títulos de niveles 7 a 9 usan sintaxis ampliada.

<!-- section: settings -->
## Dónde ajustar las opciones

Las siete pestañas de ajustes son: General, Numeración de títulos, Leyendas, Referencias cruzadas, Notas al pie y finales, Escritura y limpieza, Vista y lotes. El idioma y el estilo de numeración se eligen por separado. La sección de nota actual en la barra lateral derecha permite cambiar solo una nota. Volver a seguir los ajustes globales elimina esa excepción y conserva las demás Properties. El esquema del documento y el mapa mental de títulos, de solo lectura, permiten saltar al texto original.

<!-- section: limitations -->
## Alcance y límites

- Cada archivo Markdown usa un solo estilo de numeración. Las leyendas y referencias también se resuelven dentro del mismo archivo.
- Los títulos y leyendas dentro de listas, citas, ejemplos de código, bloques HTML y frontmatter no se numeran. Las notas y referencias del texto normal de una lista siguen funcionando.
- En Structural Tables, la acción de leyenda requiere comprobar el archivo, el texto y el intervalo exacto. Un elemento desactivado explica los casos de versión antigua o tabla no compatible. En esos casos, añade o edita la leyenda en modo fuente.
- H7–H9 son una extensión de Number Suite y DocWen. El esquema y los enlaces a títulos de Obsidian pueden no reconocerlos; puedes usar un ID de bloque como destino estable.

<!-- section: privacy-and-support -->
## Privacidad y ayuda

El complemento funciona localmente, sin red ni telemetría. Mostrar números no modifica las notas. Revisa la vista previa antes de escribir, quitar o recalcular números. Cambiar el texto de un título puede afectar a los enlaces existentes. Al informar de un error, incluye versiones, pasos y un ejemplo mínimo de Markdown sin datos privados.

[Guía completa en inglés](../../README.md) · [Informar de un problema](https://github.com/ZHYX91/obsidian-number-suite/issues/new/choose) · [Licencia MIT](../../LICENSE)
