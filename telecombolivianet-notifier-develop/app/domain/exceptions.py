

class WorkerError(Exception):
    """Base para todos los errores del worker. No instanciar directamente."""


class TemplateNotFoundError(WorkerError):
    """No existe plantilla activa para el tipo de notificación."""

    def __init__(self, tipo: str) -> None:
        self.tipo = tipo
        super().__init__(f"Sin plantilla activa para tipo '{tipo}'")


class TypeDisabledError(WorkerError):
    """El tipo de notificación está desactivado en NotifConfigs."""

    def __init__(self, tipo: str) -> None:
        self.tipo = tipo
        super().__init__(f"Tipo de notificación desactivado: '{tipo}'")


class ConfigNotFoundError(WorkerError):
    """No existe configuración para el tipo de notificación."""

    def __init__(self, tipo: str) -> None:
        self.tipo = tipo
        super().__init__(f"Sin configuración para tipo '{tipo}'")


class InvalidPhoneError(WorkerError):
    """El número de teléfono no puede normalizarse a formato E.164."""

    def __init__(self, phone: str) -> None:
        self.phone = phone
        super().__init__(f"Número de teléfono inválido: '{phone}'")
