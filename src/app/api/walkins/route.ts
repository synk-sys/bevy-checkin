import { z } from "zod";
import { deskFrom } from "@/lib/server/auth";
import { getService } from "@/lib/server/context";
import { json, readJson, withRole } from "@/lib/server/http";

const schema = z
  .object({
    firstName: z.string().min(1).max(60),
    lastName: z.string().max(60).default(""),
    email: z.union([z.literal(""), z.string().email().max(120)]).default(""),
    company: z.string().max(80).optional(),
    ticketType: z.string().max(40).optional(),
    checkInNow: z.boolean().default(true),
  })
  .strict();

export const POST = withRole("staff", async (req, session) => {
  const { checkInNow, ...input } = schema.parse(await readJson(req));
  const res = await (await getService()).createWalkIn(input, { desk: deskFrom(req), by: session.name }, checkInNow);
  return json(res, { status: 201 });
});
