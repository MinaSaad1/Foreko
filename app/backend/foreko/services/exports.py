"""PDF export of analysis results using reportlab (lightweight, no browser)."""

from __future__ import annotations

import base64
import io
from datetime import datetime
from typing import Any


ACCENT = "#00B8C9"
INK = "#111318"
INK_MUTED = "#5a5d66"
RULE = "#DADCE1"
HEADER_BG = "#1A1D25"
HEADER_FG = "#F0F2F5"
ZEBRA = "#F5F6F8"


def _strip_data_url(s: str) -> str:
    """Return raw base64 payload for a possibly data-url-prefixed PNG string."""
    if not isinstance(s, str):
        return ""
    if s.startswith("data:"):
        idx = s.find(",")
        return s[idx + 1 :] if idx != -1 else ""
    return s


def analysis_to_pdf(title: str, sections: list[dict[str, Any]]) -> bytes:
    """Render structured sections into a PDF.

    Each section is a dict; supported shapes (mix freely in the same document):

    - ``{heading, body}`` — paragraph text (newlines become line breaks)
    - ``{heading, table: {headers, rows}}`` — tabular data
    - ``{heading, kv: [[label, value], ...]}`` — compact fact grid (two columns)
    - ``{heading, image_base64, caption?}`` — embedded PNG scaled to content width

    A section may mix body/table/kv/image (rendered in that order). Set
    ``page_break: True`` to force a new page after the section.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import (
        Image,
        KeepTogether,
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=title,
    )
    content_width = doc.width

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleDark",
        parent=styles["Title"],
        textColor=colors.HexColor(INK),
        fontSize=22,
        leading=26,
        spaceAfter=2 * mm,
        alignment=0,
    )
    h2_style = ParagraphStyle(
        "H2Dark",
        parent=styles["Heading2"],
        textColor=colors.HexColor(INK),
        fontSize=13,
        leading=16,
        spaceBefore=6 * mm,
        spaceAfter=1 * mm,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#2a2d35"),
    )
    meta_style = ParagraphStyle(
        "Meta",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor(INK_MUTED),
        spaceAfter=5 * mm,
    )
    caption_style = ParagraphStyle(
        "Caption",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor(INK_MUTED),
        alignment=1,  # center
        spaceBefore=1 * mm,
        spaceAfter=2 * mm,
    )
    kv_label_style = ParagraphStyle(
        "KVLabel",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor(INK_MUTED),
    )
    kv_value_style = ParagraphStyle(
        "KVValue",
        parent=styles["BodyText"],
        fontSize=11,
        leading=14,
        textColor=colors.HexColor(INK),
        fontName="Helvetica-Bold",
    )

    def render_heading(text: str) -> list:
        flow = [Paragraph(text, h2_style)]
        # Thin accent rule under the heading.
        rule = Table(
            [[""]],
            colWidths=[content_width],
            rowHeights=[0.8],
        )
        rule.setStyle(
            TableStyle(
                [
                    ("LINEBELOW", (0, 0), (-1, -1), 0.8, colors.HexColor(ACCENT)),
                ]
            )
        )
        flow.append(rule)
        flow.append(Spacer(1, 2 * mm))
        return flow

    def render_body(body: str) -> list:
        flow: list = []
        for para in body.split("\n\n"):
            if para.strip():
                flow.append(Paragraph(para.replace("\n", "<br/>"), body_style))
                flow.append(Spacer(1, 2 * mm))
        return flow

    def render_table(table: dict[str, Any]) -> list:
        rows = table.get("rows") or []
        if not rows:
            return []
        headers = table.get("headers") or []
        data = ([headers] + rows) if headers else rows
        t = Table(data, hAlign="LEFT", repeatRows=1 if headers else 0)
        style = [
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor(RULE)),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        if headers:
            style += [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(HEADER_BG)),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor(HEADER_FG)),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(ZEBRA)]),
            ]
        else:
            style += [("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor(ZEBRA)])]
        t.setStyle(TableStyle(style))
        return [t, Spacer(1, 3 * mm)]

    def render_kv(items: list[Any]) -> list:
        # Normalize entries; accept either [label, value] or {"label", "value"}.
        pairs: list[tuple[str, str]] = []
        for it in items:
            if isinstance(it, dict):
                label = str(it.get("label", ""))
                value = str(it.get("value", ""))
            elif isinstance(it, (list, tuple)) and len(it) >= 2:
                label, value = str(it[0]), str(it[1])
            else:
                continue
            pairs.append((label, value))
        if not pairs:
            return []

        # Lay out as a 2-column grid: each cell is a (label, value) stack.
        cols = 2
        cell_pad = 3 * mm
        col_width = (content_width - cell_pad) / cols

        def cell_flow(label: str, value: str) -> list:
            return [
                Paragraph(label.upper(), kv_label_style),
                Paragraph(value, kv_value_style),
            ]

        # Pad to full rows.
        padded = list(pairs)
        if len(padded) % cols != 0:
            padded += [("", "")] * (cols - len(padded) % cols)

        rows = []
        for i in range(0, len(padded), cols):
            rows.append([cell_flow(*padded[i + c]) for c in range(cols)])

        t = Table(rows, colWidths=[col_width] * cols)
        t.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), cell_pad),
                    ("TOPPADDING", (0, 0), (-1, -1), 1.5 * mm),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5 * mm),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor(RULE)),
                ]
            )
        )
        return [t, Spacer(1, 3 * mm)]

    def render_image(image_b64: str, caption: str | None) -> list:
        payload = _strip_data_url(image_b64)
        if not payload:
            return []
        try:
            raw = base64.b64decode(payload, validate=False)
        except Exception:
            return []
        reader = ImageReader(io.BytesIO(raw))
        iw, ih = reader.getSize()
        if iw <= 0 or ih <= 0:
            return []
        # Scale to content width, preserve aspect.
        draw_w = content_width
        draw_h = draw_w * (ih / iw)
        # Cap at 60% of the usable page height so a chart never eats a whole page.
        max_h = doc.height * 0.6
        if draw_h > max_h:
            draw_h = max_h
            draw_w = draw_h * (iw / ih)
        img = Image(io.BytesIO(raw), width=draw_w, height=draw_h)
        block: list = [img]
        if caption:
            block.append(Paragraph(caption, caption_style))
        else:
            block.append(Spacer(1, 2 * mm))
        # Keep image + caption on the same page when possible.
        return [KeepTogether(block)]

    story: list = []
    story.append(Paragraph(title, title_style))
    story.append(
        Paragraph(
            f"Foreko forecasting report · generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
            meta_style,
        )
    )

    for sec in sections:
        heading = sec.get("heading")
        if heading:
            story.extend(render_heading(heading))

        body = sec.get("markdown") or sec.get("body")
        if body:
            story.extend(render_body(str(body)))

        kv = sec.get("kv")
        if kv:
            story.extend(render_kv(kv))

        table = sec.get("table")
        if table:
            story.extend(render_table(table))

        image_b64 = sec.get("image_base64") or sec.get("image")
        if image_b64:
            story.extend(render_image(image_b64, sec.get("caption")))

        if sec.get("page_break"):
            story.append(PageBreak())

    doc.build(story)
    return buf.getvalue()
