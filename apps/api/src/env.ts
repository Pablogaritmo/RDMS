const bool = (v: string | undefined, def = false) => (v == null ? def : ['1', 'true', 'yes'].includes(v.toLowerCase()));

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3000),
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://rdms:rdms@localhost:5432/rdms',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  TRUST_PROXY: bool(process.env.TRUST_PROXY),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? 'admin@crater.ucr.ac.cr',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? 'admin1234',
  ADMIN_NAME: process.env.ADMIN_NAME ?? 'Administrador',
  SEED_DEMO: bool(process.env.SEED_DEMO, true),
  /** Directory where uploaded files are stored (mount a volume in production). */
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? 'uploads',
  MAX_FILE_SIZE_MB: Number(process.env.MAX_FILE_SIZE_MB ?? 50),
  get isProd() {
    return this.NODE_ENV === 'production';
  },
  /** Secure cookies when served over HTTPS (prod) — can be disabled for plain-HTTP LAN demos. */
  get secureCookies() {
    return this.isProd && !bool(process.env.INSECURE_COOKIES);
  },
};
