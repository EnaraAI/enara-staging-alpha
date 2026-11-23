FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# Spelling dictionaries for rules-first grading (Hunspell files with their licences; see assets/dictionaries/NOTICE.md).
COPY assets ./assets

USER node
EXPOSE 3001

CMD ["node", "dist/index.js"]
