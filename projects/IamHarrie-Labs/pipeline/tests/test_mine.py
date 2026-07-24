"""Regression coverage for the Co-authored-by trailer parser -- a real bug
shipped once already: a co-author line with no email of its own, followed
immediately by another trailer that does have one, let the name capture
span the newline between them and merged two different people's names
into a single garbled identity (see mine.py's history for the actual
commit this happened on).
"""

from __future__ import annotations

from pipeline.mine import _parse_coauthors


def test_parses_a_normal_single_coauthor_trailer():
    message = "Fix the thing.\n\nCo-authored-by: Jane Doe <jane@example.com>\n"
    assert _parse_coauthors(message) == [("Jane Doe", "jane@example.com")]


def test_parses_multiple_coauthor_trailers():
    message = (
        "Fix the thing.\n\n"
        "Co-authored-by: Jane Doe <jane@example.com>\n"
        "Co-authored-by: John Smith <john@example.com>\n"
    )
    assert _parse_coauthors(message) == [
        ("Jane Doe", "jane@example.com"),
        ("John Smith", "john@example.com"),
    ]


def test_a_coauthor_trailer_with_no_email_does_not_swallow_the_next_line():
    # Real commit message shape: a bare "Co-authored-by: Name" with no
    # email, directly followed by an unrelated trailer that does have one.
    # The bare trailer can't be resolved to a real identity without an
    # email, so it's correctly dropped rather than merged with whatever
    # comes after it on the next line.
    message = "Fix the thing.\n\nCo-authored-by: Jeff Liang\nSigned-off-by: Daira Hopwood <daira@jacaranda.org>\n"
    assert _parse_coauthors(message) == []


def test_a_coauthor_trailer_with_no_email_does_not_swallow_a_later_real_one():
    message = (
        "Fix the thing.\n\n"
        "Co-authored-by: Jeff Liang\n"
        "Co-authored-by: Jane Doe <jane@example.com>\n"
    )
    assert _parse_coauthors(message) == [("Jane Doe", "jane@example.com")]
