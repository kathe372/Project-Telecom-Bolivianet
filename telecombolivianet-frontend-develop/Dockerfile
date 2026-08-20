FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

FROM nginx:alpine AS final
COPY --from=build /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/templates/default.conf.template

# Entrypoint que imprime /etc/resolv.conf al arrancar (debug DNS Railway).
COPY docker-entrypoint-custom.sh /docker-entrypoint-custom.sh
RUN sed -i 's/\r//' /docker-entrypoint-custom.sh && chmod +x /docker-entrypoint-custom.sh

ENV NGINX_ENVSUBST_TEMPLATE_VARS="BACKEND_INTERNAL_URL CHATBOT_INTERNAL_URL NGINX_RESOLVER"
ENV BACKEND_INTERNAL_URL=http://backend:5000
ENV CHATBOT_INTERNAL_URL=http://chatbot:3001
# DNS interno de Railway por defecto; en Docker local sobreescribir con 127.0.0.11
ENV NGINX_RESOLVER="[fd12::10]"

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint-custom.sh"]
CMD ["nginx", "-g", "daemon off;"]
