"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getDataScope } from "@/lib/rbac";

// ============================================================
// Schemas
// ============================================================

const createServiceSchema = z.object({
  name: z.string().min(2, "Название услуги должно содержать минимум 2 символа."),
  duration: z.number().min(5, "Минимальная длительность — 5 минут.").max(480, "Максимальная длительность — 480 минут."),
  bufferTime: z.number().min(0).max(60).default(0),
  price: z.number().min(0).default(0),
  dpPercentage: z.number().min(0).max(100).default(0),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Цвет должен быть в формате hex (#RRGGBB).").optional(),
  isVirtual: z.boolean().default(false),
});

const updateServiceSchema = createServiceSchema.extend({
  id: z.string(),
  isActive: z.boolean().optional(),
});

// ============================================================
// Action Result Type
// ============================================================

type ActionResult = { error: string | null; success: boolean };

// ============================================================
// Create Service
// ============================================================

export async function createServiceAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const scope = await getDataScope();
    if (!scope) return { error: "Unauthorized", success: false };

    const raw = formData.get("payload") as string;
    const parsed = createServiceSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message || "Некорректные данные.", success: false };
    }

    const { name, duration, bufferTime, price, dpPercentage, description, color, isVirtual } = parsed.data;

    await prisma.serviceType.create({
      data: {
        name,
        duration,
        bufferTime,
        price,
        dpPercentage,
        description: description || null,
        color: color || null,
        isVirtual,
        userId: scope.currentUserId,
      },
    });

    revalidatePath("/admin/services");
    return { error: null, success: true };
  } catch {
    return { error: "Не удалось создать услугу.", success: false };
  }
}

// ============================================================
// Update Service
// ============================================================

export async function updateServiceAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const scope = await getDataScope();
    if (!scope) return { error: "Unauthorized", success: false };

    const raw = formData.get("payload") as string;
    const parsed = updateServiceSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message || "Некорректные данные.", success: false };
    }

    const { id, name, duration, bufferTime, price, dpPercentage, description, color, isActive, isVirtual } = parsed.data;

    // Verify ownership (OWNER can edit any org member's service, STAFF only their own)
    const existing = await prisma.serviceType.findFirst({
      where: { id, ...scope.userFilter },
    });
    if (!existing) return { error: "Услуга не найдена.", success: false };

    await prisma.serviceType.update({
      where: { id },
      data: {
        name,
        duration,
        bufferTime,
        price,
        dpPercentage,
        description: description || null,
        color: color || null,
        isVirtual,
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });

    revalidatePath("/admin/services");
    return { error: null, success: true };
  } catch {
    return { error: "Не удалось обновить услугу.", success: false };
  }
}

// ============================================================
// Delete Service
// ============================================================

export async function deleteServiceAction(serviceId: string): Promise<ActionResult> {
  try {
    const scope = await getDataScope();
    if (!scope) return { error: "Unauthorized", success: false };

    // Verify ownership
    const existing = await prisma.serviceType.findFirst({
      where: { id: serviceId, userId: scope.currentUserId },
    });
    if (!existing) return { error: "Услуга не найдена.", success: false };

    // Check if service has bookings
    const bookingCount = await prisma.booking.count({
      where: { serviceTypeId: serviceId },
    });

    if (bookingCount > 0) {
      // Soft delete: deactivate instead
      await prisma.serviceType.update({
        where: { id: serviceId },
        data: { isActive: false },
      });
      revalidatePath("/admin/services");
      return { error: null, success: true };
    }

    await prisma.serviceType.delete({ where: { id: serviceId } });
    revalidatePath("/admin/services");
    return { error: null, success: true };
  } catch {
    return { error: "Не удалось удалить услугу.", success: false };
  }
}
