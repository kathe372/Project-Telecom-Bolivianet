using FluentValidation;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.DTOs.Plans;

namespace TelecomBoliviaNet.Application.Validators.Clients;

public class RegisterClientValidator : AbstractValidator<RegisterClientDto>
{
    private static readonly string[] ValidMethods = ["Efectivo", "DepositoBancario", "QR"];

    public RegisterClientValidator()
    {
        RuleFor(x => x.FullName)
            .NotEmpty().WithMessage("El nombre completo es obligatorio.")
            .MaximumLength(150).WithMessage("El nombre no puede exceder 150 caracteres.")
            .Matches(@"^[\p{L}\s\-\.\']{2,150}$").WithMessage("El nombre solo puede contener letras, espacios y guiones.");

        RuleFor(x => x.IdentityCard)
            .NotEmpty().WithMessage("El carnet de identidad es obligatorio.")
            .MaximumLength(20).WithMessage("El CI no puede exceder 20 caracteres.")
            .Matches(@"^[A-Za-z0-9\-]{4,20}$").WithMessage("El CI solo puede contener letras, números y guiones.");

        RuleFor(x => x.PhoneMain)
            .NotEmpty().WithMessage("El teléfono principal (WhatsApp) es obligatorio.")
            .MaximumLength(20).WithMessage("El teléfono no puede exceder 20 caracteres.")
            .Matches(@"^\+?[0-9\s\-]{7,20}$").WithMessage("Número de teléfono inválido (solo dígitos, espacios y guiones).");

        RuleFor(x => x.Zone)
            .NotEmpty().WithMessage("La zona o barrio es obligatoria.");

        RuleFor(x => x.WinboxNumber)
            .NotEmpty().WithMessage("El número Winbox es obligatorio.")
            .MaximumLength(50).WithMessage("El número Winbox no puede exceder 50 caracteres.");

        RuleFor(x => x.InstallationDate)
            .NotEmpty().WithMessage("La fecha de instalación es obligatoria.")
            .LessThanOrEqualTo(DateTime.UtcNow.AddDays(1))
            .WithMessage("La fecha de instalación no puede ser futura.");

        RuleFor(x => x.InstalledByUserId)
            .NotEmpty().WithMessage("El técnico instalador es obligatorio.");

        RuleFor(x => x.PlanId)
            .NotEmpty().WithMessage("El plan contratado es obligatorio.");

        RuleFor(x => x.InstallationCost)
            .GreaterThanOrEqualTo(0).WithMessage("El costo de instalación no puede ser negativo.");

        RuleFor(x => x.PaymentMethod)
            .Must(m => m == null || ValidMethods.Contains(m))
            .WithMessage($"El método de pago debe ser: {string.Join(", ", ValidMethods)}.")
            .When(x => x.PaidInstallation || x.PaidFirstMonth);

        RuleFor(x => x.Bank)
            .NotEmpty().WithMessage("El banco es obligatorio para depósito o QR.")
            .When(x => x.PaymentMethod is "DepositoBancario" or "QR");
    }
}

public class UpdateClientValidator : AbstractValidator<UpdateClientDto>
{
    public UpdateClientValidator()
    {
        RuleFor(x => x.FullName)
            .NotEmpty().WithMessage("El nombre completo es obligatorio.")
            .MaximumLength(150)
            .Matches(@"^[\p{L}\s\-\.\']{2,150}$").WithMessage("El nombre solo puede contener letras, espacios y guiones.");

        RuleFor(x => x.IdentityCard)
            .NotEmpty().WithMessage("El carnet de identidad es obligatorio.")
            .MaximumLength(20)
            .Matches(@"^[A-Za-z0-9\-]{4,20}$").WithMessage("El CI solo puede contener letras, números y guiones.");

        RuleFor(x => x.PhoneMain)
            .NotEmpty().WithMessage("El teléfono principal es obligatorio.")
            .MaximumLength(20)
            .Matches(@"^\+?[0-9\s\-]{7,20}$").WithMessage("Número de teléfono inválido.");

        RuleFor(x => x.Zone)
            .NotEmpty().WithMessage("La zona es obligatoria.");

        RuleFor(x => x.WinboxNumber)
            .NotEmpty().WithMessage("El número Winbox es obligatorio.");

        RuleFor(x => x.PlanId)
            .NotEmpty().WithMessage("El plan es obligatorio.");
    }
}

public class RegisterPaymentValidator : AbstractValidator<RegisterPaymentDto>
{
    private static readonly string[] ValidMethods = ["Efectivo", "DepositoBancario", "QR"];

    public RegisterPaymentValidator()
    {
        RuleFor(x => x.ClientId)
            .NotEmpty().WithMessage("El cliente es obligatorio.");

        RuleFor(x => x.Amount)
            .GreaterThan(0).WithMessage("El monto debe ser mayor a cero.");

        RuleFor(x => x.Method)
            .NotEmpty().WithMessage("El método de pago es obligatorio.")
            .Must(m => ValidMethods.Contains(m))
            .WithMessage($"El método de pago debe ser: {string.Join(", ", ValidMethods)}.");

        RuleFor(x => x.Bank)
            .NotEmpty().WithMessage("El banco es obligatorio para depósito o QR.")
            .When(x => x.Method is "DepositoBancario" or "QR");

        RuleFor(x => x.PaidAt)
            .NotEmpty().WithMessage("La fecha de pago es obligatoria.")
            .LessThanOrEqualTo(DateTime.UtcNow.AddDays(1))
            .WithMessage("La fecha de pago no puede ser futura.");

        RuleFor(x => x.InvoiceIds)
            .NotEmpty().WithMessage("Debe seleccionar al menos una factura.");
    }
}

public class CreatePlanValidator : AbstractValidator<CreatePlanDto>
{
    public CreatePlanValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("El nombre del plan es obligatorio.")
            .MaximumLength(100);

        RuleFor(x => x.SpeedMb)
            .GreaterThan(0).WithMessage("La velocidad debe ser mayor a 0 Mb.");

        RuleFor(x => x.MonthlyPrice)
            .GreaterThan(0).WithMessage("El precio mensual debe ser mayor a 0.");
    }
}

public class UpdatePlanValidator : AbstractValidator<UpdatePlanDto>
{
    public UpdatePlanValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("El nombre del plan es obligatorio.")
            .MaximumLength(100);

        RuleFor(x => x.SpeedMb)
            .GreaterThan(0).WithMessage("La velocidad debe ser mayor a 0 Mb.");

        RuleFor(x => x.MonthlyPrice)
            .GreaterThan(0).WithMessage("El precio mensual debe ser mayor a 0.");
    }
}


public class RejectChangeValidator : AbstractValidator<RejectChangeDto>
{
    public RejectChangeValidator()
    {
        RuleFor(x => x.Motivo)
            .NotEmpty().WithMessage("El motivo de rechazo es obligatorio.")
            .MinimumLength(10).WithMessage("El motivo debe tener al menos 10 caracteres.")
            .MaximumLength(500).WithMessage("El motivo no puede superar los 500 caracteres.");
    }
}
