using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="ClientQr"/>. Movido desde AppDbContext (F5.4).</summary>
public class ClientQrConfig : IEntityTypeConfiguration<ClientQr>
{
    public void Configure(EntityTypeBuilder<ClientQr> e)
    {
            e.ToTable("ClientQrs");
            e.HasKey(q => q.Id);
            e.HasIndex(q => new { q.ClientId, q.IsActive });
            e.HasIndex(q => new { q.ExpiresAt, q.IsActive, q.AlertSent });
            e.HasOne(q => q.Client).WithMany().HasForeignKey(q => q.ClientId).OnDelete(DeleteBehavior.Cascade);
        
    }
}
