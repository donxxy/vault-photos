import { createTRPCRouter } from "./trpc";
import { authRouter } from "./routers/auth";
import { mediaRouter } from "./routers/media";
import { albumRouter } from "./routers/album";
import { adminRouter } from "./routers/admin";

export const appRouter = createTRPCRouter({
  auth: authRouter, media: mediaRouter, album: albumRouter, admin: adminRouter,
});
export type AppRouter = typeof appRouter;
