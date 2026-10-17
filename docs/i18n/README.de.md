# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite zeigt Nummern für Überschriften, Beschriftungen, Verweise, Fußnoten und Endnoten in Obsidian an. Für die Anzeige muss die Markdown-Datei nicht geändert werden. Nummern in den Text zu schreiben ist ein eigener Schritt.

## Schnellstart

1. Aktiviere unter **Einstellungen → Number Suite → Überschriftennummerierung** die virtuellen Nummern (`Show virtual numbers`).
2. Öffne die Live-Vorschau oder Leseansicht. Die Nummern erscheinen neben den Überschriften, der gespeicherte Text bleibt unverändert.
3. Sollen die Nummern in Markdown stehen, öffne rechts die aktuelle Notiz in Number Suite. Wähle Schreiben oder Neu nummerieren und prüfe die Vorschau vor dem Bestätigen.

## Beschriftungen und Verweise

Schreibe über einem Bild, einer Tabelle, einer eigenen Formel oder einem Codeblock eine Zeile mit `Figure:`, `Table:`, `Equation:` oder `Code:`. Diese Schlüsselwörter bleiben auf Englisch. Beschriftungen können Nummern anzeigen. Mit `@[[#Überschrift]]` erhältst du einen Verweis innerhalb derselben Notiz; normale `[[#...]]`-Links bleiben wie sie sind. Fußnoten `[^id]` und Endnoten `[^endnote:id]` werden getrennt gezählt.

```markdown
Figure: Architecture

![[architecture.png]]
```

## Nummerierungsstile und Dateischutz

Es gibt hierarchische Stile sowie Beispiele für chinesische Amts- und Rechtstexte und traditionelle chinesische, japanische, koreanische und arabisch-indische Nummern. Ein Wechsel der Oberflächensprache wählt keinen anderen Stil. Die Auswahl eines Stils schreibt nichts in Markdown. Schreiben, Entfernen und Neuvergeben von Nummern sowie neue Beschriftungen oder Referenz-IDs können Dateien ändern. Prüfe die Vorschau und sichere wichtige Notizen; veränderte Überschriften können bestehende Links ungültig machen. Die Überschriftenebenen 7–9 sind eine Erweiterung.

## Installation und weitere Hilfe

Benötigt wird Obsidian 1.12.7 oder neuer auf Desktop oder Android; iOS ist noch nicht geprüft. Installiere Number Suite aus dem Community-Verzeichnis oder kopiere `main.js`, `manifest.json` und `styles.css` aus derselben GitHub-Version nach `.obsidian/plugins/number-suite/`. Das Plugin arbeitet lokal und nutzt keine Telemetrie. Weitere Regeln stehen im [ausführlichen englischen Handbuch](../../README.md).

[Issues](https://github.com/ZHYX91/obsidian-number-suite/issues)
