using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Domain.Entities.Clients;

public class Client : Entity
{
    public string TbnCode { get; set; } = string.Empty;

    public string  FullName        { get; set; } = string.Empty;
    public string  IdentityCard    { get; set; } = string.Empty;
    public string  PhoneMain       { get; set; } = string.Empty;
    public string? PhoneSecondary  { get; set; }

    public string   Zone          { get; set; } = string.Empty;
    public string?  Street        { get; set; }
    public string?  LocationRef   { get; set; }
    public decimal? GpsLatitude   { get; set; }
    public decimal? GpsLongitude  { get; set; }

    public string   WinboxNumber      { get; set; } = string.Empty;
    public DateTime InstallationDate  { get; set; }
    public Guid     InstalledByUserId { get; set; }
    public UserSystem? InstalledBy    { get; set; }
    public Guid     PlanId            { get; set; }
    public Plan?    Plan              { get; set; }
    public bool     HasTvCable        { get; set; }
    public string?  OnuSerialNumber   { get; set; }

    public ClientStatus Status      { get; private set; } = ClientStatus.Activo;
    public DateTime?    SuspendedAt { get; private set; }
    public DateTime?    CancelledAt { get; private set; }

    public DateTime  CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public uint Xmin { get; set; }

    public decimal CreditBalance { get; set; } = 0m;
    public string? Email         { get; set; }

    public bool      IsDeleted   { get; set; } = false;
    public DateTime? DeletedAt   { get; set; }
    public Guid?     DeletedById { get; set; }

    public ICollection<Invoice> Invoices { get; set; } = new List<Invoice>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();

    private Client() { }

    public static Client Create(
        string tbnCode,
        string fullName,
        string identityCard,
        string phoneMain,
        string zone,
        DateTime installationDate,
        Guid installedByUserId,
        Guid planId)
    {
        if (string.IsNullOrWhiteSpace(fullName))
            throw new DomainException("El nombre completo del cliente es obligatorio.");
        if (string.IsNullOrWhiteSpace(tbnCode))
            throw new DomainException("El código TBN es obligatorio.");
        if (string.IsNullOrWhiteSpace(phoneMain))
            throw new DomainException("El número de teléfono principal es obligatorio.");

        return new Client
        {
            TbnCode           = tbnCode.ToUpperInvariant(),
            FullName          = fullName.Trim(),
            IdentityCard      = identityCard,
            PhoneMain         = phoneMain,
            Zone              = zone,
            InstallationDate  = installationDate,
            InstalledByUserId = installedByUserId,
            PlanId            = planId,
            Status            = ClientStatus.Activo,
            CreatedAt         = DateTime.UtcNow,
        };
    }


    public void Suspend()
    {
        if (Status == ClientStatus.Suspendido)
            throw new DomainException("El cliente ya está suspendido.");
        if (Status == ClientStatus.DadoDeBaja)
            throw new DomainException("No se puede suspender un cliente dado de baja.");

        Status      = ClientStatus.Suspendido;
        SuspendedAt = DateTime.UtcNow;
        UpdatedAt   = DateTime.UtcNow;
    }

    public void Reactivate()
    {
        if (Status != ClientStatus.Suspendido)
            throw new DomainException("Solo se puede reactivar un cliente que esté suspendido.");

        Status      = ClientStatus.Activo;
        SuspendedAt = null;
        UpdatedAt   = DateTime.UtcNow;
    }

    public void Cancel()
    {
        if (Status == ClientStatus.DadoDeBaja)
            throw new DomainException("El cliente ya está dado de baja.");

        Status      = ClientStatus.DadoDeBaja;
        CancelledAt = DateTime.UtcNow;
        UpdatedAt   = DateTime.UtcNow;
    }

    public void ChangePlan(Guid newPlanId)
    {
        if (PlanId == newPlanId)
            throw new DomainException("El cliente ya tiene el plan indicado.");

        PlanId    = newPlanId;
        UpdatedAt = DateTime.UtcNow;
    }
}
