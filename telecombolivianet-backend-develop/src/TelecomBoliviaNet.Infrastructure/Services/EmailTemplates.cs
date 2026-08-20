namespace TelecomBoliviaNet.Infrastructure.Services;

/// <summary>
/// Plantillas HTML compartidas por los proveedores de email (Resend, SMTP).
/// </summary>
public static class EmailTemplates
{
    public static string PasswordReset(string name, string resetLink, int expiryHours) => $"""
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr><td style="background:#1e40af;padding:32px 40px;text-align:center;">
                  <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">TelecomBoliviaNet</h1>
                  <p style="margin:6px 0 0;color:#93c5fd;font-size:13px;">Sistema de Gestión</p>
                </td></tr>
                <!-- Cuerpo -->
                <tr><td style="padding:40px;">
                  <h2 style="margin:0 0 12px;color:#111827;font-size:20px;font-weight:700;">Recuperación de contraseña</h2>
                  <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">
                    Hola <strong>{name}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta.
                    Haz clic en el botón para continuar:
                  </p>
                  <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                    <tr><td style="background:#1e40af;border-radius:8px;padding:14px 32px;text-align:center;">
                      <a href="{resetLink}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                        Restablecer contraseña
                      </a>
                    </td></tr>
                  </table>
                  <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
                    Si no solicitaste este cambio, puedes ignorar este correo — tu contraseña seguirá siendo la misma.
                  </p>
                  <p style="margin:0;color:#9ca3af;font-size:12px;">Este enlace expira en <strong>{expiryHours} hora{(expiryHours == 1 ? "" : "s")}</strong>.</p>
                </td></tr>
                <!-- Footer -->
                <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
                  <p style="margin:0;color:#9ca3af;font-size:12px;">
                    TelecomBoliviaNet · Cochabamba, Bolivia<br>
                    Si tienes problemas, contacta al administrador del sistema.
                  </p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
        """;

    public static string AccountActivation(string name, string activationLink, int expiryHours) => $"""
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                <tr><td style="background:#1e40af;padding:32px 40px;text-align:center;">
                  <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">TelecomBoliviaNet</h1>
                  <p style="margin:6px 0 0;color:#93c5fd;font-size:13px;">Sistema de Gestión</p>
                </td></tr>
                <tr><td style="padding:40px;">
                  <h2 style="margin:0 0 12px;color:#111827;font-size:20px;font-weight:700;">Activa tu cuenta</h2>
                  <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">
                    Hola <strong>{name}</strong>, el administrador ha creado una cuenta para ti en TelecomBoliviaNet.
                    Haz clic en el botón para activar tu cuenta y elegir tu contraseña:
                  </p>
                  <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                    <tr><td style="background:#1e40af;border-radius:8px;padding:14px 32px;text-align:center;">
                      <a href="{activationLink}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                        Activar mi cuenta
                      </a>
                    </td></tr>
                  </table>
                  <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
                    Si no esperabas este correo, puedes ignorarlo sin problema.
                  </p>
                  <p style="margin:0;color:#9ca3af;font-size:12px;">Este enlace expira en <strong>{expiryHours} hora{(expiryHours == 1 ? "" : "s")}</strong>.</p>
                </td></tr>
                <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
                  <p style="margin:0;color:#9ca3af;font-size:12px;">
                    TelecomBoliviaNet · Cochabamba, Bolivia<br>
                    Si tienes problemas con el enlace, contacta al administrador del sistema.
                  </p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
        """;

    public static string PasswordChanged(string name) => $"""
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                <tr><td style="background:#1e40af;padding:32px 40px;text-align:center;">
                  <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">TelecomBoliviaNet</h1>
                  <p style="margin:6px 0 0;color:#93c5fd;font-size:13px;">Sistema de Gestión</p>
                </td></tr>
                <tr><td style="padding:40px;">
                  <h2 style="margin:0 0 12px;color:#111827;font-size:20px;font-weight:700;">Contraseña actualizada</h2>
                  <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">
                    Hola <strong>{name}</strong>, tu contraseña fue restablecida exitosamente.
                  </p>
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
                    <p style="margin:0;color:#166534;font-size:14px;">
                      ✓ Tu cuenta está protegida con tu nueva contraseña.
                    </p>
                  </div>
                  <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                    Si no realizaste este cambio, contacta de inmediato al administrador del sistema.
                  </p>
                </td></tr>
                <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
                  <p style="margin:0;color:#9ca3af;font-size:12px;">
                    TelecomBoliviaNet · Cochabamba, Bolivia
                  </p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
        """;
}
