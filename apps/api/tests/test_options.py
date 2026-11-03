from src.rag.options import OptionsFilter


def _run(tokens: list[str]) -> tuple[str, list[str]]:
    choices = OptionsFilter()
    shown = "".join(choices.feed(t) for t in tokens)
    tail, options = choices.finish()
    return shown + tail, options


def test_plain_reply_passes_through() -> None:
    assert _run(["退貨要", "在 21 天內", "申請。"]) == ("退貨要在 21 天內申請。", [])


def test_marker_split_across_tokens_is_held_back() -> None:
    text, options = _run(["請問你是哪一種？\n[", "[opt", "ions: 一般會員 ｜ 企業", "客戶]]"])
    assert text == "請問你是哪一種？\n"
    assert options == ["一般會員", "企業客戶"]


def test_a_lone_bracket_is_not_swallowed() -> None:
    assert _run(["價格是 [", "見附表]"]) == ("價格是 [見附表]", [])


def test_choices_are_capped() -> None:
    _, options = _run(["Which? [[options: a | b | c | d | e]]"])
    assert options == ["a", "b", "c", "d"]
