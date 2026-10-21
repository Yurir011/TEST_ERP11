def object_particle(word: str) -> str:
    """목적격 조사: 받침이 있으면 "을", 없으면 "를". 한글이 아니면 "을(를)"."""
    last = (word or "").strip()[-1:]
    if not last:
        return "을"
    code = ord(last)
    if code < 0xAC00 or code > 0xD7A3:
        return "을(를)"
    return "를" if (code - 0xAC00) % 28 == 0 else "을"
