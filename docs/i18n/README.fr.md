# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite affiche des numéros pour les titres, légendes, renvois, notes de bas de page et notes de fin dans Obsidian. L’affichage seul ne modifie pas Markdown. L’écriture des numéros dans un fichier est une opération distincte.

## Démarrage rapide

1. Dans **Paramètres → Number Suite → Numérotation des titres**, activez **« Afficher les numéros virtuels »**.
2. Ouvrez l’aperçu en direct ou le mode Lecture. Les numéros apparaissent près des titres, sans modifier le texte enregistré.
3. Pour inscrire les numéros dans Markdown, ouvrez l’onglet de la note actuelle dans la barre latérale de Number Suite. Choisissez l’écriture ou la renumérotation, vérifiez l’aperçu, puis confirmez.

## Légendes et renvois

Au-dessus d’une image, d’un tableau, d’une formule isolée ou d’un bloc de code, ajoutez une ligne commençant par `Figure:`, `Table:`, `Equation:` ou `Code:`. Ces mots-clés restent en anglais. Les légendes peuvent afficher un numéro. Les renvois au sein de la même note utilisent `@[[#Titre]]` ; les liens ordinaires `[[#...]]` restent inchangés. Les notes de bas de page `[^id]` et les notes de fin `[^endnote:id]` sont numérotées séparément.

```markdown
Figure: Architecture

![[architecture.png]]
```

## Styles et sécurité des fichiers

Plusieurs styles sont proposés : hiérarchique, exemples administratifs et juridiques chinois, ainsi que des formes traditionnelles chinoises, japonaises, coréennes et arabo-indiennes. Changer la langue ne change pas automatiquement le style. Sélectionner un style ne modifie pas Markdown. L’écriture, la suppression ou la renumérotation des titres, la création de légendes ou d’identifiants de renvoi peuvent modifier un fichier. Vérifiez l’aperçu et sauvegardez vos notes : les liens vers les titres peuvent être affectés. Les niveaux de titre 7 à 9 sont une extension.

## Installation et documentation

Obsidian 1.12.7 ou plus récent est nécessaire sur ordinateur ou Android ; iOS n’a pas encore été vérifié. Installez Number Suite depuis les extensions communautaires, ou copiez `main.js`, `manifest.json` et `styles.css` d’une même version dans `.obsidian/plugins/number-suite/`. Tout fonctionne localement, sans télémétrie. Les règles détaillées sont dans le [guide complet en anglais](../../README.md).

[Issues](https://github.com/ZHYX91/obsidian-number-suite/issues)
