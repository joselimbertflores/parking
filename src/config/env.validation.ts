import { z } from 'zod';

export const envValidationSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  FRONTEND_ORIGIN: z.url({ protocol: /^https?$/ }).optional(),
});

export type EnvironmentVariables = z.infer<typeof envValidationSchema>;
