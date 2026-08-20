import json
import re


def render(template_text: str, context: dict) -> tuple[str, list[str]]:
    """
    Sustituye {{variable}} con los valores del contexto.

    Retorna:
        (mensaje_renderizado, lista_de_variables_no_resueltas)

    Variables no encontradas se dejan tal cual en el mensaje (para debugging),
    pero se listan en el segundo elemento del tuple para que el caller pueda
    registrar un warning antes de enviar.
    """
    missing: list[str] = []

    def replacer(match: re.Match) -> str:
        key = match.group(1).strip()
        if key in context:
            return str(context[key])
        missing.append(key)
        return match.group(0)

    rendered = re.sub(r"\{\{(\w+)\}\}", replacer, template_text)
    return rendered, missing


def parse_context(context_json: str) -> dict:
    """Deserializa el JSON de contexto almacenado en notif_outbox."""
    try:
        return json.loads(context_json) if context_json else {}
    except (json.JSONDecodeError, TypeError):
        return {}
