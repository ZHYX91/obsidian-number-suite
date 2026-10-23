# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite affiche des numéros pour les titres, légendes, renvois, notes de bas de page et notes de fin dans Obsidian. L’affichage seul ne modifie pas Markdown. L’écriture des numéros dans un fichier est une opération distincte.

Ceci est un **guide abrégé** pour les tâches courantes. Les détails sur H7–H9, les liens entre légendes et objets, les références stables ainsi que les notes de bas de page et de fin figurent dans les guides approfondis en [anglais](../advanced.en.md) ou en [chinois simplifié](../advanced.zh-CN.md).

<!-- section: installation -->
## Installation

Obsidian 1.12.7 ou plus récent est requis, sur ordinateur ou Android. Le fonctionnement sous iOS n’est pas encore vérifié.

1. Dans Paramètres → Modules complémentaires → Parcourir, recherchez Number Suite, installez-le et activez-le.
2. Pour une installation manuelle, téléchargez le ZIP de la version depuis [GitHub Releases](https://github.com/ZHYX91/obsidian-number-suite/releases), puis placez le dossier extrait `number-suite` dans `.obsidian/plugins/`. Vous pouvez aussi placer `main.js`, `manifest.json` et `styles.css` de la même version dans `.obsidian/plugins/number-suite/`.
3. Rechargez Obsidian et activez le module. Ne mélangez pas les fichiers de versions différentes.

<!-- section: quick-start -->
## Démarrage rapide

1. Dans **Paramètres → Number Suite → Numérotation des titres**, activez **« Afficher les numéros virtuels »**.
2. Ouvrez l’aperçu en direct ou le mode Lecture. Les numéros apparaissent près des titres, sans modifier le texte enregistré.
3. Pour inscrire les numéros dans Markdown, ouvrez l’onglet de la note actuelle dans la barre latérale de Number Suite. Choisissez l’écriture ou la renumérotation, vérifiez l’aperçu, puis confirmez.

<!-- section: captions -->
## Légendes et renvois

Au-dessus d’une image, d’un tableau, d’une formule isolée ou d’un bloc de code, ajoutez une ligne commençant par `Figure:`, `Table:`, `Equation:` ou `Code:`. Ces mots-clés restent en anglais. Les légendes peuvent afficher un numéro. Les renvois au sein de la même note utilisent `@[[#Titre]]` ; les liens ordinaires `[[#...]]` restent inchangés. Les notes de bas de page `[^id]` et les notes de fin `[^endnote:id]` sont numérotées séparément.

```markdown
Figure: Architecture

![[architecture.png]]
```

Déplacer une légende ou corriger la casse de son mot-clé conserve ses identifiants de bloc, sur la même ligne ou sur les lignes suivantes. Les références de bloc existantes restent rattachées à cette légende.

<!-- section: numbering -->
## Styles et sécurité des fichiers

Plusieurs styles sont proposés : hiérarchique, exemples administratifs et juridiques chinois, ainsi que des formes traditionnelles chinoises, japonaises, coréennes et arabo-indiennes. Changer la langue ne change pas automatiquement le style. Sélectionner un style ne modifie pas Markdown. L’écriture, la suppression ou la renumérotation des titres, la création de légendes ou d’identifiants de renvoi peuvent modifier un fichier. Vérifiez l’aperçu et sauvegardez vos notes : les liens vers les titres peuvent être affectés. Les niveaux de titre 7 à 9 sont une extension.

<!-- section: settings -->
## Où régler les options

Les paramètres globaux regroupent Général, titres, légendes, renvois, notes de bas de page et de fin, opérations sur les fichiers et vues. La langue et le style de numérotation se choisissent séparément. Dans la barre latérale droite, « Note actuelle » permet de modifier une seule note. Revenir au réglage global supprime uniquement cette exception et conserve les autres Properties. Le plan du document et la carte mentale des titres, en lecture seule, permettent de rejoindre le texte source.

<!-- section: limitations -->
## Portée et limites

- Un fichier Markdown utilise un seul style de numérotation. Les légendes et les renvois restent également limités au même fichier.
- Les titres et légendes placés dans les listes, citations, exemples de code, blocs HTML ou frontmatter ne sont pas numérotés. Les notes et renvois dans le texte ordinaire des listes restent utilisables.
- Pour Structural Tables, l’action de légende exige de vérifier le fichier, le texte source et sa plage. Un élément désactivé explique les cas d’ancienne version ou de tableau non pris en charge. Ajoutez ou modifiez alors la légende en mode source.
- H7–H9 sont une extension de Number Suite et DocWen. Le plan et les liens de titres natifs d’Obsidian peuvent ne pas les reconnaître ; un identifiant de bloc fournit une cible stable.

<!-- section: privacy-and-support -->
## Confidentialité et aide

Le module fonctionne localement, sans réseau ni télémétrie. L’affichage seul ne modifie pas les notes. Vérifiez l’aperçu avant d’écrire, supprimer ou recalculer les numéros. Modifier le texte d’un titre peut affecter les liens existants. Pour signaler un problème, indiquez les versions, les étapes et un petit exemple Markdown sans contenu privé.

[Guide complet en anglais](../../README.md) · [Signaler un problème](https://github.com/ZHYX91/obsidian-number-suite/issues/new/choose) · [Licence MIT](../../LICENSE)
