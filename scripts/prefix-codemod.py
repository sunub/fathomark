"""
Adds Tailwind's `tw:` prefix to the design system's class strings.

It does not guess what a utility looks like. It reads the class names Tailwind
actually generated from the current, unprefixed source and prefixes exactly
those, so the resulting stylesheet has to contain the same rules as before.
Anything it cannot account for is reported rather than rewritten.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PREFIX = "tw:"

# Class names that are markers or our own, not Tailwind utilities, and so must
# NOT be prefixed: `group` and `peer` are targets for group-*/peer-* variants,
# `dark` and `theme-fathomark` are the theme roots, `fm-*` are ours.
# Class names that are ours or the theme's, not Tailwind's, and so must NOT be
# prefixed. `dark` is here because tokens.css declares the variant by hand as
# `@custom-variant dark (&:is(.dark *))`, which names the literal `.dark`.
#
# `group` and `peer` are deliberately NOT here. Under a prefix, Tailwind emits
# its group variants against `.tw\:group\/name`, so the marker class in the
# markup has to carry the prefix too — leaving it bare silently kills every
# group-*/peer-* variant that points at it.
PASSTHROUGH = re.compile(r"^(dark|theme-fathomark)$|^fm-[\w-]+$")

# The only class names the components use that resolve to nothing: no @utility
# declares them and no import supplies them, so they generate no CSS at all.
# They are almost certainly what the dead `@import "shadcn/tailwind.css"` was
# meant to provide. Prefixing them would change nothing and would imply they are
# Tailwind utilities, so they are left alone and reported instead.
#
# This list is checked against the generated stylesheet on every run: anything
# here that Tailwind actually generates is a bug in this list, not in the source.
UNRESOLVED_NAMES = ("shimmer", "scroll-fade-x", "scroll-fade-b")
UNRESOLVED = re.compile(r"(?:^|:)(" + "|".join(UNRESOLVED_NAMES) + r")$")

# `group/name` and `peer/name` markers always take the prefix, whether or not a
# matching variant exists yet. Tailwind only emits `.tw\:group\/name` into the
# stylesheet when something actually uses `group-*/name`, so the generated CSS
# cannot be used to decide this one — and a marker left bare today is a variant
# that silently does nothing the day someone adds it.
MARKER = re.compile(r"^(group|peer)(/[\w-]+)?$")


def known_utilities(css_path: Path) -> set[str]:
    """
    Reads the class names out of the generated stylesheet.

    Hand-written scanner rather than a regex, because Tailwind escapes the
    interesting characters — `.hover\\:bg-muted:hover` and
    `.data-\\[state\\=error\\]\\:border-destructive[data-state="error"]` both
    end their class name at an UNescaped terminator, and a regex that gets that
    wrong silently drops exactly the variants worth prefixing.
    """
    css = css_path.read_text()
    terminators = set(" \t\r\n{},>+~()[]:.#*'\"=;/")
    names: set[str] = set()
    i = 0
    while i < len(css):
        if css[i] != ".":
            i += 1
            continue
        if i > 0 and (css[i - 1].isalnum() or css[i - 1] in "_-\\"):
            i += 1
            continue
        j, out = i + 1, []
        while j < len(css):
            ch = css[j]
            if ch == "\\" and j + 1 < len(css):
                out.append(css[j + 1])
                j += 2
                continue
            if ch in terminators:
                break
            out.append(ch)
            j += 1
        name = "".join(out)
        if name and not name[0].isdigit() and not PASSTHROUGH.match(name):
            names.add(name)
        i = max(j, i + 1)
    return names


def regions(source: str) -> list[tuple[int, int]]:
    """Byte ranges that hold class strings: cva(...), cn(...), className=..."""
    found = []
    for match in re.finditer(r"\b(cva|cn)\s*\(|className=\{|className=|class=", source):
        start = match.end()
        if source[match.start():match.end()].rstrip().endswith(("(", "{")):
            depth, i = 1, start
            openers = {"(": ")", "{": "}"}
            opener = source[match.end() - 1]
            closer = openers[opener]
            while i < len(source) and depth:
                if source[i] == opener:
                    depth += 1
                elif source[i] == closer:
                    depth -= 1
                i += 1
            found.append((start, i))
        else:
            # className="…" — the single literal that follows.
            literal = re.match(r'\s*(["\'])', source[start:])
            if not literal:
                continue
            quote = literal.group(1)
            begin = start + literal.end() - 1
            end = source.find(quote, begin + 1)
            if end != -1:
                found.append((begin, end + 1))
    return found


def rewrite_string(body: str, known: set[str], unknown: list[str], where: str) -> str:
    tokens = body.split()
    if not any(t in known for t in tokens):
        return body  # not a class list
    out, clean = [], True
    for token in tokens:
        # Order matters. `.theme-fathomark`, `.dark` and `.fm-mono` are real
        # selectors in the compiled stylesheet, so they appear in `known` — but
        # they are ours, not Tailwind utilities, and prefixing them silently
        # detaches the theme from every element that carried them.
        if PASSTHROUGH.match(token) or UNRESOLVED.search(token):
            if UNRESOLVED.search(token):
                unknown.append(f"{where}: {token}")
            out.append(token)
        elif token in known or MARKER.match(token):
            out.append(PREFIX + token)
        else:
            clean = False
            unknown.append(f"{where}: {token}  <- UNEXPECTED, string left untouched")
            out.append(token)
    if not clean:
        return body  # leave it entirely alone; a human decides
    # Preserve the original leading/trailing whitespace, which matters when a
    # string is concatenated with another one.
    lead = body[: len(body) - len(body.lstrip())]
    trail = body[len(body.rstrip()):]
    return lead + " ".join(out) + trail


def candidates(source: str):
    """
    Every span of source that might be a class list: quoted strings, and the
    static text between the holes of a template literal.

    Template literals matter more than they look. marker.stories.tsx builds its
    class list as `flex size-4 ... ${ring}`, and `ring` is itself a plain string
    constant assigned to a variable — neither is inside a className= or cva()
    call, and an earlier version of this script silently skipped both.
    """
    for literal in re.finditer(r'(["\'])((?:[^\\\n]|\\.)*?)\1', source):
        yield literal.start(1) + 1, literal.end(2), literal.group(2)

    for template in re.finditer(r"`((?:[^`\\]|\\.)*)`", source):
        body, base = template.group(1), template.start(1)
        cursor = 0
        for hole in re.finditer(r"\$\{(?:[^{}]|\{[^{}]*\})*\}", body):
            if hole.start() > cursor:
                yield base + cursor, base + hole.start(), body[cursor:hole.start()]
            cursor = hole.end()
        if cursor < len(body):
            yield base + cursor, base + len(body), body[cursor:]


def process(path: Path, known: set[str], unknown: list[str]) -> bool:
    source = path.read_text()
    in_region = []
    for begin, finish in regions(source):
        in_region.append((begin, finish))

    def inside(position: int) -> bool:
        return any(b <= position < f for b, f in in_region)

    edits = []
    for begin, finish, body in candidates(source):
        if not body.strip():
            continue
        tokens = body.split()
        known_count = sum(1 for t in tokens if t in known)
        if known_count == 0:
            continue
        """
        A single known token outside a class context is almost always a
        coincidence — `data-slot="table-cell"` is not a utility list, even
        though Tailwind happily generated `.table-cell` from scanning that very
        text. Require either a class context or more than one token.
        """
        if len(tokens) < 2 and not inside(begin):
            continue
        new_body = rewrite_string(body, known, unknown, f"{path.relative_to(ROOT)}")
        if new_body != body:
            edits.append((begin, finish, new_body))

    if not edits:
        return False
    for begin, finish, replacement in sorted(set(edits), reverse=True):
        source = source[:begin] + replacement + source[finish:]
    path.write_text(source)
    return True


def main() -> int:
    known = known_utilities(Path(sys.argv[1]))
    print(f"{len(known)} utility class names generated by the current source")

    alive = [n for n in UNRESOLVED_NAMES if any(k == n or k.endswith(":" + n) for k in known)]
    if alive:
        print(f"UNRESOLVED_NAMES is wrong — Tailwind does generate: {alive}")
        return 1

    targets = sorted(
        {p for pattern in ("src/components/**/*.tsx", "src/docs/**/*.tsx", "src/docs/**/*.mdx", "src/stories/**/*.tsx")
         for p in (ROOT / "design-system").glob(pattern)}
    )
    unknown: list[str] = []
    changed = [p for p in targets if process(p, known, unknown)]

    for path in changed:
        print(f"  rewritten  {path.relative_to(ROOT)}")
    if unknown:
        print("\nNot prefixed — these generate no CSS today:")
        for line in sorted(set(unknown)):
            print(f"  {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
