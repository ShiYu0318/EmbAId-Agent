import pytest

from src.ingestion.loaders import DocumentParseError, load_document


def build_pdf(lines: list[str], title: str | None = None) -> bytes:
    """A small, valid, uncompressed PDF with one page of text."""
    text_ops = " ".join(f"({line}) Tj 0 -18 Td" for line in lines)
    stream = f"BT /F1 12 Tf 72 720 Td {text_ops} ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    if title is not None:
        objects.append(f"<< /Title ({title}) >>".encode())

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (number, body)
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    info = b" /Info 6 0 R" if title is not None else b""
    out += b"trailer\n<< /Size %d /Root 1 0 R%s >>\n" % (len(objects) + 1, info)
    out += b"startxref\n%d\n%%%%EOF\n" % xref
    return bytes(out)


def test_pdf_text_and_embedded_title_are_extracted() -> None:
    data = build_pdf(["Refunds are accepted within 30 days.", "Contact support."], "Refund Policy")

    loaded = load_document(data, filename="policy.pdf")

    assert loaded.format == "pdf"
    assert loaded.title == "Refund Policy"
    assert "Refunds are accepted within 30 days." in loaded.text
    assert "Contact support." in loaded.text


def test_pdf_without_a_title_falls_back_to_the_filename_or_text() -> None:
    loaded = load_document(build_pdf(["Shipping takes five days."]), filename="shipping.pdf")

    assert loaded.title
    assert "Shipping takes five days." in loaded.text


def test_pdf_is_detected_from_its_content_type() -> None:
    loaded = load_document(build_pdf(["Hello."]), content_type="application/pdf")

    assert loaded.format == "pdf"
    assert "Hello." in loaded.text


def test_a_corrupt_pdf_is_reported_as_a_parse_error() -> None:
    with pytest.raises(DocumentParseError):
        load_document(b"%PDF-1.4\nthis is not a pdf at all", filename="broken.pdf")
