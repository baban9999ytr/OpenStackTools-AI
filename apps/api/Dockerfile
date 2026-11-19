    FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY docs/THIRD_PARTY_LICENSES.md ./THIRD_PARTY_LICENSES.md
COPY apps/api apps/api
RUN npm run build -w apps/api
ENV NODE_ENV=production
EXPOSE 5000
CMD ["npm", "run", "start", "-w", "apps/api"]
