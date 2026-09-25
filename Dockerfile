FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Env is validated at runtime, not during the build.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Chromium for server-side PDF export. The version matches the app's playwright dependency.
RUN npx -y playwright@1.63.0 install --with-deps chromium-headless-shell && rm -rf /root/.npm
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/src/db/migrations ./src/db/migrations
# Output tracing misses files Playwright loads at runtime (browsers.json and others).
COPY --from=build /app/node_modules/.pnpm/playwright-core@1.63.0 ./node_modules/.pnpm/playwright-core@1.63.0
COPY --from=build /app/node_modules/.pnpm/playwright@1.63.0 ./node_modules/.pnpm/playwright@1.63.0
USER node
EXPOSE 3000
CMD ["node", "server.js"]
