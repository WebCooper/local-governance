# ============================================
# Stage 1: Install Dependencies
# ============================================
FROM node:20-bookworm-slim AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

# ============================================
# Stage 2: Build Vite Single-Page Application
# ============================================
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Pass build-time environment variables for Vite bundle embedding
ARG VITE_ZKP_SERVER_URL
ARG VITE_FRONTEND_PRIVATE_KEY
ARG VITE_REGISTRATION_SECRET

ENV VITE_ZKP_SERVER_URL=${VITE_ZKP_SERVER_URL}
ENV VITE_FRONTEND_PRIVATE_KEY=${VITE_FRONTEND_PRIVATE_KEY}
ENV VITE_REGISTRATION_SECRET=${VITE_REGISTRATION_SECRET}
ENV NODE_ENV=production

RUN npm run build

# ============================================
# Stage 3: Lightweight Nginx Production Server
# ============================================
FROM nginx:alpine AS runtime

# Remove default Nginx welcome pages
RUN rm -rf /usr/share/nginx/html/*

# Copy custom Nginx configuration for SPA routing & caching
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy production build files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx listens on port 80 by default
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
