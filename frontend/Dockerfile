FROM --platform=linux/amd64 node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
# Route client-side API calls through the same-origin proxy instead of the old Railway host.
ENV VITE_API_URL=/api/railway
RUN npm run build

FROM --platform=linux/amd64 node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
