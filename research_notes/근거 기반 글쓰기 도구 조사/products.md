# Claude Research와 NotebookLM의 조사·사고·작성 워크플로우

조사 기준일: 2026-10-11. 공식 공개 문서만 사용했다. 아래 제품 기능과 Fathomark 제안은 구분한다. NotebookLM 관련 현재 공식 도움말은 Gemini Notebook 명칭으로 연결된다. 이름 변경 시점 자체는 이번 조사에서 확정하지 않았다.

## Claude Research는 검색 이후 무엇을 하는가?

### Takeaway
단순 검색 횟수 증가보다 조사 계획 보존, 독립 질문 분해, 결과의 빈틈 확인, 출처 연결을 별도 책임으로 나눈 점이 중요하다. Fathomark에는 이 책임을 가져오되 복수 에이전트부터 도입할 필요는 없다.

### Cited Findings
- Claude Research는 앞선 결과를 활용한 연속 검색, 여러 관점 탐색, 미해결 질문 조사, 확인 가능한 인용을 제공한다. 연결된 내부 문맥과 웹을 조사한다. — [공식 Research 도움말](https://support.anthropic.com/en/articles/11088861-using-research-on-claude-ai)
- 2025-06-13 공개한 엔지니어링 설계에서 리드 에이전트는 전략을 세우고 계획을 메모리에 저장하며, 명확한 목표·범위·출력 형식을 받은 조사 에이전트에 일을 분배한다. 결과를 종합해 추가 조사를 결정하고, 충분해지면 CitationAgent가 주장에 필요한 출처 위치를 붙인다. — [공개 Research 아키텍처](https://www.anthropic.com/engineering/multi-agent-research-system)
- 같은 글은 도구마다 고유 목적과 명확한 설명을 요구하고, 짧고 넓은 검색에서 점차 좁히도록 권장한다. 평가에는 사실 정확성, 인용 정확성, 완전성, 출처 품질, 도구 효율을 사용한다. 복수 에이전트는 토큰 비용 증가와 조정 부담이 있어 모든 작업에 적합하지 않다. — [설계·평가 원칙](https://www.anthropic.com/engineering/multi-agent-research-system)
- URL의 전체 내용을 가져오는 web fetch와 검색은 구분된 기능이다. 검색 결과만 읽지 않고 원문에 접근할 수 있다. — [공식 웹 검색 도움말](https://support.anthropic.com/en/articles/10684626-enabling-and-using-web-search)

### Inferences
- `save_research_state`: 필요한 질문, 이미 조사한 영역, 미해결 사실, 다음 탐색 후보를 구조화해 저장한다. 비공개 사고 과정의 저장이나 노출이 필요하다는 의미가 아니다.
- `web_search`와 `fetch_source`: 회사·직무·산업 정보를 조사할 때만 외부 검색을 추가하고 원문까지 확인한다. 사용자 개인 경험은 웹으로 증명하지 않는다.
- `record_evidence`: 주장 후보·원문 구절·출처 위치·자료 유형·확인 상태를 저장한다. 원문에 없는 해석과 사실을 구분한다.
- `inspect_gaps`는 구조화된 결과를 내는 검토 단계로 만들 수 있다. 내용 생성만 하는 별도의 ‘생각하기 도구’를 여러 개 만드는 것은 불필요하다.
- 출처 검증은 모델이 선택적으로 건너뛸 도구보다 Harness의 필수 검사로 두는 편이 프로젝트에 맞는다.

### Gaps
- 공개 아키텍처는 2025년 당시 설명이다. 현재 모든 사용자에게 동일한 내부 도구·에이전트 구성이 적용된다고 확정할 수 없다.
- 내부 검색 랭킹, 출처 신뢰도 알고리즘, 비공개 추론 구현은 공개되지 않았다. Fathomark 제안은 이를 복제했다는 주장이 아니다.

## NotebookLM은 자료를 사고와 글쓰기로 어떻게 연결하는가?

### Takeaway
자료를 고르고, 해석과 메모를 축적하며, 같은 자료를 구조화된 산출물로 반복 변환하는 작업 공간을 제공한다. Fathomark에도 ‘검색 → 즉시 초안’ 사이에 근거 정리와 개요 선택이 필요하다.

### Cited Findings
- Discover Sources는 주제에 맞는 후보를 조사하고 관련성을 설명한 요약과 함께 최대 10개 추천을 제시했다. 사용자가 가져온 자료는 원문 읽기, 질문, 인용, 메모에 계속 활용된다. — [2025-04-02 공식 소개](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-discover-sources/)
- Deep Research는 질문에서 조사 계획을 만들고, 발견에 따라 검색을 수정해 출처 기반 보고서를 만든다. 보고서와 자료를 노트북에 추가해 후속 분석과 변환에 재사용한다. — [2025-11-13 공식 소개](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-deep-research-file-types/)
- 2026-07-16 업데이트된 공식 글은 느슨한 아이디어부터 대화로 자료 저장소를 만들고, 검색한 출처의 추가는 사용자가 통제한다고 설명한다. 자료로 산출물을 생성하고 생성 후 수정도 가능하다. 일부 계정부터 배포한다고 명시돼 있다. — [2026 공식 업데이트](https://blog.google/innovation-and-ai/products/notebooklm/better-research-notebooklm/)
- 인용을 선택하면 해당 구절로 이동해 문맥을 확인할 수 있다. 답변을 메모로 저장할 때 표와 클릭 가능한 인용도 보존한다. — [현재 공식 채팅 도움말](https://support.google.com/gemininotebook/answer/16179559?hl=en)
- 메모에는 자신의 해석을 정리할 수 있고, 선택한 메모를 질의와 생성의 자료로 포함하거나 제외할 수 있다. 메모의 특정 구절도 인용 대상으로 연결된다. — [공식 메모 도움말](https://support.google.com/gemininotebook/answer/16262519?hl=en)
- Mind Map은 자료의 핵심 주제와 관련 아이디어를 연결하고, 특정 노드를 선택해 그 주제에 관한 후속 질문을 할 수 있게 한다. 보고서는 템플릿·제안 형식·맞춤 설정으로 생성한다. — [Mind Maps](https://support.google.com/gemininotebook/answer/16212283), [Reports](https://support.google.com/gemininotebook/answer/18323649?hl=en)

### Inferences
- `set_source_scope`: 현재 문항에 쓸 경험 근거와 참고 자료를 선택·제외한다. 개인 경험, 회사 정보, 문체 예시를 역할별로 분리한다.
- `save_outline`: 개요의 각 항목에 근거 ID, 전달할 핵심, 미확인 내용을 붙이고 사용자 선택을 보존한다.
- `save_working_note`: 비교표·경험 후보·관점 선택·보충 답변을 재사용할 작업 메모로 저장한다. 생성된 메모를 원래 사실 증거로 승격시키지는 않는다.
- `propose_revision`: 문단 단위 수정과 변경 이유를 검토 가능한 형태로 제안한다. 본문 쓰기는 기존 승인 경로를 따른다.
- 자료 관계 탐색은 Obsidian 링크·백링크를 활용한 `find_related_notes`가 우선이며, 마인드맵은 그 결과를 보여주는 선택 UI로 나중에 추가할 수 있다.

### Gaps
- 공개 제품 설명은 사용자 기능이며 실제 내부 tool 이름이나 호출 정책을 공개한 것이 아니다.
- 자료 기반 답변도 오류가 가능하다. 인용 존재만으로 문장이 참임을 보장하지 않는다.
- Google의 기본 자료 기반 채팅과 새 조사·생성 기능은 범위가 다르다. 특정 신규 기능의 전체 계정 가용성을 이번 조사로 확정하지 않았다.
