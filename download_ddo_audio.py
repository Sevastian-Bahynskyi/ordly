from __future__ import annotations

import argparse
import concurrent.futures
import dataclasses
import datetime as dt
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Iterable
from urllib.parse import quote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag


DDO_SEARCH_URL = "https://ordnet.dk/ddo/ordbog?query="
DEFAULT_OUTPUT_DIR = Path("/Users/seva/Documents/Personal/Danish/Words Audio")
DEFAULT_CONCURRENCY = 4
MAX_CONCURRENCY = 8
MIN_MP3_BYTES = 512
ALLOWED_AUDIO_HOSTS = {"static.ordnet.dk", "ordnet.dk"}
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
    )
}

POS_ALIASES = {
    "noun": {"substantiv", "sb.", "noun"},
    "substantiv": {"substantiv", "sb.", "noun"},
    "verb": {"verbum", "vb.", "verb"},
    "verbum": {"verbum", "vb.", "verb"},
    "adjective": {"adjektiv", "adj.", "adjective"},
    "adjektiv": {"adjektiv", "adj.", "adjective"},
    "adverb": {"adverbium", "adv.", "adverb"},
    "adverbium": {"adverbium", "adv.", "adverb"},
    "pronoun": {"pronomen", "pron.", "pronoun"},
    "pronomen": {"pronomen", "pron.", "pronoun"},
    "preposition": {"præposition", "præp.", "preposition"},
    "præposition": {"præposition", "præp.", "preposition"},
    "conjunction": {"konjunktion", "konj.", "conjunction"},
    "konjunktion": {"konjunktion", "konj.", "conjunction"},
    "numeral": {"talord", "numeral"},
    "talord": {"talord", "numeral"},
    "article": {"artikel", "article"},
    "artikel": {"artikel", "article"},
    "interjection": {"udråbsord", "interjektion", "interjection"},
    "forkortelse": {"forkortelse", "abbreviation"},
    "abbreviation": {"forkortelse", "abbreviation"},
}

DEFAULT_POS_HINTS = {
    "I": "pronoun",
    "i": "preposition",
}


@dataclasses.dataclass(frozen=True)
class LookupTerm:
    raw: str
    word: str
    requested_pos: str | None


@dataclasses.dataclass(frozen=True)
class ArticleCandidate:
    article: Tag
    headwords: tuple[str, ...]
    part_of_speech: str
    score: int


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def parse_terms(raw: str) -> list[LookupTerm]:
    terms: list[LookupTerm] = []
    seen: set[tuple[str, str | None]] = set()
    for part in re.split(r"[,\n;]+", raw):
        value = normalize_text(part)
        if not value:
            continue
        word, requested_pos = split_pos_hint(value)
        key = (word, requested_pos)
        if word and key not in seen:
            terms.append(LookupTerm(raw=value, word=word, requested_pos=requested_pos))
            seen.add(key)
    return terms


def split_pos_hint(value: str) -> tuple[str, str | None]:
    if "|" not in value:
        return value, DEFAULT_POS_HINTS.get(value)
    word, requested_pos = value.rsplit("|", 1)
    word = normalize_text(word)
    requested_pos = normalize_text(requested_pos).casefold()
    return word, requested_pos or DEFAULT_POS_HINTS.get(word)


def clean_headword(value: str) -> str:
    value = re.sub(r"\s+([0-9]+)$", r"\1", normalize_text(value))
    return re.sub(r"(?<=\D)[0-9]+$", "", value).strip()


def headwords_from_article(article: Tag) -> tuple[str, ...]:
    values: list[str] = []
    for heading in article.select(".modern-top-row h2.modern-match, h2.modern-match"):
        clone = BeautifulSoup(str(heading), "html.parser")
        for extra in clone.select(".super"):
            extra.decompose()
        headword = clean_headword(clone.get_text(" ", strip=True))
        if headword:
            values.append(headword)
    return tuple(unique(values))


def part_of_speech_from_article(article: Tag) -> str:
    top_row = article.select_one(".modern-top-row")
    if not isinstance(top_row, Tag):
        return ""
    pos = top_row.select_one(".text-large")
    return normalize_text(pos.get_text(" ", strip=True)) if isinstance(pos, Tag) else ""


def pos_matches(actual_pos: str, requested_pos: str | None) -> bool:
    if not actual_pos or not requested_pos:
        return False
    aliases = POS_ALIASES.get(requested_pos.casefold(), {requested_pos.casefold()})
    actual = actual_pos.casefold()
    return any(alias.casefold() in actual for alias in aliases)


def has_pronunciation_audio(article: Tag) -> bool:
    return bool(article.select_one('#id-udt a[href*=".mp3"], #id-udt source[src*=".mp3"], #id-udt audio[src*=".mp3"]'))


def score_article(article: Tag, term: LookupTerm) -> ArticleCandidate:
    headwords = headwords_from_article(article)
    part_of_speech = part_of_speech_from_article(article)
    score = 0

    if any(headword == term.word for headword in headwords):
        score += 1000
    elif any(headword.casefold() == term.word.casefold() for headword in headwords):
        score += 700

    if pos_matches(part_of_speech, term.requested_pos):
        score += 200
    elif term.requested_pos:
        score -= 50

    if has_pronunciation_audio(article):
        score += 20

    if " " not in term.word and any(" " in headword for headword in headwords):
        score -= 120

    return ArticleCandidate(article=article, headwords=headwords, part_of_speech=part_of_speech, score=score)


def choose_article(soup: BeautifulSoup, term: LookupTerm) -> ArticleCandidate | None:
    articles = [article for article in soup.select(".artikel") if isinstance(article, Tag)]
    if not articles:
        return None
    candidates = [score_article(article, term) for article in articles]
    candidates.sort(key=lambda candidate: candidate.score, reverse=True)
    best = candidates[0]
    has_exact = any(headword == term.word for headword in best.headwords)
    has_casefold_exact = any(headword.casefold() == term.word.casefold() for headword in best.headwords)
    if best.score < 650 or not (has_exact or has_casefold_exact):
        return None
    return best


def audio_url_from_article(article: Tag, page_url: str) -> str:
    selectors = (
        '#id-udt .audio-file a[href*=".mp3"]',
        '#id-udt .audio-file source[src*=".mp3"]',
        '#id-udt .audio-file audio[src*=".mp3"]',
        '.audio-file a[href*=".mp3"]',
        '.audio-file source[src*=".mp3"]',
        '.audio-file audio[src*=".mp3"]',
    )
    for selector in selectors:
        node = article.select_one(selector)
        if not isinstance(node, Tag):
            continue
        value = node.get("href") or node.get("src")
        if value:
            return urljoin(page_url, str(value))
    return ""


def lookup_audio(term: LookupTerm) -> dict[str, object]:
    page_url = DDO_SEARCH_URL + quote(term.word)
    response = request_with_retries(page_url, timeout=20)
    soup = BeautifulSoup(response.text, "lxml")
    candidate = choose_article(soup, term)
    if candidate is None:
        return {
            "word": term.word,
            "requested_pos": term.requested_pos or "",
            "ok": False,
            "status": "failed",
            "page_url": response.url,
            "error": "No exact DDO article match",
        }

    audio_url = audio_url_from_article(candidate.article, response.url)
    if not audio_url:
        return {
            "word": term.word,
            "requested_pos": term.requested_pos or "",
            "ok": False,
            "status": "failed",
            "page_url": response.url,
            "headwords": list(candidate.headwords),
            "part_of_speech": candidate.part_of_speech,
            "selection_score": candidate.score,
            "error": "Selected DDO article has no pronunciation MP3",
        }

    return {
        "word": term.word,
        "requested_pos": term.requested_pos or "",
        "ok": True,
        "status": "found",
        "audio_url": audio_url,
        "page_url": response.url,
        "headwords": list(candidate.headwords),
        "part_of_speech": candidate.part_of_speech,
        "selection_score": candidate.score,
    }


def request_with_retries(url: str, timeout: int) -> requests.Response:
    last_error: requests.RequestException | None = None
    for attempt in range(4):
        try:
            response = requests.get(url, headers=HEADERS, timeout=timeout)
            if response.status_code in {429, 500, 502, 503, 504} and attempt < 3:
                retry_after = response.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else 1.5 * (attempt + 1)
                time.sleep(delay)
                continue
            response.raise_for_status()
            return response
        except requests.RequestException as error:
            last_error = error
            if attempt == 3:
                break
            time.sleep(1.5 * (attempt + 1))
    if last_error:
        raise last_error
    raise requests.RequestException("Request failed")


def clean_filename(word: str) -> str:
    safe = re.sub(r'[\\/:*?"<>|]+', "_", word.strip())
    safe = re.sub(r"\s+", " ", safe)
    return safe or "word"


def target_paths(terms: Iterable[LookupTerm], output_dir: Path) -> dict[str, Path]:
    paths: dict[str, Path] = {}
    used: set[str] = set()
    for term in terms:
        base = clean_filename(term.word)
        candidate = base
        index = 2
        while candidate.casefold() in used:
            candidate = f"{base} {index}"
            index += 1
        used.add(candidate.casefold())
        paths[term.raw] = output_dir / f"{candidate}.mp3"
    return paths


def audio_url_allowed(audio_url: str) -> bool:
    parsed = urlparse(audio_url)
    return parsed.scheme == "https" and parsed.hostname in ALLOWED_AUDIO_HOSTS


def is_valid_mp3(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < MIN_MP3_BYTES:
        return False
    try:
        header = path.read_bytes()[:3]
    except OSError:
        return False
    return header == b"ID3" or header[:2] in {b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"}


def download_mp3(term: LookupTerm, output_path: Path, skip_existing: bool, dry_run: bool) -> dict[str, object]:
    if is_valid_mp3(output_path) and skip_existing:
        return {
            "word": term.word,
            "requested_pos": term.requested_pos or "",
            "ok": True,
            "status": "skipped",
            "path": str(output_path),
        }

    try:
        lookup = lookup_audio(term)
    except requests.RequestException as error:
        return failure(term, "lookup_failed", safe_error(error))

    if lookup.get("ok") is not True:
        return lookup

    audio_url = str(lookup.get("audio_url") or "")
    if not audio_url_allowed(audio_url):
        return failure(term, "failed", "Unsafe or unsupported audio URL")

    if dry_run:
        lookup["status"] = "dry_run"
        lookup["path"] = str(output_path)
        return lookup

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_name(f".{output_path.name}.{os.getpid()}.part")
    try:
        response = request_with_retries(audio_url, timeout=30)
        temp_path.write_bytes(response.content)
        if not is_valid_mp3(temp_path):
            temp_path.unlink(missing_ok=True)
            return failure(term, "failed", "Downloaded file is not a valid MP3")
        temp_path.replace(output_path)
    except (OSError, requests.RequestException) as error:
        temp_path.unlink(missing_ok=True)
        return failure(term, "failed", safe_error(error))

    lookup["status"] = "saved"
    lookup["path"] = str(output_path)
    return lookup


def failure(term: LookupTerm, status: str, error: str) -> dict[str, object]:
    return {
        "word": term.word,
        "requested_pos": term.requested_pos or "",
        "ok": False,
        "status": status,
        "error": error,
    }


def safe_error(error: BaseException | str) -> str:
    return normalize_text(str(error))[:240]


def unique(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        key = value.casefold()
        if value and key not in seen:
            result.append(value)
            seen.add(key)
    return result


def write_report(results: list[dict[str, object]], output_dir: Path, dry_run: bool) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    report_path = output_dir / f"ddo_audio_report_{timestamp}.json"
    payload = {
        "created_at": dt.datetime.now(dt.UTC).isoformat(),
        "dry_run": dry_run,
        "output_dir": str(output_dir),
        "total": len(results),
        "saved": sum(1 for item in results if item.get("status") == "saved"),
        "skipped": sum(1 for item in results if item.get("status") == "skipped"),
        "dry_run_found": sum(1 for item in results if item.get("status") == "dry_run"),
        "failed": sum(1 for item in results if item.get("ok") is False),
        "items": results,
    }
    report_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return report_path


def run_batch(input_path: Path, output_dir: Path, concurrency: int, skip_existing: bool, dry_run: bool) -> tuple[list[dict[str, object]], Path]:
    raw = input_path.read_text(encoding="utf-8")
    terms = parse_terms(raw)
    paths = target_paths(terms, output_dir)
    worker_count = max(1, min(concurrency, MAX_CONCURRENCY, len(terms) or 1))
    results: list[dict[str, object] | None] = [None] * len(terms)

    def run(index: int, term: LookupTerm) -> tuple[int, dict[str, object]]:
        return index, download_mp3(term, paths[term.raw], skip_existing=skip_existing, dry_run=dry_run)

    with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = [executor.submit(run, index, term) for index, term in enumerate(terms)]
        for future in concurrent.futures.as_completed(futures):
            index, result = future.result()
            results[index] = result
            print_status(result)

    finished = [item for item in results if item is not None]
    return finished, write_report(finished, output_dir, dry_run=dry_run)


def print_status(result: dict[str, object]) -> None:
    word = str(result.get("word", ""))
    status = str(result.get("status", ""))
    if result.get("ok") is True:
        detail = str(result.get("path") or result.get("audio_url") or "")
        print(f"{word}: {status} {detail}".rstrip(), flush=True)
        return
    print(f"{word}: failed {result.get('error', '')}", flush=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Download exact DDO pronunciation MP3 files for words in a text file.")
    parser.add_argument("input", nargs="?", type=Path, default=Path("words.txt"), help="Text file with words separated by comma, newline, or semicolon.")
    parser.add_argument("-o", "--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Directory for downloaded MP3 files.")
    parser.add_argument("-j", "--concurrency", type=int, default=DEFAULT_CONCURRENCY, help="Parallel workers, capped at 8.")
    parser.add_argument("--skip-existing", action="store_true", help="Keep existing valid MP3 files instead of replacing them.")
    parser.add_argument("--dry-run", action="store_true", help="Resolve exact DDO audio URLs without writing MP3 files.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    input_path = args.input.expanduser()
    output_dir = args.output_dir.expanduser()
    if not input_path.is_file():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 2

    results, report_path = run_batch(
        input_path=input_path,
        output_dir=output_dir,
        concurrency=args.concurrency,
        skip_existing=args.skip_existing,
        dry_run=args.dry_run,
    )
    saved = sum(1 for item in results if item.get("status") == "saved")
    skipped = sum(1 for item in results if item.get("status") == "skipped")
    dry_run_found = sum(1 for item in results if item.get("status") == "dry_run")
    failed = sum(1 for item in results if item.get("ok") is False)
    print(f"Total: {len(results)}")
    print(f"Saved: {saved}")
    print(f"Already present: {skipped}")
    print(f"Dry-run found: {dry_run_found}")
    print(f"Failed: {failed}")
    print(f"Report: {report_path}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
