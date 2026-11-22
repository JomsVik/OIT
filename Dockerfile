FROM rust:1.95-bookworm AS build
WORKDIR /source
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations
COPY index.html app.js cartridges.js style.css ./
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN groupadd --gid 10001 oit && useradd --uid 10001 --gid oit --no-create-home oit \
    && mkdir -p /app/data /app/backups && chown oit:oit /app/data /app/backups
WORKDIR /app
COPY --from=build /source/target/release/oit-portal /usr/local/bin/oit-portal
USER 10001:10001
ENV BIND_ADDR=0.0.0.0:3000 DATABASE_PATH=/app/data/oit.sqlite3
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/oit-portal"]
