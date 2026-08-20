

def mask_phone(phone: str) -> str:
    """Enmascara número dejando prefijo de país y últimos 3 dígitos."""
    if not phone:
        return "***"
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) >= 11:
        return f"{digits[:3]}****{digits[-3:]}"
    if len(digits) >= 4:
        return f"****{digits[-3:]}"
    return "***"
