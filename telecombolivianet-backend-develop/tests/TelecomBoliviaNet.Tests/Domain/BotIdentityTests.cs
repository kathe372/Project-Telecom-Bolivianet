using FluentAssertions;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// S-01 — Quién es la cuenta de servicio del chatbot.
/// </summary>
/// <remarks>
/// La regla estaba escrita dos veces y en las dos comparando el correo contra una
/// variable de entorno. Si esa variable faltaba, el chatbot perdía el acceso a 9
/// endpoints <b>en silencio</b>. Ahora manda el rol, y el correo es solo un puente
/// mientras el usuario de producción siga con rol Tecnico.
/// </remarks>
public class BotIdentityTests
{
    private const string Configurado = "chatbot@empresa.bo";

    [Fact]
    public void ConRolBot_EsElChatbot_SinMirarElCorreo()
    {
        // Lo que arregla el hallazgo: el rol basta, así que ya no depende de que
        // SISTEMA_BOT_EMAIL esté bien puesta.
        BotIdentity.EsElChatbot(UserRole.Bot, "cualquier@cosa.bo", Configurado)
            .Should().BeTrue();

        BotIdentity.EsElChatbot(UserRole.Bot, null, null)
            .Should().BeTrue("ni siquiera hace falta que haya correo configurado");
    }

    [Fact]
    public void ElPuenteSigueVivo_MientrasElBotDeProduccionSeaTecnico()
    {
        // Quitar esto antes de aplicar el UPDATE del rol dejaría al chatbot sin
        // acceso a tickets el mismo día del despliegue.
        BotIdentity.EsElChatbot(UserRole.Tecnico, Configurado, Configurado)
            .Should().BeTrue();
    }

    [Fact]
    public void UnTecnicoDeVerdad_NoEsElChatbot()
    {
        BotIdentity.EsElChatbot(UserRole.Tecnico, "juan@empresa.bo", Configurado)
            .Should().BeFalse("un técnico humano solo actúa sobre sus propios tickets");
    }

    [Fact]
    public void SinCorreoConfigurado_CaeAlLiteralHistorico()
    {
        BotIdentity.EsElChatbot(UserRole.Tecnico, BotIdentity.CorreoPorDefecto, null)
            .Should().BeTrue();
    }

    [Theory]
    [InlineData(UserRole.Admin)]
    [InlineData(UserRole.Operador)]
    [InlineData(UserRole.SocioLectura)]
    public void OtrosRoles_NoSonElChatbot_AunqueElCorreoCoincida(UserRole rol)
    {
        // El puente se limita a Tecnico a propósito: si alguien diera de alta a una
        // persona con ese correo y otro rol, no heredaría los permisos del bot.
        BotIdentity.EsElChatbot(rol, Configurado, Configurado).Should().BeFalse();
    }

    // ── Las dos formas de la regla dicen lo mismo ──────────────────────────

    public static TheoryData<UserRole, string, bool> Casos() => new()
    {
        { UserRole.Bot,          "loquesea@x.bo", true  },
        { UserRole.Tecnico,      Configurado,     true  },
        { UserRole.Tecnico,      "juan@x.bo",     false },
        { UserRole.Admin,        Configurado,     false },
        { UserRole.Operador,     "ana@x.bo",      false },
        { UserRole.SocioLectura, "socio@x.bo",    false },
    };

    [Theory]
    [MemberData(nameof(Casos))]
    public void LaExpresionDeConsulta_ExcluyeExactamenteAQuienLaOtraSeñala(
        UserRole rol, string correo, bool esElBot)
    {
        // Una decide en memoria (el guard de los controladores) y la otra se
        // traduce a SQL (el listado de usuarios del panel). No se pueden unificar,
        // así que se atan aquí: si una cambia y la otra no, esto se pone rojo.
        var usuario = new UserSystem
        {
            Id = Guid.NewGuid(), FullName = "Prueba", Email = correo,
            PasswordHash = "x", Role = rol, Status = UserStatus.Activo,
        };

        var loDejaPasarElListado = new[] { usuario }.AsQueryable()
            .Where(BotIdentity.NoEsElChatbot(Configurado))
            .Any();

        loDejaPasarElListado.Should().Be(!esElBot,
            "el listado de usuarios muestra a las personas y esconde al servicio");
    }
}
