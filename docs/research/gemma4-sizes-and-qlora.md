# Gemma 4 크기와 QLoRA 조사 (2026-10-05)

> 기록 (2026-10-05). 앱 기본 모델은 `gemma4:e4b`이고 LoRA는 하지 않는다. 현재 방향은 [DIRECTION.md](../DIRECTION.md).

모든 수치는 아래 URL에서 2026-10-05에 확인한 값이다. "추정"은 직접 계산한 값이다.

## 1. Gemma 4 실재와 구성

Gemma 4는 공식 문서에 존재한다. 출처: https://ai.google.dev/gemma/docs/core

| 변형 | 구조 | 파라미터 | 컨텍스트 | 입력 | 출처 |
|---|---|---|---|---|---|
| E2B | dense, 엣지용 | 2B 유효 | 128K | 텍스트·이미지·오디오 | ai.google.dev/gemma/docs/core, ollama.com/library/gemma4 |
| E4B | dense, 엣지용 | 4.5B 유효 (임베딩 포함 8B) | 128K | 텍스트·이미지·오디오 | https://huggingface.co/google/gemma-4-e4b-it |
| 12B | dense, 인코더 없는 통합 멀티모달 | 11.95B, 48층 | 256K | 텍스트·이미지·오디오·비디오 | https://huggingface.co/google/gemma-4-12b-it |
| 26B A4B | MoE (전문가 128개 중 8개 사용, 토큰당 약 4B 활성) | 26B | 256K | 텍스트·이미지 | https://huggingface.co/google/gemma-4-26b-a4b-it/raw/main/config.json |
| 31B | dense | 30.7B, 60층 | 256K | 텍스트·이미지 | https://huggingface.co/google/gemma-4-31b-it |

- 라이선스: Apache 2.0 (E4B, 12B, 31B 모델 카드). 26B A4B 모델 카드의 라이선스는 확인 못함.
- 언어: 모델 카드는 "140+ 언어로 사전학습"이라고 쓴다. E4B 카드는 "35+ 언어를 바로 지원"이라고 쓴다. 한국어 개별 성능 수치는 확인 못함.
- 💡 MoE(Mixture of Experts): 여러 전문가 블록 중 일부만 토큰마다 계산하는 구조다. 계산량은 줄지만 전체 가중치는 모두 메모리에 올려야 한다.
- 💡 KV cache: 생성 중 이전 토큰의 attention key/value를 저장해 두는 메모리다. 컨텍스트가 길수록 커진다.
- 💡 QAT(Quantization-Aware Training): 학습 단계부터 낮은 비트 정밀도를 가정해 품질 손실을 줄인 양자화 방식이다.

## 2. Ollama 태그별 크기 (https://ollama.com/library/gemma4/tags)

| 태그 | QAT | Q4_K_M | Q8_0 | BF16 |
|---|---|---|---|---|
| e2b-it-* | 4.3GB | 4.6GB | 8.1GB | 10GB |
| e4b-it-* | 6.1GB | 6.6GB | 12GB | 16GB |
| 12b-it-* | 7.2GB | 8.0GB | 13GB | 24GB |
| 26b-a4b-it-* | 16GB | 18GB | 28GB | 52GB |
| 31b-it-* | 19GB | 20GB | 34GB | 63GB |

- Ollama가 `-it-qat` 태그를 제공하고, Gemma 문서는 공식 QAT 변형이 있다고 쓴다 (https://ai.google.dev/gemma/docs/core). `latest`는 e4b(6.6~9.5GB 범위로 표시)다. 어느 양자화가 `latest`인지는 확인 못함.
- MLX 태그(`-mlx`, `-nvfp4` 등)도 있다. 개별 크기는 확인 못함.

### KV cache 추정 (추정)

설정값 출처: 각 모델의 HF `config.json` (위 URL). 가정은 fp16(2바이트), K와 V를 모두 저장하는 상한, 슬라이딩 레이어는 윈도우(1024)까지만 저장이다.
식: 레이어당 토큰당 바이트 = KV헤드 × head_dim × 2(K,V) × 2바이트.

| 모델 | 구성 (슬라이딩 / 전역) | 8k | 32k |
|---|---|---|---|
| 12B | 40층 헤드8×256 / 8층 헤드1×512 | 약 0.47GB (0.336 + 0.134) | 약 0.87GB (0.336 + 0.537) |
| 31B | 50층 헤드16×256 / 10층 헤드4×512 | 약 1.51GB | 약 3.52GB |
| 26B A4B | 24층 헤드8×256 / 6층 헤드2×512 | 약 0.40GB | 약 1.01GB |
| E4B | 30층 헤드2×256(윈도우 512) / 12층 | 약 0.43GB | 약 1.64GB |

- 31B 계산 예: 슬라이딩 50 × 1024 × (16×256×4) = 0.84GB. 전역 10 × 8192 × (4×512×4) = 0.67GB (8k).
- E4B는 전역 KV헤드가 null이어서 2로 가정했고, KV 공유 레이어 18개(`num_kv_shared_layers`)는 반영하지 않아 상한이다.
- `attention_k_eq_v: true`(31B, 26B)이면 전역 레이어의 KV가 더 줄 수 있다. Ollama/llama.cpp의 실제 할당 방식은 확인 못함.

### 메모리별 현실성 (추정: 가중치 + KV 32k, OS·앱 여유 미반영)

| 메모리 | 현실적인 선택 | 근거 |
|---|---|---|
| 8GB | E2B QAT (4.3GB), E4B QAT (6.1GB)는 빠듯함 | 6.1 + 0.4~1.6 + OS가 8GB에 근접 |
| 16GB | 12B QAT (7.2 + 약 0.9 = 약 8.1GB), E4B Q8 (12GB) | 26B QAT는 가중치만 16GB라 불가 |
| 24GB | 26B A4B QAT (16 + 약 1 = 17GB), 31B QAT는 약 22.5GB로 빠듯함 | 통합 메모리에서 GPU가 쓸 수 있는 상한은 확인 못함 |

## 3. QLoRA가 줄이는 것

| 구분 | 내용 | 출처 |
|---|---|---|
| 줄이는 것 | 파인튜닝 시 메모리. 4비트 NF4로 얼린 기반 모델에 LoRA를 학습해 65B를 48GB GPU 한 장에서 학습 | https://arxiv.org/abs/2305.14314 |
| 못 줄이는 것 | 사용자가 추론할 때의 메모리. 논문은 학습 효율을 다루며, 배포 메모리를 줄이는 방법으로 제시하지 않는다 | 같은 출처 (해석) |

- 💡 LoRA 어댑터: 기반 가중치를 건드리지 않고 저랭크 행렬 쌍만 학습한 작은 추가 가중치다. 크기는 랭크 r과 대상 모듈 차원에 따라 정해진다 (https://huggingface.co/docs/peft/main/en/developer_guides/lora). Gemma 4 어댑터의 실제 크기는 확인 못함.
- 배포 시 사용자에게 필요한 것: (1) 기반 모델 가중치 (Table 2의 크기 그대로) (2) 어댑터 파일. 어댑터를 얹어도 기반 모델이 줄지 않는다. 오히려 어댑터 분만큼 늘고, 병합하면 같은 크기가 된다.
- 양자화된 기반에 어댑터를 얹을 때: PEFT 문서는 양자화 모델에 병합하면 반올림 오차가 생길 수 있다고 쓴다 (LoRA 가이드). AQLM은 병합이 불가능하다고 쓴다 (https://huggingface.co/docs/peft/main/en/developer_guides/quantization). 품질 손실의 크기는 확인 못함.
- QLoRA로 학습한 어댑터를 NF4가 아닌 다른 양자화(QAT, Q4_K_M)의 기반 위에 얹었을 때의 품질: 확인 못함.

## 4. 어댑터 적용 경로

| 경로 | 상태 | 출처 |
|---|---|---|
| Ollama Modelfile `ADAPTER` | 현재 문서에 없다. 서버 코드는 `LoRA adapters are no longer supported`를 반환한다 (v0.35.1과 main 모두). 제거된 버전은 확인 못함 | https://github.com/ollama/ollama/blob/main/docs/modelfile.mdx, https://github.com/ollama/ollama/blob/v0.35.1/server/create.go |
| Ollama (과거) | v0.12.0 문서는 safetensors 어댑터로 Llama, Mistral, Gemma 1·2를, 그리고 GGUF 어댑터를 지원한다고 썼다. 기반이 다르면 "erratic" 동작이라고 경고했다. Gemma 4는 목록에 없음 | https://github.com/ollama/ollama/blob/v0.12.0/docs/modelfile.md |
| llama.cpp | `convert_lora_to_gguf.py`(`--base`, `--outtype`)로 PEFT 어댑터를 GGUF로 변환. 실행 시 `--lora`, `--lora-scaled`. 병합은 `llama-export-lora` | https://github.com/ggml-org/llama.cpp/blob/master/tools/export-lora/README.md |
| llama.cpp 서버 | 요청별 LoRA 스케일 지정과 `/lora-adapters` 엔드포인트 | https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md |
| HF 일반 방식 | 어댑터만 올리고 사용자가 `PeftModel.from_pretrained`로 기반에 얹거나 `merge_and_unload()`로 병합 | https://huggingface.co/docs/peft/main/en/developer_guides/lora |

- llama.cpp 저장소에는 Gemma 4 추론 코드(`src/models/gemma4.cpp`)가 있다 (https://github.com/ggml-org/llama.cpp/tree/master/src/models). Gemma 4 LoRA 변환이 되는지는 확인 못함.
- 대안으로 Ollama에서는 병합한 전체 모델을 safetensors/GGUF로 `FROM`에 지정하는 방법이 문서화되어 있다 (https://github.com/ollama/ollama/blob/main/docs/import.mdx). 병합 후 양자화는 llama.cpp `llama-quantize`를 쓰라고 안내한다. Gemma 4에서 이 경로를 실제로 돌려 보지는 않았다.

## 5. Apple Silicon 학습 (MLX)

- mlx-lm은 LoRA와 QLoRA를 지원한다. 양자화된 모델을 `--model`로 주면 QLoRA로 동작한다 (https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md).
- Gemma 4: `mlx_lm/models/gemma4.py`, `gemma4_text.py`가 있다 (https://github.com/ml-explore/mlx-lm/tree/main/mlx_lm/models). LORA.md의 지원 목록에는 "Gemma"만 있고 Gemma 4 명시는 없다. Gemma 4 LoRA 학습이 실제로 되는지는 확인 못함.
- 메모리: 공식 문서의 유일한 수치는 "32GB 기기에서 Mistral-7B를 약 250 tokens/s로 파인튜닝"이다. Gemma 4의 요구량은 확인 못함. 줄이는 방법은 배치 크기, `--num-layers`, `--grad-checkpoint`다.

## 결론

- (a) 배포 시 사용자 메모리를 줄이는 수단은 작은 변형 선택(E2B/E4B/12B)과 양자화(공식 QAT 태그, Q4_K_M)이며, 컨텍스트 길이 제한은 KV cache 크기 조절에 해당한다.
- (b) QLoRA는 학습 비용을 줄이는 기법이고 배포 메모리는 줄이지 않는다. 용도는 스타일 어댑터를 만드는 것이다.
- (c) 모르는 점: Ollama에서의 Gemma 4 어댑터 적용 경로, 양자화 기반 위 어댑터의 품질 손실, Gemma 4의 MLX 학습 메모리, 한국어 품질.
