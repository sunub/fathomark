# Notion: 조사·사고·글쓰기 지원

## 자료 조사와 출처 관리를 어떻게 지원하는가?

### Takeaway
Notion의 확인된 강점은 검색 도구 수보다 자료 범위 선택, 여러 업무 자료의 연결, 원문으로 돌아갈 수 있는 출처 표시다. 현재 공식 Research Mode URL은 Agent 도움말로 이동하므로 독립 Research Mode가 계속 제공된다고 단정하지 않는다.

### Cited Findings
- Enterprise Search는 Notion 및 연결된 Slack·Google Drive·Jira 등을 검색하고, 내부 또는 연결 앱 자료로 답할 때 출처를 표시한다. 웹 검색/업무 자료를 각각 끄거나 특정 소스·페이지·팀스페이스로 좁힐 수 있다. Business·Enterprise에서 제공한다. — [Enterprise Search](https://www.notion.com/help/enterprise-search)
- Agent는 현재 페이지 또는 선택한 블록을 기본 문맥으로 사용하며, 추가 페이지·사람·파일·소스를 지정할 수 있다. 다단계 작업, PDF·CSV 등의 분석, 페이지 작성·편집을 지원한다. — [Notion Agent](https://www.notion.com/help/notion-agent)
- 공식 예시는 여러 자료를 대조해 절차 문서를 만들고, 담당자 확인이 필요한 부분을 표시하도록 요청한다. 이는 제품 활용 예시이며 자동 사실 검증의 보장은 아니다. — [Notion Agent](https://www.notion.com/help/notion-agent)
- 2026-10-11 실제 열람에서 `/help/research-mode` 및 Research Mode 가이드는 `/help/notion-agent`로 리디렉션됐다. 검색 캐시에 남은 과거의 다중 검색·5분 실행 설명을 현재 실행 규칙으로 사용하지 않는다. — [Research Mode 원래 URL](https://www.notion.com/help/research-mode), [기존 가이드 URL](https://www.notion.com/help/guides/power-your-deep-work-using-research-mode-in-notion)

### Inferences
- Fathomark 제안: `search_web`/`read_web` 외에 출처 범위 선택과 `save_evidence`가 유용하다. 경험의 사실·외부 기업 정보·문체 예시를 별도 종류로 저장하고 원문/날짜/구절을 보존한다. 이는 우리 설계 이름이며 Notion 내부 도구명이 아니다.
- 조사 계획은 검색할 질문과 미해결 사항을 담는 상태로 관리할 수 있다. 사고 자체를 도구로 포장하기보다 관측 가능한 근거표·비교표·개요를 산출하는 기능을 둔다.

### Gaps
- Notion 내부 도구 스키마, 검색 횟수, 반복 종료 기준, 자동 근거 검증 방식은 공개 도움말로 확인되지 않는다.

## 작성·수정·개인 문체를 어떻게 지원하는가?

### Takeaway
Notion은 생성뿐 아니라 선택 영역 수정과 반복 가능한 작성 지침을 제공한다. 글쓰기 기능마다 별도 외부 도구를 만들기보다 작업 지침과 재사용 가능한 절차를 분리하는 사례다.

### Cited Findings
- 선택한 텍스트에 `Edit with AI`로 문법·길이·톤 수정을 요청하고 수락·폐기·재시도할 수 있다. 새 문장 생성, 핵심 요약·공통 주제 추출, 독자·형식·길이를 명시하는 작업도 안내한다. — [작성 가이드](https://www.notion.com/help/guides/notion-ai-for-docs)
- 스타일 가이드 또는 잘 쓴 문서를 지정해 문체를 맞추고, 흩어진 자료에서 개요를 작성하거나 템플릿을 재사용하는 사례를 공개한다. — [Notion AI 활용 가이드](https://www.notion.com/en-gb/help/guides/everything-you-can-do-with-notion-ai)
- Instructions는 톤·형식·기본 규칙을 매 대화에 적용하는 지속 지침이며 한 번에 하나만 활성화된다. Skills는 특정 작업에 대한 요청 시 사용하는 지침이다. — [Instructions](https://www.notion.com/help/instructions-for-notion-agent)
- Skills는 페이지로 관리하는 반복 절차이며 Improve Writing·Proofread·Explain·Reformat이 기본 사례다. 선택 영역에 적용하거나 적합한 작업에서 Agent가 자동 선택한다. 사용자가 자동 선택을 끌 수 있고 설명이 선택 기준이다. — [Skills](https://www.notion.com/help/create-and-manage-skills)

### Inferences
- Fathomark 제안: `load_writing_profile`로 사실 없는 문체 규칙을 읽고 `save_outline`로 주장·근거 연결 개요를 저장한다. 초안/재작성/비평은 재사용 가능한 모델 작업으로 묶고, `validate_draft`는 출처·길이·금지된 사실 추가를 실제 검사하는 기능으로 둔다.
- 특정 문단 수정에는 전체 초안 덮어쓰기 대신 대상 문단과 변경안을 반환하는 미리보기가 적합하다.

### Gaps
- 이 자료는 기능 설명·사용 예시다. 글쓰기 정확도나 채용 성과가 객관적으로 개선됐다는 측정 근거는 확인하지 않았다.

## 사용자와 협력하고 권한을 어떻게 관리하는가?

### Takeaway
자료 조회와 쓰기 권한을 제품이 관리하며 개인 Agent와 공유 Custom Agent의 권한 모델은 다르다.

### Cited Findings
- 개인 Agent는 사용자와 같은 접근 권한을 가지며, 페이지 공유·권한 변경은 할 수 없다. — [Notion Agent](https://www.notion.com/help/notion-agent)
- Custom Agent는 사용자의 권한을 상속하지 않고 명시적으로 부여된 자료에 접근한다. 공유하면 Agent가 볼 수 있는 정보가 이용자에게 노출될 수 있어 별도 접근 설정이 필요하다. — [Custom Agent 권한](https://www.notion.com/help/custom-agents-sharing-and-permissions)
- 공유 Instructions 페이지의 편집은 해당 지침 사용자의 응답을 바꿀 수 있다. 공유 자체가 타인의 Agent에 자동 적용되지는 않는다. — [Instructions](https://www.notion.com/help/instructions-for-notion-agent)

### Inferences
- Fathomark에는 `ask_user`(보충 사실 수집), `preview_changes`(차이·출처 표시), 승인된 적용 기능을 분리한다. 모든 자료를 무조건 검색하는 것보다 사용자가 경험 노트·웹·문체 범위를 선택하게 한다.

### Gaps
- 공개 자료의 특정 쓰기 승인 사례를 모든 Notion 페이지 수정에 대한 일괄 승인 정책으로 일반화할 수 없다.
