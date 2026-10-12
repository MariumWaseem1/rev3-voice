import { z } from "zod";
import { voiceIds, taskOptions } from "./catalogue";
export const text = z.string().trim().max(2000);
export const short = z.string().trim().max(200);
export const configurationSchema = z
  .object({
    route: z.enum(["guided", "custom"]),
    originalPrompt: text,
    prompt: text,
    businessName: short,
    description: text,
    category: short,
    problems: z.array(short).max(12),
    otherProblem: text,
    receptionistName: short.default("Alex"),
    timezone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Enter a valid timezone, such as Europe/London"),
    openingHours: z
      .array(
        z
          .object({
            day: z.number().int().min(1).max(7),
            open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          })
          .strict()
          .refine(
            (x) => x.open < x.close,
            "Closing time must be after opening",
          ),
      )
      .max(7)
      .refine(
        (x) => new Set(x.map((h) => h.day)).size === x.length,
        "One opening interval per day",
      ),
    services: z
      .array(
        z
          .object({
            id: short.min(1),
            name: short.min(1),
            minutes: z.number().int().min(5).max(240),
            price: short,
          })
          .strict(),
      )
      .max(20)
      .refine(
        (x) => new Set(x.map((s) => s.id)).size === x.length,
        "Service IDs must be unique",
      ),
    faqs: z
      .array(z.object({ question: short.min(1), answer: text.min(1) }).strict())
      .max(30),
    collect: z.array(short).max(10),
    tasks: z.array(z.enum(taskOptions)).min(1).max(5),
    handover: text,
    greeting: text,
    fictional: z.boolean(),
    reviewed: z.boolean(),
    voice: z
      .string()
      .refine(
        (v) => voiceIds.includes(v as (typeof voiceIds)[number]),
        "Select a supported voice",
      ),
  })
  .strict();
export type Configuration = z.infer<typeof configurationSchema>;
export const blankConfiguration: Configuration = {
  route: "guided",
  originalPrompt: "",
  prompt: "",
  businessName: "",
  description: "",
  category: "",
  problems: [],
  otherProblem: "",
  receptionistName: "Alex",
  timezone: "Europe/London",
  openingHours: [],
  services: [],
  faqs: [],
  collect: ["Name", "Contact details"],
  tasks: [
    "Answer FAQs",
    "Capture enquiries",
    "Record callback requests",
    "Flag for staff",
  ],
  handover:
    "Record details for staff follow-up when the request needs a person.",
  greeting: "",
  fictional: false,
  reviewed: false,
  voice: "aura-2-thalia-en",
};
export function missingConfiguration(c: Configuration) {
  const missing = [];
  if (!c.businessName) missing.push("Business name");
  if (!c.description) missing.push("Business description");
  if (!c.receptionistName) missing.push("Receptionist name");
  if (!c.reviewed) missing.push("Review acknowledgement");
  if (
    c.tasks.includes("Demo appointments") &&
    (!c.services.length || !c.openingHours.length)
  )
    missing.push("Bookable services and opening hours");
  return missing;
}
export const feedbackSchema = z
  .object({
    id: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    turnId: short.optional(),
    actionId: z.string().uuid().optional(),
    goal: text,
    understood: z.number().int().min(1).max(5),
    completed: z.enum(["yes", "partly", "no", "not-tested"]),
    natural: z.number().int().min(1).max(5),
    confusing: text,
    change: text,
    needs: text,
    failureCategory: z.enum([
      "none",
      "audio",
      "connection",
      "understanding",
      "action",
      "other",
    ]),
  })
  .strict();
export const pilotSchema = z
  .object({
    businessName: short.min(1),
    contactName: short.min(1),
    phone: short,
    description: text,
    callVolume: short,
    mainProblem: text,
    systems: text,
    contactTime: short,
    permission: z.literal(true),
  })
  .strict();
export const connectionsSchema = z
  .object({
    crm: short,
    calendar: short,
    messaging: short,
    other: text,
    requirements: text,
  })
  .strict();
export const toolNames = [
  "list_services",
  "check_demo_availability",
  "create_demo_booking",
  "find_demo_booking",
  "reschedule_demo_booking",
  "cancel_demo_booking",
  "capture_enquiry",
  "request_callback",
  "flag_for_staff",
] as const;
export const toolSchema = z
  .object({
    name: z.enum(toolNames),
    key: z.string().min(8).max(120),
    args: z
      .object({
        serviceId: short.optional(),
        start: z.string().datetime({ offset: true }).optional(),
        reference: short.optional(),
        customer: short.optional(),
        contact: short.optional(),
        details: text.optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .strict(),
  })
  .strict();
