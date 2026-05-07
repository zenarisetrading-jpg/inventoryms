# Build stage
FROM node:20-slim AS builder
WORKDIR /app

# Copy root package files
COPY package*.json ./
# Copy frontend package files
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm install
RUN npm install --prefix frontend

# Copy all files
COPY . .

# Pass build arguments for Supabase (Railway provides these automatically)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Build the frontend
RUN npm run build --prefix frontend

# Production stage
FROM node:20-slim
WORKDIR /app

# Install 'serve' globally to run the app
RUN npm install -g serve

# Copy only the built files from the builder stage
COPY --from=builder /app/frontend/dist ./dist

# Set the port
ENV PORT=8080
EXPOSE 8080

# Command to run the app
CMD ["serve", "-s", "dist", "-l", "8080"]
