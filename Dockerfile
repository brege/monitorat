FROM python:3.11
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update \
    && apt-get install --yes --no-install-recommends systemd dbus docker.io docker-cli \
    && rm -rf /var/lib/apt/lists/*
ARG MONITORAT_VERSION=""
RUN if [ -n "$MONITORAT_VERSION" ]; then python -m pip install --no-cache-dir "monitorat==${MONITORAT_VERSION}"; else python -m pip install --no-cache-dir monitorat; fi
ARG USER_IDENTIFIER=1000
ARG GROUP_IDENTIFIER=1000
ARG DOCKER_GROUP_IDENTIFIER=115
ARG MESSAGEBUS_GID=101
RUN groupdel docker || true \
    && getent group ${GROUP_IDENTIFIER} >/dev/null || groupadd --gid ${GROUP_IDENTIFIER} monitorat \
    && groupadd --gid ${DOCKER_GROUP_IDENTIFIER} docker \
    && useradd --uid ${USER_IDENTIFIER} --gid ${GROUP_IDENTIFIER} --create-home --shell /bin/bash monitorat \
    && getent group messagebus >/dev/null || groupadd --gid ${MESSAGEBUS_GID} messagebus \
    && usermod --append --groups docker,messagebus monitorat \
    && mkdir -p /config \
    && chown -R monitorat:monitorat /config /app
USER monitorat
EXPOSE 6161
CMD ["monitorat", "-c", "/config/config.yaml", "server", "--host", "0.0.0.0", "--port", "6161"]
