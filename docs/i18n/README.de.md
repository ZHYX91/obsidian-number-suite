# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite zeigt Nummern für Überschriften, Beschriftungen, Verweise, Fußnoten und Endnoten in Obsidian an. Für die Anzeige muss die Markdown-Datei nicht geändert werden. Nummern in den Text zu schreiben ist ein eigener Schritt.

Dies ist eine **Kurzanleitung** für die üblichen Aufgaben. Details zu H7–H9, zur Zuordnung von Beschriftungen, stabilen Verweisen sowie Fuß- und Endnoten stehen im [englischen](../advanced.md) oder [chinesischen Vertiefungsleitfaden](../advanced.zh-CN.md).

<!-- section: installation -->
## Installation

Benötigt wird Obsidian 1.12.7 oder neuer auf Desktop oder Android. Das Verhalten unter iOS ist noch nicht geprüft.

1. Suche unter Einstellungen → Community-Erweiterungen → Durchsuchen nach Number Suite, installiere und aktiviere es.
2. Für die manuelle Installation lade das Versions-ZIP von [GitHub Releases](https://github.com/ZHYX91/obsidian-number-suite/releases) herunter. Lege den entpackten Ordner `number-suite` unter `.obsidian/plugins/` ab. Alternativ kommen `main.js`, `manifest.json` und `styles.css` aus demselben Release nach `.obsidian/plugins/number-suite/`.
3. Lade Obsidian neu und aktiviere das Plugin. Mische keine Dateien verschiedener Versionen.

**Manuelles Update:** Ersetzen Sie im vorhandenen Plugin-Ordner nur `main.js`, `manifest.json` und `styles.css` durch Dateien derselben Version. Behalten Sie `data.json`, damit Ihre Einstellungen erhalten bleiben. Behalten Sie auch vorhandene Dateien namens `recovery.json` und `recovery.pending.json`: Sie enthalten Daten zum Rückgängigmachen und Wiederherstellen von Stapelaktionen. Überschreiben oder löschen Sie sie beim Update nicht.

<!-- section: quick-start -->
## Schnellstart

1. Aktiviere unter **Einstellungen → Number Suite → Überschriftennummerierung** die Option **„Virtuelle Nummern anzeigen“**.
2. Öffne die Live-Vorschau oder Leseansicht. Die Nummern erscheinen neben den Überschriften, der gespeicherte Text bleibt unverändert.
3. Um Nummern in Markdown zu speichern, öffne **Aktuelle Notiz → Notiztext bearbeiten**. Wähle Schreiben oder Neunummerieren, prüfe die Vorschau und bestätige die Änderungen.

Notizbezogene Anzeigeoptionen werden in den Properties gespeichert; die Anzeige selbst schreibt keine Überschrift um. Die Vorschau gruppiert Änderungen und Warnungen pro Datei mit eigenen Zählern. Klappe eine Datei auf und lade bei Bedarf weitere Ergebnisse. Beim Deaktivieren enden neue Schreibvorgänge von Stapelaktionen und Rückgängig; bereits gestartete können noch abschließen. Ist ein sicheres Zurücksetzen nicht möglich, behalte `recovery.json` im Plugin-Ordner und prüfe zuerst die Notizen.

Aktuelle Notiz zeigt Dateiname, automatischen Status und drei Hauptoptionen kompakt; nur laufendes Speichern und Fehler brauchen eine Statuszeile. Schreiben, Neu nummerieren sowie Nummern- und Markerentfernung einer Notiz wechseln zur Vorschauseite in der Seitenleiste mit festem Ziel und Zurück/Abbrechen/Anwenden. Ein Notizwechsel ändert das Ziel nicht; nach Quelltextänderungen ist eine neue Vorschau nötig. Stapel bleiben in breiten Dialogen. Der Strukturmodus zeigt seinen Namen, Verschiebeschaltflächen, hervorgehobene Ziele und Einfügelinien davor/danach sowie kurze Gründe für ungültige Ziele oder nicht verfügbare Quellen.

<!-- section: captions -->
## Beschriftungen und Verweise

Schreibe über einem Bild, einer Tabelle, einer eigenen Formel oder einem Codeblock eine Zeile mit `Figure:`, `Table:`, `Equation:` oder `Code:`. Diese Schlüsselwörter bleiben auf Englisch. Beschriftungen können Nummern anzeigen. Mit `@[[#Überschrift]]` erhältst du einen Verweis innerhalb derselben Notiz. Gehört eine Block-ID zu einer Überschrift oder Beschriftung, kannst du mit `@[[#^block-id]]` darauf verweisen. Links zu normalen Absatzblöcken behandelt Obsidian wie gewohnt. Fußnoten `[^id]` und Endnoten `[^endnote:id]` werden getrennt gezählt.

Beschriftungen zählen standardmäßig in der gesamten Notiz. Unter **Beschriftungen** kannst du die Zählung an einer Überschriftenebene neu beginnen lassen, etwa mit **Figure 1.2-1**.

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

Stapelverarbeitung findest du unter **Schreiben und Bereinigen**, Links unter **Links und Verweise** und das Aussehen der Nummern unter **Anzeige und Darstellung**.


Die Einstellungen haben sieben Tabs. Unter Allgemein ist die Erweiterung der nativen Gliederung standardmäßig aktiv. Ausschalten behält die Vorlieben und aktiviert niemals das Kernplugin. Das Anzeigemenü der Gliederung speichert vier gemeinsame Optionen: Nummern, Ebenen ohne Nummer, H7–H9 und Beschriftungen. Sie wirken nur auf die Gliederung. Eine gefüllte Markierung zeigt die berechnete Nummer, eine umrandete die sichtbare Nummer aus dem Text. Beide können zusammen erscheinen. Fehlt eine Nummer, lässt sich die Ebene (Hn) anzeigen. Aktuelle Notiz erbt oder überschreibt virtuelle Nummern, gespeicherte Nummernanzeige und Schema einzeln und zeigt den Status. Start- und Überspringregeln bleiben eingeklappt und werden nach Bedarf ergänzt. Deaktivieren behält die Auswahl; Schreiben und Bereinigen erfordern weiter eine Vorschau. Blätter der Mindmap zeigen keine 0. Layout und Tiefe liegen im Nebenmenü; Verschiebeschaltflächen und Einfügeziele erscheinen nur im Strukturmodus.

Die native Gliederung und „Aktuelle Notiz“ öffnen die Mindmap für ihre eigene Datei. „Struktur anpassen“ erlaubt ganze Abschnitte nur unter demselben Elternknoten und auf derselben Ebene zu verschieben, per Ziehen oder Auf/Ab. Veralteter Quelltext wird abgelehnt; Rückgängig/Wiederholen bleibt verfügbar. Explizite Verweise springen mit einem Klick; F2 oder die mobile Quelltextaktion dient zum Bearbeiten. Nummern für gewöhnliche Wiki-Überschriftenlinks derselben Datei sind standardmäßig aus und optional in Live-Vorschau und Leseansicht verfügbar, auch mit Dateinamen; Aliase und native Aktionen bleiben erhalten.

Bei einer Nummerierung ab H2 mit Startnummer 4 überspringt `heading.skip-first.h2=1` den ersten nicht leeren H2-Abschnitt der Notiz. `heading.skip-per-parent.h2=1` überspringt den ersten H2-Abschnitt unter jeder H1-Überschrift. Treffen beide Regeln zu, wird der Abschnitt mit seinen Unterüberschriften einmal übersprungen. Der nächste H2-Abschnitt unter der ersten H1 erhält `4`, seine erste H3 `4.1`. Für H1 gilt nur die notizweite Regel. **Regel entfernen** löscht alle Einstellungen dieser Ebene.

Beide Regeln zählen in der ursprünglichen Reihenfolge, auch innerhalb übersprungener Abschnitte. Fehlt die unmittelbare Elternebene, zählt die nächsthöhere vorhandene Überschrift als übergeordnet. Ohne sie beginnt die Gruppe auf der obersten Ebene der Notiz.

<!-- section: limitations -->
## Umfang und Grenzen

- Pro Markdown-Datei gilt ein Nummerierungsstil. Auch Beschriftungen und Querverweise werden innerhalb einer Datei ausgewertet.
- Überschriften und Beschriftungen in Listen, Zitaten, Codebeispielen, HTML-Blöcken und Frontmatter werden nicht mitgezählt. Fußnoten und Querverweise im normalen Listentext bleiben nutzbar.
- Bei Structural Tables erscheint die Beschriftungsaktion nur, wenn Datei, Quelltext und Bereich eindeutig geprüft werden können. Bei älteren Versionen oder nicht unterstützten Tabellen erklärt ein deaktivierter Eintrag den Grund. Bearbeite die Beschriftung dann im Quellmodus.

<!-- section: privacy-and-support -->
## Datenschutz und Hilfe

Das Plugin arbeitet lokal, ohne Netzwerkzugriff oder Telemetrie. Die reine Anzeige verändert keine Notiz. Prüfe vor Schreiben, Entfernen oder Neuvergeben von Nummern die Vorschau. Geänderter Überschriftentext kann bestehende Links beeinflussen. Gib bei Fehlerberichten Versionen, Schritte und ein kleines Markdown-Beispiel ohne private Inhalte an.

[Ausführliche englische Anleitung](../../README.md) · [Problem melden](https://github.com/ZHYX91/obsidian-number-suite/issues/new/choose) · [MIT-Lizenz](../../LICENSE)
