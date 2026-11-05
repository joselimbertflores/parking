import { envValidationSchema } from './env.validation.js';

describe('envValidationSchema', () => {
  const environment = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/parking',
    FRONTEND_ORIGIN: 'http://localhost:4200',
  };

  it('normalizes a comma-separated list of exact frontend origins', () => {
    const result = envValidationSchema.parse({
      ...environment,
      FRONTEND_ORIGIN: 'http://localhost:4200, https://frontend.example.com',
    });
    expect(result.FRONTEND_ORIGIN).toEqual([
      'http://localhost:4200',
      'https://frontend.example.com',
    ]);
    expect(result.PORT).toBe(3000);
  });

  it.each([
    undefined,
    '',
    '*',
    'http://*.example.com',
    'http://localhost:4200/path',
    'http://localhost:4200/',
    'http://user:password@localhost:4200',
    'http://localhost:4200,',
  ])('rejects an invalid FRONTEND_ORIGIN: %s', (origin) => {
    expect(
      envValidationSchema.safeParse({
        ...environment,
        FRONTEND_ORIGIN: origin,
      }).success,
    ).toBe(false);
  });
});
