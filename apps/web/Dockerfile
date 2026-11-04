FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY docs/THIRD_PARTY_LICENSES.md ./THIRD_PARTY_LICENSES.md
COPY apps/web apps/web
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "apps/web"]
