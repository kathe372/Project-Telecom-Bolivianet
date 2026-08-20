using MediatR;
using TelecomBoliviaNet.Application.DTOs.Dashboard;

namespace TelecomBoliviaNet.Application.Dashboard.Queries;

public record GetDashKpisQuery                                  : IRequest<DashboardKpisDto>;
public record GetCollectionsTrendQuery(int Meses = 6)            : IRequest<CollectionsTrendDto>;
public record GetMetodosPagoQuery                               : IRequest<List<MetodoPagoDto>>;
public record GetTicketsEstadoQuery                             : IRequest<List<TicketEstadoDashDto>>;
public record GetTicketsUrgentesQuery(int Top = 8)              : IRequest<List<TicketDashItemDto>>;
public record GetTicketsPorTipoQuery                            : IRequest<List<TicketPorTipoDto>>;
public record GetResolucionPromedioQuery                        : IRequest<List<ResolucionPromDto>>;
public record GetWhatsAppActivityQuery(int Top = 10)           : IRequest<List<WhatsAppActivityDto>>;
public record GetDebtorsQuery                                  : IRequest<List<DebtorItemDto>>;
public record GetRecentReceiptsQuery(int Top = 8)        : IRequest<List<RecentReceiptDto>>;
public record GetClientsByZoneQuery                          : IRequest<List<ClientsByZoneDto>>;
public record GetActivityHoursQuery                           : IRequest<List<ActivityHourDto>>;

public record GetDashPreferencesQuery(Guid UserId)             : IRequest<DashboardPreferencesDto>;
public record SaveDashPreferencesCommand(Guid UserId, DashboardPreferencesDto Dto) : IRequest;

public record GetDashPagosQuery                                : IRequest<DashPagosDto>;
public record GetDashTicketsMetricasQuery                      : IRequest<DashTicketsMetricasDto>;
public record GetDashNotifQuery                                : IRequest<DashNotifDto>;
public record GetDashChatbotQuery                              : IRequest<DashChatbotDto>;
public record GetDashAutoActionsQuery                          : IRequest<DashAutoActionsDto>;

public record GetAgingPortfolioQuery                             : IRequest<AgingPortfolioDto>;
public record GetUpcomingCutoffsQuery(int DiasVista = 7)          : IRequest<UpcomingCutoffsDto>;
public record GetTechniciansWorkloadQuery                         : IRequest<TechniciansWorkloadDto>;
