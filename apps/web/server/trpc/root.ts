import { adminRouter } from './admin';
import { router } from './init';

export const appRouter = router({
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
