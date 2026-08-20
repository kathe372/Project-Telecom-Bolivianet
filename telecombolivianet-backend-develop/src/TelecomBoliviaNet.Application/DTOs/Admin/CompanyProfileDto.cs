namespace TelecomBoliviaNet.Application.DTOs.Admin;

/// <summary>
/// Datos de la empresa que encabezan todo documento exportable (PDF, Excel, CSV).
///
/// Antes estaban escritos a mano dentro del generador de reportes, así que cambiar
/// el NIT o la dirección obligaba a recompilar y desplegar. Ahora viven en
/// <c>SystemConfig</c> bajo una sola clave JSON y se editan desde Ajustes.
/// </summary>
public record CompanyProfileDto(
    /// <summary>Nombre comercial, el que va grande en el membrete.</summary>
    string  Name,

    /// <summary>Razón social completa para el pie legal.</summary>
    string? LegalName,

    string? Nit,
    string? Address,
    string? City,
    string? Phone,
    string? Email,
    string? Website,

    /// <summary>Bajada bajo el nombre comercial (ej. "Proveedor de Servicios de Internet").</summary>
    string? Tagline,

    /// <summary>Logo en base64 sin el prefijo <c>data:</c>. Opcional.</summary>
    string? LogoBase64,

    /// <summary>Color de la marca en hex (#RRGGBB) — tiñe cabeceras y acentos.</summary>
    string  PrimaryColor,

    /// <summary>Leyenda del pie de página de cada reporte.</summary>
    string? FooterLegal
)
{
    /// <summary>Línea de contacto compacta: "Av. Siempre Viva 123 · Cochabamba · 71435981".</summary>
    public string ContactLine => string.Join("  ·  ", new[] { Address, City, Phone, Email }
        .Where(s => !string.IsNullOrWhiteSpace(s)));

    /// <summary>Identificación tributaria para el membrete, vacía si no está cargada.</summary>
    public string TaxLine => string.IsNullOrWhiteSpace(Nit) ? string.Empty : $"NIT: {Nit}";
}
