# LibreOffice renderer used only by the conversion QA tooling (DOCX -> PDF for visual
# regression). It is a development/CI tool: it is not part of the runtime topology.
FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libreoffice-writer-nogui \
        fonts-liberation2 fonts-dejavu-core fonts-crosextra-carlito fonts-crosextra-caladea \
        fontconfig \
    && rm -rf /var/lib/apt/lists/*
ENV HOME=/tmp
WORKDIR /work
ENTRYPOINT ["soffice", "--headless", "--norestore", "--convert-to", "pdf", "--outdir", "/work"]
