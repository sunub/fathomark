from collections.abc import Iterator

from model.evaluation.result import EvaluationResult, group_results


def print_comparison(results: Iterator[EvaluationResult]) -> None:
    grouped = group_results(results)

    for case_id, approaches in grouped.items():
        print(f"사례: {case_id}")

        for approach, result in approaches.items():
            print(f"  [{approach}] {result.generated_text}")

        missing = {"prompt_baseline", "lora"} - approaches.keys()
        if missing:
            print(f"  비교 결과 없음: {', '.join(sorted(missing))}")

        print()
