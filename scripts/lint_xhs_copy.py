import argparse
import json
import re
from pathlib import Path


BANNED_PHRASES = [
    "在当今时代",
    "随着技术发展",
    "总的来说",
    "综上所述",
    "值得注意的是",
    "核心在于",
    "赋能",
    "降本增效",
    "闭环",
    "抓手",
    "全链路",
    "底层逻辑",
    "效率提升会更明显",
]

ABSTRACT_WORDS = [
    "提升效率",
    "持续优化",
    "形成体系",
    "沉淀能力",
    "打造流程",
    "重塑工作流",
    "价值最大化",
]


def load_text(path: Path) -> str:
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        body = data.get("body", "")
        title = data.get("title", "")
        return f"{title}\n{body}"
    return path.read_text(encoding="utf-8")


def paragraphs(body: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]


def first_sentence(text: str) -> str:
    return re.split(r"[。！？!?，,；;]\s*", text.strip())[0]


def find_issues(text: str) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    body = text.strip()
    paras = paragraphs(body)

    for phrase in BANNED_PHRASES:
        if phrase in body:
            issues.append({"severity": "high", "type": "banned_phrase", "message": f"Remove or rewrite: {phrase}"})

    for phrase in ABSTRACT_WORDS:
        if phrase in body:
            issues.append({"severity": "medium", "type": "abstract_wording", "message": f"Make this concrete: {phrase}"})

    numbered = re.findall(r"(?m)^\s*(?:0?\d|[一二三四五六七八九十])[\.、｜|]", body)
    if len(numbered) >= 5:
        issues.append({"severity": "medium", "type": "over_numbered", "message": "Too many numbered sections; merge or vary structure."})

    long_paras = [p for p in paras if len(p) > 95]
    if long_paras:
        issues.append({"severity": "medium", "type": "long_paragraph", "message": f"{len(long_paras)} paragraph(s) are too long for Xiaohongshu mobile reading."})

    starts = [first_sentence(p)[:8] for p in paras if p]
    repeated = sorted({s for s in starts if s and starts.count(s) > 1})
    if repeated:
        issues.append({"severity": "medium", "type": "repeated_starts", "message": f"Repeated paragraph openings: {', '.join(repeated)}"})

    concrete_markers = ["我看到", "我试", "后来", "卡在", "返工", "比如", "不要", "不建议", "先", "再"]
    if not any(marker in body for marker in concrete_markers):
        issues.append({"severity": "high", "type": "no_scene", "message": "Add a concrete scene, action, or tradeoff."})

    caveat_markers = ["不建议", "不适合", "注意", "别", "风险", "边界", "但"]
    if not any(marker in body for marker in caveat_markers):
        issues.append({"severity": "medium", "type": "no_caveat", "message": "Add one honest limitation or thing not to do."})

    return issues


def main() -> None:
    parser = argparse.ArgumentParser(description="Lint Xiaohongshu copy for AI-smell patterns.")
    parser.add_argument("--draft", type=Path, required=True, help="Draft JSON or text file.")
    parser.add_argument("--fail-on-high", action="store_true", help="Exit non-zero when high-severity issues exist.")
    args = parser.parse_args()

    text = load_text(args.draft)
    issues = find_issues(text)
    result = {
        "status": "ok" if not issues else "needs_revision",
        "issue_count": len(issues),
        "issues": issues,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.fail_on_high and any(issue["severity"] == "high" for issue in issues):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
