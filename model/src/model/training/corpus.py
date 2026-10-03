"""Read a selected writing corpus and split it before tokenization."""

import hashlib
import os
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class Document:
    path: str
    text: str
    sha256: str


class Tokenizer(Protocol):
    eos_token_id: int | None

    def encode(self, text: str, *, add_special_tokens: bool) -> list[int]: ...


def load_documents(
    folder: Path, *, excluded_relative_dirs: frozenset[str] = frozenset()
) -> list[Document]:
    """Load unique UTF-8 Markdown/text documents without following symlinks.

    Paths in the result are relative to the explicitly selected folder. Hidden
    files and directories are excluded, including Obsidian's configuration.
    """
    folder = Path(folder)
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError(
            f"Corpus folder must be an existing non-symlink directory: {folder}"
        )
    excluded = set()
    for value in excluded_relative_dirs:
        relative = Path(value)
        if relative.is_absolute() or not relative.parts or ".." in relative.parts:
            raise ValueError(f"Excluded directory must be relative to the corpus: {value}")
        excluded.add(relative.as_posix().rstrip("/"))

    def walk_error(error: OSError) -> None:
        raise ValueError(f"Cannot read corpus folder: {error}") from error

    paths = []
    for directory, directories, filenames in os.walk(
        folder, followlinks=False, onerror=walk_error
    ):
        directory = Path(directory)
        relative_directory = directory.relative_to(folder)
        directories[:] = sorted(
            name
            for name in directories
            if not name.startswith(".")
            and not (directory / name).is_symlink()
            and (relative_directory / name).as_posix() not in excluded
        )
        paths.extend(
            directory / name
            for name in filenames
            if not name.startswith(".")
            and Path(name).suffix.lower() in {".md", ".txt"}
            and not (directory / name).is_symlink()
            and (directory / name).is_file()
        )

    documents = []
    seen = set()
    for path in sorted(paths, key=lambda item: item.relative_to(folder).as_posix()):
        try:
            text = path.read_text(encoding="utf-8").replace("\r\n", "\n").strip()
        except (OSError, UnicodeError) as error:
            raise ValueError(
                f"Cannot read UTF-8 corpus document {path}: {error}"
            ) from error
        if not text or text in seen:
            continue
        seen.add(text)
        documents.append(
            Document(
                path.relative_to(folder).as_posix(),
                text,
                hashlib.sha256(text.encode("utf-8")).hexdigest(),
            )
        )
    return documents


def split_documents(
    documents: list[Document], validation_fraction: float = 0.2, seed: int = 42
) -> tuple[list[Document], list[Document]]:
    """Make a reproducible document-level split, excluding exact duplicates."""
    if not 0 < validation_fraction < 1:
        raise ValueError("validation_fraction must be between 0 and 1, exclusively")
    unique = {}
    for document in sorted(
        documents, key=lambda item: (item.path, item.sha256, item.text)
    ):
        unique.setdefault(document.text, document)
    shuffled = list(unique.values())
    if len(shuffled) < 2:
        raise ValueError("Training requires at least 2 distinct documents")
    random.Random(seed).shuffle(shuffled)
    validation_count = max(
        1, min(len(shuffled) - 1, int(len(shuffled) * validation_fraction))
    )
    return shuffled[validation_count:], shuffled[:validation_count]


def token_chunks(
    documents: list[Document], tokenizer: Tokenizer, max_length: int = 512
) -> list[list[int]]:
    """Tokenize each document separately, preserving transitions at chunk edges."""
    if max_length < 2:
        raise ValueError("max_length must be at least 2")
    eos = tokenizer.eos_token_id
    if eos is None:
        raise ValueError("Tokenizer must provide an EOS token ID")
    chunks = []
    for document in documents:
        tokens = list(tokenizer.encode(document.text, add_special_tokens=False)) + [eos]
        for start in range(0, len(tokens) - 1, max_length - 1):
            chunks.append(tokens[start : start + max_length])
    return chunks
