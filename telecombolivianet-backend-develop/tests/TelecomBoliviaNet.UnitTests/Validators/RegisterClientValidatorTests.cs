using TelecomBoliviaNet.Application.Clients;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Validators.Clients;

namespace TelecomBoliviaNet.UnitTests.Validators;

/// <summary>
/// SEC-T05/T06: Input validation — FullName regex rejects injection patterns
/// and accepts valid Latin names.
/// </summary>
public class RegisterClientValidatorTests
{
    private readonly RegisterClientValidator _validator = new();

    /// <summary>DTO base válido; cada test sobreescribe solo el campo bajo prueba con `with`.</summary>
    private static RegisterClientDto ValidDto(string fullName) => new(
        FullName:              fullName,
        IdentityCard:          "12345678",
        PhoneMain:             "70000000",
        PhoneSecondary:        null,
        Zone:                  "Sur",
        Street:                null,
        LocationRef:           null,
        GpsLatitude:           null,
        GpsLongitude:          null,
        WinboxNumber:          "W-001",
        InstallationDate:      new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        InstalledByUserId:     Guid.NewGuid(),
        PlanId:                Guid.NewGuid(),
        HasTvCable:            false,
        OnuSerialNumber:       null,
        InstallationCost:      0m,
        PaidInstallation:      false,
        PaidFirstMonth:        false,
        PaymentMethod:         null,
        Bank:                  null,
        PhysicalReceiptNumber: null);

    // SEC-T05: invalid names are rejected
    [Theory]
    [InlineData("<script>alert(1)</script>")]
    [InlineData("'; DROP TABLE clients; --")]
    [InlineData("user@email.com")]
    [InlineData("12345")]
    public void Validator_InvalidFullName_ReturnsError(string name)
    {
        var result = _validator.Validate(ValidDto(name));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "FullName");
    }

    // SEC-T06: valid Latin names pass
    [Theory]
    [InlineData("Juan Pérez García")]
    [InlineData("María José Rodríguez-López")]
    [InlineData("O'Brien Ñoño")]
    [InlineData("Ana Mamani")]
    public void Validator_ValidFullName_Passes(string name)
    {
        var result = _validator.Validate(ValidDto(name));

        result.Errors.Should().NotContain(e => e.PropertyName == "FullName",
            $"'{name}' es un nombre válido y no debe generar error");
    }
}
