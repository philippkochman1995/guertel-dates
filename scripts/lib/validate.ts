import { z } from "zod";
import type { Event } from "../types";

const eventSchema = z.object({
  location: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(1),
  event_url: z.string().url(),
  image: z.string().url().optional(),
});

const eventsSchema = z.array(eventSchema);

export function validateEvents(events: Event[]): Event[] {
  return eventsSchema.parse(events);
}
