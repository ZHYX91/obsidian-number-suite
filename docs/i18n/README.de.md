# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite zeigt Nummern für Überschriften, Beschriftungen, Verweise, Fußnoten und Endnoten in Obsidian an. Für die Anzeige muss die Markdown-Datei nicht geändert werden. Nummern in den Text zu schreiben ist ein eigener Schritt.

Dies ist eine **Kurzanleitung** für die üblichen Aufgaben. Details zu H7–H9, zur Zuordnung von Beschriftungen, stabilen Verweisen sowie Fuß- und Endnoten stehen im [englischen](../advanced.en.md) oder [chinesischen Vertiefungsleitfaden](../advanced.zh-CN.md).

<!-- section: installation -->
## Installation

Benötigt wird Obsidian 1.12.7 oder neuer auf Desktop oder Android. Das Verhalten unter iOS ist noch nicht geprüft.

1. Suche unter Einstellungen → Community-Erweiterungen → Durchsuchen nach Number Suite, installiere und aktiviere es.
2. Für die manuelle Installation lade das Versions-ZIP von [GitHub Releases](https://github.com/ZHYX91/obsidian-number-suite/releases) herunter. Lege den entpackten Ordner `number-suite` unter `.obsidian/plugins/` ab. Alternativ kommen `main.js`, `manifest.json` und `styles.css` aus demselben Release nach `.obsidian/plugins/number-suite/`.
3. Lade Obsidian neu und aktiviere das Plugin. Mische keine Dateien verschiedener Versionen.

<!-- section: quick-start -->
## Schnellstart

1. Aktiviere unter **Einstellungen → Number Suite → Überschriftennummerierung** die Option **„Virtuelle Nummern anzeigen“**.
2. Öffne die Live-Vorschau oder Leseansicht. Die Nummern erscheinen neben den Überschriften, der gespeicherte Text bleibt unverändert.
3. Sollen die Nummern in Markdown stehen, öffne rechts die aktuelle Notiz in Number Suite. Wähle Schreiben oder Neu nummerieren und prüfe die Vorschau vor dem Bestätigen.

Die Anleitung in „Aktuelle Notiz“ vergleicht Quelltext, Ziel und passende Aktion. Notizbezogene Anzeigeoptionen werden in den Properties gespeichert; die Anzeige selbst schreibt keine Überschrift um. Die Vorschau gruppiert Änderungen und Warnungen pro Datei mit eigenen Zählern. Klappe eine Datei auf und lade bei Bedarf weitere Ergebnisse. Beim Deaktivieren enden neue Schreibvorgänge von Stapelaktionen und Rückgängig; bereits gestartete können noch abschließen. Ist ein sicheres Zurücksetzen nicht möglich, behalte `recovery.json` im Plugin-Ordner und prüfe zuerst die Notizen.

<!-- section: captions -->
## Beschriftungen und Verweise

Schreibe über einem Bild, einer Tabelle, einer eigenen Formel oder einem Codeblock eine Zeile mit `Figure:`, `Table:`, `Equation:` oder `Code:`. Diese Schlüsselwörter bleiben auf Englisch. Beschriftungen können Nummern anzeigen. Mit `@[[#Überschrift]]` erhältst du einen Verweis innerhalb derselben Notiz; normale `[[#...]]`-Links bleiben wie sie sind. Fußnoten `[^id]` und Endnoten `[^endnote:id]` werden getrennt gezählt.

```markdown
Figure: Architecture

![[architecture.png]]
```

Beim Verschieben einer Beschriftung oder Korrigieren ihrer Großschreibung bleiben vorhandene Block-IDs in derselben Zeile oder in Folgezeilen bei der Beschriftung. Bestehende Blockverweise zeigen weiter auf sie.

<!-- section: numbering -->
## Nummerierungsstile und Dateischutz

Es gibt hierarchische Stile sowie Beispiele für chinesische Amts- und Rechtstexte und traditionelle chinesische, japanische, koreanische und arabisch-indische Nummern. Ein Wechsel der Oberflächensprache wählt keinen anderen Stil. Die Auswahl eines Stils schreibt nichts in Markdown. Schreiben, Entfernen und Neuvergeben von Nummern sowie neue Beschriftungen oder Referenz-IDs können Dateien ändern. Prüfe die Vorschau und sichere wichtige Notizen; veränderte Überschriften können bestehende Links ungültig machen. Die Überschriftenebenen 7–9 sind eine Erweiterung.

<!-- section: settings -->
## Einstellungen finden

Die sieben globalen Einstellungsbereiche heißen: Allgemein, Überschriftennummerierung, Beschriftungen, Querverweise, Fuß- und Endnoten, Schreiben und Bereinigen, Anzeige und Stapel. Sprache und Nummerierungsstil werden getrennt gewählt. In „Aktuelle Notiz“ in der rechten Seitenleiste kannst du einzelne Werte überschreiben. „Globaler Einstellung folgen“ entfernt nur diese Ausnahme und lässt andere Properties unverändert. Dokumentgliederung und schreibgeschützte Überschriften-Mindmap führen direkt zur ursprünglichen Zeile.

<!-- section: limitations -->
## Umfang und Grenzen

- Pro Markdown-Datei gilt ein Nummerierungsstil. Auch Beschriftungen und Querverweise werden innerhalb einer Datei ausgewertet.
- Überschriften und Beschriftungen in Listen, Zitaten, Codebeispielen, HTML-Blöcken und Frontmatter werden nicht mitgezählt. Fußnoten und Querverweise im normalen Listentext bleiben nutzbar.
- Bei Structural Tables erscheint die Beschriftungsaktion nur, wenn Datei, Quelltext und Bereich eindeutig geprüft werden können. Bei älteren Versionen oder nicht unterstützten Tabellen erklärt ein deaktivierter Eintrag den Grund. Bearbeite die Beschriftung dann im Quellmodus.
- H7–H9 sind eine Erweiterung von Number Suite und DocWen. Obsidian erkennt sie eventuell nicht in seiner eigenen Gliederung oder in Überschriftenlinks; Block-IDs bieten ein stabiles Verweisziel.

<!-- section: privacy-and-support -->
## Datenschutz und Hilfe

Das Plugin arbeitet lokal, ohne Netzwerkzugriff oder Telemetrie. Die reine Anzeige verändert keine Notiz. Prüfe vor Schreiben, Entfernen oder Neuvergeben von Nummern die Vorschau. Geänderter Überschriftentext kann bestehende Links beeinflussen. Gib bei Fehlerberichten Versionen, Schritte und ein kleines Markdown-Beispiel ohne private Inhalte an.

[Ausführliche englische Anleitung](../../README.md) · [Problem melden](https://github.com/ZHYX91/obsidian-number-suite/issues/new/choose) · [MIT-Lizenz](../../LICENSE)
