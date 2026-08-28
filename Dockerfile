FROM node:22-alpine AS base
# prisma.config.ts requires DATABASE_URL to merely be *set* — generate never
# connects to it — but it's read as soon as the config module loads, which
# happens on every `prisma generate`, including the one npm ci's postinstall
# triggers in the deps stage below. Set once here so both deps and builder
# inherit it without needing a real, reachable database.
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public"

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
# npm ci's postinstall (`prisma generate`) needs the schema present, so it's
# copied ahead of the rest of the source — the generated client itself
# isn't used from this stage (only node_modules is copied forward into
# builder below), it's here purely so that install step doesn't fail.
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
