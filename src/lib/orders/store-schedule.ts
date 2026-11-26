import type {
  BusinessHour,
  ScheduledOrdersConfig,
  StoreConfiguration,
  StoreEmergencyPause,
} from "@/types/operations";
import type { ServiceType } from "@/types/orders";

export const DEFAULT_STORE_TIMEZONE = "America/Bogota";

export const DEFAULT_EMERGENCY_PAUSE_REASON =
  "Barra saturada temporalmente por alta demanda. Volvemos pronto.";

export const DEFAULT_SCHEDULED_ORDERS_CONFIG: ScheduledOrdersConfig = {
  enabled: true,
  slotIntervalMinutes: 30,
  minLeadMinutes: 45,
  maxDaysAhead: 2,
};

export type StoreScheduleConfig = Pick<
  StoreConfiguration,
  "businessHours" | "timezone" | "emergencyPause" | "scheduledOrders"
>;

export type StoreScheduleStatus = "open" | "closed" | "paused";

export type NextOpenWindow = {
  dayLabel: string;
  dateKey: string;
  open: string;
  close: string;
  startsAtIso: string;
  isToday: boolean;
  isTomorrow: boolean;
};

export type StoreAvailability = {
  status: StoreScheduleStatus;
  isOpenNow: boolean;
  canOrderNow: boolean;
  isPaused: boolean;
  pauseReason?: string;
  pauseResumeAt?: string;
  isWithinBusinessHours: boolean;
  hasConfiguredHours: boolean;
  timezone: string;
  todayHours: BusinessHour | null;
  nextOpenWindow: NextOpenWindow | null;
  scheduledOrdersEnabled: boolean;
  canScheduleOrders: boolean;
  summaryText: string;
};

export type ScheduledSlot = {
  iso: string;
  dateKey: string;
  dayLabel: string;
  timeLabel: string;
  time24: string;
};

export type OrderScheduleValidationResult =
  | { allowed: true; fulfillmentMode: "now" }
  | {
      allowed: true;
      fulfillmentMode: "scheduled";
      scheduledFor: string;
      formattedLabel: string;
    }
  | {
      allowed: false;
      reason: string;
      code:
        | "STORE_PAUSED"
        | "STORE_CLOSED"
        | "SCHEDULING_DISABLED"
        | "INVALID_SCHEDULE_TIME";
    };

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  totalMinutes: number;
  dateKey: string;
};

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const DAY_NAMES_ES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

const DAY_SHORT_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

const MONTH_SHORT_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

const NORMALIZED_DAY_ALIASES: Record<string, number> = {
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  mie: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sab: 6,
};

function parseTimeToMinutes(time24: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time24.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatMinutesTo24h(totalMinutes: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.floor(totalMinutes)));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  offsetDays: number,
): { year: number; month: number; day: number; dayOfWeek: number; dateKey: string } {
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays));
  const nextYear = shifted.getUTCFullYear();
  const nextMonth = shifted.getUTCMonth() + 1;
  const nextDay = shifted.getUTCDate();
  return {
    year: nextYear,
    month: nextMonth,
    day: nextDay,
    dayOfWeek: shifted.getUTCDay(),
    dateKey: buildDateKey(nextYear, nextMonth, nextDay),
  };
}

function resolveValidTimeZone(timeZone?: string): string {
  const candidate = timeZone?.trim() || DEFAULT_STORE_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_STORE_TIMEZONE;
  }
}

export function normalizeDayNameToIndex(day: string): number | null {
  const normalized = day
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  return normalized in NORMALIZED_DAY_ALIASES
    ? NORMALIZED_DAY_ALIASES[normalized]
    : null;
}

export function getLocalDateParts(
  date: Date,
  timeZone: string = DEFAULT_STORE_TIMEZONE,
): LocalDateParts {
  const safeZone = resolveValidTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: safeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? date.getUTCFullYear());
  const month = Number(parts.find((p) => p.type === "month")?.value ?? date.getUTCMonth() + 1);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? date.getUTCDate());
  const weekdayRaw = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase().slice(0, 3);
  const rawHour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const dayOfWeek = WEEKDAY_MAP[weekdayRaw] ?? date.getUTCDay();

  return {
    year,
    month,
    day,
    dayOfWeek,
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
    dateKey: buildDateKey(year, month, day),
  };
}

export function localDateTimeToUtcDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = DEFAULT_STORE_TIMEZONE,
): Date {
  const safeZone = resolveValidTimeZone(timeZone);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let guess = targetAsUtc;
  for (let pass = 0; pass < 2; pass += 1) {
    const localAtGuess = getLocalDateParts(new Date(guess), safeZone);
    const localAsUtc = Date.UTC(
      localAtGuess.year,
      localAtGuess.month - 1,
      localAtGuess.day,
      localAtGuess.hour,
      localAtGuess.minute,
      0,
      0,
    );
    const diff = localAsUtc - targetAsUtc;
    if (diff === 0) break;
    guess -= diff;
  }

  return new Date(guess);
}

export function isEmergencyPauseActive(
  pause?: StoreEmergencyPause,
  now: Date = new Date(),
): boolean {
  if (!pause?.active) return false;
  if (!pause.resumeAt) return true;
  const resumeMs = Date.parse(pause.resumeAt);
  if (Number.isNaN(resumeMs)) return true;
  return resumeMs > now.getTime();
}

export function resolveScheduledOrdersConfig(
  config?: StoreScheduleConfig | null,
): ScheduledOrdersConfig {
  const raw = config?.scheduledOrders;
  if (!raw) return DEFAULT_SCHEDULED_ORDERS_CONFIG;
  return {
    enabled: Boolean(raw.enabled),
    slotIntervalMinutes:
      Number.isFinite(raw.slotIntervalMinutes) && raw.slotIntervalMinutes >= 15
        ? Math.min(120, Math.round(raw.slotIntervalMinutes))
        : DEFAULT_SCHEDULED_ORDERS_CONFIG.slotIntervalMinutes,
    minLeadMinutes:
      Number.isFinite(raw.minLeadMinutes) && raw.minLeadMinutes >= 15
        ? Math.min(240, Math.round(raw.minLeadMinutes))
        : DEFAULT_SCHEDULED_ORDERS_CONFIG.minLeadMinutes,
    maxDaysAhead:
      Number.isFinite(raw.maxDaysAhead) && raw.maxDaysAhead >= 1
        ? Math.min(7, Math.round(raw.maxDaysAhead))
        : DEFAULT_SCHEDULED_ORDERS_CONFIG.maxDaysAhead,
  };
}

export function formatTime12h(time24: string): string {
  const totalMinutes = parseTimeToMinutes(time24);
  if (totalMinutes === null) return time24;
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const period = hour24 >= 12 ? "p. m." : "a. m.";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatScheduledForLabel(
  iso: string,
  timeZone: string = DEFAULT_STORE_TIMEZONE,
  now: Date = new Date(),
): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return iso;

  const safeZone = resolveValidTimeZone(timeZone);
  const nowParts = getLocalDateParts(now, safeZone);
  const tomorrowParts = addCalendarDays(nowParts.year, nowParts.month, nowParts.day, 1);
  const targetParts = getLocalDateParts(target, safeZone);
  const timeLabel = formatTime12h(formatMinutesTo24h(targetParts.totalMinutes));

  if (targetParts.dateKey === nowParts.dateKey) {
    return `Hoy · ${timeLabel}`;
  }
  if (targetParts.dateKey === tomorrowParts.dateKey) {
    return `Mañana · ${timeLabel}`;
  }
  const dayShort = DAY_SHORT_ES[targetParts.dayOfWeek] ?? "";
  const monthShort = MONTH_SHORT_ES[targetParts.month - 1] ?? "";
  return `${dayShort} ${targetParts.day} ${monthShort} · ${timeLabel}`;
}

function findRuleForDayIndex(
  businessHours: BusinessHour[],
  dayOfWeek: number,
): BusinessHour | null {
  return (
    businessHours.find((entry) => normalizeDayNameToIndex(entry.day) === dayOfWeek) ?? null
  );
}

function findNextOpenWindow(
  businessHours: BusinessHour[],
  localNow: LocalDateParts,
  timeZone: string,
): NextOpenWindow | null {
  if (businessHours.length === 0) return null;

  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const calendarDay = addCalendarDays(
      localNow.year,
      localNow.month,
      localNow.day,
      dayOffset,
    );
    const rule = findRuleForDayIndex(businessHours, calendarDay.dayOfWeek);
    if (!rule || rule.closed) continue;

    const openMinutes = parseTimeToMinutes(rule.open);
    const closeMinutes = parseTimeToMinutes(rule.close);
    if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) {
      continue;
    }

    if (dayOffset === 0 && localNow.totalMinutes >= openMinutes) {
      continue;
    }

    const openHour = Math.floor(openMinutes / 60);
    const openMin = openMinutes % 60;
    const startsAt = localDateTimeToUtcDate(
      calendarDay.year,
      calendarDay.month,
      calendarDay.day,
      openHour,
      openMin,
      timeZone,
    );

    const isToday = dayOffset === 0;
    const isTomorrow = dayOffset === 1;
    const dayLabel = isToday
      ? "Hoy"
      : isTomorrow
        ? "Mañana"
        : DAY_NAMES_ES[calendarDay.dayOfWeek] ?? rule.day;

    return {
      dayLabel,
      dateKey: calendarDay.dateKey,
      open: rule.open,
      close: rule.close,
      startsAtIso: startsAt.toISOString(),
      isToday,
      isTomorrow,
    };
  }

  return null;
}

export function getAvailableScheduledSlots(
  config?: StoreScheduleConfig | null,
  now: Date = new Date(),
): ScheduledSlot[] {
  const scheduledConfig = resolveScheduledOrdersConfig(config);
  if (!scheduledConfig.enabled) return [];

  const businessHours = config?.businessHours ?? [];
  if (businessHours.length === 0) return [];

  const timezone = resolveValidTimeZone(config?.timezone);
  const localNow = getLocalDateParts(now, timezone);
  const isPaused = isEmergencyPauseActive(config?.emergencyPause, now);
  const resumeAtMs = config?.emergencyPause?.resumeAt
    ? Date.parse(config.emergencyPause.resumeAt)
    : Number.NaN;
  const hasFutureResumeAt = isPaused && !Number.isNaN(resumeAtMs) && resumeAtMs > now.getTime();

  let earliestMs = now.getTime() + scheduledConfig.minLeadMinutes * 60_000;
  let startDayOffset = 0;

  if (isPaused) {
    if (hasFutureResumeAt) {
      earliestMs = Math.max(earliestMs, resumeAtMs);
    } else {
      startDayOffset = 1;
    }
  }

  const slots: ScheduledSlot[] = [];

  for (
    let dayOffset = startDayOffset;
    dayOffset <= scheduledConfig.maxDaysAhead;
    dayOffset += 1
  ) {
    const calendarDay = addCalendarDays(
      localNow.year,
      localNow.month,
      localNow.day,
      dayOffset,
    );
    const rule = findRuleForDayIndex(businessHours, calendarDay.dayOfWeek);
    if (!rule || rule.closed) continue;

    const openMinutes = parseTimeToMinutes(rule.open);
    const closeMinutes = parseTimeToMinutes(rule.close);
    if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) {
      continue;
    }

    const dayLabel =
      dayOffset === 0
        ? "Hoy"
        : dayOffset === 1
          ? "Mañana"
          : `${DAY_SHORT_ES[calendarDay.dayOfWeek]} ${calendarDay.day} ${MONTH_SHORT_ES[calendarDay.month - 1]}`;

    const lastSlotStart = closeMinutes - scheduledConfig.slotIntervalMinutes;
    for (
      let slotMinutes = openMinutes;
      slotMinutes <= lastSlotStart;
      slotMinutes += scheduledConfig.slotIntervalMinutes
    ) {
      const slotHour = Math.floor(slotMinutes / 60);
      const slotMin = slotMinutes % 60;
      const slotDate = localDateTimeToUtcDate(
        calendarDay.year,
        calendarDay.month,
        calendarDay.day,
        slotHour,
        slotMin,
        timezone,
      );

      if (slotDate.getTime() < earliestMs) continue;

      const time24 = formatMinutesTo24h(slotMinutes);
      slots.push({
        iso: slotDate.toISOString(),
        dateKey: calendarDay.dateKey,
        dayLabel,
        timeLabel: formatTime12h(time24),
        time24,
      });
    }
  }

  return slots;
}

export function evaluateStoreAvailability(
  config?: StoreScheduleConfig | null,
  now: Date = new Date(),
): StoreAvailability {
  const timezone = resolveValidTimeZone(config?.timezone);
  const scheduledConfig = resolveScheduledOrdersConfig(config);
  const isPaused = isEmergencyPauseActive(config?.emergencyPause, now);
  const pauseReason = isPaused
    ? config?.emergencyPause?.reason?.trim() || DEFAULT_EMERGENCY_PAUSE_REASON
    : undefined;
  const pauseResumeAt =
    isPaused &&
    config?.emergencyPause?.resumeAt &&
    !Number.isNaN(Date.parse(config.emergencyPause.resumeAt))
      ? config.emergencyPause.resumeAt
      : undefined;

  const businessHours = config?.businessHours ?? [];
  const hasConfiguredHours = businessHours.length > 0;

  if (!hasConfiguredHours) {
    const status: StoreScheduleStatus = isPaused ? "paused" : "open";
    const summaryText = isPaused
      ? pauseResumeAt
        ? `${pauseReason} Reanudamos aprox. a las ${formatScheduledForLabel(pauseResumeAt, timezone, now)}.`
        : pauseReason ?? DEFAULT_EMERGENCY_PAUSE_REASON
      : "Disponible para pedidos ahora";

    return {
      status,
      isOpenNow: !isPaused,
      canOrderNow: !isPaused,
      isPaused,
      ...(pauseReason ? { pauseReason } : {}),
      ...(pauseResumeAt ? { pauseResumeAt } : {}),
      isWithinBusinessHours: true,
      hasConfiguredHours: false,
      timezone,
      todayHours: null,
      nextOpenWindow: null,
      scheduledOrdersEnabled: scheduledConfig.enabled,
      canScheduleOrders: false,
      summaryText,
    };
  }

  const localNow = getLocalDateParts(now, timezone);
  const todayRule = findRuleForDayIndex(businessHours, localNow.dayOfWeek);
  const openMinutes = todayRule ? parseTimeToMinutes(todayRule.open) : null;
  const closeMinutes = todayRule ? parseTimeToMinutes(todayRule.close) : null;
  const isWithinBusinessHours = Boolean(
    todayRule &&
      !todayRule.closed &&
      openMinutes !== null &&
      closeMinutes !== null &&
      closeMinutes > openMinutes &&
      localNow.totalMinutes >= openMinutes &&
      localNow.totalMinutes < closeMinutes,
  );

  const nextOpenWindow = isWithinBusinessHours
    ? null
    : findNextOpenWindow(businessHours, localNow, timezone);

  const status: StoreScheduleStatus = isPaused
    ? "paused"
    : isWithinBusinessHours
      ? "open"
      : "closed";
  const isOpenNow = status === "open";
  const availableSlots = scheduledConfig.enabled
    ? getAvailableScheduledSlots(config, now)
    : [];
  const canScheduleOrders = scheduledConfig.enabled && availableSlots.length > 0;

  let summaryText = "";
  if (isPaused) {
    summaryText = pauseResumeAt
      ? `${pauseReason} Reanudamos aprox. ${formatScheduledForLabel(pauseResumeAt, timezone, now)}.`
      : pauseReason ?? DEFAULT_EMERGENCY_PAUSE_REASON;
  } else if (isWithinBusinessHours && todayRule) {
    summaryText = `Abierto hoy de ${formatTime12h(todayRule.open)} a ${formatTime12h(todayRule.close)}`;
  } else if (nextOpenWindow) {
    const prefix = nextOpenWindow.isToday
      ? "Abrimos hoy"
      : nextOpenWindow.isTomorrow
        ? "Abrimos mañana"
        : `Abrimos el ${nextOpenWindow.dayLabel}`;
    summaryText = `Cerrado en este momento. ${prefix} a las ${formatTime12h(nextOpenWindow.open)}.`;
  } else {
    summaryText = "Cerrado temporalmente fuera de horario de atención.";
  }

  return {
    status,
    isOpenNow,
    canOrderNow: isOpenNow,
    isPaused,
    ...(pauseReason ? { pauseReason } : {}),
    ...(pauseResumeAt ? { pauseResumeAt } : {}),
    isWithinBusinessHours,
    hasConfiguredHours: true,
    timezone,
    todayHours: todayRule,
    nextOpenWindow,
    scheduledOrdersEnabled: scheduledConfig.enabled,
    canScheduleOrders,
    summaryText,
  };
}

export function validateOrderSchedule(params: {
  config?: StoreScheduleConfig | null;
  scheduledFor?: string;
  serviceType?: ServiceType;
  now?: Date;
}): OrderScheduleValidationResult {
  const now = params.now ?? new Date();
  const availability = evaluateStoreAvailability(params.config, now);
  const scheduledConfig = resolveScheduledOrdersConfig(params.config);
  const cleanScheduledFor = params.scheduledFor?.trim();

  if (!cleanScheduledFor) {
    if (availability.isPaused) {
      const resumeHint = availability.pauseResumeAt
        ? ` Reapertura estimada: ${formatScheduledForLabel(availability.pauseResumeAt, availability.timezone, now)}.`
        : "";
      const scheduleHint = availability.canScheduleOrders
        ? " Puedes programar tu pedido para más tarde."
        : "";
      return {
        allowed: false,
        code: "STORE_PAUSED",
        reason: `${availability.pauseReason ?? DEFAULT_EMERGENCY_PAUSE_REASON}${resumeHint}${scheduleHint}`,
      };
    }

    if (!availability.isWithinBusinessHours) {
      const nextHint = availability.nextOpenWindow
        ? ` ${
            availability.nextOpenWindow.isToday
              ? "Abrimos hoy"
              : availability.nextOpenWindow.isTomorrow
                ? "Abrimos mañana"
                : `Abrimos el ${availability.nextOpenWindow.dayLabel}`
          } a las ${formatTime12h(availability.nextOpenWindow.open)}.`
        : "";
      const scheduleHint = availability.canScheduleOrders
        ? " Puedes programar tu pedido dentro del horario del local."
        : "";
      return {
        allowed: false,
        code: "STORE_CLOSED",
        reason: `El local está cerrado en este momento.${nextHint}${scheduleHint}`,
      };
    }

    return { allowed: true, fulfillmentMode: "now" };
  }

  if (params.serviceType === "mesa") {
    return {
      allowed: false,
      code: "INVALID_SCHEDULE_TIME",
      reason:
        "Los pedidos en mesa son para consumo inmediato; selecciona Domicilio o Recoger en barra para programar.",
    };
  }

  if (!scheduledConfig.enabled) {
    return {
      allowed: false,
      code: "SCHEDULING_DISABLED",
      reason: "Los pedidos programados están deshabilitados temporalmente.",
    };
  }

  const targetMs = Date.parse(cleanScheduledFor);
  if (Number.isNaN(targetMs)) {
    return {
      allowed: false,
      code: "INVALID_SCHEDULE_TIME",
      reason: "La fecha y hora programada no es válida.",
    };
  }

  const minAllowedMs =
    now.getTime() + Math.max(0, scheduledConfig.minLeadMinutes - 5) * 60_000;
  if (targetMs < minAllowedMs) {
    return {
      allowed: false,
      code: "INVALID_SCHEDULE_TIME",
      reason: `Debes programar tu pedido con al menos ${scheduledConfig.minLeadMinutes} minutos de anticipación.`,
    };
  }

  const timezone = availability.timezone;
  const nowLocal = getLocalDateParts(now, timezone);
  const targetDate = new Date(targetMs);
  const targetLocal = getLocalDateParts(targetDate, timezone);
  const maxAllowedDay = addCalendarDays(
    nowLocal.year,
    nowLocal.month,
    nowLocal.day,
    scheduledConfig.maxDaysAhead,
  );

  if (targetLocal.dateKey > maxAllowedDay.dateKey) {
    return {
      allowed: false,
      code: "INVALID_SCHEDULE_TIME",
      reason: `Solo puedes programar pedidos hasta con ${scheduledConfig.maxDaysAhead} días de anticipación.`,
    };
  }

  if (availability.isPaused) {
    if (availability.pauseResumeAt) {
      const resumeMs = Date.parse(availability.pauseResumeAt);
      if (!Number.isNaN(resumeMs) && targetMs < resumeMs) {
        return {
          allowed: false,
          code: "STORE_PAUSED",
          reason: `La barra está pausada hasta ${formatScheduledForLabel(availability.pauseResumeAt, timezone, now)}. Elige una franja posterior.`,
        };
      }
    } else if (targetLocal.dateKey <= nowLocal.dateKey) {
      return {
        allowed: false,
        code: "STORE_PAUSED",
        reason:
          "La barra está en pausa temporal para hoy. Programa tu pedido para mañana o espera la reactivación.",
      };
    }
  }

  const businessHours = params.config?.businessHours ?? [];
  if (businessHours.length > 0) {
    const dayRule = findRuleForDayIndex(businessHours, targetLocal.dayOfWeek);
    if (!dayRule || dayRule.closed) {
      return {
        allowed: false,
        code: "INVALID_SCHEDULE_TIME",
        reason: "El local no atiende el día seleccionado para la entrega programada.",
      };
    }
    const openMinutes = parseTimeToMinutes(dayRule.open);
    const closeMinutes = parseTimeToMinutes(dayRule.close);
    if (
      openMinutes === null ||
      closeMinutes === null ||
      targetLocal.totalMinutes < openMinutes ||
      targetLocal.totalMinutes >= closeMinutes
    ) {
      return {
        allowed: false,
        code: "INVALID_SCHEDULE_TIME",
        reason: `La hora programada debe estar dentro del horario de atención (${formatTime12h(dayRule.open)} a ${formatTime12h(dayRule.close)}).`,
      };
    }
  }

  return {
    allowed: true,
    fulfillmentMode: "scheduled",
    scheduledFor: targetDate.toISOString(),
    formattedLabel: formatScheduledForLabel(targetDate.toISOString(), timezone, now),
  };
}
