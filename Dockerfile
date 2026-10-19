# ---------- build ----------
# Dùng bookworm-slim thay alpine: Prisma trên musl cần binaryTarget riêng,
# đổi lấy vài chục MB để bớt một loại lỗi khó đoán khi lên máy chủ.
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
# prisma generate không cần DB thật, chỉ cần biến tồn tại để parse schema.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Cắt bỏ devDependencies nhưng GIỮ Prisma client đã sinh ở bước trên.
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV TZ=Asia/Ho_Chi_Minh

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY prisma ./prisma

# uploads là volume; tạo sẵn và trao quyền cho user không phải root.
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

EXPOSE 8087
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8087/api/health || exit 1

CMD ["node", "dist/main"]
