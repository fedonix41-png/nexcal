/**
 * ============================================================
 * NexCal — WhatsApp Notification via MultiWA
 * ============================================================
 * Non-blocking WhatsApp messaging via the MultiWA API Gateway.
 * Config priority: Organization DB settings → env vars fallback.
 * All functions are fire-and-forget: they will NEVER throw or
 * block the main booking flow, even if MultiWA is unreachable.
 * ============================================================
 */

import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { prisma } from "@/lib/prisma";

// ============================================================
// Config — DB first, env fallback
// ============================================================

const ENV_MULTIWA_API_URL = process.env.MULTIWA_API_URL || "";
const ENV_MULTIWA_API_KEY = process.env.MULTIWA_API_KEY || "";
const ENV_MULTIWA_SESSION_ID = process.env.MULTIWA_SESSION_ID || "";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "NexCal";

interface WhatsAppConfig {
  apiUrl: string;
  apiKey: string;
  sessionId: string;
}

/**
 * Get WhatsApp config for a given organization.
 * Priority: DB settings → env fallback.
 */
async function getConfig(organizationId?: string | null): Promise<WhatsAppConfig> {
  if (organizationId) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { multiwaUrl: true, multiwaApiKey: true, multiwaSessionId: true },
      });
      if (org?.multiwaUrl && org?.multiwaApiKey && org?.multiwaSessionId) {
        return {
          apiUrl: org.multiwaUrl,
          apiKey: org.multiwaApiKey,
          sessionId: org.multiwaSessionId,
        };
      }
    } catch {
      // Fall through to env
    }
  }
  return {
    apiUrl: ENV_MULTIWA_API_URL,
    apiKey: ENV_MULTIWA_API_KEY,
    sessionId: ENV_MULTIWA_SESSION_ID,
  };
}

// ============================================================
// Core: sendWhatsApp — fire-and-forget HTTP POST
// ============================================================

async function sendWhatsApp(phone: string, message: string, config: WhatsAppConfig): Promise<void> {
  if (!config.apiUrl || !config.apiKey || !config.sessionId) return;

  try {
    const normalizedPhone = normalizePhone(phone);
    const url = `${config.apiUrl}/api/sessions/${config.sessionId}/messages/send`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({
        to: normalizedPhone,
        text: message,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(
        `[WhatsApp] Failed to send message to ${normalizedPhone}: ${response.status} ${response.statusText}`
      );
    }
  } catch (err) {
    console.warn(`[WhatsApp] Send failed (non-blocking):`, err instanceof Error ? err.message : err);
  }
}

// ============================================================
// Phone number normalization (Indonesian format)
// ============================================================

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-+]/g, "");
  if (cleaned.startsWith("08")) {
    cleaned = "62" + cleaned.slice(1);
  }
  if (!cleaned.startsWith("62")) {
    cleaned = "62" + cleaned;
  }
  return cleaned;
}

// ============================================================
// Message Templates
// ============================================================

interface BookingInfo {
  patientName: string;
  patientPhone: string;
  serviceName: string;
  date: Date;
  startTime: string;
  duration: number;
  clinicName?: string;
  organizationId?: string | null;
  manageUrl?: string;
}

function formatDate(date: Date): string {
  return format(date, "EEEE, d MMMM yyyy", { locale: ru });
}

function buildBookingReceivedMessage(info: BookingInfo): string {
  const clinic = info.clinicName || APP_NAME;
  const lines = [
    `✅ *Бронирование принято*`,
    ``,
    `Здравствуйте, *${info.patientName}*!`,
    `Ваше бронирование получено и ожидает подтверждения.`,
    ``,
    `📋 *Детали бронирования:*`,
    `• Услуга: ${info.serviceName}`,
    `• Дата: ${formatDate(info.date)}`,
    `• Время: ${info.startTime} (${info.duration} мин)`,
    ``,
    `Мы отправим уведомление после подтверждения бронирования.`,
  ];
  if (info.manageUrl) {
    lines.push(``, `🔗 *Управлять бронированием:* ${info.manageUrl}`);
  }
  lines.push(``, `Спасибо! 🙏`, `— ${clinic}`);
  return lines.join("\n");
}

function buildBookingConfirmedMessage(info: BookingInfo): string {
  const clinic = info.clinicName || APP_NAME;
  const lines = [
    `🎉 *Бронирование подтверждено!*`,
    ``,
    `Здравствуйте, *${info.patientName}*!`,
    `Ваше бронирование *подтверждено*. Ждём вас по следующему расписанию:`,
    ``,
    `📋 *Детали бронирования:*`,
    `• Услуга: ${info.serviceName}`,
    `• Дата: ${formatDate(info.date)}`,
    `• Время: ${info.startTime} (${info.duration} мин)`,
    ``,
    `Пожалуйста, приходите за 10 минут до начала.`,
  ];
  if (info.manageUrl) {
    lines.push(``, `🔗 *Управлять бронированием:* ${info.manageUrl}`);
  }
  lines.push(``, `До встречи! 👋`, `— ${clinic}`);
  return lines.join("\n");
}

function buildBookingCancelledMessage(info: BookingInfo, reason?: string | null): string {
  const clinic = info.clinicName || APP_NAME;
  const lines = [
    `❌ *Бронирование отменено*`,
    ``,
    `Здравствуйте, *${info.patientName}*!`,
    `К сожалению, ваше бронирование было отменено.`,
    ``,
    `📋 *Детали бронирования:*`,
    `• Услуга: ${info.serviceName}`,
    `• Дата: ${formatDate(info.date)}`,
    `• Время: ${info.startTime}`,
  ];
  if (reason) lines.push(``, `📝 *Причина:* ${reason}`);
  lines.push(``, `Пожалуйста, создайте новое бронирование.`, ``, `Приносим извинения. 🙏`, `— ${clinic}`);
  return lines.join("\n");
}

// ============================================================
// Public API — Fire-and-Forget Notification Senders
// ============================================================

export function notifyBookingReceived(info: BookingInfo): void {
  const message = buildBookingReceivedMessage(info);
  (async () => {
    const config = await getConfig(info.organizationId);
    sendWhatsApp(info.patientPhone, message, config).catch(() => {});
  })();
}

export function notifyBookingConfirmed(info: BookingInfo): void {
  const message = buildBookingConfirmedMessage(info);
  (async () => {
    const config = await getConfig(info.organizationId);
    sendWhatsApp(info.patientPhone, message, config).catch(() => {});
  })();
}

export function notifyBookingCancelled(info: BookingInfo, reason?: string | null): void {
  const message = buildBookingCancelledMessage(info, reason);
  (async () => {
    const config = await getConfig(info.organizationId);
    sendWhatsApp(info.patientPhone, message, config).catch(() => {});
  })();
}
