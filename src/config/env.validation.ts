import { z } from 'zod';

export const envValidationSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  FRONTEND_ORIGIN: z
    .string()
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(
      z
        .array(
          z
            .url({ protocol: /^https?$/ })
            .refine(
              (value) =>
                !value.includes('*') && URL.parse(value)?.origin === value,
              'Cada origen debe incluir solo protocolo, host y puerto, sin ruta ni barra final.',
            ),
        )
        .min(1),
    ),
});

export type EnvironmentVariables = z.infer<typeof envValidationSchema>;
