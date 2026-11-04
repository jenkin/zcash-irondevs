# Zcash Irondevs, builds the co-authorship visualization as a static site.
#
# Uses the committed web-next/public/graph.json (seed data). To render the full
# CodeZ archive, run the Python pipeline first (see README) to regenerate that
# file, then rebuild this image.
#
#   docker build -t zcash-irondevs .
#   docker run --rm -p 3000:3000 zcash-irondevs
#
FROM node:22-alpine AS build
WORKDIR /app
COPY web-next/package.json web-next/package-lock.json ./
RUN npm ci
COPY web-next/ ./
RUN npm run build

FROM node:22-alpine
RUN npm i -g serve
COPY --from=build /app/out /app/out
EXPOSE 3000
CMD ["serve", "-s", "/app/out", "-l", "3000"]
