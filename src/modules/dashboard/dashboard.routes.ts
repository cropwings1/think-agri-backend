import { Router } from "express";
import { supabase } from "../../config/supabase.js";
import { asyncHandler, HttpError } from "../../utils/http.js";
export const dashboardRouter = Router();

dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [
      total,
      recent,
      interests,
      languages,
      statuses,
      locations,
      activity,
      joinedFarmers,
      notJoinedFarmers,
    ] = await Promise.all([
      supabase.from("farmers").select("id", { count: "exact", head: true }),
      supabase
        .from("farmers")
        .select("id,created_at", { count: "exact" })
        .gte("created_at", since)
        .order("created_at"),
      supabase
        .from("farmer_interests")
        .select("interest_id,interests(id,slug,name_en)")
        .limit(10000),
      supabase.from("farmers").select("language").limit(10000),
      supabase.from("whatsapp_messages").select("status").limit(10000),
      supabase.from("farmers").select("district,pincode").limit(10000),
      supabase
        .from("audit_logs")
        .select("id,action,entity_type,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("farmers")
        .select("id", { count: "exact", head: true })
        .eq("community_status", "joined"),
      supabase
        .from("farmers")
        .select("id", { count: "exact", head: true })
        .eq("community_status", "not_joined"),
    ]);
    for (const r of [
      total,
      recent,
      interests,
      languages,
      statuses,
      locations,
      activity,
      joinedFarmers,
      notJoinedFarmers,
    ])
      if (r.error)
        throw new HttpError(500, "Unable to load dashboard analytics");
    const countBy = (items: any[], key: string) =>
      items.reduce((acc: Record<string, number>, item) => {
        const v = item[key] ?? "unknown";
        acc[v] = (acc[v] ?? 0) + 1;
        return acc;
      }, {});
    const interestCounts = countBy(interests.data ?? [], "interest_id");
    const languageCounts = countBy(languages.data ?? [], "language");
    const whatsappCounts = countBy(statuses.data ?? [], "status");
    const districtCounts = countBy(locations.data ?? [], "district");
    const daily = (recent.data ?? []).reduce(
      (acc: Record<string, number>, item: any) => {
        const day = item.created_at.slice(0, 10);
        acc[day] = (acc[day] ?? 0) + 1;
        return acc;
      },
      {}
    );
    const totalFarmers = total.count ?? 0;
    const totalMessages = statuses.data?.length ?? 0;
    const delivered = whatsappCounts["delivered"] ?? 0;
    res.json({
      success: true,
      data: {
        totalFarmers,
        registrationsInPeriod: recent.count ?? 0,
        registrationTrend: Object.entries(daily).map(([date, count]) => ({
          date,
          count,
        })),
        interestBreakdown: interestCounts,
        languageBreakdown: languageCounts,
        whatsappStatus: whatsappCounts,
        whatsappDeliveryRate: totalMessages
          ? Number(((delivered / totalMessages) * 100).toFixed(1))
          : 0,
        totalWhatsAppMessages: totalMessages,
        districtBreakdown: districtCounts,
        recentActivity: activity.data ?? [],
        periodDays: days,
        communityStatus: {
          joined: joinedFarmers.count ?? 0,
          not_joined: notJoinedFarmers.count ?? 0,
        },
      },
    });
  })
);
