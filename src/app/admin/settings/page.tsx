import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getGCalStatus } from "@/actions/gcal";
import { getOrgSettings } from "@/actions/settings";
import { prisma } from "@/lib/prisma";
import { GCalCard } from "@/components/admin/gcal-card";
import { CalendarFeedForm, MultiwaSettingsForm, GcalSettingsForm, MidtransSettingsForm } from "@/components/admin/settings-forms";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gcal?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const isOwner = session.user.role === "OWNER";

  // Fetch org settings (OWNER only) + GCal OAuth status (ALL roles)
  const [orgSettings, gcalStatus, user] = await Promise.all([
    isOwner ? getOrgSettings() : null,
    getGCalStatus(),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { calendarFeedUrl: true } }),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Настройки
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Управляйте интеграциями и параметрами вашей учётной записи
        </p>
      </div>

      {/* Flash messages from OAuth flow */}
      {params.gcal === "connected" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          ✅ Google Calendar успешно подключён!
        </div>
      )}
      {params.gcal === "denied" && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300">
          ⚠️ Вы отменили подключение Google Calendar.
        </div>
      )}
      {params.gcal === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          ❌ Произошла ошибка при подключении Google Calendar.
        </div>
      )}

      {/* ========================================================== */}
      {/* Section 1: Kalender Pribadi (ALL ROLES — Owner & Staff) */}
      {/* ========================================================== */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          📅 Личный календарь
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Подключите аккаунт Google Calendar, чтобы расписание бронирований автоматически появлялось в вашем личном календаре.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <GCalCard connected={gcalStatus.connected} configured={gcalStatus.configured} />
          <CalendarFeedForm connected={Boolean(user?.calendarFeedUrl)} />
        </div>
      </div>

      {/* ========================================================== */}
      {/* Section 2: Integrasi Organisasi (OWNER ONLY) */}
      {/* ========================================================== */}
      {isOwner && orgSettings && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
            ⚙️ Интеграции организации
          </h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Настройте API-ключи для всей организации. Эти учётные данные используются всеми сотрудниками для подключения календаря и уведомлений WhatsApp.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MultiwaSettingsForm data={{
              multiwaUrl: orgSettings.multiwaUrl,
              multiwaApiKey: orgSettings.multiwaApiKey,
              multiwaSessionId: orgSettings.multiwaSessionId,
            }} />
            <GcalSettingsForm data={{
              gcalClientId: orgSettings.gcalClientId,
              gcalClientSecret: orgSettings.gcalClientSecret,
            }} />
            <MidtransSettingsForm data={{
              midtransServerKey: orgSettings.midtransServerKey,
              midtransClientKey: orgSettings.midtransClientKey,
              midtransIsProd: orgSettings.midtransIsProd,
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
