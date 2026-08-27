using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TelecomBoliviaNet.Domain.Entities.Dashboard;
using TelecomBoliviaNet.Domain.Entities.Auth;

namespace TelecomBoliviaNet.Infrastructure.Data.Config;

/// <summary>Mapeo de <see cref="DashboardPreference"/>. Movido desde AppDbContext (F5.4).</summary>
public class DashboardPreferenceConfig : IEntityTypeConfiguration<DashboardPreference>
{
    public void Configure(EntityTypeBuilder<DashboardPreference> e)
    {
            e.ToTable("DashboardPreferences");
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.UserId).IsUnique();
            e.Property(p => p.ShowKpis).HasDefaultValue(true);
            e.Property(p => p.ShowTendencia).HasDefaultValue(true);
            e.Property(p => p.ShowTickets).HasDefaultValue(true);
            e.Property(p => p.ShowWhatsApp).HasDefaultValue(true);
            e.Property(p => p.ShowDeudores).HasDefaultValue(true);
            e.Property(p => p.ShowZonas).HasDefaultValue(true);
            e.Property(p => p.ShowMetodosPago).HasDefaultValue(true);
            e.Property(p => p.ShowComprobantes).HasDefaultValue(true);
            e.Property(p => p.UpdatedAt);
            e.HasOne<UserSystem>()
             .WithOne()
             .HasForeignKey<DashboardPreference>(p => p.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        
    }
}
