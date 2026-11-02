FROM node:22-bookworm-slim AS webbuild
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV A2HUMAN_API_ORIGIN=http://127.0.0.1:3848
RUN npm run build

FROM python:3.12-slim-bookworm
RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 locales \
  && sed -i 's/^# *zh_CN.UTF-8 UTF-8/zh_CN.UTF-8 UTF-8/' /etc/locale.gen \
  && locale-gen zh_CN.UTF-8 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=webbuild /app/.next/standalone ./
COPY --from=webbuild /app/.next/static ./.next/static
COPY --from=webbuild /app/public ./public
COPY pyproject.toml alembic.ini ./
COPY alembic ./alembic
COPY a2human ./a2human
COPY src/locales ./src/locales
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && pip install --no-cache-dir .
ENV NODE_ENV=production
ENV PORT=3847
ENV HOSTNAME=0.0.0.0
ENV A2HUMAN_API_ORIGIN=http://127.0.0.1:3848
RUN mkdir -p /app/data && node --version
VOLUME /app/data
EXPOSE 3847
CMD ["/docker-entrypoint.sh"]
