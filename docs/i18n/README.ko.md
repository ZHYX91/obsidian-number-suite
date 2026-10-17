# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite는 Obsidian의 제목, 캡션, 참조, 각주와 미주에 번호를 표시하는 플러그인입니다. 번호를 화면에만 표시하면 Markdown 원본은 변경되지 않습니다. 파일에 번호를 쓰는 작업은 별도로 실행합니다.

## 시작하기

1. **설정 → Number Suite → 제목 번호**에서 가상 번호 표시(`Show virtual numbers`)를 켭니다.
2. 라이브 미리 보기 또는 읽기 화면을 엽니다. 제목 옆에 번호가 나타나지만 노트 내용은 그대로입니다.
3. 번호를 파일에 저장하려면 오른쪽 Number Suite 패널에서 현재 노트를 선택한 다음 번호 쓰기 또는 다시 매기기를 실행하세요. 미리 보기를 확인한 뒤 적용합니다.

## 캡션과 참조

이미지, 표, 독립 수식 또는 코드 블록 위에 `Figure:`, `Table:`, `Equation:`, `Code:` 중 하나로 시작하는 캡션 줄을 추가하세요. 이 키워드는 영어 그대로 써야 합니다. 캡션 번호는 화면에만 표시할 수도 있습니다. 같은 노트 안의 참조는 `@[[#제목]]`을 사용합니다. 일반 `[[#제목]]` 링크는 변경되지 않습니다. 각주 `[^id]`와 미주 `[^endnote:id]`는 따로 번호를 매깁니다.

```markdown
Figure: Architecture

![[architecture.png]]
```

## 번호 형식과 파일 보호

기본 계층 번호와 중국 공문서·법률 문서 형식, 번체 중국어·일본어·한국어·아라비아-인도 숫자 형식 예시를 제공합니다. 인터페이스 언어를 바꿔도 번호 형식이 자동으로 바뀌지 않습니다. 형식을 선택하는 것만으로 파일이 수정되지는 않습니다. 번호 쓰기·삭제·다시 매기기나 캡션, 참조 ID 만들기는 Markdown을 변경할 수 있습니다. 제목 링크가 끊어질 수 있으니 미리 보기를 확인하고 백업하세요. 7~9단계 제목은 확장 문법입니다.

## 설치와 자세한 안내

Obsidian 1.12.7 이상의 데스크톱 및 Android에서 사용할 수 있습니다. iOS는 아직 검증하지 않았습니다. 커뮤니티 플러그인에서 설치하거나 동일한 GitHub Release의 `main.js`, `manifest.json`, `styles.css`를 `.obsidian/plugins/number-suite/`에 넣으세요. 사용 기록을 수집하지 않습니다. 템플릿 문법과 제한 사항은 [영문 상세 설명](../../README.md)을 참고하세요.

[Issues](https://github.com/ZHYX91/obsidian-number-suite/issues)
