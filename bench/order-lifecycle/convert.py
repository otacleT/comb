#!/usr/bin/env python3
"""Build the E3 benchmark project from the Spike 01 order-lifecycle spec.

One-off generator: the output under project/ is committed. Usage:
  python3 bench/order-lifecycle/convert.py .spike/spike/spec/order-lifecycle.md bench/order-lifecycle/project
"""
import pathlib
import re
import sys

src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
out = pathlib.Path(sys.argv[2])

text = re.sub(r"\bREQ-(\d{2})\b", lambda m: f"REQ-ORDER-0{m.group(1)}", src)
purpose, requirements, sections = "", "", []
for part in re.split(r"^## ", text, flags=re.M)[1:]:
    title, _, body = part.partition("\n")
    title, body = title.strip(), body.strip()
    if title == "Purpose":
        purpose = body
    elif title == "Requirements":
        requirements = body
    else:
        # sub-headings inside a section move one level down, below "### Section:"
        sections.append(f"### Section: {title}\n" + re.sub(r"^### ", "#### ", body, flags=re.M) + "\n")

change = out / "comb" / "changes" / "add-order-lifecycle"
(change / "specs" / "order-lifecycle").mkdir(parents=True, exist_ok=True)
(out / "comb" / "specs").mkdir(parents=True, exist_ok=True)
(out / "comb" / "specs" / ".gitkeep").write_text("")
(out / "comb" / "config.yaml").write_text(
    "version: 1\nlanguage: en\nagents: [claude-code]\n"
    "context: \"Kurumi, a C2C marketplace for second-hand goods (like Mercari). MVP order lifecycle.\"\n"
)
(out / "comb" / "decisions.md").write_text("# Decisions\n")
(change / ".comb.yaml").write_text("schema: comb.change/v1\nid: add-order-lifecycle\ncreated: 2026-10-06\nbase: {}\n")
(change / "proposal.md").write_text(
    "# Change: Order lifecycle for the Kurumi MVP\n\n"
    "## Why\nBuyers and sellers need a safe path from \"Buy\" to completion, cancellation or refund, "
    "with Kurumi holding the money until the transaction completes.\n\n"
    "## What Changes\n- Adds the order-lifecycle capability: payment, shipment, delivery, confirmation, "
    "auto-completion, cancellation, disputes, returns, refunds, chargebacks, admin force-cancel and seller payout.\n\n"
    "## Impact\n- Capabilities: order-lifecycle (new)\n- Requirements: REQ-ORDER-001..REQ-ORDER-018 (new)\n"
)
(change / "tasks.md").write_text("- [ ] 1.1 Implement the order lifecycle (REQ-ORDER-001..REQ-ORDER-018)\n")
(change / "specs" / "order-lifecycle" / "spec.md").write_text(
    "---\nprefix: ORDER\n---\n## Purpose\n" + purpose + "\n\n## ADDED Sections\n\n" + "\n".join(sections)
    + "\n## ADDED Requirements\n\n" + requirements + "\n"
)
print("wrote", change)
