# 모델 평가 무결성과 실증 근거 확보 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학습 자료가 평가에 섞이는 결함을 고치고, 사실 보존 평가를 문체 변환과 양립시키며, 실제 모델의 개선 여부를 확인할 재현 가능한 증거를 확보한다.

**Architecture:** 기존 Python 학습·검토 흐름을 유지한다. 최초 학습과 재평가는 같은 지문 검사를 사용하고, 평가 사례는 기존 문자열 보존 방식과 새로운 의미 검토 방식을 명시적으로 구분한다. 실증과 제공자 호환성 조사는 별도 결과로 남기며 후보 활성화를 자동화하지 않는다.

**Tech Stack:** Python 3.12+, PyTorch, Transformers, unittest, Ruff, 기존 로컬 모델 환경. 새 의존성 없음.

**Spec:** [PRODUCT](../../PRODUCT.md), [MODEL_SELECTION](../../MODEL_SELECTION.md), [ADR 0006](../../adr/0006-user-selected-style-personalization.md), [ADR 0003](../../adr/0003-separate-training-from-runtime.md), [승인된 폴더 학습 예외](../../../.omx/plans/folder-to-evaluated-model.md), [기존 평가 계획](../../../.omx/plans/evaluation-connected-training.md).

## Global Constraints

- 이 계획은 코드 수정 전 실행 설계다. 현재 작성 단계에서는 이 문서만 변경하고 커밋하지 않는다.
- 상위 계획의 Global Constraints, 게이트와 리더 직렬 커밋 절차를 적용한다.
- Python 작업은 `model/`에 한정한다. 플러그인은 Python 학습 의존성을 요구하지 않는다.
- `No new dependencies without explicit request.` 기존 환경이 없으면 설치 없이 환경 부재를 기록한다.
- 사용자가 명시적으로 선택한 폴더만 읽는다. Vault 전체를 찾아 문체나 학습 자료를 추론하지 않는다.
- 승인된 최신 폴더 계획은 `auto_derived_unreviewed` 학습을 허용한다. 이를 금지하거나 사람이 검토한 것으로 바꾸지 않는다.
- 수동 `train-supervised`의 목표 답변 검토는 유지한다. 폴더 예외를 수동 경로까지 확대하지 않는다.
- `Disallowed tool executions | 0`, `Non-terminating repeated-call loops | 0`은 제품 평가 조건이다.
- 제품 기본 모델 선정에는 최소 200개 시나리오, 16GB 대표 장비의 cold p95 ≤5초 목표/8초 초과 탈락, warm p95 ≤2초 목표가 필요하다.
- 위 지연 목표는 제품 제공자 평가에 적용한다. 학습용 Python 추론 시간으로 대신 충족했다고 주장하지 않는다.
- 한국어 품질·문체 선호·메모리 합격 수치는 아직 미결정이다. 측정 전에 합의되지 않은 숫자로 합격을 만들지 않는다.
- 테스트용 작은 Qwen, 합성 예제, 다음 토큰 예측 오차 개선은 실제 사용자 문체 개선 증거가 아니다.
- 개인 원문·경로·가중치·검토 파일은 로컬 비추적 결과 폴더에 둔다. 공개 문서에는 비식별 요약만 남긴다.

## Review Focus

1. 학습 답변을 평가 근거로 넣거나 정규화만 바꾼 입력은 최초 학습·재평가 모두 거부해야 한다. → Task 1.
2. 사실은 유지한 의역은 의미 검토 대상으로 남고, 반드시 유지할 숫자 누락은 통과하면 안 된다. → Task 2.
3. 기존 사례·검토를 새 판정 방식으로 몰래 바꾸거나 완료된 결과를 수정하면 이전 승인은 무효여야 한다. → Task 2.
4. 자료·실모델·장비가 없거나 한 방식의 결과가 누락되면 비교 성공을 만들어내지 않아야 한다. → Task 3.
5. 자체 adapter.pt를 제공자가 읽을 수 없거나 기본 모델이 다르면 적용 가능하다고 보고하면 안 된다. → Task 4.

💡 지문은 내용을 정규화한 뒤 계산한 값으로, 같은 자료가 다른 이름으로 재사용되는지 검사한다.
💡 의미 검토는 표현이 달라도 사실의 주체·수치·부정·조건이 유지되는지 사람이 확인하는 절차다.

---

## 파일과 병렬 실행 경계

- Task 1: `training/supervised.py`, `training/workflow.py`, 해당 테스트. 최초/재평가 중복 검사 소유.
- Task 2: `evaluation/case.py`, `runner.py`, `training/supervised.py`, `folder_data.py`, 관련 테스트·문서. Task 1 후 실행한다.
- Task 3: 신규 `evaluation/trial.py`, `tests/test_trial.py`, `QUALITY_TRAINING.md`. Task 2 계약 확정 후 실행한다.
- Task 4: 신규 `model/PORTABILITY.md`, 기존 `tests/test_training_cli.py`의 계약 보강. Task 1과 독립적인 조사 가능.
- 여러 담당자는 다른 변경을 되돌리지 않는다. `supervised.py`와 `QUALITY_TRAINING.md` 수정은 순차 통합한다.
- 각 작업은 실패 테스트 → 최소 구현 → 통과 검증 → 독립 리뷰 → 해당 범위 커밋 순서다.

### M1 (Task 1): 최초 학습과 재평가의 교차 필드 중복 검사 통합

**Files:** Modify `model/src/model/training/supervised.py`, `model/src/model/training/workflow.py`; Test `model/tests/test_supervised.py`, `model/tests/test_training_workflow.py`.

**Interfaces:** `source_fingerprint(text: str) -> str`와 `ensure_unseen(cases: list[EvaluationCase], used: list[dict[str, str]]) -> None`을 `supervised.py`에 둔다. `used` 항목은 정규화 전 `id`, 정규화 지문 `source_sha256`, 선택적 `target_sha256`다. 기존 `ensure_disjoint`와 `_check_seen_cases`는 이 계약을 공유한다.

- [ ] 기존 97개 테스트를 먼저 실행하여 보호되는 동작을 기록한다. 실패가 있으면 원인부터 조사한다.
- [ ] `SupervisedTest.test_rejects_target_as_held_out_source`를 추가한다. 기존 자료 생성 패턴을 사용하고 아래 회의 자료는 직접 생성한다.

```python
train = SupervisedExample(EvaluationCase('train', 'q', '날짜: 금요일', '짧게', ('금요일',)), '회의는 금요일입니다.')
valid = SupervisedExample(EvaluationCase('valid', 'q', '날짜: 토요일', '짧게', ('토요일',)), '회의는 토요일입니다.')
evaluation = EvaluationCase('eval', 'q', train.target_text, '짧게', ('금요일',))
with self.assertRaisesRegex(ValueError, 'overlap'):
    ensure_disjoint([train], [valid], [evaluation])
```

- [ ] 학습 source↔검증 target, 학습 target↔검증 source, 학습/검증 target↔평가 source, 정규화 ID 중복을 `subTest`로 추가한다. 공통 style 재사용은 허용한다.
- [ ] `cd model && .venv/bin/python -m unittest discover -s tests -p test_supervised.py -v` 실행. 기존 구현이 교차 필드 사례에서 실패함을 확인한다.
- [ ] `source_fingerprint`는 기존 NFKC·공백 축약·casefold 후 SHA256을 그대로 사용한다. 기존 저장 지문을 재해석하거나 새 알고리즘으로 바꾸지 않는다.
- [ ] `ensure_disjoint`는 분할별 source/target 지문 집합의 교집합을 모두 검사한다. 평가는 target이 없으므로 source만 검사한다. 포함 문자열·의역 탐지까지 확장하지 않는다.
- [ ] `_case_manifest`와 `_check_seen_cases`가 같은 함수를 사용하도록 연결한다. 기존 원문 document SHA256 검사는 보존한다.
- [ ] `test_training_workflow.py`에 최초 dry-run과 저장 후 evaluate가 동일 오염 자료를 모델 로딩 전에 거부하는 테스트를 추가한다. 기존 모킹 패턴을 재사용한다.
- [ ] 위 두 테스트 파일과 전체 unittest를 실행한다. 예상: 새로운 중복 사례 거부, 기존 폴더·저장 후보 호환 테스트 통과.
- [ ] 독립 리뷰에서 최초·재평가가 같은 문자열 지문을 비교하는지 확인한 후 `fix(model): 평가 자료 재사용으로 인한 과대평가 방지`로 아래 커밋 절차를 수행한다.

### M2 (Task 2): 고정 표현 검사와 의미 보존 검토 분리

**Files:** Modify `model/src/model/evaluation/case.py`, `runner.py`, `model/src/model/training/supervised.py`, `folder_data.py`; Test `model/tests/test_evaluation.py`, `test_evaluation_runner.py`, `test_supervised.py`, `test_folder_data.py`; Docs `model/QUALITY_TRAINING.md`.

**Interfaces:** `EvaluationCase`에 기본값 `schema_version: int = 1`, `literal_facts: tuple[str, ...] | None = None` 추가. `to_dict() -> dict[str, object]`와 `required_literals() -> tuple[str, ...]` 추가. v1은 기존 expected_facts를 고정 표현으로 사용하고, v2는 명시된 literal_facts만 강제하며 expected_facts는 의미 검토 기준으로 사용한다.

- [ ] `test_v2_paraphrase_waits_for_human_review`를 추가한다. `expected_facts=('회의는 금요일에 열린다.',)`, `literal_facts=('금요일',)`, 답변 `금요일에 회의를 엽니다.`를 사용한다.
- [ ] 기존 `EvaluationRunnerTest.review_file`로 사람이 네 항목을 통과시킨 v2 답변은 비교 대상에 들어가지만, 검토 전에는 pending이고 `금요일` 누락 시 rejected임을 검증한다.

```python
case = replace(self.case, schema_version=2,
               expected_facts=('회의는 금요일에 열린다.',), literal_facts=('금요일',))
self.assertEqual(case.required_literals(), ('금요일',))
self.assertEqual(replace(self.case).required_literals(), self.case.expected_facts)
```

- [ ] v1 JSONL에 새 필드가 없어도 기존 fingerprint가 바뀌지 않는 golden 테스트를 추가한다. 기존 raw 사례/답변으로 직접 계산한 구형 SHA256과 같아야 한다.
- [ ] `literal_facts`·`schema_version` 수정 후 기존 target/result 검토 재사용 거부, 완료 결과 무효화, 불명확한 v1+literal_facts 조합과 알 수 없는 버전 거부를 테스트한다.
- [ ] `cd model && .venv/bin/python -m unittest discover -s tests -p test_evaluation_runner.py -v`와 관련 schema 테스트를 실행한다. 신규 인자/메서드 부재로 실패함을 확인한다.
- [ ] v1 `to_dict`는 기존 다섯 필드만 반환하여 옛 해시를 유지한다. v2는 version과 literal_facts를 포함한다. 버전은 정수 1/2만 허용하고 bool은 거부한다.
- [ ] v2는 literal_facts 목록을 반드시 명시해야 한다. 빈 목록은 의미 검토만 한다는 명시적 선택이며 자동 합격을 뜻하지 않는다. expected_facts의 비어 있지 않은 조건은 유지한다.
- [ ] case가 포함된 모든 저장·fingerprint 경로를 `to_dict`로 연결한다. `asdict(case)` 및 중첩 case 직렬화 사용처를 검색해 하나도 빠뜨리지 않는다.
- [ ] `_missing`과 수동 학습 목표 문자열 검사는 `required_literals()`만 강제한다. 네 품질 관문과 unsupported_claims는 그대로 유지하며 자동 진단으로 사람 검토를 생성하지 않는다.
- [ ] 새 폴더 자료는 v2로 생성한다. expected_facts는 추출 구절, literal_facts는 원문 숫자 포함 토큰의 순서 보존 중복 제거 결과로 둔다. 숫자 없는 사실·이름·부정은 의미 검토 대상으로 남긴다.
- [ ] 기존 숫자 포함 토큰 추출 규칙 `r'\S*\d\S*'`을 재사용한다. 날짜/단위 문맥 누락을 막는 기존 `_facts` 검사는 유지한다.
- [ ] migration은 원본 파일 수정이 아닌 별도 v2 파일 작성과 새 평가 실행으로 한다. 검토 양식은 다시 생성한다. 기존 승인·완료 보고서를 새 버전으로 승격하지 않는다.
- [ ] `QUALITY_TRAINING.md`에 v1 유지/v2 선택, 의역 사례, 숫자 고정 검사 한계, 재검토 요구를 기록한다. 새 사례를 자동으로 사람이 승인한 것으로 만들지 않는다.
- [ ] 전체 unittest·Ruff를 실행하고 구형 예제 dry-run을 확인한다. 독립 리뷰 후 `fix(model): 의역과 사실 보존을 분리해 평가`로 커밋한다.

### M3 (Task 3): 실제 비교 실행 증거와 차단 상태 기록

**Files:** Create `model/src/model/evaluation/trial.py`, `model/tests/test_trial.py`; Modify `model/QUALITY_TRAINING.md`. 개인 실행 결과는 사용자 선택 비추적 로컬 경로에만 저장한다.

**Interfaces:** `summarize_trial(run_dir: Path, metadata: dict[str, object]) -> dict[str, object]`. 기존 cases/results/report/final-report와 검토 양식을 읽는다. 생성·학습·승인·활성화는 하지 않는다. 별도 프로그램 프레임워크 없이 `python -m model.evaluation.trial --run-dir PATH --metadata PATH --output PATH`를 제공한다.

- [ ] `test_trial.py`에 파일 없는 실행, baseline 누락, 기본 모델/생성 설정 불일치, 미검토 결과, 완료 후 변조된 결과 테스트를 추가한다.
- [ ] 메타데이터 필수 항목을 `hardware`(문자열), `ram_gb`(양수), `device`(문자열), `model_revision`(문자열), `data_kind`(`synthetic`/`user_selected`), `measurement_scope`(`python_training`)로 고정한다.

```python
with TemporaryDirectory() as directory:
    report = summarize_trial(Path(directory), {})
    self.assertEqual(report['status'], 'blocked_missing_evidence')
    self.assertFalse(report['establishes_product_readiness'])
    self.assertIn('results.jsonl', report['missing'])
```

- [ ] `cd model && .venv/bin/python -m unittest discover -s tests -p test_trial.py -v` 실행. 새 모듈 부재로 실패를 확인한다.
- [ ] 기존 case/result 비교 검사를 재사용한다. 불완전 자료는 `blocked_missing_evidence`, 불일치·변조는 `invalid_evidence`, 정상 실행 자료는 `recorded`로 기록한다. 모든 상태에서 `establishes_product_readiness: false`다.
- [ ] 입력 파일 해시를 요약에 기록하고 `final-report.json`의 기존 input/output 지문을 검증한다. finalized 입력 지문 확인에 사용할 reviews 파일은 metadata의 `reviews_path`로 명시하고 없으면 최종 판정을 인용하지 않는다.
- [ ] 결과에는 사례 수, 실제 품질 상태, 실제 후보 실패 사례, 실제 비교 가능 수만 기록한다. 숫자 없는 지연·메모리 측정, 선호 투표, 없는 검토를 추정하지 않는다.
- [ ] 문서에 실행용 metadata 예시를 추가하되 실측 숫자는 `<실측값>`으로 표시한다. 기존 생성 결과와 새 CLI의 연결 명령을 작성한다.
- [ ] 사용자 지정 자료와 캐시된 실제 모델이 있는 경우에만 기존 `train-folder`를 새 결과 폴더에서 실행한다. 우선 dry-run으로 분할을 확인한다. 경로 미제공 시 Vault를 탐색하지 않는다.
- [ ] 자료·캐시·장비 부족은 원인과 필요한 입력을 기록한다. 다운로드·고비용 실행이 필요한 경우 남은 독립 작업을 먼저 완료하고 해당 단계만 대기한다.
- [ ] 같은 request/evidence/style/base revision/settings의 두 결과를 생성하고 미사용 사례로 검토한다. 작은 합성 테스트 성공과 개인 실험 결과를 구분한다.
- [ ] 원문 사실의 불필요한 재현, 숫자·날짜 변경, 충돌, 정보 부족, 문체 자료 속 지시 사례를 포함한다. 최소 사례 수나 합격률을 임의로 정하지 않는다.
- [ ] 문체 선호 수집 UI·자동 적용은 만들지 않는다. 합격 기준이 미정이면 결과는 판단 자료이며 채택 승인이 아니다.
- [ ] 전체 unittest·Ruff 실행 후 `feat(model): 실험 근거와 미검증 상태를 구분`으로 커밋한다. 사용자 자료는 stage하지 않는다.

### M4 (Task 4): 후보 이동 가능성 확인과 적용 단계의 명시적 보류

**Files:** Create `model/PORTABILITY.md`; Test `model/tests/test_training_cli.py`; 필요 시 관련 계약 설명만 `model/README.md`에 반영한다. exporter·provider·plugin 구현은 이 작업 범위에 없다.

**Interfaces:** 문서에 `base_model`, `base_revision`, `rank`, `alpha`, `target_modules`, `module_names`, tokenizer 파일, custom adapter tensor 키와 shape를 매핑한다. 대상 제공자는 제품 제공자 계획에서 실제 선택한 하나를 사용하며 선택 전에는 `blocked_provider_decision`이다.

- [ ] 기존 작은 Qwen roundtrip 테스트에 저장 전후 출력 토큰 동일성, 기본 가중치 불변, base revision/모듈 불일치 거부를 명시한다. 이미 있는 검증은 중복 테스트를 만들지 않는다.
- [ ] 실제 누락된 계약 테스트만 추가하여 실패 여부를 확인한다. 모두 이미 보호되면 기존 테스트 이름·명령을 문서 근거로 기록하고 기능 변경 없이 진행한다.
- [ ] `cd model && .venv/bin/python -m unittest discover -s tests -p test_training_cli.py -v`를 실행한다. Python roundtrip은 제공자 호환 증거와 구분한다.
- [ ] 선택 제공자의 공식 문서에서 지원 adapter 형식·기본 모델/양자화 제약·적용 방법을 확인하고 URL·확인 날짜를 기록한다. 외부 SDK를 설치하지 않는다.
- [ ] 자체 LoRA q_proj/v_proj 가중치·scaling·tensor 명명과 제공자 형식을 비교한다. 확인하지 못한 항목은 unknown이며 지원됨으로 표시하지 않는다.
- [ ] 이미 설치된 도구와 비민감 테스트 자산으로 검증 가능한 경우에만 작은 변환 가능성 실험을 수행한다. 추가 다운로드·의존성·실사용 후보 배포는 제외한다.
- [ ] 결과는 `not_verified` 또는 구체적 검증 범위를 갖는 `verified_for_exact_configuration`으로 적는다. 실험하지 않은 장비·모델·양자화 조합까지 일반화하지 않는다.
- [ ] 별도 후속 구현의 시작 조건을 기록한다: 실제 문체 비교 증거, 합의된 품질·선호 기준, 제공자 형식 확인, 사용자 명시적 적용, 이전 상태 복귀, 로컬 자료 삭제/보관 정책.
- [ ] 출구 조건 미충족이면 LoRA 제품 적용은 보류하고 프롬프트·선택 예시 기반 개인화를 제품 경로로 유지한다. 이 보류는 현재 학습 실험 실행을 막지 않는다.
- [ ] 문서 근거와 기존 roundtrip 테스트를 독립 리뷰하고 `docs(model): 후보 적용 전 호환 조건 명시`로 커밋한다.

## 공통 검증과 커밋 절차

- [ ] 실행 전 `git -C model rev-parse --show-toplevel`로 실제 저장소 경계를 확인한다. skill의 중첩 저장소 설명만 믿고 잘못된 곳에 stage하지 않는다.
- [ ] 각 작업 후 `cd model && .venv/bin/python -m unittest discover -s tests && .venv/bin/ruff check . && .venv/bin/ruff format --check .`.
- [ ] 통합 완료 후 저장소 루트에서 `pnpm typecheck && pnpm test && pnpm boundaries && pnpm build`.
- [ ] 누출 재현이 거부로 바뀌고, v1 결과 지문이 유지되며, v2 의역/숫자 누락/변조 검사가 통과하는지 리뷰한다.
- [ ] 각 작업의 파일만 stage한 뒤 루트 `.agents/skills/commit/SKILL.md`에 따라 `node .agents/skills/commit/lint-message.mjs --suggest`를 실행한다. 중첩 저장소에서는 스크립트 절대 경로를 사용한다.
- [ ] 메시지는 한국어 conventional header·한국어 `*` 본문과 Lore trailers를 파일에 작성한다. `Tested`, `Not-tested`, 필요 시 `Constraint`, `Directive`를 실제 확인 결과로 채운다.
- [ ] 메시지 파일을 같은 linter로 확인한 뒤 `git commit -F <메시지파일>`로 커밋한다. scope 후보가 여러 개면 해당 작업 안에서도 커밋을 나눈다.
- [ ] 이 계획 작성 시점에는 어떤 구현·stage·커밋도 수행하지 않는다. 실행 결과는 변경 파일, 해결한 문제, 실제 검증, 남은 외부 조건을 분리해 보고한다.

## 완료 판정

- 코드 완료: Task 1·2·3의 회귀 테스트 및 전체 검증 통과, Task 4의 호환성 근거/미검증 이유 기록.
- 실증 완료: 실제 선택 자료의 기본 모델/후보 비교 결과와 의미 검토가 존재하며 조건·지문이 재현 가능함.
- 제품 채택 완료는 별도다: 200개 도구 시나리오와 대표 장비 평가, 합의된 문체/품질 기준, 사용자 적용·복귀·삭제 정책을 충족하기 전에는 선언하지 않는다.
- 실측 불가 상태에서도 코드·문서 작업은 완료할 수 있지만, 실증 상태는 blocked 또는 pending으로 정직하게 남긴다.

## 실행 명령과 결과 자료 연결

다음 명령의 `<...>`는 실행자가 확보한 실제 경로다. 경로를 추측하거나 저장소에서 개인 문서를 찾지 않는다.

```bash
cd model
.venv/bin/python -m model.training train-folder --input-dir '<선택한-원문-폴더>' --dry-run
.venv/bin/python -m model.training train-folder --input-dir '<선택한-원문-폴더>' --output-dir '<새-개인-결과-폴더>'
.venv/bin/python -m model.training review --run-dir '<새-개인-결과-폴더>/candidate/evaluation' --reviews-file '<직접-검토한-reviews.jsonl>'
.venv/bin/python -m model.evaluation.trial --run-dir '<새-개인-결과-폴더>/candidate/evaluation' --metadata '<실행-조건.json>' --output '<새-실험-요약.json>'
```

- `review`는 검토 양식을 사람이 완료한 뒤 실행한다. 대기 중인 null 값을 자동으로 true로 채우지 않는다.
- 신규 trial CLI의 output은 기존 파일을 덮어쓰지 않는다. 같은 입력 재실행은 다른 경로에 동일한 판정·입력 지문을 남긴다.
- `TrialTest.test_refuses_existing_output`에서 기존 출력 바이트가 보존되는지, 종료 상태가 실패인지 검증한다.
- `TrialTest.test_synthetic_run_never_establishes_product_readiness`에서 합성 all-pass 자료도 제품 검증 완료로 바뀌지 않는지 검증한다.
- 실제 장비가 16GB가 아니면 장비 특성을 그대로 기록하고 대표 장비 기준 충족 여부는 미검증으로 둔다.
- 실제 사용자 문체 선호가 없으면 품질 통과와 문체 개선을 구분한다. 후보가 기본 모델보다 우수하다고 표현하지 않는다.
- 외부 조건 없이 완료 가능한 Task 1·2 및 Task 3 코드·Task 4 조사는 끝까지 진행한다. 자료 요청 때문에 모든 작업을 중단하지 않는다.
