# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite affiche des numéros pour les titres, légendes, renvois, notes de bas de page et notes de fin dans Obsidian. L’affichage seul ne modifie pas Markdown. L’écriture des numéros dans un fichier est une opération distincte.

Ceci est un **guide abrégé** pour les tâches courantes. Les détails sur H7–H9, les liens entre légendes et objets, les références stables ainsi que les notes de bas de page et de fin figurent dans les guides approfondis en [anglais](../advanced.md) ou en [chinois simplifié](../advanced.zh-CN.md).

<!-- section: installation -->
## Installation

Obsidian 1.12.7 ou plus récent est requis, sur ordinateur ou Android. Le fonctionnement sous iOS n’est pas encore vérifié.

1. Dans Paramètres → Modules complémentaires → Parcourir, recherchez Number Suite, installez-le et activez-le.
2. Pour une installation manuelle, téléchargez le ZIP de la version depuis [GitHub Releases](https://github.com/ZHYX91/obsidian-number-suite/releases), puis placez le dossier extrait `number-suite` dans `.obsidian/plugins/`. Vous pouvez aussi placer `main.js`, `manifest.json` et `styles.css` de la même version dans `.obsidian/plugins/number-suite/`.
3. Rechargez Obsidian et activez le module. Ne mélangez pas les fichiers de versions différentes.

**Mise à jour manuelle :** Dans le dossier existant du module, remplacez uniquement `main.js`, `manifest.json` et `styles.css` par les fichiers d’une même version. Conservez `data.json` pour garder vos réglages. Conservez aussi les fichiers `recovery.json` et `recovery.pending.json`, s’ils existent : ils contiennent les données d’annulation et de restauration des traitements par lot. Ne les écrasez pas et ne les supprimez pas lors de la mise à jour.

<!-- section: quick-start -->
## Démarrage rapide

1. Dans **Paramètres → Number Suite → Numérotation des titres**, activez **« Afficher les numéros virtuels »**.
2. Ouvrez l’aperçu en direct ou le mode Lecture. Les numéros apparaissent près des titres, sans modifier le texte enregistré.
3. Pour enregistrer les numéros dans Markdown, ouvrez **Note actuelle → Modifier le texte**. Choisissez l’écriture ou la renumérotation, vérifiez l’aperçu et confirmez.

Les choix propres à une note sont enregistrés dans ses Properties ; l’affichage lui-même ne réécrit pas les titres. L’aperçu regroupe les changements et avertissements par fichier, avec leurs nombres. Dépliez un fichier et chargez la suite pour tout examiner. Désactiver le module arrête les nouvelles écritures de traitement par lot et d’annulation ; une écriture déjà lancée peut se terminer. Si le retour en arrière ne peut pas être effectué sans écraser une modification, conservez `recovery.json` dans le dossier du module et vérifiez les notes.

La note active affiche de façon compacte le nom, le statut automatique et trois choix principaux ; les enregistrements en cours et les erreurs restent visibles. Les opérations sur une seule note passent à une page d’aperçu dans la barre latérale, avec une cible fixe et Retour/Annuler/Appliquer. Changer de note ne change pas la cible ; une modification de la source impose un nouvel aperçu. Les lots conservent une boîte de dialogue large. Le mode de structure affiche son nom, les boutons de déplacement, la cible surlignée et les lignes d’insertion avant/après, avec une raison concise si la cible ou la source est indisponible.

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

Les réglages du traitement par lot se trouvent dans **Écriture et nettoyage**, ceux des liens dans **Liens et références** et l’apparence des numéros dans **Affichage et apparence**.

Les réglages comportent sept onglets. Dans Général, l’amélioration du plan natif est activée par défaut. La désactiver conserve les préférences et n’active jamais le module principal. Le menu d’affichage du plan mémorise quatre choix communs : numéros, niveaux sans numéro, H7–H9 et légendes. Ils concernent uniquement le plan. Le numéro calculé a un fond coloré et le numéro écrit dans le titre, un contour. Les deux peuvent apparaître ensemble. En leur absence, vous pouvez afficher le niveau (Hn). Note actuelle hérite ou remplace séparément les numéros virtuels, l’affichage des numéros enregistrés et le style, avec un état automatique. Les règles de départ et d’exclusion sont repliées et ajoutées selon les besoins. Désactiver conserve les choix ; écriture et nettoyage exigent toujours un aperçu. Les feuilles de la carte n’affichent pas 0. Disposition et profondeur sont dans un menu secondaire ; les boutons de déplacement et cibles apparaissent seulement en mode structure.

Le plan natif et Note actuelle ouvrent la carte pour leur propre fichier. « Ajuster la structure » déplace des sections entières de même parent et niveau par glisser-déposer ou boutons haut/bas, avec rejet du texte modifié et Annuler/Rétablir. Un clic sur un renvoi explicite navigue ; F2 ou l’action mobile permet de modifier sa source. La numérotation des liens Wiki vers un titre du même fichier reste désactivée par défaut ; elle fonctionne en aperçu et lecture, aussi avec un nom de fichier, sans modifier alias et actions natives.

<!-- section: limitations -->
## Portée et limites

- Un fichier Markdown utilise un seul style de numérotation. Les légendes et les renvois restent également limités au même fichier.
- Les titres et légendes placés dans les listes, citations, exemples de code, blocs HTML ou frontmatter ne sont pas numérotés. Les notes et renvois dans le texte ordinaire des listes restent utilisables.
- Pour Structural Tables, l’action de légende exige de vérifier le fichier, le texte source et sa plage. Un élément désactivé explique les cas d’ancienne version ou de tableau non pris en charge. Ajoutez ou modifiez alors la légende en mode source.

<!-- section: privacy-and-support -->
## Confidentialité et aide

Le module fonctionne localement, sans réseau ni télémétrie. L’affichage seul ne modifie pas les notes. Vérifiez l’aperçu avant d’écrire, supprimer ou recalculer les numéros. Modifier le texte d’un titre peut affecter les liens existants. Pour signaler un problème, indiquez les versions, les étapes et un petit exemple Markdown sans contenu privé.

[Guide complet en anglais](../../README.md) · [Signaler un problème](https://github.com/ZHYX91/obsidian-number-suite/issues/new/choose) · [Licence MIT](../../LICENSE)
