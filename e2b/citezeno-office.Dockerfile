# The E2B sandbox template for the assistant's file conversions (convert_file):
# E2B's code interpreter (Python, pandas, matplotlib…) plus LibreOffice and
# pandoc, and fonts for many scripts (Noto, including Ethiopic, Arabic, CJK).
#
# Build it with the E2B CLI (see e2b.dev/docs for the current command), e.g.
#   e2b template build --name citezeno-office --dockerfile e2b/citezeno-office.Dockerfile
# then set E2B_TEMPLATE=citezeno-office. run_python uses the same template.
FROM e2bdev/code-interpreter:latest

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc libreoffice-impress \
      pandoc \
      fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji fonts-dejavu \
 && rm -rf /var/lib/apt/lists/*
