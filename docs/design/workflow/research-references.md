# 기업 조사와 반영한 설계 원칙

상태: **참고 조사**  
기준일: 2026-10-11  
[문서 목차](README.md)

이번 조사에서 얻은 것은 공개 기능과 설계 사례다. 각 회사의 내부 실행을 그대로 재현하거나 같은 글쓰기 성과를 보장하는 근거는 아니다.

| 제품·자료 | 확인한 방식 | 반영한 설계 |
|---|---|---|
| Notion | 자료 범위와 출처, 기본 Instructions와 작업별 Skills | 경험·기업·문체 자료 구분, 문체 지침과 개요·교정 절차 분리 |
| Claude Research | 공개 설계에서 조사 계획 유지, 후속 탐색, 출처 연결 | 확보 사실과 남은 질문 보존, 탐색 한도와 출처 책임 |
| NotebookLM | 자료 후보 선택, 출처 기반 답변, 메모와 후속 보고서 | 근거표·선택 개요를 다음 작업에 재사용 |
| Atlassian Rovo | 에이전트 지식 자료 범위와 접근 권한 | 도구 실행 전에 사용 가능한 자료 범위 확인 |
| Word Copilot | 선택 영역 재작성과 결과 검토 | 전체 재작성보다 대상·유지 사실을 지정한 수정안 |
| Grammarly | 독자·목표에 따른 전략적 제안 | 문항 적합성·모호함·중복에 대한 비평 절차 |

Notion의 범위·출처 기능은 [Enterprise Search](https://www.notion.com/help/enterprise-search), 지침과 반복 절차는 [Instructions](https://www.notion.com/help/instructions-for-notion-agent)와 [Skills](https://www.notion.com/help/create-and-manage-skills)를 참고했다. 내부 도구 이름은 공개 기능으로부터 추정하지 않는다.

Claude는 [공개 연구 시스템 설계](https://www.anthropic.com/engineering/multi-agent-research-system), NotebookLM은 [Discover Sources](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-discover-sources/)와 [Deep Research](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-deep-research-file-types/)를 참고했다. 공개 당시 구조를 현재 모든 실행의 보장으로 해석하지 않는다.

추가 참고는 [Rovo 자료 범위](https://support.atlassian.com/rovo/docs/knowledge-sources-for-agents/), [Word 선택 영역 편집](https://support.microsoft.com/en-gb/word/copilot/edit-rewrite-content), [Grammarly 전략적 제안](https://support.grammarly.com/hc/en-us/articles/25351804320397-Introducing-strategic-suggestions)이다. Grammarly 자료의 지원 범위는 미국 영어이므로 한국어 지원 사례나 개인 문체 학습 기능의 근거로 사용하지 않는다. 더 자세한 조사는 [기존 조사 보고서](../../../reports/근거 기반 글쓰기 도구 조사.md)에 보존한다.
